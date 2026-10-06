import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TrainingSessionService } from '../../application/training-session.service';

@Component({
  selector: 'app-learn-results-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './learn-results-page.component.html',
  styleUrl: '../learning-pages.css'
})
export class LearnResultsPageComponent {
  readonly snapshot;
  starting = false;

  constructor(private readonly training: TrainingSessionService, private readonly router: Router) {
    this.snapshot = training.snapshot();
  }

  get accuracy(): number | null {
    const summary = this.snapshot.summary;
    return summary?.attempts ? summary.correct / summary.attempts : null;
  }

  practiceAgain(): void {
    if (this.starting) return;
    this.starting = true;
    void this.training.startSession().finally(() => this.starting = false);
    void this.router.navigateByUrl('/learn/session');
  }
}
