import { CharacterStatistics, MorseSymbolId } from './learning-model';

export const ADAPTIVE_POLICY_VERSION = 1;
const MAX_WEIGHT = 3;
const MIN_WEIGHT = 1;

export interface AdaptiveSymbolWeight {
  readonly symbolId: MorseSymbolId;
  readonly weight: number;
  readonly reasons: readonly string[];
}

/** Explainable, bounded weighting derived only from locally stored evidence. */
export function deriveAdaptiveWeights(
  activeSymbols: readonly MorseSymbolId[],
  statistics: Readonly<Record<MorseSymbolId, CharacterStatistics>>,
  newestSymbolId: MorseSymbolId
): readonly AdaptiveSymbolWeight[] {
  const observedLatencies = activeSymbols.flatMap((symbolId) =>
    statistics[symbolId]?.rollingRecognitionLatenciesMs ?? []
  );
  const baselineLatency = observedLatencies.length
    ? observedLatencies.reduce((sum, latency) => sum + latency, 0) / observedLatencies.length
    : null;

  return Object.freeze(activeSymbols.map((symbolId) => {
    const item = statistics[symbolId];
    const results = item?.rollingUnassistedResults.slice(-20) ?? [];
    const errorRate = results.length
      ? results.filter((correct) => !correct).length / results.length
      : 0;
    const latencies = item?.rollingRecognitionLatenciesMs.slice(-20) ?? [];
    const meanLatency = latencies.length
      ? latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length
      : null;
    const confusionCount = Object.values(item?.confusions ?? {}).reduce((sum, count) => sum + count, 0);
    const reasons: string[] = [];
    let weight = MIN_WEIGHT;

    if ((item?.unassistedAttempts ?? 0) < 8 && symbolId === newestSymbolId) {
      weight += 1;
      reasons.push('newest character needs exposure');
    }
    if (results.length >= 3 && errorRate > 0.15) {
      weight += Math.min(1, errorRate * 1.5);
      reasons.push('recent accuracy is lower');
    }
    if (baselineLatency && meanLatency && meanLatency > baselineLatency * 1.15) {
      weight += Math.min(0.65, (meanLatency / baselineLatency) - 1);
      reasons.push('recent recognition is slower');
    }
    if (confusionCount > 0) {
      weight += Math.min(0.5, confusionCount / 10);
      reasons.push('recent answers show confusion');
    }
    return Object.freeze({ symbolId, weight: Math.min(MAX_WEIGHT, weight), reasons: Object.freeze(reasons) });
  }));
}
