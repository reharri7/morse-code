export interface CwBenchmarkFixtureLabel {
  readonly id: string;
  readonly referenceText: string;
  readonly tags: readonly string[];
}

export interface CwBenchmarkObservation {
  readonly rawText: string;
  readonly unknownSymbolCount: number;
  readonly acquisitionTimeMs: number | null;
  readonly falseLockCount: number;
  readonly lockLossCount: number;
  readonly lockRecoveryCount: number;
  readonly meanCharacterConfidence: number;
}

export interface CwFixtureMetrics extends CwBenchmarkFixtureLabel {
  readonly rawText: string;
  readonly characterErrors: number;
  readonly characterCount: number;
  readonly characterErrorRate: number;
  readonly wordErrors: number;
  readonly wordCount: number;
  readonly wordErrorRate: number;
  readonly exact: boolean;
  readonly unknownSymbolCount: number;
  readonly acquisitionTimeMs: number | null;
  readonly falseLockCount: number;
  readonly lockLossCount: number;
  readonly lockRecoveryCount: number;
  readonly meanCharacterConfidence: number;
}

export interface CwAggregateMetrics {
  readonly fixtureCount: number;
  readonly characterErrorRate: number;
  readonly wordErrorRate: number;
  readonly exactMessageRate: number;
  readonly unknownSymbolRate: number;
  readonly acquisitionSuccessRate: number;
  readonly meanAcquisitionTimeMs: number | null;
  readonly falseLockRate: number;
  readonly lockRecoveryRate: number;
  readonly meanCharacterConfidence: number;
}

export interface CwBenchmarkReport {
  readonly fixtures: readonly CwFixtureMetrics[];
  readonly aggregate: CwAggregateMetrics;
}

export interface CwBenchmarkThresholds {
  readonly maximumCharacterErrorRate: number;
  readonly maximumWordErrorRate: number;
  readonly minimumExactMessageRate: number;
  readonly maximumUnknownSymbolRate: number;
  readonly minimumAcquisitionSuccessRate: number;
  readonly maximumMeanAcquisitionTimeMs: number;
  readonly maximumFalseLockRate: number;
  readonly minimumLockRecoveryRate: number;
}

export type CwCharacterDiffKind = 'match' | 'substitution' | 'insertion' | 'deletion';

export interface CwCharacterDiff {
  readonly kind: CwCharacterDiffKind;
  readonly expected: string;
  readonly actual: string;
}

export interface CwRawTextMetrics {
  readonly expectedText: string;
  readonly actualText: string;
  readonly characterErrors: number;
  readonly characterCount: number;
  readonly characterErrorRate: number;
  readonly wordErrors: number;
  readonly wordCount: number;
  readonly wordErrorRate: number;
  readonly exact: boolean;
  readonly unknownSymbolCount: number;
  readonly unknownSymbolRate: number;
  readonly characterDiff: readonly CwCharacterDiff[];
}

/** One raw, unnormalized scoring definition shared by benchmarks and verification. */
export function compareRawText(expectedText: string, actualText: string): CwRawTextMetrics {
  const referenceWords = words(expectedText);
  const actualWords = words(actualText);
  const characterDiff = alignCharacters(expectedText, actualText);
  const characterErrors = characterDiff.filter((item) => item.kind !== 'match').length;
  const wordErrors = editDistance(referenceWords, actualWords);
  const unknownSymbolCount = [...actualText].filter((character) => character === '?').length;
  return {
    expectedText,
    actualText,
    characterErrors,
    characterCount: expectedText.length,
    characterErrorRate: characterErrors / Math.max(1, expectedText.length),
    wordErrors,
    wordCount: referenceWords.length,
    wordErrorRate: wordErrors / Math.max(1, referenceWords.length),
    exact: actualText === expectedText,
    unknownSymbolCount,
    unknownSymbolRate: unknownSymbolCount / Math.max(1, expectedText.length),
    characterDiff
  };
}

/** Exact, context-free benchmark metrics for labeled raw CW output. */
export function buildCwBenchmarkReport(
  cases: readonly { readonly fixture: CwBenchmarkFixtureLabel; readonly observation: CwBenchmarkObservation }[]
): CwBenchmarkReport {
  const fixtures = cases.map(({ fixture, observation }) => evaluateFixture(fixture, observation));
  const characterErrors = sum(fixtures, (item) => item.characterErrors);
  const characterCount = sum(fixtures, (item) => item.characterCount);
  const wordErrors = sum(fixtures, (item) => item.wordErrors);
  const wordCount = sum(fixtures, (item) => item.wordCount);
  const unknowns = sum(fixtures, (item) => item.unknownSymbolCount);
  const acquired = fixtures.filter((item) => item.acquisitionTimeMs !== null);
  const falseLocks = sum(fixtures, (item) => item.falseLockCount);
  const losses = sum(fixtures, (item) => item.lockLossCount);
  const recoveries = sum(fixtures, (item) => item.lockRecoveryCount);
  return {
    fixtures,
    aggregate: {
      fixtureCount: fixtures.length,
      characterErrorRate: characterErrors / Math.max(1, characterCount),
      wordErrorRate: wordErrors / Math.max(1, wordCount),
      exactMessageRate: fixtures.filter((item) => item.exact).length / Math.max(1, fixtures.length),
      unknownSymbolRate: unknowns / Math.max(1, characterCount),
      acquisitionSuccessRate: acquired.length / Math.max(1, fixtures.length),
      meanAcquisitionTimeMs: acquired.length
        ? sum(acquired, (item) => item.acquisitionTimeMs ?? 0) / acquired.length
        : null,
      falseLockRate: falseLocks / Math.max(1, fixtures.length),
      lockRecoveryRate: losses ? recoveries / losses : 1,
      meanCharacterConfidence: fixtures.length
        ? sum(fixtures, (item) => item.meanCharacterConfidence) / fixtures.length
        : 0
    }
  };
}

