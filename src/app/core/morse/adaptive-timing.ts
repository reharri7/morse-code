import { TimingEvent, ToneSegment } from './interfaces';

export type TimingTrackerState = 'acquiring' | 'tracking';

export interface AdaptiveTimingOptions {
  readonly minimumWordsPerMinute?: number;
  readonly maximumWordsPerMinute?: number;
  readonly markHistoryLimit?: number;
  readonly gapHistoryLimit?: number;
  readonly acquisitionMarkCount?: number;
  readonly acquisitionBoundaryGapCount?: number;
  readonly maximumUpdateFraction?: number;
}

export interface AdaptiveTimingSnapshot {
  readonly state: TimingTrackerState;
  readonly elementDitDurationMs: number;
  readonly spacingUnitDurationMs: number;
  readonly characterWordsPerMinute: number;
  readonly effectiveWordsPerMinute: number;
  readonly confidence: number;
  readonly observationCount: number;
  readonly timingJitter: number;
}

type BufferedSegment = { readonly state: 'tone' | 'silence'; readonly durationMs: number };
type GapLevel = 'none' | 'character' | 'word';

interface UnitFit {
  readonly unitMs: number;
  readonly residual: number;
  readonly hasMultipleClasses: boolean;
}

/**
 * Resettable, browser-free M4 timing tracker. It robustly fits 1/3-unit marks,
 * fits 3/7-unit boundary gaps independently for Farnsworth, and only changes
 * a live estimate by a bounded amount per observation.
 */
export class AdaptiveTimingTracker {
  private readonly minimumDitMs: number;
  private readonly maximumDitMs: number;
  private readonly markHistoryLimit: number;
  private readonly gapHistoryLimit: number;
  private readonly acquisitionMarkCount: number;
  private readonly acquisitionBoundaryGapCount: number;
  private readonly maximumUpdateFraction: number;
  private readonly markDurations: number[] = [];
  private readonly gapDurations: number[] = [];
  private bufferedSegments: BufferedSegment[] = [];
  private trackerState: TimingTrackerState = 'acquiring';
  private elementDitMs = 0;
  private spacingUnitMs = 0;
  private elementFitResidual = 1;
  private spacingFitResidual = 1;
  private elementHasMultipleClasses = false;
  private spacingHasMultipleClasses = false;
  private openGapLevel: GapLevel = 'none';

  constructor(options: AdaptiveTimingOptions = {}) {
    const minimumWpm = options.minimumWordsPerMinute ?? 5;
    const maximumWpm = options.maximumWordsPerMinute ?? 60;
    if (minimumWpm <= 0 || maximumWpm <= minimumWpm) {
      throw new Error('Adaptive timing requires a valid positive WPM range.');
    }
    this.minimumDitMs = 1_200 / maximumWpm;
    this.maximumDitMs = 1_200 / minimumWpm;
    this.markHistoryLimit = Math.max(12, options.markHistoryLimit ?? 48);
    this.gapHistoryLimit = Math.max(8, options.gapHistoryLimit ?? 32);
    this.acquisitionMarkCount = Math.max(3, options.acquisitionMarkCount ?? 4);
    this.acquisitionBoundaryGapCount = Math.max(1, options.acquisitionBoundaryGapCount ?? 2);
    this.maximumUpdateFraction = clamp(options.maximumUpdateFraction ?? 0.1, 0.02, 0.25);
  }

  pushSegment(segment: ToneSegment): readonly TimingEvent[] {
    const item: BufferedSegment = { state: segment.state, durationMs: durationMs(segment) };
    if (item.durationMs <= 0) return [];
    if (item.state === 'silence' && this.markDurations.length === 0) return [];

    if (item.state === 'tone') {
      pushBounded(this.markDurations, item.durationMs, this.markHistoryLimit);
      // Bootstrap directly from the growing robust fit. Bounded smoothing only
      // applies after acquisition, when an abrupt jump would destabilize text.
      this.updateElementEstimate(this.trackerState === 'acquiring');
    } else {
      pushBounded(this.gapDurations, item.durationMs, this.gapHistoryLimit);
      this.updateSpacingEstimate();
    }

    if (this.trackerState === 'acquiring') {
      this.bufferedSegments.push(item);
      if (!this.readyToTrack()) return [];
      this.trackerState = 'tracking';
      this.updateSpacingEstimate(true);
      const replay = this.classifyBufferedSegments();
      this.openGapLevel = 'none';
      return replay;
    }

    if (item.state === 'tone') return [this.classifyMark(item.durationMs)];
    return this.completeGap(item.durationMs);
  }

