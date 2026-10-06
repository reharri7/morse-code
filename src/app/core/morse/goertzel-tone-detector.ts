import { ToneDetector, ToneSegment } from './interfaces';

export interface GoertzelToneDetectorOptions {
  readonly targetFrequencyHz: number;
  /** Short analysis frames preserve CW timing edges; 64 samples is 8 ms at 8 kHz. */
  readonly frameSize?: number;
  /** Normalized Goertzel power that is considered an active tone. */
  readonly powerThreshold?: number;
  /** Lower release threshold used after tone onset to prevent threshold chatter. */
  readonly powerOffThreshold?: number;
  /** Compare target power with nearby bins and adapt to the local noise floor. */
  readonly adaptiveNoiseFloor?: boolean;
  readonly minimumSnrDb?: number;
  readonly attackFrames?: number;
  readonly releaseFrames?: number;
  /** Optional stateful audio band-pass before short-window detection. */
  readonly narrowBandQ?: number;
}

export interface ToneDetectionSnapshot {
  readonly targetPower: number;
  readonly noisePower: number;
  readonly snrDb: number | null;
  readonly effectiveOnThreshold: number;
  readonly effectiveOffThreshold: number;
}

/** A narrow-band detector appropriate for a known CW sidetone, without an FFT. */
export class GoertzelToneDetector implements ToneDetector {
  private readonly frameSize: number;
  private targetFrequencyHz: number;
  private powerThreshold: number;
  private powerOffThreshold: number;
  private readonly adaptiveNoiseFloor: boolean;
  private readonly minimumSnrDb: number;
  private readonly attackFrames: number;
  private readonly releaseFrames: number;
  private readonly narrowBandQ: number;
  private toneActive = false;
  private attackStreak = 0;
  private releaseStreak = 0;
  private noisePower = 0;
  private targetPower = 0;
  private effectiveOnThreshold = 0;
  private effectiveOffThreshold = 0;
  private filterSampleRate = 0;
  private filterFrequencyHz = 0;
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(options: GoertzelToneDetectorOptions) {
    this.frameSize = options.frameSize ?? 64;
    this.targetFrequencyHz = options.targetFrequencyHz;
    this.powerThreshold = options.powerThreshold ?? 0.04;
    this.powerOffThreshold = options.powerOffThreshold ?? this.powerThreshold;
    this.adaptiveNoiseFloor = options.adaptiveNoiseFloor ?? false;
    this.minimumSnrDb = options.minimumSnrDb ?? 6;
    this.attackFrames = Math.max(1, Math.round(options.attackFrames ?? 1));
    this.releaseFrames = Math.max(1, Math.round(options.releaseFrames ?? 1));
    this.narrowBandQ = Math.max(0, options.narrowBandQ ?? 0);
    if (this.frameSize < 8 || this.targetFrequencyHz <= 0 || this.powerThreshold <= 0 ||
      this.powerOffThreshold <= 0 || this.powerOffThreshold > this.powerThreshold) {
      throw new Error('Goertzel detector requires a positive target frequency, threshold, and frame size of at least 8.');
    }
  }

  configure(targetFrequencyHz: number, powerThreshold = this.powerThreshold, powerOffThreshold = this.powerOffThreshold): void {
    if (targetFrequencyHz <= 0 || powerThreshold <= 0 || powerOffThreshold <= 0 || powerOffThreshold > powerThreshold) {
      throw new Error('Goertzel configuration requires a positive frequency and valid on/off thresholds.');
    }
    this.targetFrequencyHz = targetFrequencyHz;
    this.powerThreshold = powerThreshold;
    this.powerOffThreshold = powerOffThreshold;
  }

