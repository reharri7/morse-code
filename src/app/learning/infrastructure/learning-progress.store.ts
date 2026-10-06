import { INTERNATIONAL_RECEIVE_COURSE_V1 } from '../domain/koch-course';
import {
  CharacterStatistics,
  DEFAULT_TRAINING_SETTINGS,
  LearnerProfileV1,
  LearningSessionSummary,
  RecentUnassistedAttempt,
  TrainingSessionLength,
  TrainingSettings
} from '../domain/learning-model';
import { createInitialLearnerProfile, emptyCharacterStatistics } from '../domain/learning-score';

export interface LearningStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const LEARNING_STORAGE_KEY = 'cw-transcriber.learning.v1';

const MAX_COUNTER = 1_000_000_000;
const MAX_LATENCY_TOTAL_MS = 1_000_000_000_000;
const MAX_CHARACTER_RESULTS = 50;
const MAX_LATENCY_RESULTS = 50;
const MAX_CONFUSION_SYMBOLS = 10;
const MAX_RECENT_ATTEMPTS = 200;
const MAX_RECENT_SESSIONS = 100;
const COURSE = INTERNATIONAL_RECEIVE_COURSE_V1;

export class LearningProgressStore {
  lastWriteSucceeded = true;

  constructor(
    private readonly storage: LearningStorageLike,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  load(): LearnerProfileV1 {
    try {
      const value = this.storage.getItem(LEARNING_STORAGE_KEY);
      if (!value) return createInitialLearnerProfile(this.now());
      return normalizeStoredProfile(JSON.parse(value), this.now());
    } catch {
      return createInitialLearnerProfile(this.now());
    }
  }

  save(profile: LearnerProfileV1): LearnerProfileV1 {
    const normalized = normalizeStoredProfile(profile, this.now());
    try {
      this.storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(normalized));
      this.lastWriteSucceeded = true;
    } catch {
      this.lastWriteSucceeded = false;
    }
    return normalized;
  }

  reset(): LearnerProfileV1 {
    try {
      this.storage.removeItem(LEARNING_STORAGE_KEY);
      this.lastWriteSucceeded = true;
    } catch {
      this.lastWriteSucceeded = false;
    }
    return createInitialLearnerProfile(this.now());
  }
}

export function normalizeStoredProfile(value: unknown, fallbackDate: string): LearnerProfileV1 {
  const record = asRecord(value);
  if (!record) return createInitialLearnerProfile(fallbackDate);
  const schemaVersion = finiteInteger(record['schemaVersion'], 0, 100, 0);
  if (schemaVersion === 0) return migrateLegacyProfile(record, fallbackDate);
  if (schemaVersion !== 1 ||
      record['courseId'] !== COURSE.id ||
      finiteInteger(record['courseVersion'], 0, 100, 0) !== COURSE.version) {
    return createInitialLearnerProfile(fallbackDate);
  }
  return normalizeV1(record, fallbackDate);
}

function normalizeV1(record: Record<string, unknown>, fallbackDate: string): LearnerProfileV1 {
  const characterSource = asRecord(record['characters']) ?? {};
  const characters = Object.fromEntries(COURSE.symbolOrder.map((symbolId) => [
    symbolId,
    normalizeCharacterStatistics(symbolId, asRecord(characterSource[symbolId]))
  ]));
  return {
    schemaVersion: 1,
    courseId: COURSE.id,
    courseVersion: COURSE.version,
    currentSymbolCount: finiteInteger(
      record['currentSymbolCount'], COURSE.initialSymbolCount, COURSE.symbolOrder.length, COURSE.initialSymbolCount
    ),
    settings: normalizeSettings(asRecord(record['settings'])),
    characters,
    recentUnassistedAttempts: normalizeRecentAttempts(record['recentUnassistedAttempts']),
    recentSessions: normalizeRecentSessions(record['recentSessions']),
    updatedAt: validDate(record['updatedAt']) ?? fallbackDate
  };
}

function migrateLegacyProfile(record: Record<string, unknown>, fallbackDate: string): LearnerProfileV1 {
  const migrated: Record<string, unknown> = {
    schemaVersion: 1,
    courseId: COURSE.id,
    courseVersion: COURSE.version,
    currentSymbolCount: record['currentSymbolCount'] ?? record['currentLevel'],
    settings: record['settings'],
    characters: record['characters'] ?? record['characterStats'],
    recentUnassistedAttempts: record['recentUnassistedAttempts'],
    recentSessions: record['recentSessions'] ?? record['sessions'],
    updatedAt: record['updatedAt']
  };
  return normalizeV1(migrated, fallbackDate);
}

function normalizeSettings(value: Record<string, unknown> | null): TrainingSettings {
  const characterWpm = finiteNumber(value?.['characterWpm'], 12, 40, DEFAULT_TRAINING_SETTINGS.characterWpm);
  return {
    characterWpm,
    effectiveWpm: finiteNumber(
      value?.['effectiveWpm'], 5, characterWpm, Math.min(DEFAULT_TRAINING_SETTINGS.effectiveWpm, characterWpm)
    ),
    toneFrequencyHz: finiteNumber(value?.['toneFrequencyHz'], 300, 1_000, DEFAULT_TRAINING_SETTINGS.toneFrequencyHz),
    sessionLength: normalizeSessionLength(value?.['sessionLength'])
  };
}

