import { PcmFrame } from './interfaces';

export type AcquisitionState = 'searching' | 'locked' | 'degraded' | 'lost';
export type LockMode = 'automatic' | 'manual';

export interface SpectrumCandidate {
  readonly frequencyHz: number;
  readonly power: number;
  readonly noisePower: number;
  readonly snrDb: number;
  readonly narrowness: number;
  readonly persistence: number;
  readonly dutyCycle: number;
  readonly score: number;
}

export interface SpectrumScan {
  readonly startSample: number;
  readonly endSample: number;
  readonly sampleRate: number;
  readonly noisePower: number;
  readonly candidates: readonly SpectrumCandidate[];
}

export interface ToneAcquisitionOptions {
  readonly minFrequencyHz?: number;
  readonly maxFrequencyHz?: number;
  readonly frequencyStepHz?: number;
  readonly minimumPower?: number;
  readonly minimumSnrDb?: number;
  readonly acquireScans?: number;
  readonly degradeScans?: number;
  readonly loseScans?: number;
  readonly trackingRangeHz?: number;
  readonly maxCandidates?: number;
  readonly manualFrequencyHz?: number;
}

export interface ToneAcquisitionSnapshot {
  readonly state: AcquisitionState;
  readonly mode: LockMode;
  readonly lockedFrequencyHz: number | null;
  readonly lockQuality: number;
  readonly snrDb: number | null;
  readonly tonePower: number;
  readonly noisePower: number;
  readonly powerOnThreshold: number;
  readonly powerOffThreshold: number;
  readonly candidates: readonly SpectrumCandidate[];
  readonly transitionReason: string;
}

const EPSILON = 1e-12;

/** Bounded, windowed Goertzel-bank spectrum scan for the configured CW audio band. */
export class SpectralToneScanner {
  private sampleRate = 0;
  private analysisSize = 0;
  private hopSize = 0;
  private buffer = new Float32Array();
  private window = new Float32Array();
  private windowedBuffer = new Float32Array();
  private windowSum = 0;
  private bufferLength = 0;
  private bufferStartSample = 0;
  private expectedNextSample: number | null = null;
  private frequencies: number[] = [];
  private persistence = new Float32Array();
  private dutyCycle = new Float32Array();
  private trackingFrequencyHz: number | null = null;
  private trackingRangeHz = 0;
  private smoothedNoisePower = 0;

  constructor(private readonly options: Required<Pick<ToneAcquisitionOptions,
    'minFrequencyHz' | 'maxFrequencyHz' | 'frequencyStepHz' | 'minimumPower' | 'minimumSnrDb' | 'maxCandidates'>>) {}

  pushFrame(frame: PcmFrame): SpectrumScan[] {
    if (frame.sampleRate <= 0) throw new Error('Spectrum scanning requires a positive sample rate.');
    if (frame.sampleRate !== this.sampleRate ||
      (this.expectedNextSample !== null && frame.startSample !== this.expectedNextSample)) {
      this.configureForSampleRate(frame.sampleRate);
    }
    this.expectedNextSample = frame.startSample + frame.samples.length;

    const scans: SpectrumScan[] = [];
    let sourceOffset = 0;
    while (sourceOffset < frame.samples.length) {
      if (!this.bufferLength) this.bufferStartSample = frame.startSample + sourceOffset;
      const copyLength = Math.min(frame.samples.length - sourceOffset, this.analysisSize - this.bufferLength);
      this.buffer.set(frame.samples.subarray(sourceOffset, sourceOffset + copyLength), this.bufferLength);
      this.bufferLength += copyLength;
      sourceOffset += copyLength;
      if (this.bufferLength === this.analysisSize) {
        scans.push(this.scan());
        this.buffer.copyWithin(0, this.hopSize, this.analysisSize);
        this.bufferLength = this.analysisSize - this.hopSize;
        this.bufferStartSample += this.hopSize;
      }
    }
    return scans;
  }

