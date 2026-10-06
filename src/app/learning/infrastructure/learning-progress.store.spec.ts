import { createInitialLearnerProfile, recordRecognitionAttempt } from '../domain/learning-score';
import { RecognitionAttempt } from '../domain/learning-model';
import {
  LEARNING_STORAGE_KEY,
  LearningProgressStore,
  LearningStorageLike,
  normalizeStoredProfile
} from './learning-progress.store';

const NOW = '2026-09-25T12:00:00.000Z';
const PRODUCT_KEY = 'cw-transcriber.product.v1';

class MemoryStorage implements LearningStorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe('LearningProgressStore', () => {
  it('round-trips settings, level, and per-character aggregates exactly', () => {
    const storage = new MemoryStorage();
    const store = new LearningProgressStore(storage, () => NOW);
    let profile = createInitialLearnerProfile(NOW);
    profile = recordRecognitionAttempt(profile, attempt('K', true));
    profile = {
      ...profile,
      currentSymbolCount: 3,
      settings: { characterWpm: 25, effectiveWpm: 9, toneFrequencyHz: 700, sessionLength: 60 }
    };
    const saved = store.save(profile);
    expect(new LearningProgressStore(storage, () => NOW).load()).toEqual(saved);
    expect(storage.getItem(LEARNING_STORAGE_KEY)).not.toContain('samples');
  });

  it('migrates schema zero and normalizes bounds while ignoring unknown symbols', () => {
    const migrated = normalizeStoredProfile({
      schemaVersion: 0,
      currentLevel: 3,
      settings: { characterWpm: 100, effectiveWpm: 1, toneFrequencyHz: 2_000, sessionLength: 999 },
      characterStats: {
        K: { attempts: 5, correct: 8, unassistedAttempts: 3, unassistedCorrect: 9 },
        _: { attempts: 99, correct: 99 }
      },
      updatedAt: NOW
    }, NOW);
    expect(migrated.currentSymbolCount).toBe(3);
    expect(migrated.settings).toEqual({
      characterWpm: 40, effectiveWpm: 5, toneFrequencyHz: 1_000, sessionLength: 40
    });
    expect(migrated.characters['K']).toEqual(jasmine.objectContaining({
      attempts: 5, correct: 5, unassistedAttempts: 3, unassistedCorrect: 3
    }));
    expect(migrated.characters['_']).toBeUndefined();
  });

  it('bounds rolling data and rejects invalid records', () => {
    const recentAttempts = Array.from({ length: 220 }, (_, index) => ({
      symbolId: index === 0 ? '_' : 'K', correct: true, answeredAt: NOW
    }));
    const recentSessions = Array.from({ length: 110 }, (_, index) => ({
      id: String(index), startedAt: NOW, completedAt: NOW, level: 2,
      settings: {}, attempts: 40, correct: 36
    }));
    const profile = normalizeStoredProfile({
      ...createInitialLearnerProfile(NOW), recentUnassistedAttempts: recentAttempts, recentSessions,
      characters: { K: { attempts: 999, correct: 700, rollingUnassistedResults: Array(75).fill(true) } }
    }, NOW);
    expect(profile.recentUnassistedAttempts.length).toBe(200);
    expect(profile.recentUnassistedAttempts.every((item) => item.symbolId === 'K')).toBeTrue();
    expect(profile.recentSessions.length).toBe(100);
    expect(profile.characters['K'].rollingUnassistedResults.length).toBe(50);
  });

  it('falls back safely for corrupt JSON and unsupported course/schema versions', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEARNING_STORAGE_KEY, '{bad json');
    expect(new LearningProgressStore(storage, () => NOW).load().currentSymbolCount).toBe(2);
    storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify({ schemaVersion: 2, currentSymbolCount: 30 }));
    expect(new LearningProgressStore(storage, () => NOW).load().currentSymbolCount).toBe(2);
    storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify({
      ...createInitialLearnerProfile(NOW), courseVersion: 999, currentSymbolCount: 30
    }));
    expect(new LearningProgressStore(storage, () => NOW).load().currentSymbolCount).toBe(2);
  });

  it('returns normalized in-memory progress when storage is full', () => {
    const storage: LearningStorageLike = {
      getItem: () => null,
      setItem: () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); },
      removeItem: () => undefined
    };
    const store = new LearningProgressStore(storage, () => NOW);
    const profile = { ...createInitialLearnerProfile(NOW), currentSymbolCount: 3 };
    expect(() => store.save(profile)).not.toThrow();
    expect(store.save(profile).currentSymbolCount).toBe(3);
    expect(store.lastWriteSucceeded).toBeFalse();
  });

  it('resets only the learning key and leaves transcription product data intact', () => {
    const storage = new MemoryStorage();
    storage.setItem(PRODUCT_KEY, JSON.stringify({ schemaVersion: 1, sessions: [{ id: 'keep-me' }] }));
    const store = new LearningProgressStore(storage, () => NOW);
    store.save({ ...createInitialLearnerProfile(NOW), currentSymbolCount: 8 });
    const reset = store.reset();
    expect(reset.currentSymbolCount).toBe(2);
    expect(storage.getItem(LEARNING_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(PRODUCT_KEY)).toContain('keep-me');
  });
});

function attempt(symbolId: string, correct: boolean): RecognitionAttempt {
  return {
    trialId: 'trial-1', expectedSymbolId: symbolId, enteredSymbolId: correct ? symbolId : 'M', correct,
    replayCount: 0, recognitionLatencyMs: 800, answeredAt: NOW
  };
}
