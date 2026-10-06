import { Inject, Injectable } from '@angular/core';
import { encodeMorseText } from '../../core/morse/morse-sequence';
import { compileMorseTimeline } from '../../core/morse/morse-timing';
import { CopyScore, scoreCopyText } from '../domain/copy-scoring';
import { LearnerProfileV1, RecognitionAttempt } from '../domain/learning-model';
import { recordRecognitionAttempt } from '../domain/learning-score';
import {
  generateContestTrials,
  generateSimulatedCallsigns,
  generateSimulatedQso,
  normalizeRadioCopyInput,
  radioDisplayText,
  RadioPracticeTrial
} from '../domain/radio-practice';
import { MorseAudioPlayer } from '../infrastructure/morse-audio.service';
import {
  LEARNING_PROGRESS_REPOSITORY,
  LearningProgressRepository,
  TRAINING_AUDIO_PLAYER,
  TRAINING_CLOCK,
  TrainingClock
} from './training-session.service';

export type RadioPracticeMode = 'callsigns' | 'contest' | 'qso';
export type RadioPracticeState = 'idle' | 'playing' | 'answering' | 'feedback' | 'complete' | 'error';

export interface RadioPracticeRecord {
  readonly trial: RadioPracticeTrial;
  readonly enteredText: string;
  readonly score: CopyScore;
}

export interface RadioPracticeSnapshot {
  readonly state: RadioPracticeState;
  readonly mode: RadioPracticeMode;
  readonly profile: LearnerProfileV1;
  readonly currentTrial: RadioPracticeTrial | null;
  readonly trialNumber: number;
  readonly totalTrials: number;
  readonly feedback: RadioPracticeRecord | null;
  readonly transcript: readonly RadioPracticeRecord[];
  readonly exactTrials: number;
  readonly replayCount: number;
  readonly storageWriteSucceeded: boolean;
  readonly errorMessage: string | null;
}

@Injectable({ providedIn: 'root' })
export class RadioPracticeService {
  private state: RadioPracticeState = 'idle';
  private mode: RadioPracticeMode = 'callsigns';
  private profile: LearnerProfileV1;
  private trials: readonly RadioPracticeTrial[] = [];
  private index = 0;
  private feedback: RadioPracticeRecord | null = null;
  private transcript: RadioPracticeRecord[] = [];
  private exactTrials = 0;
  private replayCount = 0;
  private errorMessage: string | null = null;
  private revision = 0;
  private readonly listeners = new Set<(snapshot: RadioPracticeSnapshot) => void>();

  constructor(
    @Inject(TRAINING_AUDIO_PLAYER) private readonly audio: MorseAudioPlayer,
    @Inject(LEARNING_PROGRESS_REPOSITORY) private readonly progress: LearningProgressRepository,
    @Inject(TRAINING_CLOCK) private readonly clock: TrainingClock
  ) {
    this.profile = progress.load();
  }

  snapshot(): RadioPracticeSnapshot {
    return {
      state: this.state, mode: this.mode, profile: this.profile,
      currentTrial: this.trials[this.index] ?? null,
      trialNumber: Math.min(this.index + 1, this.trials.length), totalTrials: this.trials.length,
      feedback: this.feedback, transcript: Object.freeze([...this.transcript]), exactTrials: this.exactTrials,
      replayCount: this.replayCount, storageWriteSucceeded: this.progress.lastWriteSucceeded,
      errorMessage: this.errorMessage
    };
  }