  reset(): void {
    this.bufferLength = 0;
    this.expectedNextSample = null;
    this.smoothedNoisePower = 0;
    this.persistence.fill(0);
    this.dutyCycle.fill(0);
  }

  setTrackingFrequency(frequencyHz: number | null, rangeHz = 0): void {
    this.trackingFrequencyHz = frequencyHz;
    this.trackingRangeHz = rangeHz;
  }

  private configureForSampleRate(sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.analysisSize = nextPowerOfTwo(Math.max(512, Math.min(4_096, Math.round(sampleRate * 0.064))));
    this.hopSize = this.analysisSize / 2;
    this.buffer = new Float32Array(this.analysisSize);
    this.window = new Float32Array(this.analysisSize);
    this.windowedBuffer = new Float32Array(this.analysisSize);
    this.windowSum = 0;
    for (let index = 0; index < this.analysisSize; index += 1) {
      this.window[index] = 0.5 - (0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, this.analysisSize - 1)));
      this.windowSum += this.window[index];
    }
    this.bufferLength = 0;
    this.expectedNextSample = null;
    this.smoothedNoisePower = 0;
    const highestFrequency = Math.min(this.options.maxFrequencyHz, (sampleRate / 2) - this.options.frequencyStepHz);
    this.frequencies = [];
    for (let frequency = this.options.minFrequencyHz; frequency <= highestFrequency; frequency += this.options.frequencyStepHz) {
      this.frequencies.push(frequency);
    }
    this.persistence = new Float32Array(this.frequencies.length);
    this.dutyCycle = new Float32Array(this.frequencies.length);
  }

  private scan(): SpectrumScan {
    for (let index = 0; index < this.analysisSize; index += 1) {
      this.windowedBuffer[index] = this.buffer[index] * this.window[index];
    }
    const frequencyIndexes = this.frequencies
      .map((_, index) => index)
      .filter((index) => this.trackingFrequencyHz === null ||
        Math.abs(this.frequencies[index] - this.trackingFrequencyHz) <= this.trackingRangeHz + this.options.frequencyStepHz);
    const powers = frequencyIndexes.map((index) => goertzelPower(
      this.windowedBuffer, this.frequencies[index], this.sampleRate, this.windowSum * this.windowSum
    ));
    const sortedPowers = [...powers].sort((left, right) => left - right);
    const measuredNoisePower = sortedPowers[Math.floor(sortedPowers.length / 2)] ?? 0;
    if (!this.smoothedNoisePower) this.smoothedNoisePower = measuredNoisePower;
    else this.smoothedNoisePower += (measuredNoisePower - this.smoothedNoisePower) *
      (measuredNoisePower < this.smoothedNoisePower ? 0.3 : 0.08);
    const noisePower = this.smoothedNoisePower;
    const maximumPower = Math.max(EPSILON, ...powers);
    const candidates: SpectrumCandidate[] = [];

    for (let localIndex = 0; localIndex < powers.length; localIndex += 1) {
      const index = frequencyIndexes[localIndex];
      const power = powers[localIndex];
      const left = powers[Math.max(0, localIndex - 1)] ?? 0;
      const right = powers[Math.min(powers.length - 1, localIndex + 1)] ?? 0;
      const isLocalPeak = power >= left && power >= right && (power > left || power > right);
      const snrDb = 10 * Math.log10((power + EPSILON) / (noisePower + EPSILON));
      const narrowness = power / (((left + right) / 2) + EPSILON);
      const strong = isLocalPeak && power >= this.options.minimumPower &&
        snrDb >= this.options.minimumSnrDb && narrowness >= 1.01;
      this.persistence[index] = strong
        ? Math.min(1, (this.persistence[index] * 0.78) + 0.28)
        : this.persistence[index] * 0.82;
      this.dutyCycle[index] = (this.dutyCycle[index] * 0.9) + (strong ? 0.1 : 0);
      if (!isLocalPeak || power < this.options.minimumPower) continue;

      const frequencyHz = interpolatePeakFrequency(this.frequencies[index], left, power, right, this.options.frequencyStepHz);
      const snrScore = clamp(snrDb / 30, 0, 1);
      const narrownessScore = clamp((narrowness - 1) / 2, 0, 1);
      const relativePowerScore = clamp(power / maximumPower, 0, 1);
      const carrierPenalty = this.dutyCycle[index] > 0.88 ? 0.25 : this.dutyCycle[index] > 0.76 ? 0.6 : 1;
      const score = carrierPenalty * ((0.32 * snrScore) + (0.18 * narrownessScore) +
        (0.3 * this.persistence[index]) + (0.2 * relativePowerScore));
      candidates.push({
        frequencyHz,
        power,
        noisePower,
        snrDb,
        narrowness,
        persistence: this.persistence[index],
        dutyCycle: this.dutyCycle[index],
        score: clamp(score, 0, 1)
      });
    }

    candidates.sort((left, right) => right.score - left.score || right.power - left.power);
    return {
      startSample: this.bufferStartSample,
      endSample: this.bufferStartSample + this.analysisSize,
      sampleRate: this.sampleRate,
      noisePower,
      candidates: candidates.slice(0, this.options.maxCandidates)
    };
  }
}

