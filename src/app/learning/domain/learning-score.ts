import { getMorseSymbolDefinition } from '../../core/morse/morse-table';
import { activeKochSymbols, INTERNATIONAL_RECEIVE_COURSE_V1 } from './koch-course';
import {
  CharacterStatistics,
  DEFAULT_TRAINING_SETTINGS,
  KochCourse,
  LearnerProfileV1,
  LearningSessionSummary,
  MorseSymbolId,
  RecognitionAttempt
} from './learning-model';

const MAX_CHARACTER_RESULTS = 50;
const MAX_LATENCY_RESULTS = 50;
const MAX_CONFUSION_SYMBOLS = 10;
const MAX_RECENT_ATTEMPTS = 200;
const MAX_RECENT_SESSIONS = 100;
const UNLOCK_WINDOW = 40;
const MINIMUM_AGGREGATE_ACCURACY = 0.9;
const MINIMUM_NEWEST_ATTEMPTS = 8;
const MINIMUM_NEWEST_ACCURACY = 0.85;

export interface ScoreRecognitionAnswerOptions {
  readonly trialId: string;
  readonly expectedSymbolId: MorseSymbolId;
  readonly enteredSymbol: string | null;
  readonly replayCount: number;
  readonly recognitionLatencyMs: number | null;
  readonly answeredAt: string;
}

export type UnlockReason =
  | 'course-complete'
  | 'insufficient-attempts'
  | 'aggregate-accuracy'
  | 'newest-attempts'
  | 'newest-accuracy';

export interface UnlockEvaluation {
  readonly eligible: boolean;
  readonly nextSymbolId: MorseSymbolId | null;
  readonly windowAttempts: number;
  readonly aggregateAccuracy: number | null;
  readonly newestSymbolId: MorseSymbolId;
  readonly newestAttempts: number;
  readonly newestAccuracy: number | null;
  readonly reasons: readonly UnlockReason[];
}

export function createInitialLearnerProfile(
  updatedAt: string,
  course: KochCourse = INTERNATIONAL_RECEIVE_COURSE_V1
): LearnerProfileV1 {
  const characters = Object.fromEntries(
    course.symbolOrder.map((symbolId) => [symbolId, emptyCharacterStatistics(symbolId)])
  );
  return {
    schemaVersion: 1,
    courseId: course.id,
    courseVersion: course.version,
    currentSymbolCount: course.initialSymbolCount,
    settings: DEFAULT_TRAINING_SETTINGS,
    characters,
    recentUnassistedAttempts: [],
    recentSessions: [],
    updatedAt
  };
}

export function scoreRecognitionAnswer(options: ScoreRecognitionAnswerOptions): RecognitionAttempt {
  getMorseSymbolDefinition(options.expectedSymbolId);
  const enteredSymbolId = normalizeEnteredSymbol(options.enteredSymbol);
  const replayCount = nonNegativeInteger(options.replayCount);
  const recognitionLatencyMs = options.recognitionLatencyMs !== null &&
    Number.isFinite(options.recognitionLatencyMs) && options.recognitionLatencyMs >= 0
    ? options.recognitionLatencyMs
    : null;
  return {
    trialId: String(options.trialId),
    expectedSymbolId: options.expectedSymbolId,
    enteredSymbolId,
    correct: enteredSymbolId === options.expectedSymbolId,
    replayCount,
    recognitionLatencyMs,
    answeredAt: options.answeredAt
  };
}

export function recordRecognitionAttempt(
  profile: LearnerProfileV1,
  attempt: RecognitionAttempt
): LearnerProfileV1 {
  const previous = profile.characters[attempt.expectedSymbolId];
  if (!previous) throw new Error(`Attempt symbol is not in the learner's course: ${attempt.expectedSymbolId}`);
  const unassisted = attempt.replayCount === 0;
  const latency = attempt.recognitionLatencyMs;
  const nextStatistics: CharacterStatistics = {
    ...previous,
    attempts: previous.attempts + 1,
    correct: previous.correct + (attempt.correct ? 1 : 0),
    unassistedAttempts: previous.unassistedAttempts + (unassisted ? 1 : 0),
    unassistedCorrect: previous.unassistedCorrect + (unassisted && attempt.correct ? 1 : 0),
    replayCount: previous.replayCount + attempt.replayCount,
    latencyTotalMs: previous.latencyTotalMs + (latency ?? 0),
    latencySampleCount: previous.latencySampleCount + (latency === null ? 0 : 1),
    rollingUnassistedResults: unassisted
      ? [...previous.rollingUnassistedResults, attempt.correct].slice(-MAX_CHARACTER_RESULTS)
      : previous.rollingUnassistedResults,
    rollingRecognitionLatenciesMs: unassisted && latency !== null
      ? [...previous.rollingRecognitionLatenciesMs, latency].slice(-MAX_LATENCY_RESULTS)
      : previous.rollingRecognitionLatenciesMs,
    confusions: unassisted && !attempt.correct && attempt.enteredSymbolId
      ? incrementConfusion(previous.confusions, attempt.enteredSymbolId)
      : previous.confusions,
    lastPracticedAt: attempt.answeredAt
  };
  return {
    ...profile,
    characters: { ...profile.characters, [attempt.expectedSymbolId]: nextStatistics },
    recentUnassistedAttempts: unassisted
      ? [...profile.recentUnassistedAttempts, {
          symbolId: attempt.expectedSymbolId,
          correct: attempt.correct,
          answeredAt: attempt.answeredAt
        }].slice(-MAX_RECENT_ATTEMPTS)
      : profile.recentUnassistedAttempts,
    updatedAt: attempt.answeredAt
  };
}

