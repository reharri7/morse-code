
import { Component, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { CopyPracticeMode } from '../../application/copy-practice.service';
import type { RadioPracticeMode } from '../../application/radio-practice.service';
import { TrainingSessionService, TrainingSessionSnapshot } from '../../application/training-session.service';
import { activeKochSymbols, INTERNATIONAL_RECEIVE_COURSE_V1 } from '../../domain/koch-course';

@Component({
  selector: 'app-learn-home-page',
  imports: [RouterLink],
  templateUrl: './learn-home-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: '../learning-pages.css'
})
export class LearnHomePageComponent implements OnDestroy {
  snapshot: TrainingSessionSnapshot;
  launching = '';
  private readonly unsubscribe: () => void;

  constructor(
    private readonly training: TrainingSessionService,
    private readonly router: Router
  ) {
    training.reloadProfile();
    this.snapshot = training.snapshot();
    this.unsubscribe = training.subscribe((snapshot) => this.snapshot = snapshot);
  }

  get activeSymbols(): readonly string[] {
    return activeKochSymbols(this.snapshot.profile.currentSymbolCount);
  }

  get courseProgress(): number {
    return this.snapshot.profile.currentSymbolCount / INTERNATIONAL_RECEIVE_COURSE_V1.symbolOrder.length;
  }

  get canContinue(): boolean {
    return ['preparing', 'playing', 'awaiting-answer', 'showing-feedback', 'paused', 'error'].includes(this.snapshot.state);
  }

  startCharacters(): void {
    if (this.canContinue) {
      void this.router.navigateByUrl('/learn/session');
      return;
    }
    this.launching = 'characters';
    void this.training.startSession().finally(() => this.launching = '');
    void this.router.navigateByUrl('/learn/session');
  }

  startCopy(mode: CopyPracticeMode): void {
    void this.router.navigate(['/learn/copy'], { queryParams: { mode, start: 1 } });
  }

  startRadio(mode: RadioPracticeMode): void {
    void this.router.navigate(['/learn/radio'], { queryParams: { mode, start: 1 } });
  }

  ngOnDestroy(): void {
    this.unsubscribe();
  }
}