/** Acquisition, drift tracking, hysteresis, and manual-lock policy. */
export class ToneAcquisitionTracker {
  private readonly settings: Required<Omit<ToneAcquisitionOptions, 'manualFrequencyHz'>>;
  private readonly scanner: SpectralToneScanner;
  private mode: LockMode;
  private state: AcquisitionState;
  private lockedFrequencyHz: number | null;
  private candidateFrequencyHz: number | null = null;
  private acquireStreak = 0;
  private poorStreak = 0;
  private lockQuality = 0;
  private snrDb: number | null = null;
  private tonePower = 0;
  private noisePower = 0;
  private powerOnThreshold: number;
  private powerOffThreshold: number;
  private candidates: readonly SpectrumCandidate[] = [];
  private transitionReason: string;

  constructor(options: ToneAcquisitionOptions = {}) {
    this.settings = {
      minFrequencyHz: options.minFrequencyHz ?? 300,
      maxFrequencyHz: options.maxFrequencyHz ?? 1_200,
      frequencyStepHz: options.frequencyStepHz ?? 20,
      minimumPower: options.minimumPower ?? 0.00001,
      minimumSnrDb: options.minimumSnrDb ?? 7,
      acquireScans: options.acquireScans ?? 3,
      degradeScans: options.degradeScans ?? 6,
      loseScans: options.loseScans ?? 18,
      trackingRangeHz: options.trackingRangeHz ?? 80,
      maxCandidates: options.maxCandidates ?? 5
    };
    validateSettings(this.settings);
    this.scanner = new SpectralToneScanner(this.settings);
    this.mode = options.manualFrequencyHz === undefined ? 'automatic' : 'manual';
    this.lockedFrequencyHz = options.manualFrequencyHz ?? null;
    this.state = this.lockedFrequencyHz === null ? 'searching' : 'locked';
    this.powerOnThreshold = this.settings.minimumPower;
    this.powerOffThreshold = this.settings.minimumPower * 0.6;
    this.transitionReason = this.mode === 'manual' ? 'Manual frequency selected.' : 'Scanning the configured CW audio band.';
  }

  pushFrame(frame: PcmFrame): ToneAcquisitionSnapshot {
    for (const scan of this.scanner.pushFrame(frame)) this.consumeScan(scan);
    return this.snapshot();
  }

