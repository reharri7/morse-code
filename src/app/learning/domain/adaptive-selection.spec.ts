import { deriveAdaptiveWeights } from './adaptive-selection';
import { generateExerciseSymbols } from './exercise-generator';
import { createInitialLearnerProfile, recordRecognitionAttempt } from './learning-score';

describe('adaptive weak-character selection', () => {
  it('raises weak-symbol exposure without starving the active set', () => {
    let profile = { ...createInitialLearnerProfile('2026-09-25T00:00:00.000Z'), currentSymbolCount: 5 };
    for (let index = 0; index < 12; index += 1) {
      profile = recordRecognitionAttempt(profile, {
        trialId: `weak-${index}`, expectedSymbolId: 'U', enteredSymbolId: index < 9 ? 'R' : 'U',
        correct: index >= 9, replayCount: 0, recognitionLatencyMs: 2_000,
        answeredAt: `2026-09-25T00:00:${String(index).padStart(2, '0')}.000Z`
      });
      profile = recordRecognitionAttempt(profile, {
        trialId: `strong-${index}`, expectedSymbolId: 'K', enteredSymbolId: 'K', correct: true,
        replayCount: 0, recognitionLatencyMs: 400,
        answeredAt: `2026-09-25T00:01:${String(index).padStart(2, '0')}.000Z`
      });
    }

    const weights = deriveAdaptiveWeights(['K', 'M', 'U', 'R', 'E'], profile.characters, 'E');
    const weak = weights.find((item) => item.symbolId === 'U')!;
    expect(weak.weight).toBeGreaterThan(weights.find((item) => item.symbolId === 'K')!.weight);
    expect(weak.reasons).toContain('recent accuracy is lower');
    expect(weak.reasons).toContain('recent recognition is slower');
    expect(weak.reasons).toContain('recent answers show confusion');
    expect(Math.max(...weights.map((item) => item.weight))).toBeLessThanOrEqual(3);
    expect(Math.min(...weights.map((item) => item.weight))).toBeGreaterThanOrEqual(1);

    const generated = generateExerciseSymbols({
      currentSymbolCount: 5, count: 2_000, seed: 'adaptive',
      characterStatistics: profile.characters, adaptive: true
    });
    const counts = Object.fromEntries(['K', 'M', 'U', 'R', 'E'].map((symbol) => [
      symbol, generated.filter((item) => item === symbol).length
    ]));
    expect(counts['U']).toBeGreaterThan(counts['K']);
    expect(Math.min(...Object.values(counts))).toBeGreaterThan(150);
    expect(Math.max(...Object.values(counts))).toBeLessThan(800);
  });

  it('keeps focused review inside unlocked symbols without changing progress', () => {
    const profile = { ...createInitialLearnerProfile('2026-09-25T00:00:00.000Z'), currentSymbolCount: 5 };
    const generated = generateExerciseSymbols({
      currentSymbolCount: profile.currentSymbolCount, count: 100, seed: 'focus',
      focusSymbolIds: ['K', 'U'], characterStatistics: profile.characters, adaptive: true
    });
    expect(new Set(generated)).toEqual(new Set(['K', 'U']));
    expect(profile.currentSymbolCount).toBe(5);
    expect(() => generateExerciseSymbols({
      currentSymbolCount: 5, count: 1, seed: 'locked', focusSymbolIds: ['Z']
    })).toThrowError(/locked symbol/);
  });

  it('tracks bounded rolling latency and confusion evidence', () => {
    let profile = createInitialLearnerProfile('2026-09-25T00:00:00.000Z');
    for (let index = 0; index < 70; index += 1) {
      profile = recordRecognitionAttempt(profile, {
        trialId: String(index), expectedSymbolId: 'K', enteredSymbolId: 'M', correct: false,
        replayCount: 0, recognitionLatencyMs: 500 + index, answeredAt: new Date(index * 1_000).toISOString()
      });
    }
    expect(profile.characters['K'].rollingRecognitionLatenciesMs.length).toBe(50);
    expect(profile.characters['K'].rollingRecognitionLatenciesMs[0]).toBe(520);
    expect(profile.characters['K'].confusions['M']).toBe(70);
  });
});
