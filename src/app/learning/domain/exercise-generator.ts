import { activeKochSymbols, INTERNATIONAL_RECEIVE_COURSE_V1 } from './koch-course';
import { CharacterStatistics, KochCourse, MorseSymbolId } from './learning-model';
import { deriveAdaptiveWeights } from './adaptive-selection';
import { createSeededRandom } from './seeded-random';

export interface ExerciseGenerationOptions {
  readonly currentSymbolCount: number;
  readonly count: number;
  readonly seed: string | number;
  readonly characterStatistics?: Readonly<Record<MorseSymbolId, CharacterStatistics>>;
  readonly previousSymbolId?: MorseSymbolId | null;
  readonly course?: KochCourse;
  readonly adaptive?: boolean;
  readonly focusSymbolIds?: readonly MorseSymbolId[];
}

/** Produces a stable sequence for a seed without using global Math.random. */
export function generateExerciseSymbols(options: ExerciseGenerationOptions): readonly MorseSymbolId[] {
  if (!Number.isInteger(options.count) || options.count < 0 || options.count > 10_000) {
    throw new Error('Exercise count must be an integer between 0 and 10000.');
  }
  const course = options.course ?? INTERNATIONAL_RECEIVE_COURSE_V1;
  const unlockedSymbols = activeKochSymbols(options.currentSymbolCount, course);
  const focus = options.focusSymbolIds?.length ? new Set(options.focusSymbolIds) : null;
  const activeSymbols = focus ? unlockedSymbols.filter((symbolId) => focus.has(symbolId)) : unlockedSymbols;
  if (!activeSymbols.length) throw new Error('Focused review must contain at least one unlocked symbol.');
  if (focus && [...focus].some((symbolId) => !unlockedSymbols.includes(symbolId))) {
    throw new Error('Focused review cannot contain a locked symbol.');
  }
  const newestSymbolId = activeSymbols[activeSymbols.length - 1];
  const newestAttempts = options.characterStatistics?.[newestSymbolId]?.unassistedAttempts ?? 0;
  const random = createSeededRandom(options.seed);
  const adaptiveWeights = options.adaptive && options.characterStatistics
    ? new Map(deriveAdaptiveWeights(activeSymbols, options.characterStatistics, newestSymbolId)
      .map((item) => [item.symbolId, item.weight]))
    : null;
  const result: MorseSymbolId[] = [];
  let previous = options.previousSymbolId ?? null;

  for (let index = 0; index < options.count; index += 1) {
    const candidates = activeSymbols.filter((symbolId) => activeSymbols.length === 1 || symbolId !== previous);
    const weighted = candidates.map((symbolId) => ({
      symbolId,
      weight: adaptiveWeights?.get(symbolId) ?? (symbolId === newestSymbolId && newestAttempts < 8 ? 2 : 1)
    }));
    const selected = weightedSelection(weighted, random());
    result.push(selected);
    previous = selected;
  }
  return Object.freeze(result);
}

function weightedSelection(
  candidates: readonly { readonly symbolId: MorseSymbolId; readonly weight: number }[],
  value: number
): MorseSymbolId {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let cursor = value * total;
  for (const candidate of candidates) {
    cursor -= candidate.weight;
    if (cursor < 0) return candidate.symbolId;
  }
  return candidates[candidates.length - 1].symbolId;
}
