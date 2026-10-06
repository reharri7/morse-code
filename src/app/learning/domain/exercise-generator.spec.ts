import { generateExerciseSymbols } from './exercise-generator';
import { createInitialLearnerProfile } from './learning-score';

describe('Koch exercise generation', () => {
  it('is reproducible, avoids immediate repeats, and never selects locked symbols', () => {
    const options = { currentSymbolCount: 5, count: 200, seed: 'session-42' };
    const first = generateExerciseSymbols(options);
    const second = generateExerciseSymbols(options);
    expect(first).toEqual(second);
    expect(first.every((symbol) => ['K', 'M', 'U', 'R', 'E'].includes(symbol))).toBeTrue();
    expect(first.every((symbol, index) => index === 0 || symbol !== first[index - 1])).toBeTrue();
  });

  it('gives the newest underexposed character extra bounded exposure', () => {
    const generated = generateExerciseSymbols({ currentSymbolCount: 3, count: 1_000, seed: 12345 });
    const counts = countSymbols(generated);
    expect(counts['U']).toBeGreaterThan(counts['K']);
    expect(counts['U']).toBeGreaterThan(counts['M']);
    expect(counts['U']).toBeLessThanOrEqual(500);
  });

  it('returns to equal base weights after eight newest-character attempts', () => {
    const profile = createInitialLearnerProfile('2026-09-25T00:00:00.000Z');
    const statistics = {
      ...profile.characters,
      U: { ...profile.characters['U'], unassistedAttempts: 8 }
    };
    const generated = generateExerciseSymbols({
      currentSymbolCount: 3, count: 1_000, seed: 12345, characterStatistics: statistics
    });
    const counts = countSymbols(generated);
    expect(Math.max(counts['K'], counts['M'], counts['U']) - Math.min(counts['K'], counts['M'], counts['U']))
      .toBeLessThan(80);
  });

  it('honors a previous symbol and validates requested count', () => {
    expect(generateExerciseSymbols({
      currentSymbolCount: 2, count: 2, seed: 'next', previousSymbolId: 'K'
    })[0]).toBe('M');
    expect(() => generateExerciseSymbols({ currentSymbolCount: 2, count: -1, seed: 1 }))
      .toThrowError(/Exercise count/);
  });
});

function countSymbols(symbols: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = { K: 0, M: 0, U: 0 };
  for (const symbol of symbols) counts[symbol] = (counts[symbol] ?? 0) + 1;
  return counts;
}
