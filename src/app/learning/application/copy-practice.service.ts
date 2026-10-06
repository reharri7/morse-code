import { Inject, Injectable } from '@angular/core';
import { encodeMorseText } from '../../core/morse/morse-sequence';
import { compileMorseTimeline } from '../../core/morse/morse-timing';
import { CopyScore, scoreCopyText } from '../domain/copy-scoring';
import { LearnerProfileV1, RecognitionAttempt, TrainingSettings } from '../domain/learning-model';
import { generateRandomGroups, generateWordExercises } from '../domain/practice-content';
import { recordRecognitionAttempt } from '../domain/learning-score';
import { MorseAudioPlayer } from '../infrastructure/morse-audio.service';
import {
  LEARNING_PROGRESS_REPOSITORY,
  LearningProgressRepository,
  TRAINING_AUDIO_PLAYER,
  TRAINING_CLOCK,
  TrainingClock
} from './training-session.service';

export type CopyPracticeMode = 'groups' | 'words';
export type CopyPracticeState = 'idle' | 'playing' | 'answering' | 'feedback' | 'complete' | 'error';

export interface CopyPracticeSnapshot {
  readonly state: CopyPracticeState;
  readonly mode: CopyPracticeMode;
  readonly profile: LearnerProfileV1;
  readonly expectedText: string | null;
  readonly trialNumber: number;
  readonly totalTrials: number;
  readonly feedback: CopyScore | null;
  readonly correctTrials: number;
  readonly replayCount: number;
  readonly storageWriteSucceeded: boolean;
  readonly errorMessage: string | null;
}

@Injectable({ providedIn: 'root' })
export class CopyPracticeService {
  private state: CopyPracticeState = 'idle';
  private mode: CopyPracticeMode = 'groups';
  private profile: LearnerProfileV1;
  private content: readonly string[] = [];
  private index = 0;
  private feedback: CopyScore | null = null;
  private correctTrials = 0;
  private replayCount = 0;
  private errorMessage: string | null = null;
  private revision = 0;
  private readonly listeners = new Set<(snapshot: CopyPracticeSnapshot) => void>();

  constructor(
    @Inject(TRAINING_AUDIO_PLAYER) private readonly audio: MorseAudioPlayer,
    @Inject(LEARNING_PROGRESS_REPOSITORY) private readonly progress: LearningProgressRepository,
    @Inject(TRAINING_CLOCK) private readonly clock: TrainingClock
  ) {
    this.profile = progress.load();
  }

  snapshot(): CopyPracticeSnapshot {
    return {
      state: this.state, mode: this.mode, profile: this.profile,
      expectedText: this.content[this.index] ?? null,
      trialNumber: Math.min(this.index + 1, this.content.length), totalTrials: this.content.length,
      feedback: this.feedback, correctTrials: this.correctTrials, replayCount: this.replayCount,
      storageWriteSucceeded: this.progress.lastWriteSucceeded, errorMessage: this.errorMessage
    };
  }

  subscribe(listener: (snapshot: CopyPracticeSnapshot) => void): () => void {
    this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener);
  }

  async start(mode: CopyPracticeMode, options: { seed?: string | number; trials?: number; groupLength?: number } = {}): Promise<void> {
    this.cancel();
    this.profile = this.progress.load();
    this.mode = mode;
    const trials = Math.max(1, Math.min(20, Math.floor(options.trials ?? 10)));
    this.content = mode === 'groups'
      ? generateRandomGroups({
          currentSymbolCount: this.profile.currentSymbolCount, groupCount: trials,
          groupLength: Math.max(2, Math.min(8, Math.floor(options.groupLength ?? 5))),
          seed: options.seed ?? this.clock.nowIso(), characterStatistics: this.profile.characters, adaptive: true
        })
      : generateWordExercises({ currentSymbolCount: this.profile.currentSymbolCount, count: trials, seed: options.seed ?? this.clock.nowIso() });
    this.index = 0; this.feedback = null; this.correctTrials = 0; this.replayCount = 0; this.errorMessage = null;
    if (!this.content.length) {
      this.state = 'error';
      this.errorMessage = 'Words become available after more letters are unlocked. Random groups are ready now.';
      this.emit();
      return;
    }
    await this.play(false);
  }

  async replay(): Promise<void> { if (this.state === 'answering') await this.play(true); }

  submit(value: string): boolean {
    if (this.state !== 'answering' || !value.trim()) return false;
    const expected = this.content[this.index];
    const score = scoreCopyText(expected, value);
    const answeredAt = this.clock.nowIso();
    let nextProfile = this.profile;
    score.outcomes.forEach((outcome, outcomeIndex) => {
      const attempt: RecognitionAttempt = {
        trialId: `copy-${this.index + 1}-${outcomeIndex + 1}`,
        expectedSymbolId: outcome.expectedSymbolId,
        enteredSymbolId: outcome.enteredSymbolId,
        correct: outcome.correct,
        replayCount: this.replayCount,
        recognitionLatencyMs: null,
        answeredAt
      };
      nextProfile = recordRecognitionAttempt(nextProfile, attempt);
    });
    this.profile = this.progress.save(nextProfile);
    this.feedback = score;
    if (score.correct) this.correctTrials += 1;
    this.state = 'feedback';
    this.emit();
    return true;
  }

  async next(): Promise<void> {
    if (this.state !== 'feedback') return;
    this.index += 1; this.feedback = null; this.replayCount = 0;
    if (this.index >= this.content.length) { this.state = 'complete'; this.emit(); return; }
    await this.play(false);
  }

  cancel(): void { this.revision += 1; this.audio.cancel(); }
  exit(): void { this.cancel(); this.state = 'idle'; this.content = []; this.emit(); }

  private async play(replay: boolean): Promise<void> {
    const expected = this.content[this.index];
    if (!expected) return;
    const revision = ++this.revision;
    this.audio.cancel();
    if (replay) this.replayCount += 1;
    this.state = 'playing'; this.errorMessage = null; this.emit();
    try {
      await this.audio.prepare();
      await this.audio.playTimeline(compileMorseTimeline(encodeMorseText(expected), this.profile.settings as TrainingSettings));
      if (revision !== this.revision) return;
      this.state = 'answering'; this.emit();
    } catch (error) {
      if (revision !== this.revision || (error instanceof DOMException && error.name === 'AbortError')) return;
      this.state = 'error';
      this.errorMessage = error instanceof Error ? `Practice audio could not start: ${error.message}` : 'Practice audio could not start.';
      this.emit();
    }
  }

  private emit(): void { const snapshot = this.snapshot(); for (const listener of this.listeners) listener(snapshot); }
}