  previewOpenGap(duration: number): readonly TimingEvent[] {
    if (this.trackerState !== 'tracking' || !this.spacingUnitMs || duration <= 0) return [];
    const nextLevel = gapLevel(duration, this.spacingUnitMs);
    if (nextLevel === 'none' || gapRank(nextLevel) <= gapRank(this.openGapLevel)) return [];
    this.openGapLevel = nextLevel;
    return [this.classifyBoundaryGap(duration, nextLevel)];
  }

  flush(): readonly TimingEvent[] {
    if (this.trackerState === 'tracking') {
      this.openGapLevel = 'none';
      return [];
    }
    if (!this.markDurations.length) return [];
    this.updateElementEstimate(true);
    this.updateSpacingEstimate(true);
    this.trackerState = 'tracking';
    const replay = this.classifyBufferedSegments();
    this.openGapLevel = 'none';
    return replay;
  }

  resetOpenGap(): void {
    this.openGapLevel = 'none';
  }

  reset(): void {
    this.markDurations.length = 0;
    this.gapDurations.length = 0;
    this.bufferedSegments = [];
    this.trackerState = 'acquiring';
    this.elementDitMs = 0;
    this.spacingUnitMs = 0;
    this.elementFitResidual = 1;
    this.spacingFitResidual = 1;
    this.elementHasMultipleClasses = false;
    this.spacingHasMultipleClasses = false;
    this.openGapLevel = 'none';
  }

  snapshot(): AdaptiveTimingSnapshot {
    const characterWordsPerMinute = this.elementDitMs ? 1_200 / this.elementDitMs : 0;
    const spacingUnit = this.spacingUnitMs || this.elementDitMs;
    const effectiveWordsPerMinute = this.elementDitMs && spacingUnit
      ? 60_000 / ((31 * this.elementDitMs) + (19 * spacingUnit))
      : 0;
    const markEvidence = Math.min(1, this.markDurations.length / 10);
    const gapEvidence = Math.min(1, this.boundaryGapDurations().length / 4);
    const elementQuality = Math.max(0, 1 - (this.elementFitResidual / 0.35));
    const spacingQuality = Math.max(0, 1 - (this.spacingFitResidual / 0.4));
    const diversity = (this.elementHasMultipleClasses ? 0.15 : 0) + (this.spacingHasMultipleClasses ? 0.1 : 0);
    const confidence = this.trackerState === 'tracking'
      ? clamp((0.4 * markEvidence) + (0.2 * gapEvidence) + (0.2 * elementQuality) + (0.1 * spacingQuality) + diversity, 0, 1)
      : clamp(0.25 * markEvidence * elementQuality, 0, 0.35);
    return {
      state: this.trackerState,
      elementDitDurationMs: this.elementDitMs,
      spacingUnitDurationMs: spacingUnit,
      characterWordsPerMinute,
      effectiveWordsPerMinute,
      confidence,
      observationCount: this.markDurations.length + this.gapDurations.length,
      timingJitter: clamp((this.elementFitResidual + this.spacingFitResidual) / 2, 0, 1)
    };
  }

  private updateElementEstimate(force = false): void {
    const fit = fitUnit(this.markDurations, [1, 3], this.minimumDitMs, this.maximumDitMs);
    if (!fit) return;
    this.elementFitResidual = fit.residual;
    this.elementHasMultipleClasses = fit.hasMultipleClasses;
    this.elementDitMs = updateEstimate(this.elementDitMs, fit.unitMs, force ? 1 : this.maximumUpdateFraction);
  }

