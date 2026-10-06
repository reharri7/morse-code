import { getMorseSymbolDefinition } from './morse-table';
import { MorseSequence } from './morse-sequence';
import {
  MorseTimeline,
  MorseTimelineRole,
  MorseTimelineSegment,
  MorseTimingBasis,
  MorseTimingProfile,
  ResolvedMorseTiming
} from './morse-timeline';

const PARIS_ELEMENT_UNITS = 31;
const PARIS_SPACING_UNITS = 19;
const PARIS_DIT_CONSTANT_MS = 1_200;
const PARIS_WORD_MS = 60_000;
const TIMING_EPSILON_MS = 1e-9;
const WPM_EPSILON = 1e-9;

/** Resolves true PARIS effective speed into separate element and boundary units. */
export function resolveMorseTiming(profile: MorseTimingProfile): ResolvedMorseTiming {
  assertPositiveFinite(profile.characterWpm, 'Character WPM');
  assertPositiveFinite(profile.effectiveWpm, 'Effective WPM');
  assertPositiveFinite(profile.toneFrequencyHz, 'Tone frequency');
  if (profile.effectiveWpm - profile.characterWpm > WPM_EPSILON) {
    throw new Error('Effective WPM cannot exceed character WPM.');
  }

  const elementUnitMs = PARIS_DIT_CONSTANT_MS / profile.characterWpm;
  const targetWordMs = PARIS_WORD_MS / profile.effectiveWpm;
  const spacingUnitMs = (targetWordMs - (PARIS_ELEMENT_UNITS * elementUnitMs)) / PARIS_SPACING_UNITS;
  if (spacingUnitMs + TIMING_EPSILON_MS < elementUnitMs) {
    throw new Error('The timing profile cannot preserve standard-or-longer Morse boundaries.');
  }

  return Object.freeze({
    profile: Object.freeze({ ...profile }),
    elementUnitMs,
    spacingUnitMs
  });
}

/**
 * Preserves the legacy generator's boundary-unit WPM while exposing the true
 * effective PARIS speed used by the shared timing model.
 */
export function timingProfileFromLegacySpacingWpm(
  characterWpm: number,
  spacingWordsPerMinute: number,
  toneFrequencyHz: number
): MorseTimingProfile {
  assertPositiveFinite(characterWpm, 'Character WPM');
  assertPositiveFinite(spacingWordsPerMinute, 'Spacing WPM');
  assertPositiveFinite(toneFrequencyHz, 'Tone frequency');
  const elementUnitMs = PARIS_DIT_CONSTANT_MS / characterWpm;
  const spacingUnitMs = PARIS_DIT_CONSTANT_MS / spacingWordsPerMinute;
  const effectiveWpm = spacingWordsPerMinute === characterWpm
    ? characterWpm
    : PARIS_WORD_MS /
      ((PARIS_ELEMENT_UNITS * elementUnitMs) + (PARIS_SPACING_UNITS * spacingUnitMs));
  return Object.freeze({ characterWpm, effectiveWpm, toneFrequencyHz });
}

/** Compiles canonical symbols and boundaries into an exact, renderer-neutral timeline. */
export function compileMorseTimeline(
  sequence: MorseSequence,
  profile: MorseTimingProfile
): MorseTimeline {
  const timing = resolveMorseTiming(profile);
  const segments: MorseTimelineSegment[] = [];
  let symbolIndex = 0;

  for (const token of sequence.tokens) {
    if (token.kind === 'character-boundary') {
      segments.push(createSegment('silence', 'character-gap', 'spacing', 3, null, timing));
      continue;
    }
    if (token.kind === 'word-boundary') {
      segments.push(createSegment('silence', 'word-gap', 'spacing', 7, null, timing));
      continue;
    }

    const pattern = getMorseSymbolDefinition(token.symbolId).pattern;
    [...pattern].forEach((mark, markIndex) => {
      const role: MorseTimelineRole = mark === '.' ? 'dit' : 'dah';
      const unitCount = mark === '.' ? 1 : 3;
      segments.push(createSegment('tone', role, 'element', unitCount, symbolIndex, timing));
      if (markIndex < pattern.length - 1) {
        segments.push(createSegment('silence', 'intra-character', 'element', 1, symbolIndex, timing));
      }
    });
    symbolIndex += 1;
  }

  return Object.freeze({
    segments: Object.freeze(segments),
    durationMs: segments.reduce((total, segment) => total + segment.durationMs, 0),
    timing
  });
}

function createSegment(
  kind: 'tone' | 'silence',
  role: MorseTimelineRole,
  timingBasis: MorseTimingBasis,
  unitCount: 1 | 3 | 7,
  symbolIndex: number | null,
  timing: ResolvedMorseTiming
): MorseTimelineSegment {
  const unitMs = timingBasis === 'element' ? timing.elementUnitMs : timing.spacingUnitMs;
  return Object.freeze({ kind, role, timingBasis, unitCount, symbolIndex, durationMs: unitCount * unitMs });
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}
