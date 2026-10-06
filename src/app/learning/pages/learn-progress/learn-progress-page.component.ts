import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TrainingSessionService } from '../../application/training-session.service';
import { activeKochSymbols } from '../../domain/koch-course';
import { CharacterStatistics } from '../../domain/learning-model';

@Component({
  selector: 'app-learn-progress-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './learn-progress-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: '../learning-pages.css'
})
export class LearnProgressPageComponent {
  readonly snapshot;

  constructor(training: TrainingSessionService) {
    training.reloadProfile();
    this.snapshot = training.snapshot();
  }

  get statistics(): readonly CharacterStatistics[] {
    return activeKochSymbols(this.snapshot.profile.currentSymbolCount)
      .map((symbol) => this.snapshot.profile.characters[symbol]);
  }

  accuracy(statistics: CharacterStatistics): number | null {
    return statistics.attempts ? statistics.correct / statistics.attempts : null;
  }

  meanLatency(statistics: CharacterStatistics): number | null {
    return statistics.latencySampleCount
      ? statistics.latencyTotalMs / statistics.latencySampleCount
      : null;
  }
}
