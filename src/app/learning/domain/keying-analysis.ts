import { CHARACTER_BY_MORSE, getMorseSymbolDefinition } from '../../core/morse/morse-table';

export interface KeyingStroke {
  readonly downAtMs: number;
  readonly upAtMs: number;
}

export interface KeyingElementResult {
  readonly sent: '.' | '-';
  readonly expected: '.' | '-' | null;
  readonly durationMs: number;
  readonly targetDurationMs: number;
  readonly timingErrorRatio: number;
}

export interface KeyingGapResult {
  readonly durationMs: number;
  readonly targetDurationMs: number;
  readonly timingErrorRatio: number;
}

export interface KeyingAttemptResult {
  readonly targetSymbolId: string;
  readonly expectedPattern: string;
  readonly sentPattern: string;
  readonly decodedSymbolId: string | null;
  readonly patternCorrect: boolean;
  readonly rhythmScore: number;
  readonly passed: boolean;
  readonly elements: readonly KeyingElementResult[];
  readonly gaps: readonly KeyingGapResult[];
  readonly guidance: string;
}

const DIT_DAH_BOUNDARY_UNITS = 2;
const PASSING_RHYTHM_SCORE = 70;

/** Pure, deterministic straight-key analysis against the requested character speed. */
export function analyzeKeyingAttempt(
  targetSymbolId: string,
  strokes: readonly KeyingStroke[],
  characterWpm: number
): KeyingAttemptResult {
  const target = getMorseSymbolDefinition(targetSymbolId);
  if (!Number.isFinite(characterWpm) || characterWpm < 5 || characterWpm > 80) {
    throw new Error('Keying speed must be between 5 and 80 WPM.');
  }
  const normalized = normalizeStrokes(strokes);
  const ditMs = 1_200 / characterWpm;
  const elements = normalized.map((stroke, index): KeyingElementResult => {
    const durationMs = stroke.upAtMs - stroke.downAtMs;
    const sent = durationMs < ditMs * DIT_DAH_BOUNDARY_UNITS ? '.' : '-';
    const expected = (target.pattern[index] as '.' | '-' | undefined) ?? null;
    const targetDurationMs = (sent === '.' ? 1 : 3) * ditMs;
    return {
      sent,
      expected,
      durationMs,
      targetDurationMs,
      timingErrorRatio: relativeError(durationMs, targetDurationMs)
    };
  });
  const gaps = normalized.slice(1).map((stroke, index): KeyingGapResult => {
    const durationMs = stroke.downAtMs - normalized[index].upAtMs;
    return {
      durationMs,
      targetDurationMs: ditMs,
      timingErrorRatio: relativeError(durationMs, ditMs)
    };
  });
  const sentPattern = elements.map((element) => element.sent).join('');
  const patternCorrect = sentPattern === target.pattern;
  const errors = [...elements.map((element) => element.timingErrorRatio), ...gaps.map((gap) => gap.timingErrorRatio)];
  const meanError = errors.length
    ? errors.reduce((total, error) => total + Math.min(error, 1), 0) / errors.length
    : 1;
  const rhythmScore = Math.round(Math.max(0, (1 - meanError) * 100));
  const passed = patternCorrect && rhythmScore >= PASSING_RHYTHM_SCORE;
  const decodedSymbolId = CHARACTER_BY_MORSE[sentPattern] ?? null;
  return {
    targetSymbolId: target.id,
    expectedPattern: target.pattern,
    sentPattern,
    decodedSymbolId,
    patternCorrect,
    rhythmScore,
    passed,
    elements,
    gaps,
    guidance: guidanceFor(patternCorrect, rhythmScore, sentPattern, decodedSymbolId)
  };
}

function normalizeStrokes(strokes: readonly KeyingStroke[]): readonly KeyingStroke[] {
  const normalized = strokes.map((stroke) => ({ downAtMs: Number(stroke.downAtMs), upAtMs: Number(stroke.upAtMs) }));
  for (let index = 0; index < normalized.length; index += 1) {
    const stroke = normalized[index];
    if (!Number.isFinite(stroke.downAtMs) || !Number.isFinite(stroke.upAtMs) || stroke.upAtMs <= stroke.downAtMs) {
      throw new Error('Every keying stroke needs a positive, finite duration.');
    }
    if (index > 0 && stroke.downAtMs < normalized[index - 1].upAtMs) {
      throw new Error('Keying strokes cannot overlap or move backward in time.');
    }
  }
  return normalized;
}

function relativeError(actual: number, target: number): number {
  return Math.abs(actual - target) / target;
}

function guidanceFor(
  patternCorrect: boolean,
  rhythmScore: number,
  sentPattern: string,
  decodedSymbolId: string | null
): string {
  if (!sentPattern) return 'Send at least one mark before checking the attempt.';
  if (!patternCorrect) {
    return decodedSymbolId
      ? `That rhythm reads as ${decodedSymbolId}. Compare the number and order of dits and dahs, then try again.`
      : 'That mark sequence is not a supported character. Compare the number and order of dits and dahs, then try again.';
  }
  if (rhythmScore >= 90) return 'Clean character and steady element spacing.';
  if (rhythmScore >= PASSING_RHYTHM_SCORE) return 'Correct character. Keep the dits, dahs, and inside gaps a little more even.';
  return 'The character is recognizable, but the mark lengths or inside gaps need a steadier beat.';
}