  private updateSpacingEstimate(force = false): void {
    if (!this.elementDitMs) return;
    // Very long outages are useful word-boundary evidence but are not genuine
    // 7-unit spacing observations and must not stretch the Farnsworth estimate.
    const boundaryGaps = this.boundaryGapDurations()
      .filter((duration) => duration <= 10 * this.elementDitMs);
    const fit = fitUnit(
      boundaryGaps,
      [3, 7],
      this.elementDitMs * 0.75,
      this.maximumDitMs * 4
    );
    if (!fit) {
      this.spacingUnitMs = this.elementDitMs;
      return;
    }
    this.spacingFitResidual = fit.residual;
    this.spacingHasMultipleClasses = fit.hasMultipleClasses;
    this.spacingUnitMs = updateEstimate(this.spacingUnitMs || this.elementDitMs, fit.unitMs, force ? 1 : this.maximumUpdateFraction);
  }

  private boundaryGapDurations(): number[] {
    if (!this.elementDitMs) return [];
    return this.gapDurations.filter((duration) => duration >= 1.8 * this.elementDitMs);
  }

  private readyToTrack(): boolean {
    if (this.markDurations.length < this.acquisitionMarkCount || !this.elementDitMs) return false;
    return this.boundaryGapDurations().length >= this.acquisitionBoundaryGapCount || this.markDurations.length >= 12;
  }

  private classifyBufferedSegments(): TimingEvent[] {
    const events: TimingEvent[] = [];
    for (const segment of this.bufferedSegments) {
      if (segment.state === 'tone') events.push(this.classifyMark(segment.durationMs));
      else {
        const level = gapLevel(segment.durationMs, this.spacingUnitMs || this.elementDitMs);
        if (level !== 'none') events.push(this.classifyBoundaryGap(segment.durationMs, level));
      }
    }
    this.bufferedSegments = [];
    return events;
  }

  private classifyMark(duration: number): TimingEvent {
    const units = duration / this.elementDitMs;
    const ditDistance = Math.abs(units - 1);
    const dahDistance = Math.abs(units - 3) / 3;
    const kind = ditDistance <= dahDistance ? 'dit' : 'dah';
    const residual = kind === 'dit' ? ditDistance : dahDistance;
    return timingEvent(kind, duration, residual, this.snapshot().confidence, 'mark');
  }

  private completeGap(duration: number): TimingEvent[] {
    const level = gapLevel(duration, this.spacingUnitMs || this.elementDitMs);
    if (level === 'none') {
      this.openGapLevel = 'none';
      return [];
    }
    const shouldEmit = gapRank(level) > gapRank(this.openGapLevel);
    this.openGapLevel = 'none';
    return shouldEmit ? [this.classifyBoundaryGap(duration, level)] : [];
  }

  private classifyBoundaryGap(duration: number, level: Exclude<GapLevel, 'none'>): TimingEvent {
    const expectedUnits = level === 'character' ? 3 : 7;
    const residual = Math.abs((duration / (this.spacingUnitMs || this.elementDitMs)) - expectedUnits) / expectedUnits;
    return timingEvent(level === 'character' ? 'character-gap' : 'word-gap', duration, residual, this.snapshot().confidence, 'gap');
  }
}

