import { encodeMorseText } from '../../core/morse/morse-sequence';
import { COMMON_WORD_CORPUS_V1 } from '../data/common-words';
import { activeKochSymbols } from './koch-course';
import { CharacterStatistics, MorseSymbolId } from './learning-model';
import { generateExerciseSymbols } from './exercise-generator';
import { createSeededRandom } from './seeded-random';

export interface GroupPracticeOptions {
  readonly currentSymbolCount: number;
  readonly groupCount: number;
  readonly groupLength: number;
  readonly seed: string | number;
  readonly characterStatistics?: Readonly<Record<MorseSymbolId, CharacterStatistics>>;
  readonly adaptive?: boolean;
  readonly focusSymbolIds?: readonly MorseSymbolId[];
}

export function generateRandomGroups(options: GroupPracticeOptions): readonly string[] {
  if (!Number.isInteger(options.groupCount) || options.groupCount < 1 || options.groupCount > 100) {
    throw new Error('Group count must be an integer between 1 and 100.');
  }
  if (!Number.isInteger(options.groupLength) || options.groupLength < 2 || options.groupLength > 10) {
    throw new Error('Group length must be an integer between 2 and 10.');
  }
  const symbols = generateExerciseSymbols({
    currentSymbolCount: options.currentSymbolCount,
    count: options.groupCount * options.groupLength,
    seed: options.seed,
    characterStatistics: options.characterStatistics,
    adaptive: options.adaptive,
    focusSymbolIds: options.focusSymbolIds
  });
  return Object.freeze(Array.from({ length: options.groupCount }, (_, index) =>
    symbols.slice(index * options.groupLength, (index + 1) * options.groupLength).join('')
  ));
}

export interface WordPracticeOptions {
  readonly currentSymbolCount: number;
  readonly count: number;
  readonly seed: string | number;
}

export function eligiblePracticeWords(currentSymbolCount: number): readonly string[] {
  const allowed = new Set(activeKochSymbols(currentSymbolCount));
  return Object.freeze(COMMON_WORD_CORPUS_V1.words.filter((word) =>
    [...word].every((symbol) => allowed.has(symbol))
  ));
}

export function generateWordExercises(options: WordPracticeOptions): readonly string[] {
  if (!Number.isInteger(options.count) || options.count < 0 || options.count > 1_000) {
    throw new Error('Word count must be an integer between 0 and 1000.');
  }
  const eligible = eligiblePracticeWords(options.currentSymbolCount);
  if (!eligible.length || options.count === 0) return Object.freeze([]);
  const random = createSeededRandom(options.seed);
  const result: string[] = [];
  let previous = '';
  for (let index = 0; index < options.count; index += 1) {
    const candidates = eligible.length > 1 ? eligible.filter((word) => word !== previous) : eligible;
    const selected = candidates[Math.floor(random() * candidates.length)];
    result.push(selected);
    previous = selected;
  }
  return Object.freeze(result);
}

/** Validates explicit character and word boundary tokens for generated content. */
export function encodePracticeGroups(groups: readonly string[]) {
  return encodeMorseText(groups.join(' '));
}
