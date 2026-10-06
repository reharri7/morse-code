/** Framework-free contracts shared by generated CW and future learning audio. */

export type MorseTimelineRole =
  | 'dit'
  | 'dah'
  | 'intra-character'
  | 'character-gap'
  | 'word-gap';

export type MorseTimingBasis = 'element' | 'spacing';

export interface MorseTimingProfile {
  readonly characterWpm: number;
  /** True PARIS effective speed. Must not exceed characterWpm. */
  readonly effectiveWpm: number;
  readonly toneFrequencyHz: number;
}

export interface ResolvedMorseTiming {
  readonly profile: MorseTimingProfile;
  readonly elementUnitMs: number;
  readonly spacingUnitMs: number;
}

export interface MorseTimelineSegment {
  readonly kind: 'tone' | 'silence';
  readonly durationMs: number;
  readonly role: MorseTimelineRole;
  readonly timingBasis: MorseTimingBasis;
  readonly unitCount: 1 | 3 | 7;
  readonly symbolIndex: number | null;
}

export interface MorseTimeline {
  readonly segments: readonly MorseTimelineSegment[];
  readonly durationMs: number;
  readonly timing: ResolvedMorseTiming;
}