export function benchmarkFailures(report: CwBenchmarkReport, thresholds: CwBenchmarkThresholds): string[] {
  const aggregate = report.aggregate;
  const failures: string[] = [];
  if (aggregate.characterErrorRate > thresholds.maximumCharacterErrorRate) failures.push('character error rate');
  if (aggregate.wordErrorRate > thresholds.maximumWordErrorRate) failures.push('word error rate');
  if (aggregate.exactMessageRate < thresholds.minimumExactMessageRate) failures.push('exact message rate');
  if (aggregate.unknownSymbolRate > thresholds.maximumUnknownSymbolRate) failures.push('unknown symbol rate');
  if (aggregate.acquisitionSuccessRate < thresholds.minimumAcquisitionSuccessRate) failures.push('acquisition success rate');
  if (aggregate.meanAcquisitionTimeMs === null || aggregate.meanAcquisitionTimeMs > thresholds.maximumMeanAcquisitionTimeMs) {
    failures.push('mean acquisition time');
  }
  if (aggregate.falseLockRate > thresholds.maximumFalseLockRate) failures.push('false lock rate');
  if (aggregate.lockRecoveryRate < thresholds.minimumLockRecoveryRate) failures.push('lock recovery rate');
  return failures;
}

function evaluateFixture(fixture: CwBenchmarkFixtureLabel, observation: CwBenchmarkObservation): CwFixtureMetrics {
  const metrics = compareRawText(fixture.referenceText, observation.rawText);
  return {
    ...fixture,
    rawText: observation.rawText,
    characterErrors: metrics.characterErrors,
    characterCount: metrics.characterCount,
    characterErrorRate: metrics.characterErrorRate,
    wordErrors: metrics.wordErrors,
    wordCount: metrics.wordCount,
    wordErrorRate: metrics.wordErrorRate,
    exact: metrics.exact,
    unknownSymbolCount: observation.unknownSymbolCount,
    acquisitionTimeMs: observation.acquisitionTimeMs,
    falseLockCount: observation.falseLockCount,
    lockLossCount: observation.lockLossCount,
    lockRecoveryCount: observation.lockRecoveryCount,
    meanCharacterConfidence: observation.meanCharacterConfidence
  };
}

function alignCharacters(expected: string, actual: string): CwCharacterDiff[] {
  const left = [...expected];
  const right = [...actual];
  const costs = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
  for (let row = 0; row <= left.length; row += 1) costs[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) costs[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      costs[row][column] = Math.min(
        costs[row - 1][column] + 1,
        costs[row][column - 1] + 1,
        costs[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
    }
  }
  const aligned: CwCharacterDiff[] = [];
  let row = left.length;
  let column = right.length;
  while (row || column) {
    const same = row > 0 && column > 0 && left[row - 1] === right[column - 1];
    if (same && costs[row][column] === costs[row - 1][column - 1]) {
      aligned.push({ kind: 'match', expected: left[row - 1], actual: right[column - 1] });
      row -= 1;
      column -= 1;
    } else if (row > 0 && column > 0 && costs[row][column] === costs[row - 1][column - 1] + 1) {
      aligned.push({ kind: 'substitution', expected: left[row - 1], actual: right[column - 1] });
      row -= 1;
      column -= 1;
    } else if (column > 0 && costs[row][column] === costs[row][column - 1] + 1) {
      aligned.push({ kind: 'insertion', expected: '', actual: right[column - 1] });
      column -= 1;
    } else {
      aligned.push({ kind: 'deletion', expected: left[row - 1], actual: '' });
      row -= 1;
    }
  }
  return aligned.reverse();
}

function words(value: string): string[] {
  return value ? value.split(' ') : [];
}

function editDistance<T>(expected: readonly T[], actual: readonly T[]): number {
  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let row = 1; row <= expected.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= actual.length; column += 1) {
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (expected[row - 1] === actual[column - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[actual.length];
}

function sum<T>(values: readonly T[], select: (value: T) => number): number {
  return values.reduce((total, value) => total + select(value), 0);
}
