import { PcmFrame } from './interfaces';

export interface RfSignalConditionerOptions {
  readonly highPassCutoffHz?: number;
  readonly targetLevel?: number;
  readonly minimumGain?: number;
  readonly maximumGain?: number;
  readonly impulseLimitMultiplier?: number;
}

export interface SignalConditioningSnapshot {
  readonly inputLevel: number;
  readonly outputLevel: number;
  readonly noiseLevel: number;
  readonly gain: number;
  readonly removedDcLevel: number;
  readonly limitedSampleCount: number;
}

/** Stateful DC removal, impulse limiting, and bounded level normalization. */
export class RfSignalConditioner {
  private readonly cutoffHz: number;
  private readonly targetLevel: number;
  private readonly minimumGain: number;
  private readonly maximumGain: number;
  private readonly impulseLimitMultiplier: number;
  private sampleRate = 0;
  private expectedNextSample: number | null = null;
  private previousInput = 0;
  private previousHighPassed = 0;
  private levelEnvelope = 0;
  private noiseLevel = 0;
  private gain = 1;
  private inputLevel = 0;
  private outputLevel = 0;
  private removedDcLevel = 0;
  private limitedSampleCount = 0;

  constructor(options: RfSignalConditionerOptions = {}) {
    this.cutoffHz = options.highPassCutoffHz ?? 25;
    this.targetLevel = options.targetLevel ?? 0.28;
    this.minimumGain = options.minimumGain ?? 0.45;
    this.maximumGain = options.maximumGain ?? 7;
    this.impulseLimitMultiplier = options.impulseLimitMultiplier ?? 3.5;
    if (this.cutoffHz <= 0 || this.targetLevel <= 0 || this.minimumGain <= 0 ||
      this.maximumGain < this.minimumGain || this.impulseLimitMultiplier < 2) {
      throw new Error('RF conditioning options must define positive, bounded filter and level settings.');
    }
  }

  pushFrame(frame: PcmFrame): PcmFrame {
    if (frame.sampleRate <= 0 || frame.startSample < 0) throw new Error('RF conditioning requires a valid PCM frame.');
    if (frame.sampleRate !== this.sampleRate ||
      (this.expectedNextSample !== null && frame.startSample !== this.expectedNextSample)) {
      this.resetFilter(frame.sampleRate);
    }
    this.expectedNextSample = frame.startSample + frame.samples.length;
    this.inputLevel = rms(frame.samples);

    const highPassed = new Float32Array(frame.samples.length);
    const dcPole = Math.exp((-2 * Math.PI * this.cutoffHz) / frame.sampleRate);
    let removedDcSum = 0;
    for (let index = 0; index < frame.samples.length; index += 1) {
      const input = frame.samples[index];
      const filtered = input - this.previousInput + (dcPole * this.previousHighPassed);
      this.previousInput = input;
      this.previousHighPassed = filtered;
      highPassed[index] = filtered;
      removedDcSum += Math.abs(input - filtered);
    }
    this.removedDcLevel = frame.samples.length ? removedDcSum / frame.samples.length : 0;

    const magnitudes = Array.from(highPassed, (sample) => Math.abs(sample)).sort((left, right) => left - right);
    const robustSignalLevel = percentile(magnitudes, 0.82);
    const frameNoiseLevel = percentile(magnitudes, 0.2) * 2;
    this.noiseLevel = updateAsymmetric(this.noiseLevel, frameNoiseLevel, 0.3, 0.06);
    this.levelEnvelope = updateAsymmetric(this.levelEnvelope, robustSignalLevel, 0.28, 0.035);

    const impulseLimit = Math.max(0.08, percentile(magnitudes, 0.92) * this.impulseLimitMultiplier);
    const desiredGain = clamp(this.targetLevel / Math.max(0.015, this.levelEnvelope), this.minimumGain, this.maximumGain);
    this.gain += (desiredGain - this.gain) * (desiredGain < this.gain ? 0.35 : 0.16);

    const output = new Float32Array(highPassed.length);
    for (let index = 0; index < highPassed.length; index += 1) {
      const limited = clamp(highPassed[index], -impulseLimit, impulseLimit);
      if (limited !== highPassed[index]) this.limitedSampleCount += 1;
      output[index] = clamp(limited * this.gain, -1, 1);
    }
    this.outputLevel = rms(output);
    return { samples: output, sampleRate: frame.sampleRate, startSample: frame.startSample };
  }

  snapshot(): SignalConditioningSnapshot {
    return {
      inputLevel: this.inputLevel,
      outputLevel: this.outputLevel,
      noiseLevel: this.noiseLevel,
      gain: this.gain,
      removedDcLevel: this.removedDcLevel,
      limitedSampleCount: this.limitedSampleCount
    };
  }

  reset(): void {
    this.sampleRate = 0;
    this.expectedNextSample = null;
    this.previousInput = 0;
    this.previousHighPassed = 0;
    this.levelEnvelope = 0;
    this.noiseLevel = 0;
    this.gain = 1;
    this.inputLevel = 0;
    this.outputLevel = 0;
    this.removedDcLevel = 0;
    this.limitedSampleCount = 0;
  }

  private resetFilter(sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.expectedNextSample = null;
    this.previousInput = 0;
    this.previousHighPassed = 0;
  }
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function updateAsymmetric(current: number, next: number, fallingRate: number, risingRate: number): number {
  if (!current) return next;
  const rate = next < current ? fallingRate : risingRate;
  return current + ((next - current) * rate);
}

function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
