import { Inject, Injectable, InjectionToken, inject } from '@angular/core';
import { resolveMorseTiming } from '../../core/morse/morse-timing';
import { generateExerciseSymbols } from '../domain/exercise-generator';
import { INTERNATIONAL_RECEIVE_COURSE_V1 } from '../domain/koch-course';
import {
  LearnerProfileV1,
  LearningSessionSummary,
  RecognitionAttempt,
  RecognitionTrial,
  TrainingSessionState,
  TrainingSettings
} from '../domain/learning-model';
import {
  advanceKochProgress,
  appendLearningSession,
  recordRecognitionAttempt,
  scoreRecognitionAnswer
} from '../domain/learning-score';
import { compileRecognitionPromptTimeline } from '../domain/recognition-timeline';
import {
  LearningProgressStore,
  LearningStorageLike
} from '../infrastructure/learning-progress.store';
import { MorseAudioPlayer, MorseAudioService } from '../infrastructure/morse-audio.service';

export interface LearningProgressRepository {
  readonly lastWriteSucceeded: boolean;
  load(): LearnerProfileV1;
  save(profile: LearnerProfileV1): LearnerProfileV1;
}

export interface TrainingClock {
  monotonicMs(): number;
  nowIso(): string;
}

export interface StartTrainingSessionOptions {
  readonly settings?: TrainingSettings;
  readonly seed?: string | number;
  readonly sessionId?: string;
  readonly reviewSymbolCount?: number;
}

export interface TrainingSessionSnapshot {
  readonly state: TrainingSessionState;
  readonly profile: LearnerProfileV1;
  readonly currentTrial: RecognitionTrial | null;
  readonly trialNumber: number;
  readonly totalTrials: number;
  readonly replayCount: number;
  readonly attempts: readonly RecognitionAttempt[];
  readonly feedback: RecognitionAttempt | null;
  readonly summary: LearningSessionSummary | null;
  readonly errorMessage: string | null;
  readonly storageWriteSucceeded: boolean;
}

export const TRAINING_AUDIO_PLAYER = new InjectionToken<MorseAudioPlayer>(
  'TrainingAudioPlayer',
  { providedIn: 'root', factory: () => inject(MorseAudioService) }
);

export const LEARNING_PROGRESS_REPOSITORY = new InjectionToken<LearningProgressRepository>(
  'LearningProgressRepository',
  { providedIn: 'root', factory: () => new LearningProgressStore(browserLearningStorage()) }
);

export const TRAINING_CLOCK = new InjectionToken<TrainingClock>(
  'TrainingClock',
  { providedIn: 'root', factory: browserTrainingClock }
);

@Injectable({ providedIn: 'root' })
export class TrainingSessionService {
  private profile: LearnerProfileV1;
  private state: TrainingSessionState = 'idle';
  private currentTrial: RecognitionTrial | null = null;
  private attempts: RecognitionAttempt[] = [];
  private feedback: RecognitionAttempt | null = null;
  private summary: LearningSessionSummary | null = null;
  private errorMessage: string | null = null;
  private replayCount = 0;
  private answerOpenedAtMs: number | null = null;
  private sessionSymbols: readonly string[] = [];
  private sessionId = '';
  private sessionStartedAt = '';
  private sessionLevel = 0;
  private focusedReview = false;
  private pausedFrom: TrainingSessionState | null = null;
  private lifecycleRevision = 0;
  private playbackRevision = 0;
  private fallbackId = 0;
  private readonly listeners = new Set<(snapshot: TrainingSessionSnapshot) => void>();

  constructor(
    @Inject(TRAINING_AUDIO_PLAYER) private readonly audio: MorseAudioPlayer,
    @Inject(LEARNING_PROGRESS_REPOSITORY) private readonly progress: LearningProgressRepository,
    @Inject(TRAINING_CLOCK) private readonly clock: TrainingClock
  ) {
    this.profile = progress.load();
  }

  snapshot(): TrainingSessionSnapshot {
    return {
      state: this.state,
      profile: this.profile,
      currentTrial: this.currentTrial,
      trialNumber: this.currentTrial?.ordinal ?? this.attempts.length,
      totalTrials: this.sessionSymbols.length,
      replayCount: this.replayCount,
      attempts: [...this.attempts],
      feedback: this.feedback,
      summary: this.summary,
      errorMessage: this.errorMessage,
      storageWriteSucceeded: this.progress.lastWriteSucceeded
    };
  }