  setManualFrequency(frequencyHz: number | null): ToneAcquisitionSnapshot {
    this.acquireStreak = 0;
    this.poorStreak = 0;
    if (frequencyHz === null) {
      this.mode = 'automatic';
      this.state = 'searching';
      this.lockedFrequencyHz = null;
      this.lockQuality = 0;
      this.transitionReason = 'Manual lock released; scanning for the best persistent tone.';
      this.scanner.setTrackingFrequency(null);
    } else {
      if (frequencyHz < this.settings.minFrequencyHz || frequencyHz > this.settings.maxFrequencyHz) {
        throw new Error('Manual frequency must be inside the configured scan band.');
      }
      this.mode = 'manual';
      this.state = 'locked';
      this.lockedFrequencyHz = frequencyHz;
      this.lockQuality = 0;
      this.transitionReason = 'Manual frequency selected; automatic chasing is disabled.';
      this.scanner.setTrackingFrequency(null);
    }
    return this.snapshot();
  }

  snapshot(): ToneAcquisitionSnapshot {
    return {
      state: this.state,
      mode: this.mode,
      lockedFrequencyHz: this.lockedFrequencyHz,
      lockQuality: this.lockQuality,
      snrDb: this.snrDb,
      tonePower: this.tonePower,
      noisePower: this.noisePower,
      powerOnThreshold: this.powerOnThreshold,
      powerOffThreshold: this.powerOffThreshold,
      candidates: [...this.candidates],
      transitionReason: this.transitionReason
    };
  }

  private consumeScan(scan: SpectrumScan): void {
    this.candidates = scan.candidates;
    this.noisePower = scan.noisePower;
    if (this.mode === 'manual') this.updateManualLock();
    else if (this.state === 'searching' || this.state === 'lost') this.searchForLock();
    else this.trackAutomaticLock();
  }

  private searchForLock(): void {
    const best = this.candidates[0];
    if (!best || !this.isStrong(best)) {
      this.acquireStreak = 0;
      this.candidateFrequencyHz = null;
      this.lockQuality *= 0.85;
      return;
    }
    if (this.candidateFrequencyHz !== null &&
      Math.abs(best.frequencyHz - this.candidateFrequencyHz) <= this.settings.frequencyStepHz * 1.5) {
      this.acquireStreak += 1;
      this.candidateFrequencyHz = (this.candidateFrequencyHz * 0.65) + (best.frequencyHz * 0.35);
    } else {
      this.candidateFrequencyHz = best.frequencyHz;
      this.acquireStreak = 1;
    }
    this.useEvidence(best);
    if (this.acquireStreak >= this.settings.acquireScans) {
      this.lockedFrequencyHz = this.candidateFrequencyHz;
      this.state = 'locked';
      this.poorStreak = 0;
      this.transitionReason = `Locked a persistent narrow tone near ${Math.round(this.lockedFrequencyHz)} Hz.`;
      this.scanner.setTrackingFrequency(this.lockedFrequencyHz, this.settings.trackingRangeHz);
    }
  }

  private trackAutomaticLock(): void {
    const lockedFrequency = this.lockedFrequencyHz;
    const nearby = lockedFrequency === null ? undefined : nearestCandidate(this.candidates, lockedFrequency, this.settings.trackingRangeHz);
    if (nearby && this.isStrong(nearby)) {
      this.poorStreak = 0;
      this.state = 'locked';
      this.lockedFrequencyHz = (lockedFrequency as number) * 0.78 + nearby.frequencyHz * 0.22;
      this.scanner.setTrackingFrequency(this.lockedFrequencyHz, this.settings.trackingRangeHz);
      this.useEvidence(nearby);
      this.transitionReason = 'Tracking the locked tone within its frequency neighborhood.';
      return;
    }
    this.handlePoorEvidence(false);
  }

  private updateManualLock(): void {
    const lockedFrequency = this.lockedFrequencyHz;
    const selected = lockedFrequency === null ? undefined : nearestCandidate(this.candidates, lockedFrequency, this.settings.trackingRangeHz);
    if (selected && this.isStrong(selected)) {
      this.poorStreak = 0;
      this.state = 'locked';
      this.useEvidence(selected);
      this.transitionReason = 'Manual frequency is present; automatic chasing remains disabled.';
      return;
    }
    this.handlePoorEvidence(true);
  }

