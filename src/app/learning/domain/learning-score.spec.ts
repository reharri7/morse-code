import { INTERNATIONAL_RECEIVE_COURSE_V1 } from './koch-course';
import {
  advanceKochProgress,
  appendLearningSession,
  createInitialLearnerProfile,
  evaluateKochUnlock,
  recordRecognitionAttempt,
  scoreRecognitionAnswer
} from './learning-score';
import { LearnerProfileV1, LearningSessionSummary, RecognitionAttempt } from './learning-model';

const START = '2026-09-25T00:00:00.000Z';

describe('learning scoring and Koch progression', () => {
  it('creates the two-character default profile and scores normalized answers', () => {
    const profile = createInitialLearnerProfile(START);
    expect(profile.currentSymbolCount).toBe(2);
    expect(profile.settings).toEqual({
      characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600, sessionLength: 40
    });
    expect(INTERNATIONAL_RECEIVE_COURSE_V1.symbolOrder.every((symbol) => profile.characters[symbol] !== undefined))
      .toBeTrue();
    expect(Object.keys(profile.characters).length).toBe(INTERNATIONAL_RECEIVE_COURSE_V1.symbolOrder.length);

    const attempt = scoreRecognitionAnswer({
      trialId: 'trial-1', expectedSymbolId: 'K', enteredSymbol: ' k ', replayCount: 0,
      recognitionLatencyMs: 850, answeredAt: '2026-09-25T00:00:01.000Z'
    });
    expect(attempt.enteredSymbolId).toBe('K');
    expect(attempt.correct).toBeTrue();
  });

  it('records assisted attempts without using them as mastery evidence', () => {
    const attempt = scoreRecognitionAnswer({
      trialId: 'trial-1', expectedSymbolId: 'M', enteredSymbol: 'K', replayCount: 2,
      recognitionLatencyMs: 1_250, answeredAt: '2026-09-25T00:00:01.000Z'
    });
    const profile = recordRecognitionAttempt(createInitialLearnerProfile(START), attempt);
    expect(profile.characters['M']).toEqual(jasmine.objectContaining({
      attempts: 1, correct: 0, unassistedAttempts: 0, unassistedCorrect: 0,
      replayCount: 2, latencyTotalMs: 1_250, latencySampleCount: 1
    }));
    expect(profile.recentUnassistedAttempts).toEqual([]);
  });

  it('caps per-character and global rolling mastery evidence', () => {
    let profile = createInitialLearnerProfile(START);
    for (let index = 0; index < 220; index += 1) {
      profile = recordRecognitionAttempt(profile, attempt('K', true, index));
    }
    expect(profile.characters['K'].rollingUnassistedResults.length).toBe(50);
    expect(profile.recentUnassistedAttempts.length).toBe(200);
    expect(profile.characters['K'].attempts).toBe(220);
  });

  it('does not unlock with only 39 eligible attempts', () => {
    const evaluation = evaluateKochUnlock(profileWith([
      ...correctAttempts('K', 31), ...correctAttempts('M', 8)
    ]));
    expect(evaluation.eligible).toBeFalse();
    expect(evaluation.reasons).toContain('insufficient-attempts');
  });

  it('does not unlock below aggregate accuracy', () => {
    const evaluation = evaluateKochUnlock(profileWith([
      ...mixedAttempts('K', 32, 29), ...mixedAttempts('M', 8, 6)
    ]));
    expect(evaluation.aggregateAccuracy).toBe(35 / 40);
    expect(evaluation.reasons).toContain('aggregate-accuracy');
  });

  it('does not unlock without eight newest-character attempts', () => {
    const evaluation = evaluateKochUnlock(profileWith([
      ...correctAttempts('K', 33), ...correctAttempts('M', 7)
    ]));
    expect(evaluation.aggregateAccuracy).toBe(1);
    expect(evaluation.reasons).toContain('newest-attempts');
  });

  it('does not unlock when newest-character accuracy is below 85 percent', () => {
    const evaluation = evaluateKochUnlock(profileWith([
      ...correctAttempts('K', 32), ...mixedAttempts('M', 8, 6)
    ]));
    expect(evaluation.aggregateAccuracy).toBe(38 / 40);
    expect(evaluation.newestAccuracy).toBe(6 / 8);
    expect(evaluation.reasons).toContain('newest-accuracy');
  });

  it('unlocks exactly one symbol at the documented passing boundary', () => {
    const profile = profileWith([
      ...mixedAttempts('K', 32, 29), ...mixedAttempts('M', 8, 7)
    ]);
    const evaluation = evaluateKochUnlock(profile);
    expect(evaluation.eligible).toBeTrue();
    expect(evaluation.aggregateAccuracy).toBe(0.9);
    expect(evaluation.newestAccuracy).toBe(0.875);
    expect(evaluation.nextSymbolId).toBe('U');

    const advanced = advanceKochProgress(profile, '2026-09-25T01:00:00.000Z');
    expect(advanced.currentSymbolCount).toBe(3);
    expect(advanceKochProgress(advanced, '2026-09-25T01:00:01.000Z').currentSymbolCount).toBe(3);
  });

  it('never advances beyond the final course symbol', () => {
    const profile: LearnerProfileV1 = {
      ...createInitialLearnerProfile(START),
      currentSymbolCount: INTERNATIONAL_RECEIVE_COURSE_V1.symbolOrder.length
    };
    expect(evaluateKochUnlock(profile).reasons).toContain('course-complete');
    expect(advanceKochProgress(profile, '2026-09-25T01:00:00.000Z')).toBe(profile);
  });

  it('keeps at most 100 newest unique session summaries', () => {
    let profile = createInitialLearnerProfile(START);
    for (let index = 0; index < 105; index += 1) {
      profile = appendLearningSession(profile, summary(String(index)));
    }
    expect(profile.recentSessions.length).toBe(100);
    expect(profile.recentSessions[0].id).toBe('104');
    expect(profile.recentSessions[99].id).toBe('5');
  });
});

function attempt(symbolId: string, correct: boolean, index: number): RecognitionAttempt {
  return {
    trialId: `trial-${index}`,
    expectedSymbolId: symbolId,
    enteredSymbolId: correct ? symbolId : symbolId === 'K' ? 'M' : 'K',
    correct,
    replayCount: 0,
    recognitionLatencyMs: 500 + index,
    answeredAt: new Date(Date.parse(START) + (index * 1_000)).toISOString()
  };
}

function correctAttempts(symbolId: string, count: number): RecognitionAttempt[] {
  return mixedAttempts(symbolId, count, count);
}

function mixedAttempts(symbolId: string, count: number, correct: number): RecognitionAttempt[] {
  return Array.from({ length: count }, (_, index) => attempt(symbolId, index < correct, index));
}

function profileWith(attempts: readonly RecognitionAttempt[]): LearnerProfileV1 {
  return attempts.reduce(recordRecognitionAttempt, createInitialLearnerProfile(START));
}

function summary(id: string): LearningSessionSummary {
  return {
    id,
    startedAt: START,
    completedAt: '2026-09-25T00:10:00.000Z',
    courseId: 'international-receive',
    courseVersion: 1,
    level: 2,
    settings: { characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600, sessionLength: 40 },
    attempts: 40,
    correct: 36,
    unassistedAccuracy: 0.9,
    meanRecognitionLatencyMs: 900,
    introducedSymbolId: null
  };
}
