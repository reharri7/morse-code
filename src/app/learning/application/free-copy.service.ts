import { Inject, Injectable } from '@angular/core';
import { encodeMorseText } from '../../core/morse/morse-sequence';
import { compileMorseTimeline } from '../../core/morse/morse-timing';
import { CopyComparison, buildCopyComparison, generateFreeCopyPassage } from '../domain/free-copy';
import { LearnerProfileV1, RecognitionAttempt } from '../domain/learning-model';
import { recordRecognitionAttempt } from '../domain/learning-score';
import { MorseAudioPlayer } from '../infrastructure/morse-audio.service';
import {
  LEARNING_PROGRESS_REPOSITORY,
  LearningProgressRepository,
  TRAINING_AUDIO_PLAYER,
  TRAINING_CLOCK,
  TrainingClock
} from './training-session.service';

export type FreeCopyState = 'idle' | 'playing' | 'copying' | 'paused' | 'review' | 'error';

export interface FreeCopySnapshot {
  readonly state: FreeCopyState;
  readonly profile: LearnerProfileV1;
  readonly draft: string;
  readonly expectedText: string | null;
  readonly comparison: CopyComparison | null;
  readonly replayCount: number;
  readonly storageWriteSucceeded: boolean;
  readonly errorMessage: string | null;
}

@Injectable({ providedIn: 'root' })
export class FreeCopyService {
  private state: FreeCopyState = 'idle';
  private profile: LearnerProfileV1;
  private passage = '';
  private draft = '';
  private comparison: CopyComparison | null = null;
  private replayCount = 0;
  private errorMessage: string | null = null;
  private revision = 0;
  private readonly listeners = new Set<(snapshot: FreeCopySnapshot) => void>();

  constructor(
    @Inject(TRAINING_AUDIO_PLAYER) private readonly audio: MorseAudioPlayer,
    @Inject(LEARNING_PROGRESS_REPOSITORY) private readonly progress: LearningProgressRepository,
    @Inject(TRAINING_CLOCK) private readonly clock: TrainingClock
  ) {
    this.profile = progress.load();
  }

  snapshot(): FreeCopySnapshot {
    return {
      state: this.state, profile: this.profile, draft: this.draft,
      expectedText: this.state === 'review' ? this.passage : null,
      comparison: this.comparison, replayCount: this.replayCount,
      storageWriteSucceeded: this.progress.lastWriteSucceeded, errorMessage: this.errorMessage
    };
  }

  subscribe(listener: (snapshot: FreeCopySnapshot) => void): () => void {
    this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener);
  }

  async start(options: { seed?: string | number; wordCount?: number } = {}): Promise<void> {
    this.cancel();
    this.profile = this.progress.load();
    this.passage = generateFreeCopyPassage({
      currentSymbolCount: this.profile.currentSymbolCount,
      wordCount: Math.max(4, Math.min(12, Math.floor(options.wordCount ?? 8))),
      seed: options.seed ?? this.clock.nowIso()
    }) ?? '';
    this.draft = ''; this.comparison = null; this.replayCount = 0; this.errorMessage = null;
    if (!this.passage) {
      this.state = 'error';
      this.errorMessage = 'Free copy becomes available when enough unlocked letters can form several practice words.';
      this.emit();
      return;
    }
    await this.play(false);
  }

  updateDraft(value: string): void {
    if (!['playing', 'copying', 'paused'].includes(this.state)) return;
    this.draft = value.slice(0, 200);
    this.emit();
  }

  pause(): void {
    if (!['playing', 'copying'].includes(this.state)) return;
    this.cancel(); this.state = 'paused'; this.emit();
  }

  async resume(): Promise<void> {
    if (this.state !== 'paused') return;
    await this.play(true);
  }

  finish(): boolean {
    if (!['playing', 'copying', 'paused'].includes(this.state) || !this.draft.trim()) return false;
    this.cancel();
    this.comparison = buildCopyComparison({ userCopy: this.draft, referenceText: this.passage });
    const answeredAt = this.clock.nowIso();
    let nextProfile = this.profile;
    this.comparison.referenceScore?.outcomes.forEach((outcome, index) => {
      if (!nextProfile.characters[outcome.expectedSymbolId]) return;
      const attempt: RecognitionAttempt = {
        trialId: `free-copy-${index + 1}`, expectedSymbolId: outcome.expectedSymbolId,
        enteredSymbolId: outcome.enteredSymbolId, correct: outcome.correct,
        replayCount: this.replayCount, recognitionLatencyMs: null, answeredAt
      };
      nextProfile = recordRecognitionAttempt(nextProfile, attempt);
    });
    this.profile = this.progress.save(nextProfile);
    this.state = 'review'; this.emit(); return true;
  }

  cancel(): void { this.revision += 1; this.audio.cancel(); }
  exit(): void { this.cancel(); this.state = 'idle'; this.passage = ''; this.draft = ''; this.comparison = null; this.emit(); }

  private async play(replay: boolean): Promise<void> {
    const revision = ++this.revision;
    this.audio.cancel();
    if (replay) this.replayCount += 1;
    this.state = 'playing'; this.errorMessage = null; this.emit();
    try {
      await this.audio.prepare();
      await this.audio.playTimeline(compileMorseTimeline(encodeMorseText(this.passage), this.profile.settings));
      if (revision !== this.revision) return;
      this.state = 'copying'; this.emit();
    } catch (error) {
      if (revision !== this.revision || (error instanceof DOMException && error.name === 'AbortError')) return;
      this.state = 'error';
      this.errorMessage = error instanceof Error ? `Free-copy audio could not start: ${error.message}` : 'Free-copy audio could not start.';
      this.emit();
    }
  }

  private emit(): void { const snapshot = this.snapshot(); for (const listener of this.listeners) listener(snapshot); }
}