function normalizeCharacterStatistics(
  symbolId: string,
  value: Record<string, unknown> | null
): CharacterStatistics {
  if (!value) return emptyCharacterStatistics(symbolId);
  const attempts = finiteInteger(value['attempts'], 0, MAX_COUNTER, 0);
  const correct = finiteInteger(value['correct'], 0, attempts, 0);
  const unassistedAttempts = finiteInteger(value['unassistedAttempts'], 0, attempts, 0);
  const unassistedCorrect = finiteInteger(
    value['unassistedCorrect'], 0, Math.min(correct, unassistedAttempts), 0
  );
  const rolling = Array.isArray(value['rollingUnassistedResults'])
    ? value['rollingUnassistedResults'].filter((item): item is boolean => typeof item === 'boolean').slice(-MAX_CHARACTER_RESULTS)
    : [];
  const latencies = Array.isArray(value['rollingRecognitionLatenciesMs'])
    ? value['rollingRecognitionLatenciesMs']
      .filter((item): item is number => typeof item === 'number' && Number.isFinite(item) && item >= 0)
      .slice(-MAX_LATENCY_RESULTS)
    : [];
  const confusionSource = asRecord(value['confusions']) ?? {};
  const allowed = new Set(COURSE.symbolOrder);
  const confusions = Object.fromEntries(Object.entries(confusionSource)
    .filter(([entered]) => allowed.has(entered))
    .map(([entered, count]) => [entered, finiteInteger(count, 0, MAX_COUNTER, 0)] as const)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, MAX_CONFUSION_SYMBOLS));
  return {
    symbolId,
    attempts,
    correct,
    unassistedAttempts,
    unassistedCorrect,
    replayCount: finiteInteger(value['replayCount'], 0, MAX_COUNTER, 0),
    latencyTotalMs: finiteNumber(value['latencyTotalMs'], 0, MAX_LATENCY_TOTAL_MS, 0),
    latencySampleCount: finiteInteger(value['latencySampleCount'], 0, attempts, 0),
    rollingUnassistedResults: rolling,
    rollingRecognitionLatenciesMs: latencies,
    confusions,
    lastPracticedAt: validDate(value['lastPracticedAt'])
  };
}

function normalizeRecentAttempts(value: unknown): readonly RecentUnassistedAttempt[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(COURSE.symbolOrder);
  return value.flatMap((item): RecentUnassistedAttempt[] => {
    const record = asRecord(item);
    const symbolId = record?.['symbolId'];
    const answeredAt = validDate(record?.['answeredAt']);
    if (!record || typeof symbolId !== 'string' || !allowed.has(symbolId) ||
        typeof record['correct'] !== 'boolean' || answeredAt === null) return [];
    return [{ symbolId, correct: record['correct'], answeredAt }];
  }).slice(-MAX_RECENT_ATTEMPTS);
}

function normalizeRecentSessions(value: unknown): readonly LearningSessionSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): LearningSessionSummary[] => {
    const record = asRecord(item);
    if (!record) return [];
    const startedAt = validDate(record['startedAt']);
    const completedAt = validDate(record['completedAt']);
    if (!startedAt || !completedAt) return [];
    const introduced = record['introducedSymbolId'];
    return [{
      id: String(record['id'] ?? '').slice(0, 120),
      startedAt,
      completedAt,
      courseId: COURSE.id,
      courseVersion: COURSE.version,
      level: finiteInteger(record['level'], COURSE.initialSymbolCount, COURSE.symbolOrder.length, COURSE.initialSymbolCount),
      settings: normalizeSettings(asRecord(record['settings'])),
      attempts: finiteInteger(record['attempts'], 0, MAX_COUNTER, 0),
      correct: finiteInteger(record['correct'], 0, finiteInteger(record['attempts'], 0, MAX_COUNTER, 0), 0),
      unassistedAccuracy: nullableRatio(record['unassistedAccuracy']),
      meanRecognitionLatencyMs: nullableFinite(record['meanRecognitionLatencyMs'], 0, MAX_LATENCY_TOTAL_MS),
      introducedSymbolId: typeof introduced === 'string' && COURSE.symbolOrder.includes(introduced) ? introduced : null
    }];
  }).slice(0, MAX_RECENT_SESSIONS);
}

function normalizeSessionLength(value: unknown): TrainingSessionLength {
  return value === 20 || value === 60 ? value : 40;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric)
    ? Math.max(minimum, Math.min(maximum, Math.floor(numeric)))
    : fallback;
}

function finiteNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, numeric)) : fallback;
}

function nullableFinite(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : null;
}

function nullableRatio(value: unknown): number | null {
  return nullableFinite(value, 0, 1);
}

function validDate(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}