function fitUnit(durations: readonly number[], classes: readonly number[], minimum: number, maximum: number): UnitFit | null {
  if (!durations.length) return null;
  const candidates: number[] = [];
  for (const duration of durations) {
    for (const units of classes) {
      const candidate = duration / units;
      if (candidate >= minimum && candidate <= maximum) candidates.push(candidate);
    }
  }
  if (!candidates.length) return null;

  let bestUnit = candidates[0];
  let bestResidual = Number.POSITIVE_INFINITY;
  let bestClasses = new Set<number>();
  for (const candidate of candidates) {
    const residuals: number[] = [];
    const selectedClasses = new Set<number>();
    durations.forEach((duration, index) => {
      let selected = classes[0];
      let residual = Number.POSITIVE_INFINITY;
      for (const units of classes) {
        const candidateResidual = Math.abs(duration - (candidate * units)) / (candidate * units);
        if (candidateResidual < residual) {
          residual = candidateResidual;
          selected = units;
        }
      }
      selectedClasses.add(selected);
      const recencyWeight = Math.pow(0.94, durations.length - index - 1);
      residuals.push(Math.min(residual, 0.8) * recencyWeight);
    });
    const score = residuals.reduce((sum, value) => sum + value, 0) /
      durations.reduce((sum, _value, index) => sum + Math.pow(0.94, durations.length - index - 1), 0);
    if (score < bestResidual - 1e-6 || (Math.abs(score - bestResidual) <= 1e-6 && candidate > bestUnit)) {
      bestResidual = score;
      bestUnit = candidate;
      bestClasses = selectedClasses;
    }
  }
  // Refine the winning cluster with a weighted least-squares unit. Long marks
  // and word gaps span more samples, so detector-edge quantization is a smaller
  // fraction of their duration and they provide stronger timing evidence.
  let weightedUnitSum = 0;
  let totalWeight = 0;
  const refinedClasses = new Set<number>();
  durations.forEach((duration, index) => {
    let selected = classes[0];
    let selectedResidual = Number.POSITIVE_INFINITY;
    for (const units of classes) {
      const residual = Math.abs(duration - (bestUnit * units)) / (bestUnit * units);
      if (residual < selectedResidual) {
        selectedResidual = residual;
        selected = units;
      }
    }
    refinedClasses.add(selected);
    const weight = selected * selected * Math.pow(0.94, durations.length - index - 1);
    weightedUnitSum += (duration / selected) * weight;
    totalWeight += weight;
  });
  const refinedUnit = clamp(weightedUnitSum / totalWeight, minimum, maximum);
  let refinedResidualSum = 0;
  let residualWeight = 0;
  durations.forEach((duration, index) => {
    let residual = Number.POSITIVE_INFINITY;
    for (const units of classes) {
      residual = Math.min(residual, Math.abs(duration - (refinedUnit * units)) / (refinedUnit * units));
    }
    const weight = Math.pow(0.94, durations.length - index - 1);
    refinedResidualSum += Math.min(residual, 0.8) * weight;
    residualWeight += weight;
  });
  return {
    unitMs: refinedUnit,
    residual: refinedResidualSum / residualWeight,
    hasMultipleClasses: refinedClasses.size > 1
  };
}

function timingEvent(
  kind: TimingEvent['kind'],
  duration: number,
  residual: number,
  trackerConfidence: number,
  observation: 'mark' | 'gap'
): TimingEvent {
  const fitConfidence = clamp(1 - (residual / 0.45), 0, 1);
  const confidence = clamp((0.65 * fitConfidence) + (0.35 * trackerConfidence), 0, 1);
  const reasons: string[] = [];
  if (trackerConfidence < 0.5) reasons.push('timing estimate is still developing');
  if (residual > 0.22) reasons.push(`${observation} falls between expected timing groups`);
  return { kind, durationMs: duration, confidence, residual, reasons };
}

function gapLevel(duration: number, spacingUnitMs: number): GapLevel {
  if (!spacingUnitMs || duration < 2 * spacingUnitMs) return 'none';
  return duration >= 5 * spacingUnitMs ? 'word' : 'character';
}

function gapRank(level: GapLevel): number {
  return level === 'none' ? 0 : level === 'character' ? 1 : 2;
}

function updateEstimate(current: number, target: number, maximumFraction: number): number {
  if (!current) return target;
  const maximumChange = current * maximumFraction;
  return current + clamp(target - current, -maximumChange, maximumChange);
}

function durationMs(segment: ToneSegment): number {
  return ((segment.endSample - segment.startSample) / segment.sampleRate) * 1_000;
}

function pushBounded(values: number[], value: number, limit: number): void {
  values.push(value);
  if (values.length > limit) values.splice(0, values.length - limit);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
