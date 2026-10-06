
import { Component, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  RadioPracticeMode,
  RadioPracticeService,
  RadioPracticeSnapshot
} from '../../application/radio-practice.service';
import { RADIO_TOKEN_CONVENTIONS } from '../../domain/radio-practice';

@Component({
  selector: 'app-radio-practice-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './radio-practice-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: '../learning-pages.css'
})
export class RadioPracticePageComponent implements OnDestroy {
  snapshot: RadioPracticeSnapshot;
  answer = '';
  readonly mode: RadioPracticeMode;
  readonly tokenConventions = RADIO_TOKEN_CONVENTIONS;
  private readonly unsubscribe: () => void;

  constructor(route: ActivatedRoute, private readonly practice: RadioPracticeService) {
    const requested = route.snapshot.queryParamMap.get('mode');
    this.mode = requested === 'contest' || requested === 'qso' ? requested : 'callsigns';
    this.snapshot = practice.snapshot();
    this.unsubscribe = practice.subscribe((snapshot) => this.snapshot = snapshot);
    if (route.snapshot.queryParamMap.get('start') === '1') void practice.start(this.mode);
  }

  start(): void { void this.practice.start(this.mode); }
  replay(): void { void this.practice.replay(); }
  submit(): void { if (this.practice.submit(this.answer)) this.answer = ''; }
  next(): void { void this.practice.next(); }

  ngOnDestroy(): void {
    this.practice.exit();
    this.unsubscribe();
  }
}
