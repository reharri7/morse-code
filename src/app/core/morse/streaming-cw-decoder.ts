import { GoertzelToneDetector, ToneDetectionSnapshot } from './goertzel-tone-detector';
import { AdaptiveTimingOptions, AdaptiveTimingSnapshot, AdaptiveTimingTracker } from './adaptive-timing';
import { DecodedCharacterEvidence, PcmFrame, TimingEvent, ToneSegment, ToneState } from './interfaces';
import { StreamingMorseDecoder } from './morse-decoder';

export interface StreamingCwDecoderOptions {
  readonly targetFrequencyHz: number;
  readonly frameSize?: number;
  readonly powerThreshold?: number;
  readonly powerOffThreshold?: number;
  readonly eventHistoryLimit?: number;
  readonly timing?: AdaptiveTimingOptions;
  /** Enables M5 local-noise adaptation and narrow interference rejection. */
  readonly robustDetection?: boolean;
}

export interface StreamingCwSnapshot {
  readonly rawText: string;
  readonly unknownSymbols: readonly string[];
  readonly characters: readonly DecodedCharacterEvidence[];
  readonly decodeConfidence: number;
  readonly toneState: ToneState;
  readonly signalLevel: number;
  readonly tonePower: number;
  readonly recentEvents: readonly TimingEvent[];
  readonly markCount: number;
  readonly droppedFrameCount: number;
  readonly processedSampleCount: number;
  readonly sampleRate: number;
  readonly timing: AdaptiveTimingSnapshot;
  readonly detection: ToneDetectionSnapshot;
}

/**
 * Incremental composition for a known tone with adaptive M4 timing. It retains
 * no PCM and only bounded timing observations and diagnostic history.
 */
export class StreamingCwDecoder {
  private readonly detector: GoertzelToneDetector;
  private readonly timingTracker: AdaptiveTimingTracker;
  private readonly eventHistoryLimit: number;
  private readonly decoder = new StreamingMorseDecoder();
  private currentSegment: ToneSegment | null = null;
  private recentEvents: TimingEvent[] = [];
  private markCount = 0;
  private droppedFrameCount = 0;
  private processedSampleCount = 0;
  private expectedNextSample: number | null = null;
  private signalLevel = 0;
  private tonePower = 0;
  private sampleRate = 0;

  constructor(options: StreamingCwDecoderOptions) {
    const robustDetection = options.robustDetection ?? false;
    this.eventHistoryLimit = Math.max(8, options.eventHistoryLimit ?? 96);
    this.timingTracker = new AdaptiveTimingTracker(options.timing);
    this.detector = new GoertzelToneDetector({
      targetFrequencyHz: options.targetFrequencyHz,
      frameSize: options.frameSize ?? 128,
      powerThreshold: options.powerThreshold ?? 0.0005,
      powerOffThreshold: options.powerOffThreshold,
      adaptiveNoiseFloor: robustDetection,
      minimumSnrDb: 5.5,
      attackFrames: robustDetection ? 2 : 1,
      releaseFrames: robustDetection ? 2 : 1,
      narrowBandQ: robustDetection ? 12 : 0
    });
  }

  retune(targetFrequencyHz: number, powerThreshold: number, powerOffThreshold: number, breakSegment = false): void {
    if (breakSegment) this.resetSignalBoundary();
    this.detector.configure(targetFrequencyHz, powerThreshold, powerOffThreshold);
  }

  pushFrame(frame: PcmFrame): StreamingCwSnapshot {
    if (frame.sampleRate <= 0 || frame.startSample < 0) throw new Error('PCM frames require a positive sample rate and non-negative position.');
    if (this.sampleRate && frame.sampleRate !== this.sampleRate) this.resetSignalBoundary();
    if (this.expectedNextSample !== null && frame.startSample !== this.expectedNextSample) {
      this.droppedFrameCount += 1;
      this.resetSignalBoundary();
    }

    this.sampleRate = frame.sampleRate;
    this.expectedNextSample = frame.startSample + frame.samples.length;
    this.processedSampleCount += frame.samples.length;
    this.signalLevel = rootMeanSquare(frame.samples);

    const detected = this.detector.detect(frame.samples, frame.sampleRate);
    for (const localSegment of detected) {
      this.consumeSegment({
        ...localSegment,
        startSample: frame.startSample + localSegment.startSample,
        endSample: frame.startSample + localSegment.endSample
      });
    }
    this.applyOpenSilenceGap();
    return this.snapshot();
  }