  private handlePoorEvidence(manual: boolean): void {
    this.poorStreak += 1;
    this.lockQuality *= 0.86;
    this.snrDb = null;
    this.tonePower = 0;
    if (this.poorStreak >= this.settings.loseScans) {
      this.state = 'lost';
      if (!manual) this.lockedFrequencyHz = null;
      if (!manual) this.scanner.setTrackingFrequency(null);
      this.transitionReason = manual
        ? 'The manually selected tone is lost; the selected frequency is still held.'
        : 'Lock was lost after sustained poor evidence; scanning to reacquire.';
    } else if (this.poorStreak >= this.settings.degradeScans) {
      this.state = 'degraded';
      this.transitionReason = manual
        ? 'Manual lock quality is degraded; the selected frequency is unchanged.'
        : 'Lock quality is degraded; holding the current neighborhood.';
    }
  }

  private useEvidence(candidate: SpectrumCandidate): void {
    this.lockQuality = clamp(candidate.score, 0, 1);
    this.snrDb = candidate.snrDb;
    this.tonePower = candidate.power;
    const range = Math.max(candidate.power - candidate.noisePower, this.settings.minimumPower);
    this.powerOnThreshold = Math.max(this.settings.minimumPower, candidate.noisePower + (range * 0.2));
    this.powerOffThreshold = Math.max(this.settings.minimumPower * 0.5, candidate.noisePower + (range * 0.1));
  }

  private isStrong(candidate: SpectrumCandidate): boolean {
    return candidate.power >= this.settings.minimumPower && candidate.snrDb >= this.settings.minimumSnrDb &&
      candidate.narrowness >= 1.01 && candidate.persistence >= 0.3 && candidate.score >= 0.32;
  }
}

function goertzelPower(samples: Float32Array, frequencyHz: number, sampleRate: number, normalization: number): number {
  const coefficient = 2 * Math.cos((2 * Math.PI * frequencyHz) / sampleRate);
  let previous = 0;
  let previousPrevious = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index] + coefficient * previous - previousPrevious;
    previousPrevious = previous;
    previous = current;
  }
  const power = previousPrevious ** 2 + previous ** 2 - coefficient * previous * previousPrevious;
  return power / Math.max(EPSILON, normalization);
}

function interpolatePeakFrequency(centerFrequency: number, left: number, center: number, right: number, step: number): number {
  const denominator = left - (2 * center) + right;
  if (Math.abs(denominator) < EPSILON) return centerFrequency;
  return centerFrequency + (clamp(0.5 * (left - right) / denominator, -0.5, 0.5) * step);
}

function nearestCandidate(candidates: readonly SpectrumCandidate[], frequencyHz: number, rangeHz: number): SpectrumCandidate | undefined {
  return candidates
    .filter((candidate) => Math.abs(candidate.frequencyHz - frequencyHz) <= rangeHz)
    .sort((left, right) => Math.abs(left.frequencyHz - frequencyHz) - Math.abs(right.frequencyHz - frequencyHz))[0];
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function validateSettings(settings: Required<Omit<ToneAcquisitionOptions, 'manualFrequencyHz'>>): void {
  if (settings.minFrequencyHz <= 0 || settings.maxFrequencyHz <= settings.minFrequencyHz || settings.frequencyStepHz <= 0 ||
    settings.minimumPower <= 0 || settings.minimumSnrDb <= 0 || settings.acquireScans < 1 ||
    settings.degradeScans < 1 || settings.loseScans <= settings.degradeScans || settings.trackingRangeHz <= 0) {
    throw new Error('Tone acquisition options must define a valid band, thresholds, and hysteresis counts.');
  }
}
