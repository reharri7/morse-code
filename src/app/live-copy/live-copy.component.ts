import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecodedCharacterEvidence } from '../core/morse/interfaces';
import { CopyComparison, buildCopyComparison } from '../learning/domain/free-copy';

@Component({
  selector: 'app-live-copy',
  imports: [CommonModule, FormsModule],
  templateUrl: './live-copy.component.html',
  styleUrl: './live-copy.component.css'
})
export class LiveCopyComponent implements OnDestroy {
  @Input() rawText = '';
  @Input() characters: readonly DecodedCharacterEvidence[] = [];
  @Input() timingConfidence = 0;
  @Input() receiverActive = false;
  @Output() activeChange = new EventEmitter<boolean>();

  state: 'idle' | 'active' | 'review' = 'idle';
  userCopy = '';
  referenceText = '';
  comparison: CopyComparison | null = null;

  start(): void {
    this.userCopy = ''; this.referenceText = ''; this.comparison = null; this.state = 'active';
    this.activeChange.emit(true);
  }

  finish(): void {
    if (this.state !== 'active' || !this.userCopy.trim()) return;
    this.comparison = buildCopyComparison({
      userCopy: this.userCopy,
      rawDecoderText: this.rawText,
      referenceText: this.referenceText,
      characters: this.characters,
      timingConfidence: this.timingConfidence
    });
    this.state = 'review';
    this.activeChange.emit(false);
  }

  cancel(): void {
    this.state = 'idle'; this.userCopy = ''; this.referenceText = ''; this.comparison = null;
    this.activeChange.emit(false);
  }

  ngOnDestroy(): void { if (this.state === 'active') this.activeChange.emit(false); }
}