  flush(): StreamingCwSnapshot {
    if (this.currentSegment) this.emitTiming(this.timingTracker.pushSegment(this.currentSegment));
    this.currentSegment = null;
    this.emitTiming(this.timingTracker.flush());
    this.decoder.finish();
    return this.snapshot();
  }

  reset(): StreamingCwSnapshot {
    this.decoder.reset();
    this.currentSegment = null;
    this.recentEvents = [];
    this.markCount = 0;
    this.droppedFrameCount = 0;
    this.processedSampleCount = 0;
    this.expectedNextSample = null;
    this.signalLevel = 0;
    this.tonePower = 0;
    this.sampleRate = 0;
    this.detector.reset();
    this.timingTracker.reset();
    return this.snapshot();
  }

  snapshot(): StreamingCwSnapshot {
    const decoded = this.decoder.result();
    return {
      rawText: decoded.text,
      unknownSymbols: decoded.unknownSymbols,
      characters: decoded.characters,
      decodeConfidence: decoded.characters.length
        ? decoded.characters.reduce((sum, character) => sum + character.confidence, 0) / decoded.characters.length
        : 0,
      toneState: this.currentSegment?.state ?? 'silence',
      signalLevel: this.signalLevel,
      tonePower: this.tonePower,
      recentEvents: [...this.recentEvents],
      markCount: this.markCount,
      droppedFrameCount: this.droppedFrameCount,
      processedSampleCount: this.processedSampleCount,
      sampleRate: this.sampleRate,
      timing: this.timingTracker.snapshot(),
      detection: this.detector.snapshot()
    };
  }

  private consumeSegment(segment: ToneSegment): void {
    if (!this.currentSegment) {
      this.currentSegment = segment;
      this.tonePower = segment.state === 'tone' ? segment.averagePower : 0;
      return;
    }
    if (segment.state === this.currentSegment.state && segment.startSample === this.currentSegment.endSample) {
      const oldLength = this.currentSegment.endSample - this.currentSegment.startSample;
      const newLength = segment.endSample - segment.startSample;
      const combinedPower = ((this.currentSegment.averagePower * oldLength) + (segment.averagePower * newLength)) / (oldLength + newLength);
      this.currentSegment = { ...this.currentSegment, endSample: segment.endSample, averagePower: combinedPower };
      this.tonePower = segment.state === 'tone' ? combinedPower : 0;
      return;
    }

    this.emitTiming(this.timingTracker.pushSegment(this.currentSegment));
    this.currentSegment = segment;
    this.tonePower = segment.state === 'tone' ? segment.averagePower : 0;
  }

  private applyOpenSilenceGap(): void {
    if (this.currentSegment?.state === 'silence') {
      this.emitTiming(this.timingTracker.previewOpenGap(durationMs(this.currentSegment)));
    }
  }

  private emit(event: TimingEvent): void {
    this.decoder.push(event);
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.eventHistoryLimit) {
      this.recentEvents.splice(0, this.recentEvents.length - this.eventHistoryLimit);
    }
  }

  private emitTiming(events: readonly TimingEvent[]): void {
    for (const event of events) {
      this.emit(event);
      if (event.kind === 'dit' || event.kind === 'dah') this.markCount += 1;
    }
  }

  private resetSignalBoundary(): void {
    if (this.currentSegment?.state === 'tone') this.emitTiming(this.timingTracker.pushSegment(this.currentSegment));
    this.currentSegment = null;
    this.timingTracker.resetOpenGap();
    this.detector.reset();
  }
}

function durationMs(segment: ToneSegment): number {
  return ((segment.endSample - segment.startSample) / segment.sampleRate) * 1_000;
}

function rootMeanSquare(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}