  subscribe(listener: (snapshot: TrainingSessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  reloadProfile(): void {
    if (!['idle', 'complete'].includes(this.state)) return;
    this.profile = this.progress.load();
    this.emit();
  }

  async startSession(options: StartTrainingSessionOptions = {}): Promise<void> {
    this.invalidatePlayback();
    const revision = ++this.lifecycleRevision;
    const now = this.clock.nowIso();
    const settings = options.settings ?? this.profile.settings;
    this.profile = this.progress.save({ ...this.profile, settings, updatedAt: now });
    this.sessionId = options.sessionId ?? this.createSessionId();
    this.sessionStartedAt = now;
    const requestedLevel = options.reviewSymbolCount ?? this.profile.currentSymbolCount;
    this.sessionLevel = Number.isInteger(requestedLevel)
      ? Math.max(INTERNATIONAL_RECEIVE_COURSE_V1.initialSymbolCount,
        Math.min(this.profile.currentSymbolCount, requestedLevel))
      : this.profile.currentSymbolCount;
    this.focusedReview = this.sessionLevel < this.profile.currentSymbolCount;
    this.sessionSymbols = generateExerciseSymbols({
      currentSymbolCount: this.sessionLevel,
      count: this.profile.settings.sessionLength,
      seed: options.seed ?? this.sessionId,
      characterStatistics: this.profile.characters,
      adaptive: true
    });
    this.attempts = [];
    this.feedback = null;
    this.summary = null;
    this.errorMessage = null;
    this.replayCount = 0;
    this.answerOpenedAtMs = null;
    this.currentTrial = this.createTrial(0);
    this.state = 'preparing';
    this.emit();
    try {
      await this.audio.prepare();
      if (revision !== this.lifecycleRevision || this.state !== 'preparing') return;
      await this.playCurrentTrial(false);
    } catch (error) {
      if (revision === this.lifecycleRevision) this.handleAudioError(error);
    }
  }

  async replay(): Promise<void> {
    if ((this.state !== 'awaiting-answer' && this.state !== 'playing') || !this.currentTrial) return;
    await this.playCurrentTrial(true);
  }

  submitAnswer(enteredSymbol: string): boolean {
    if (this.state !== 'awaiting-answer' || !this.currentTrial || this.answerOpenedAtMs === null) return false;
    const scored = scoreRecognitionAnswer({
      trialId: this.currentTrial.id,
      expectedSymbolId: this.currentTrial.expectedSymbolId,
      enteredSymbol,
      replayCount: this.replayCount,
      recognitionLatencyMs: Math.max(0, this.clock.monotonicMs() - this.answerOpenedAtMs),
      answeredAt: this.clock.nowIso()
    });
    if (scored.enteredSymbolId === null) return false;

    this.state = 'showing-feedback';
    this.answerOpenedAtMs = null;
    this.feedback = scored;
    this.attempts = [...this.attempts, scored];
    this.profile = this.progress.save(recordRecognitionAttempt(this.profile, scored));
    this.emit();
    return true;
  }

  async next(): Promise<void> {
    if (this.state !== 'showing-feedback') return;
    if (this.attempts.length >= this.sessionSymbols.length) {
      this.completeSession();
      return;
    }
    this.currentTrial = this.createTrial(this.attempts.length);
    this.feedback = null;
    this.replayCount = 0;
    this.answerOpenedAtMs = null;
    await this.playCurrentTrial(false);
  }

  pause(): void {
    if (!['preparing', 'playing', 'awaiting-answer', 'showing-feedback'].includes(this.state)) return;
    this.pausedFrom = this.state;
    this.invalidatePlayback();
    this.state = 'paused';
    this.answerOpenedAtMs = null;
    this.emit();
  }

  async resume(): Promise<void> {
    if (this.state !== 'paused' || !this.currentTrial) return;
    const previous = this.pausedFrom;
    this.pausedFrom = null;
    this.focusedReview = false;
    if (previous === 'showing-feedback') {
      this.state = 'showing-feedback';
      this.emit();
      return;
    }
    const revision = ++this.lifecycleRevision;
    this.state = 'preparing';
    this.errorMessage = null;
    this.emit();
    try {
      await this.audio.prepare();
      if (revision !== this.lifecycleRevision || this.state !== 'preparing') return;
      await this.playCurrentTrial(false);
    } catch (error) {
      if (revision === this.lifecycleRevision) this.handleAudioError(error);
    }
  }

  handleVisibilityChange(hidden: boolean): void {
    if (hidden) this.pause();
  }

  async retryAudio(): Promise<void> {
    if (this.state !== 'error' || !this.currentTrial) return;
    this.state = 'preparing';
    this.errorMessage = null;
    const revision = ++this.lifecycleRevision;
    this.emit();
    try {
      await this.audio.prepare();
      if (revision !== this.lifecycleRevision || this.state !== 'preparing') return;
      await this.playCurrentTrial(false);
    } catch (error) {
      if (revision === this.lifecycleRevision) this.handleAudioError(error);
    }
  }

  exitSession(): void {
    this.invalidatePlayback();
    this.state = 'idle';
    this.currentTrial = null;
    this.sessionSymbols = [];
    this.attempts = [];
    this.feedback = null;
    this.summary = null;
    this.errorMessage = null;
    this.replayCount = 0;
    this.answerOpenedAtMs = null;
    this.pausedFrom = null;
    this.emit();
  }

  async dispose(): Promise<void> {
    this.exitSession();
    await this.audio.dispose();
    this.listeners.clear();
  }

  private async playCurrentTrial(isReplay: boolean): Promise<void> {
    if (!this.currentTrial) return;
    const revision = ++this.playbackRevision;
    this.audio.cancel();
    if (isReplay) this.replayCount += 1;
    this.state = 'playing';
    this.errorMessage = null;
    this.answerOpenedAtMs = null;
    this.emit();
    try {
      await this.audio.playTimeline({
        segments: this.currentTrial.timeline,
        durationMs: this.currentTrial.timeline.reduce((total, segment) => total + segment.durationMs, 0),
        timing: resolveMorseTiming(this.profile.settings)
      });
      if (revision !== this.playbackRevision || this.state !== 'playing') return;
      this.answerOpenedAtMs = this.clock.monotonicMs();
      this.state = 'awaiting-answer';
      this.emit();
    } catch (error) {
      if (revision !== this.playbackRevision || isCancellation(error)) return;
      this.handleAudioError(error);
    }
  }

  private createTrial(index: number): RecognitionTrial {
    const expectedSymbolId = this.sessionSymbols[index];
    const timeline = compileRecognitionPromptTimeline(expectedSymbolId, this.profile.settings);
    return {
      id: `${this.sessionId}-trial-${index + 1}`,
      ordinal: index + 1,
      expectedSymbolId,
      timeline: timeline.segments
    };
  }

  private completeSession(): void {
    const beforeCount = this.profile.currentSymbolCount;
    const completedAt = this.clock.nowIso();
    const advanced = this.focusedReview ? this.profile : advanceKochProgress(this.profile, completedAt);
    const introducedSymbolId = advanced.currentSymbolCount > beforeCount
      ? INTERNATIONAL_RECEIVE_COURSE_V1.symbolOrder[beforeCount]
      : null;
    const unassisted = this.attempts.filter((attempt) => attempt.replayCount === 0);
    const latencies = this.attempts.flatMap((attempt) =>
      attempt.recognitionLatencyMs === null ? [] : [attempt.recognitionLatencyMs]
    );
    const summary: LearningSessionSummary = {
      id: this.sessionId,
      startedAt: this.sessionStartedAt,
      completedAt,
      courseId: INTERNATIONAL_RECEIVE_COURSE_V1.id,
      courseVersion: INTERNATIONAL_RECEIVE_COURSE_V1.version,
      level: this.sessionLevel,
      settings: this.profile.settings,
      attempts: this.attempts.length,
      correct: this.attempts.filter((attempt) => attempt.correct).length,
      unassistedAccuracy: unassisted.length
        ? unassisted.filter((attempt) => attempt.correct).length / unassisted.length
        : null,
      meanRecognitionLatencyMs: latencies.length
        ? latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length
        : null,
      introducedSymbolId
    };
    this.profile = this.progress.save(appendLearningSession(advanced, summary));
    this.summary = summary;
    this.currentTrial = null;
    this.state = 'complete';
    this.emit();
  }

  private invalidatePlayback(): void {
    this.lifecycleRevision += 1;
    this.playbackRevision += 1;
    this.audio.cancel();
  }

  private handleAudioError(error: unknown): void {
    if (isCancellation(error)) return;
    this.state = 'error';
    this.answerOpenedAtMs = null;
    this.errorMessage = error instanceof Error && error.message
      ? `Practice audio could not start: ${error.message}`
      : 'Practice audio could not start. Check this browser\'s audio settings and try again.';
    this.emit();
  }

  private createSessionId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    this.fallbackId += 1;
    return `learning-${this.clock.nowIso()}-${this.fallbackId}`;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

function browserTrainingClock(): TrainingClock {
  return {
    monotonicMs: () => typeof performance === 'undefined' ? Date.now() : performance.now(),
    nowIso: () => new Date().toISOString()
  };
}

function browserLearningStorage(): LearningStorageLike {
  try {
    return window.localStorage;
  } catch {
    return {
      getItem: () => { throw new Error('Local learning storage is unavailable.'); },
      setItem: () => { throw new Error('Local learning storage is unavailable.'); },
      removeItem: () => { throw new Error('Local learning storage is unavailable.'); }
    };
  }
}

function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