  reset(): void {
    this.toneActive = false;
    this.attackStreak = 0;
    this.releaseStreak = 0;
    this.noisePower = 0;
    this.targetPower = 0;
    this.effectiveOnThreshold = this.powerThreshold;
    this.effectiveOffThreshold = this.powerOffThreshold;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  snapshot(): ToneDetectionSnapshot {
    const snrDb = this.noisePower
      ? 10 * Math.log10((this.targetPower + 1e-12) / (this.noisePower + 1e-12))
      : null;
    return {
      targetPower: this.targetPower,
      noisePower: this.noisePower,
      snrDb,
      effectiveOnThreshold: this.effectiveOnThreshold,
      effectiveOffThreshold: this.effectiveOffThreshold
    };
  }

  detect(samples: Float32Array, sampleRate: number): ToneSegment[] {
    const analysisSamples = this.narrowBandQ ? this.applyNarrowBand(samples, sampleRate) : samples;
    const segments: ToneSegment[] = [];
    for (let start = 0; start < samples.length; start += this.frameSize) {
      const end = Math.min(start + this.frameSize, samples.length);
      const power = this.goertzelPower(analysisSamples, start, end, sampleRate, this.targetFrequencyHz);
      this.targetPower = power;
      this.updateNoiseFloor(samples, start, end, sampleRate);
      const snrOn = 10 ** (this.minimumSnrDb / 10);
      const snrOff = 10 ** (Math.max(1, this.minimumSnrDb - 2.5) / 10);
      this.effectiveOnThreshold = this.adaptiveNoiseFloor
        ? Math.max(this.powerThreshold * 0.05, this.noisePower * snrOn)
        : this.powerThreshold;
      this.effectiveOffThreshold = this.adaptiveNoiseFloor
        ? Math.max(this.powerOffThreshold * 0.04, this.noisePower * snrOff)
        : this.powerOffThreshold;
      const threshold = this.toneActive ? this.effectiveOffThreshold : this.effectiveOnThreshold;
      const evidenceActive = power >= threshold;
      if (this.toneActive) {
        this.releaseStreak = evidenceActive ? 0 : this.releaseStreak + 1;
        if (this.releaseStreak >= this.releaseFrames) {
          this.toneActive = false;
          this.releaseStreak = 0;
        }
      } else {
        this.attackStreak = evidenceActive ? this.attackStreak + 1 : 0;
        if (this.attackStreak >= this.attackFrames) {
          this.toneActive = true;
          this.attackStreak = 0;
        }
      }
      const state = this.toneActive ? 'tone' : 'silence';
      const previous = segments.at(-1);
      if (previous?.state === state) {
        segments[segments.length - 1] = {
          ...previous,
          endSample: end,
          averagePower: (previous.averagePower + power) / 2
        };
      } else {
        segments.push({ state, startSample: start, endSample: end, sampleRate, averagePower: power });
      }
    }
    return segments;
  }

  private applyNarrowBand(samples: Float32Array, sampleRate: number): Float32Array {
    if (sampleRate !== this.filterSampleRate || Math.abs(this.targetFrequencyHz - this.filterFrequencyHz) >= 1) {
      const omega = (2 * Math.PI * this.targetFrequencyHz) / sampleRate;
      const alpha = Math.sin(omega) / (2 * this.narrowBandQ);
      const a0 = 1 + alpha;
      this.b0 = alpha / a0;
      this.b1 = 0;
      this.b2 = -alpha / a0;
      this.a1 = (-2 * Math.cos(omega)) / a0;
      this.a2 = (1 - alpha) / a0;
      this.filterSampleRate = sampleRate;
      this.filterFrequencyHz = this.targetFrequencyHz;
    }
    const output = new Float32Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
      const input = samples[index];
      const filtered = (this.b0 * input) + (this.b1 * this.x1) + (this.b2 * this.x2) -
        (this.a1 * this.y1) - (this.a2 * this.y2);
      this.x2 = this.x1;
      this.x1 = input;
      this.y2 = this.y1;
      this.y1 = filtered;
      output[index] = filtered;
    }
    return output;
  }

  private updateNoiseFloor(samples: Float32Array, start: number, end: number, sampleRate: number): void {
    if (!this.adaptiveNoiseFloor) return;
    const count = end - start;
    const offset = Math.max(90, (sampleRate / Math.max(1, count)) * 1.8);
    const nyquist = sampleRate / 2;
    const references = [
      this.targetFrequencyHz - (2 * offset),
      this.targetFrequencyHz - offset,
      this.targetFrequencyHz + offset,
      this.targetFrequencyHz + (2 * offset)
    ].filter((frequency) => frequency > 30 && frequency < nyquist - 30)
      .map((frequency) => this.goertzelPower(samples, start, end, sampleRate, frequency))
      .sort((left, right) => left - right);
    const measured = references[Math.floor(references.length / 2)] ?? 0;
    if (!this.noisePower) this.noisePower = measured;
    else this.noisePower += (measured - this.noisePower) * (measured < this.noisePower ? 0.3 : 0.08);
  }

  private goertzelPower(samples: Float32Array, start: number, end: number, sampleRate: number, frequencyHz: number): number {
    const count = end - start;
    if (count === 0) return 0;
    const coefficient = 2 * Math.cos((2 * Math.PI * frequencyHz) / sampleRate);
    let previous = 0;
    let previousPrevious = 0;
    for (let index = start; index < end; index += 1) {
      const current = samples[index] + coefficient * previous - previousPrevious;
      previousPrevious = previous;
      previous = current;
    }
    const power = previousPrevious ** 2 + previous ** 2 - coefficient * previous * previousPrevious;
    return power / (count * count);
  }
}
