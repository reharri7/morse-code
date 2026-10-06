import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CopyPracticeMode, CopyPracticeService, CopyPracticeSnapshot } from '../../application/copy-practice.service';

@Component({
  selector: 'app-copy-practice-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './copy-practice-page.component.html',
  styleUrl: '../learning-pages.css'
})
export class CopyPracticePageComponent implements OnDestroy {
  snapshot: CopyPracticeSnapshot;
  answer = '';
  readonly mode: CopyPracticeMode;
  private readonly unsubscribe: () => void;

  constructor(route: ActivatedRoute, private readonly practice: CopyPracticeService) {
    this.mode = route.snapshot.queryParamMap.get('mode') === 'words' ? 'words' : 'groups';
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
