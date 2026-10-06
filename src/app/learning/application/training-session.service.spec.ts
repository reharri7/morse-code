import { MorseTimeline } from '../../core/morse/morse-timeline';
import { LearnerProfileV1, RecognitionAttempt, TrainingSettings } from '../domain/learning-model';
import { createInitialLearnerProfile, recordRecognitionAttempt } from '../domain/learning-score';
import { MorseAudioPlayer } from '../infrastructure/morse-audio.service';
import {
  LearningProgressRepository,
  TrainingClock,
  TrainingSessionService
} from './training-session.service';

const START = '2026-09-25T12:00:00.000Z';
const SHORT_SESSION: TrainingSettings = {
  characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600, sessionLength: 20
};

describe('TrainingSessionService', () => {
  it('prepares audio, plays a shared timeline, and scores only the first valid answer', async () => {
    const audio = new FakeAudioPlayer();
    const clock = new ManualClock();
    const progress = new MemoryProgress();
    const service = new TrainingSessionService(audio, progress, clock);
    const starting = service.startSession({ settings: SHORT_SESSION, seed: 'first', sessionId: 'session-1' });
    await flushMicrotasks();
    expect(service.snapshot().state).toBe('playing');
    expect(audio.prepareCount).toBe(1);
    expect(audio.timelines[0].segments.length).toBeGreaterThan(0);
    expect(audio.timelines[0].segments.at(-1)).toEqual(jasmine.objectContaining({
      kind: 'silence', role: 'character-gap', timingBasis: 'spacing'
    }));

    clock.monotonic = 500;
    audio.complete();
    await starting;
    const expected = service.snapshot().currentTrial?.expectedSymbolId ?? '';
    expect(service.snapshot().state).toBe('awaiting-answer');
    clock.monotonic = 900;
    expect(service.submitAnswer(` ${expected.toLowerCase()} `)).toBeTrue();
    expect(service.submitAnswer(expected)).toBeFalse();
    expect(service.snapshot().attempts).toEqual([
      jasmine.objectContaining({ correct: true, recognitionLatencyMs: 400, replayCount: 0 })
    ]);
  });

  it('cancels rapid replay and marks the eventual attempt assisted', async () => {
    const audio = new FakeAudioPlayer();
    const clock = new ManualClock();
    const progress = new MemoryProgress();
    const service = new TrainingSessionService(audio, progress, clock);
    const starting = service.startSession({ settings: SHORT_SESSION, seed: 1, sessionId: 'replay' });
    await flushMicrotasks();
    audio.complete();
    await starting;

    const firstReplay = service.replay();
    await flushMicrotasks();
    const secondReplay = service.replay();
    await flushMicrotasks();
    audio.complete();
    await Promise.all([firstReplay, secondReplay]);
    expect(audio.cancelCount).toBeGreaterThanOrEqual(3);
    expect(service.snapshot().replayCount).toBe(2);

    const expected = service.snapshot().currentTrial?.expectedSymbolId ?? '';
    expect(service.submitAnswer(expected)).toBeTrue();
    expect(service.snapshot().profile.characters[expected].unassistedAttempts).toBe(0);
    expect(service.snapshot().profile.characters[expected].replayCount).toBe(2);
  });

  it('pauses on backgrounding and excludes paused time by replaying before answer timing', async () => {
    const audio = new FakeAudioPlayer();
    const clock = new ManualClock();
    const service = new TrainingSessionService(audio, new MemoryProgress(), clock);
    const starting = service.startSession({ settings: SHORT_SESSION, seed: 2, sessionId: 'pause' });
    await flushMicrotasks();
    clock.monotonic = 100;
    audio.complete();
    await starting;

    clock.monotonic = 1_000;
    service.handleVisibilityChange(true);
    expect(service.snapshot().state).toBe('paused');
    clock.monotonic = 10_000;
    const resuming = service.resume();
    await flushMicrotasks();
    clock.monotonic = 10_100;
    audio.complete();
    await resuming;
    clock.monotonic = 10_200;
    const expected = service.snapshot().currentTrial?.expectedSymbolId ?? '';
    service.submitAnswer(expected);
    expect(service.snapshot().feedback?.recognitionLatencyMs).toBe(100);
    expect(service.snapshot().feedback?.replayCount).toBe(0);
  });

  it('surfaces audio failure without scoring and can retry', async () => {
    const audio = new FakeAudioPlayer();
    audio.prepareError = new Error('browser blocked playback');
    const service = new TrainingSessionService(audio, new MemoryProgress(), new ManualClock());
    await service.startSession({ settings: SHORT_SESSION, seed: 3, sessionId: 'error' });
    expect(service.snapshot().state).toBe('error');
    expect(service.snapshot().errorMessage).toContain('browser blocked playback');
    expect(service.snapshot().attempts).toEqual([]);

    audio.prepareError = null;
    const retrying = service.retryAudio();
    await flushMicrotasks();
    audio.complete();
    await retrying;
    expect(service.snapshot().state).toBe('awaiting-answer');
    expect(service.snapshot().attempts).toEqual([]);
  });

  it('persists completed attempts even when storage reports failure', async () => {
    const audio = new FakeAudioPlayer(true);
    const progress = new MemoryProgress();
    progress.writeSucceeds = false;
    const service = new TrainingSessionService(audio, progress, new ManualClock());
    await service.startSession({ settings: SHORT_SESSION, seed: 4, sessionId: 'quota' });
    const expected = service.snapshot().currentTrial?.expectedSymbolId ?? '';
    expect(service.submitAnswer(expected)).toBeTrue();
    expect(service.snapshot().state).toBe('showing-feedback');
    expect(service.snapshot().storageWriteSucceeded).toBeFalse();
    expect(service.snapshot().profile.characters[expected].attempts).toBe(1);
  });

  it('completes two consecutive sessions, persists summaries, and unlocks at most one symbol', async () => {
    const audio = new FakeAudioPlayer(true);
    const progress = new MemoryProgress();
    const clock = new ManualClock();
    const service = new TrainingSessionService(audio, progress, clock);

    await completePerfectSession(service, clock, 'one');
    expect(service.snapshot().state).toBe('complete');
    expect(service.snapshot().profile.currentSymbolCount).toBe(2);
    await completePerfectSession(service, clock, 'two');
    expect(service.snapshot().profile.currentSymbolCount).toBe(3);
    expect(service.snapshot().summary?.introducedSymbolId).toBe('U');
    expect(service.snapshot().profile.recentSessions.map((summary) => summary.id)).toEqual(['two', 'one']);
  });

  it('allows an earlier-level focused review without rolling back or unlocking progress', async () => {
    const audio = new FakeAudioPlayer(true);
    const progress = new MemoryProgress();
    progress.profile = { ...progress.profile, currentSymbolCount: 5 };
    const service = new TrainingSessionService(audio, progress, new ManualClock());
    await service.startSession({ settings: SHORT_SESSION, seed: 'review', sessionId: 'review', reviewSymbolCount: 3 });
    expect(['K', 'M', 'U']).toContain(service.snapshot().currentTrial?.expectedSymbolId ?? '');
    for (let index = 0; index < SHORT_SESSION.sessionLength; index += 1) {
      const expected = service.snapshot().currentTrial?.expectedSymbolId ?? '';
      service.submitAnswer(expected);
      await service.next();
    }
    expect(service.snapshot().profile.currentSymbolCount).toBe(5);
    expect(service.snapshot().summary?.level).toBe(3);
    expect(service.snapshot().summary?.introducedSymbolId).toBeNull();
  });

  it('cancels route-exit playback and disposes audio resources', async () => {
    const audio = new FakeAudioPlayer();
    const service = new TrainingSessionService(audio, new MemoryProgress(), new ManualClock());
    const starting = service.startSession({ settings: SHORT_SESSION, seed: 5, sessionId: 'exit' });
    await flushMicrotasks();
    service.exitSession();
    await starting;
    expect(service.snapshot().state).toBe('idle');
    expect(audio.cancelCount).toBeGreaterThan(0);
    await service.dispose();
    expect(audio.disposeCount).toBe(1);
  });
});