  subscribe(listener: (snapshot: RadioPracticeSnapshot) => void): () => void {
    this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener);
  }

  async start(mode: RadioPracticeMode, options: { seed?: string | number; trials?: number } = {}): Promise<void> {
    this.cancel();
    this.profile = this.progress.load();
    this.mode = mode;
    const seed = options.seed ?? this.clock.nowIso();
    const count = Math.max(1, Math.min(20, Math.floor(options.trials ?? 10)));
    if (mode === 'callsigns') {
      this.trials = generateSimulatedCallsigns({ currentSymbolCount: this.profile.currentSymbolCount, count, seed })
        .map((callsign, index) => Object.freeze({
          id: `callsign-${index + 1}`, kind: 'callsign' as const, label: 'Simulated callsign',
          audioText: callsign.value, displayText: callsign.value,
          explanation: 'Locally generated practice text. It is not assigned, looked up, or validated.', speaker: null
        }));
    } else if (mode === 'contest') {
      this.trials = generateContestTrials({ currentSymbolCount: this.profile.currentSymbolCount, count, seed });
    } else {
      this.trials = generateSimulatedQso(this.profile.currentSymbolCount, seed)?.turns ?? [];
    }
    this.index = 0; this.feedback = null; this.transcript = []; this.exactTrials = 0;
    this.replayCount = 0; this.errorMessage = null;
    if (!this.trials.length) {
      this.state = 'error';
      this.errorMessage = mode === 'callsigns'
        ? 'Simulated callsigns become available after a number and more letters are unlocked.'
        : 'This radio exercise needs more of the alphabet and numbers. Keep learning, or use random groups now.';
      this.emit();
      return;
    }
    await this.play(false);
  }

  async replay(): Promise<void> { if (this.state === 'answering') await this.play(true); }

  submit(value: string): boolean {
    if (this.state !== 'answering' || !value.trim()) return false;
    const trial = this.trials[this.index];
    const normalizedInput = normalizeRadioCopyInput(value);
    const score = scoreCopyText(trial.audioText, normalizedInput);
    const answeredAt = this.clock.nowIso();
    let nextProfile = this.profile;
    score.outcomes.forEach((outcome, outcomeIndex) => {
      if (!nextProfile.characters[outcome.expectedSymbolId]) return;
      const attempt: RecognitionAttempt = {
        trialId: `radio-${this.index + 1}-${outcomeIndex + 1}`,
        expectedSymbolId: outcome.expectedSymbolId, enteredSymbolId: outcome.enteredSymbolId,
        correct: outcome.correct, replayCount: this.replayCount,
        recognitionLatencyMs: null, answeredAt
      };
      nextProfile = recordRecognitionAttempt(nextProfile, attempt);
    });
    this.profile = this.progress.save(nextProfile);
    const record = Object.freeze({ trial, enteredText: radioDisplayText(score.enteredText), score });
    this.feedback = record;
    this.transcript.push(record);
    if (score.correct) this.exactTrials += 1;
    this.state = 'feedback';
    this.emit();
    return true;
  }

  async next(): Promise<void> {
    if (this.state !== 'feedback') return;
    this.index += 1; this.feedback = null; this.replayCount = 0;
    if (this.index >= this.trials.length) { this.state = 'complete'; this.emit(); return; }
    await this.play(false);
  }

  cancel(): void { this.revision += 1; this.audio.cancel(); }
  exit(): void { this.cancel(); this.state = 'idle'; this.trials = []; this.feedback = null; this.transcript = []; this.emit(); }

  private async play(replay: boolean): Promise<void> {
    const trial = this.trials[this.index];
    if (!trial) return;
    const revision = ++this.revision;
    this.audio.cancel();
    if (replay) this.replayCount += 1;
    this.state = 'playing'; this.errorMessage = null; this.emit();
    try {
      await this.audio.prepare();
      await this.audio.playTimeline(compileMorseTimeline(encodeMorseText(trial.audioText), this.profile.settings));
      if (revision !== this.revision) return;
      this.state = 'answering'; this.emit();
    } catch (error) {
      if (revision !== this.revision || (error instanceof DOMException && error.name === 'AbortError')) return;
      this.state = 'error';
      this.errorMessage = error instanceof Error ? `Radio practice audio could not start: ${error.message}` : 'Radio practice audio could not start.';
      this.emit();
    }
  }

  private emit(): void { const snapshot = this.snapshot(); for (const listener of this.listeners) listener(snapshot); }
}
