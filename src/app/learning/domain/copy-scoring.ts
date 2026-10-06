import { MorseSymbolId } from './learning-model';

export interface CopyCharacterOutcome {
  readonly expectedSymbolId: MorseSymbolId;
  readonly enteredSymbolId: MorseSymbolId | null;
  readonly correct: boolean;
}

export interface CopyScore {
  readonly expectedText: string;
  readonly enteredText: string;
  readonly correct: boolean;
  readonly characterErrors: number;
  readonly outcomes: readonly CopyCharacterOutcome[];
}

export function normalizeCopyText(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Bounded Levenshtein alignment that preserves one outcome per expected character. */
export function scoreCopyText(expectedValue: string, enteredValue: string): CopyScore {
  const expectedText = normalizeCopyText(expectedValue);
  const enteredText = normalizeCopyText(enteredValue);
  const expected = [...expectedText.replaceAll(' ', '')];
  const entered = [...enteredText.replaceAll(' ', '')];
  if (!expected.length || expected.length > 100 || entered.length > 100) {
    throw new Error('Copy answers must contain between 1 and 100 symbols.');
  }
  const distances = Array.from({ length: expected.length + 1 }, () => Array<number>(entered.length + 1).fill(0));
  for (let row = 0; row <= expected.length; row += 1) distances[row][0] = row;
  for (let column = 0; column <= entered.length; column += 1) distances[0][column] = column;
  for (let row = 1; row <= expected.length; row += 1) {
    for (let column = 1; column <= entered.length; column += 1) {
      const substitution = distances[row - 1][column - 1] + (expected[row - 1] === entered[column - 1] ? 0 : 1);
      distances[row][column] = Math.min(substitution, distances[row - 1][column] + 1, distances[row][column - 1] + 1);
    }
  }

  const reversed: CopyCharacterOutcome[] = [];
  let row = expected.length;
  let column = entered.length;
  while (row > 0 || column > 0) {
    if (row > 0 && column > 0) {
      const cost = expected[row - 1] === entered[column - 1] ? 0 : 1;
      if (distances[row][column] === distances[row - 1][column - 1] + cost) {
        reversed.push({
          expectedSymbolId: expected[row - 1],
          enteredSymbolId: entered[column - 1],
          correct: cost === 0
        });
        row -= 1;
        column -= 1;
        continue;
      }
    }
    if (row > 0 && distances[row][column] === distances[row - 1][column] + 1) {
      reversed.push({ expectedSymbolId: expected[row - 1], enteredSymbolId: null, correct: false });
      row -= 1;
      continue;
    }
    column -= 1;
  }
  const outcomes = Object.freeze(reversed.reverse());
  return Object.freeze({
    expectedText,
    enteredText,
    correct: expectedText === enteredText,
    characterErrors: distances[expected.length][entered.length],
    outcomes
  });
}