class FakeAudioPlayer implements MorseAudioPlayer {
  readonly timelines: MorseTimeline[] = [];
  prepareCount = 0;
  cancelCount = 0;
  disposeCount = 0;
  prepareError: Error | null = null;
  private pending: { resolve: () => void; reject: (error: unknown) => void } | null = null;

  constructor(private readonly autoComplete = false) {}

  async prepare(): Promise<void> {
    this.prepareCount += 1;
    if (this.prepareError) throw this.prepareError;
  }

  playTimeline(timeline: MorseTimeline): Promise<void> {
    this.timelines.push(timeline);
    if (this.autoComplete) return Promise.resolve();
    return new Promise<void>((resolve, reject) => { this.pending = { resolve, reject }; });
  }

  cancel(): void {
    this.cancelCount += 1;
    const pending = this.pending;
    this.pending = null;
    pending?.reject(new DOMException('cancelled', 'AbortError'));
  }

  complete(): void {
    const pending = this.pending;
    this.pending = null;
    pending?.resolve();
  }

  async dispose(): Promise<void> {
    this.disposeCount += 1;
    this.cancel();
  }
}

class ManualClock implements TrainingClock {
  monotonic = 0;
  wallTime = Date.parse(START);
  monotonicMs(): number { return this.monotonic; }
  nowIso(): string {
    this.wallTime += 1_000;
    return new Date(this.wallTime).toISOString();
  }
}

class MemoryProgress implements LearningProgressRepository {
  profile: LearnerProfileV1 = createInitialLearnerProfile(START);
  writeSucceeds = true;
  get lastWriteSucceeded(): boolean { return this.writeSucceeds; }
  load(): LearnerProfileV1 { return this.profile; }
  save(profile: LearnerProfileV1): LearnerProfileV1 {
    this.profile = profile;
    return profile;
  }
}

async function completePerfectSession(
  service: TrainingSessionService,
  clock: ManualClock,
  sessionId: string
): Promise<void> {
  await service.startSession({ settings: SHORT_SESSION, seed: sessionId, sessionId });
  for (let index = 0; index < SHORT_SESSION.sessionLength; index += 1) {
    clock.monotonic += 100;
    const expected = service.snapshot().currentTrial?.expectedSymbolId ?? '';
    expect(service.submitAnswer(expected)).toBeTrue();
    await service.next();
  }
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

// Compile-time guard: attempts remain immutable input to the session summary.
void ({} as RecognitionAttempt);