export function evaluateKochUnlock(
  profile: LearnerProfileV1,
  course: KochCourse = INTERNATIONAL_RECEIVE_COURSE_V1
): UnlockEvaluation {
  const active = activeKochSymbols(profile.currentSymbolCount, course);
  const newestSymbolId = active[active.length - 1];
  const nextSymbolId = course.symbolOrder[profile.currentSymbolCount] ?? null;
  const activeSet = new Set(active);
  const window = profile.recentUnassistedAttempts
    .filter((attempt) => activeSet.has(attempt.symbolId))
    .slice(-UNLOCK_WINDOW);
  const correct = window.filter((attempt) => attempt.correct).length;
  const newest = window.filter((attempt) => attempt.symbolId === newestSymbolId);
  const newestCorrect = newest.filter((attempt) => attempt.correct).length;
  const aggregateAccuracy = window.length ? correct / window.length : null;
  const newestAccuracy = newest.length ? newestCorrect / newest.length : null;
  const reasons: UnlockReason[] = [];

  if (nextSymbolId === null) reasons.push('course-complete');
  if (window.length < UNLOCK_WINDOW) reasons.push('insufficient-attempts');
  if (aggregateAccuracy === null || aggregateAccuracy < MINIMUM_AGGREGATE_ACCURACY) {
    reasons.push('aggregate-accuracy');
  }
  if (newest.length < MINIMUM_NEWEST_ATTEMPTS) reasons.push('newest-attempts');
  if (newestAccuracy === null || newestAccuracy < MINIMUM_NEWEST_ACCURACY) {
    reasons.push('newest-accuracy');
  }

  return {
    eligible: reasons.length === 0,
    nextSymbolId,
    windowAttempts: window.length,
    aggregateAccuracy,
    newestSymbolId,
    newestAttempts: newest.length,
    newestAccuracy,
    reasons
  };
}

export function advanceKochProgress(
  profile: LearnerProfileV1,
  updatedAt: string,
  course: KochCourse = INTERNATIONAL_RECEIVE_COURSE_V1
): LearnerProfileV1 {
  const evaluation = evaluateKochUnlock(profile, course);
  if (!evaluation.eligible) return profile;
  return {
    ...profile,
    currentSymbolCount: Math.min(profile.currentSymbolCount + 1, course.symbolOrder.length),
    updatedAt
  };
}

export function appendLearningSession(
  profile: LearnerProfileV1,
  summary: LearningSessionSummary
): LearnerProfileV1 {
  return {
    ...profile,
    recentSessions: [summary, ...profile.recentSessions.filter((item) => item.id !== summary.id)]
      .slice(0, MAX_RECENT_SESSIONS),
    updatedAt: summary.completedAt
  };
}

export function emptyCharacterStatistics(symbolId: MorseSymbolId): CharacterStatistics {
  return {
    symbolId,
    attempts: 0,
    correct: 0,
    unassistedAttempts: 0,
    unassistedCorrect: 0,
    replayCount: 0,
    latencyTotalMs: 0,
    latencySampleCount: 0,
    rollingUnassistedResults: [],
    rollingRecognitionLatenciesMs: [],
    confusions: {},
    lastPracticedAt: null
  };
}

function incrementConfusion(
  previous: Readonly<Record<MorseSymbolId, number>>,
  enteredSymbolId: MorseSymbolId
): Readonly<Record<MorseSymbolId, number>> {
  const next = { ...previous, [enteredSymbolId]: Math.min(1_000_000, (previous[enteredSymbolId] ?? 0) + 1) };
  return Object.fromEntries(Object.entries(next)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, MAX_CONFUSION_SYMBOLS));
}

function normalizeEnteredSymbol(value: string | null): MorseSymbolId | null {
  if (value === null) return null;
  const normalized = value.trim().toUpperCase();
  if ([...normalized].length !== 1) return null;
  try {
    getMorseSymbolDefinition(normalized);
    return normalized;
  } catch {
    return null;
  }
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
