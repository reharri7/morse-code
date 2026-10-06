import { PcmFrame } from './interfaces';
import { RfSignalConditioner, SignalConditioningSnapshot } from './rf-signal-conditioner';
import { StreamingCwDecoder, StreamingCwDecoderOptions, StreamingCwSnapshot } from './streaming-cw-decoder';
import { ToneAcquisitionOptions, ToneAcquisitionSnapshot, ToneAcquisitionTracker } from './tone-acquisition';

export interface AcquiringCwDecoderOptions extends ToneAcquisitionOptions {
  readonly detectorFrameSize?: number;
  readonly preRollSeconds?: number;
  readonly timing?: StreamingCwDecoderOptions['timing'];
}

export interface AcquiringCwSnapshot extends StreamingCwSnapshot {
  readonly acquisition: ToneAcquisitionSnapshot;
  readonly conditioning: SignalConditioningSnapshot;
}

/** Coordinates bounded pre-roll, acquisition/retuning, and raw streaming decode. */
export class AcquiringCwDecoder {
  private readonly tracker: ToneAcquisitionTracker;
  private readonly conditioner = new RfSignalConditioner();
  private readonly preRollSeconds: number;
  private decoder: StreamingCwDecoder | null = null;
  private preRoll: PcmFrame[] = [];
  private preRollSampleCount = 0;
  private lastConfiguredFrequencyHz: number | null = null;
  private signalLevel = 0;
  private sampleRate = 0;
  private processedSampleCount = 0;

  constructor(private readonly options: AcquiringCwDecoderOptions) {
    this.preRollSeconds = options.preRollSeconds ?? 3;
    this.tracker = new ToneAcquisitionTracker(options);
  }

  pushFrame(frame: PcmFrame): AcquiringCwSnapshot {
    this.signalLevel = rootMeanSquare(frame.samples);
    this.sampleRate = frame.sampleRate;
    this.processedSampleCount += frame.samples.length;
    const conditionedFrame = this.conditioner.pushFrame(frame);
    const acquisition = this.tracker.pushFrame(conditionedFrame);
    const decodable = (acquisition.state === 'locked' || acquisition.state === 'degraded') &&
      acquisition.lockedFrequencyHz !== null;

    if (!this.decoder || !decodable || this.preRoll.length) this.retainPreRoll(conditionedFrame);
    if (decodable) {
      this.ensureDecoder(acquisition);
      if (this.preRoll.length) this.replayPreRoll();
      else this.decoder?.pushFrame(conditionedFrame);
    }
    return this.composeSnapshot();
  }

  setManualFrequency(frequencyHz: number | null): AcquiringCwSnapshot {
    const acquisition = this.tracker.setManualFrequency(frequencyHz);
    if (frequencyHz !== null && this.decoder) {
      this.decoder.retune(frequencyHz, acquisition.powerOnThreshold, acquisition.powerOffThreshold, true);
      this.lastConfiguredFrequencyHz = frequencyHz;
    }
    return this.composeSnapshot();
  }

  flush(): AcquiringCwSnapshot {
    this.decoder?.flush();
    return this.composeSnapshot();
  }

  snapshot(): AcquiringCwSnapshot {
    return this.composeSnapshot();
  }

  private ensureDecoder(acquisition: ToneAcquisitionSnapshot): void {
    const frequencyHz = acquisition.lockedFrequencyHz as number;
    if (!this.decoder) {
      const decoderOptions: StreamingCwDecoderOptions = {
        targetFrequencyHz: frequencyHz,
        frameSize: this.options.detectorFrameSize ?? 128,
        powerThreshold: acquisition.powerOnThreshold,
        powerOffThreshold: acquisition.powerOffThreshold,
        timing: this.options.timing,
        robustDetection: true
      };
      this.decoder = new StreamingCwDecoder(decoderOptions);
      this.lastConfiguredFrequencyHz = frequencyHz;
      return;
    }
    const moved = this.lastConfiguredFrequencyHz === null || Math.abs(frequencyHz - this.lastConfiguredFrequencyHz) >= 2;
    this.decoder.retune(frequencyHz, acquisition.powerOnThreshold, acquisition.powerOffThreshold, false);
    if (moved) this.lastConfiguredFrequencyHz = frequencyHz;
  }

  private replayPreRoll(): void {
    const frames = this.preRoll;
    this.preRoll = [];
    this.preRollSampleCount = 0;
    for (const bufferedFrame of frames) this.decoder?.pushFrame(bufferedFrame);
  }

  private retainPreRoll(frame: PcmFrame): void {
    this.preRoll.push(frame);
    this.preRollSampleCount += frame.samples.length;
    const maximumSamples = Math.max(frame.samples.length, Math.round(frame.sampleRate * this.preRollSeconds));
    while (this.preRollSampleCount > maximumSamples && this.preRoll.length > 1) {
      const removed = this.preRoll.shift();
      this.preRollSampleCount -= removed?.samples.length ?? 0;
    }
  }

  private composeSnapshot(): AcquiringCwSnapshot {
    const decoder = this.decoder?.snapshot() ?? emptyDecoderSnapshot();
    return {
      ...decoder,
      signalLevel: this.signalLevel,
      sampleRate: this.sampleRate,
      processedSampleCount: this.processedSampleCount,
      acquisition: this.tracker.snapshot(),
      conditioning: this.conditioner.snapshot()
    };
  }
}

function emptyDecoderSnapshot(): StreamingCwSnapshot {
  return {
    rawText: '', unknownSymbols: [], characters: [], decodeConfidence: 0,
    toneState: 'silence', signalLevel: 0, tonePower: 0,
    recentEvents: [], markCount: 0, droppedFrameCount: 0, processedSampleCount: 0, sampleRate: 0,
    timing: {
      state: 'acquiring', elementDitDurationMs: 0, spacingUnitDurationMs: 0,
      characterWordsPerMinute: 0, effectiveWordsPerMinute: 0, confidence: 0,
      observationCount: 0, timingJitter: 0
    },
    detection: {
      targetPower: 0, noisePower: 0, snrDb: null,
      effectiveOnThreshold: 0, effectiveOffThreshold: 0
    }
  };
}

function rootMeanSquare(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}
