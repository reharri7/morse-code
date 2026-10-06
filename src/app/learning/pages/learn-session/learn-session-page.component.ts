import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { getMorseSymbolDefinition } from '../../../core/morse/morse-table';
import { TrainingSessionService, TrainingSessionSnapshot } from '../../application/training-session.service';

@Component({
  selector: 'app-learn-session-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './learn-session-page.component.html',
  styleUrl: '../learning-pages.css'
})
export class LearnSessionPageComponent implements OnDestroy {
  @ViewChild('answerInput') answerInput?: ElementRef<HTMLInputElement>;
  @ViewChild('nextButton') nextButton?: ElementRef<HTMLButtonElement>;

  snapshot: TrainingSessionSnapshot;
  typedAnswer = '';
  inputMessage = '';
  private readonly unsubscribe: () => void;

  constructor(
    private readonly training: TrainingSessionService,
    private readonly router: Router
  ) {
    this.snapshot = training.snapshot();
    this.unsubscribe = training.subscribe((snapshot) => {
      const previousState = this.snapshot?.state;
      this.snapshot = snapshot;
      if (snapshot.state === 'awaiting-answer' && previousState !== 'awaiting-answer') {
        queueMicrotask(() => this.answerInput?.nativeElement.focus());
      }
      if (snapshot.state === 'showing-feedback' && previousState !== 'showing-feedback') {
        queueMicrotask(() => this.nextButton?.nativeElement.focus());
      }
    });
  }

  get progressPercent(): number {
    if (!this.snapshot.totalTrials) return 0;
    return Math.min(100, (this.snapshot.attempts.length / this.snapshot.totalTrials) * 100);
  }

  get feedbackPattern(): string {
    const symbol = this.snapshot.feedback?.expectedSymbolId;
    return symbol
      ? getMorseSymbolDefinition(symbol).pattern.replaceAll('.', '·').replaceAll('-', '−')
      : '';
  }

  get announcement(): string {
    switch (this.snapshot.state) {
      case 'preparing': return 'Preparing practice audio.';
      case 'playing': return `Playing character ${this.snapshot.trialNumber} of ${this.snapshot.totalTrials}.`;
      case 'awaiting-answer': return 'Audio finished. Type the character you heard.';
      case 'showing-feedback': return this.snapshot.feedback?.correct ? 'Correct.' : 'Not quite.';
      case 'paused': return 'Practice paused.';
      case 'complete': return 'Practice session complete.';
      case 'error': return this.snapshot.errorMessage ?? 'Practice audio needs attention.';
      default: return 'No active practice session.';
    }
  }

  submitTypedAnswer(): void {
    const accepted = this.training.submitAnswer(this.typedAnswer);
    if (!accepted) {
      this.inputMessage = 'Enter one available letter or number.';
      return;
    }
    this.typedAnswer = '';
    this.inputMessage = '';
  }

  onTypedAnswerChange(value: string): void {
    this.typedAnswer = value;
    if (/^[a-z0-9]$/i.test(value)) {
      this.submitTypedAnswer();
    }
  }

  submitKey(symbol: string): void {
    if (this.training.submitAnswer(symbol)) {
      this.typedAnswer = '';
      this.inputMessage = '';
    }
  }

  async nextTrial(): Promise<void> {
    await this.training.next();
    if (this.training.snapshot().state === 'complete') {
      await this.router.navigateByUrl('/learn/results');
    }
  }

  pause(): void { this.training.pause(); }
  resume(): void { void this.training.resume(); }
  replay(): void { void this.training.replay(); }
  retry(): void { void this.training.retryAudio(); }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    this.training.handleVisibilityChange(document.hidden);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const inControl = Boolean(target?.closest('input, select, textarea, button, a'));
    if (event.key === 'Escape') {
      event.preventDefault();
      this.pause();
      return;
    }
    if (!inControl && this.snapshot.state === 'showing-feedback' &&
        (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      void this.nextTrial();
      return;
    }
    if (inControl) return;
    if ((event.key === ' ' || event.key === 'Enter') &&
        (this.snapshot.state === 'awaiting-answer' || this.snapshot.state === 'playing')) {
      event.preventDefault();
      this.replay();
      return;
    }
    if (this.snapshot.state === 'awaiting-answer' && /^[a-z0-9]$/i.test(event.key)) {
      event.preventDefault();
      this.submitKey(event.key);
    }
  }

  ngOnDestroy(): void {
    if (['preparing', 'playing', 'awaiting-answer', 'showing-feedback'].includes(this.snapshot.state)) {
      this.training.pause();
    }
    this.unsubscribe();
  }
}
