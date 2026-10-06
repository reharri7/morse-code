import { CommonModule } from '@angular/common';
import { Component, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FreeCopyService, FreeCopySnapshot } from '../../application/free-copy.service';
import { CopyComparison, buildCopyComparison } from '../../domain/free-copy';
import { AudioFileAdapter } from '../../../verification/audio-file-adapter';
import { VerificationResult } from '../../../verification/verification-model';
import { runPcmVerification } from '../../../verification/verification-runner';

@Component({
  selector: 'app-free-copy-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './free-copy-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: '../learning-pages.css'
})
export class FreeCopyPageComponent implements OnDestroy {
  snapshot: FreeCopySnapshot;
  draft = '';
  recordingConfirmed = false;
  recordingBusy = false;
  recordingError = '';
  recordingUrl = '';
  recordingName = '';
  recordingUserCopy = '';
  recordingReference = '';
  recordingResult: VerificationResult | null = null;
  recordingComparison: CopyComparison | null = null;
  private readonly unsubscribe: () => void;
  private readonly fileAdapter = new AudioFileAdapter();

  constructor(private readonly practice: FreeCopyService) {
    this.snapshot = practice.snapshot();
    this.unsubscribe = practice.subscribe((snapshot) => {
      this.snapshot = snapshot;
      this.draft = snapshot.draft;
    });
  }

  start(): void { this.clearRecording(); void this.practice.start(); }
  updateDraft(): void { this.practice.updateDraft(this.draft); }
  pause(): void { this.practice.pause(); }
  resume(): void { void this.practice.resume(); }
  finish(): void { this.practice.updateDraft(this.draft); this.practice.finish(); }

  async selectRecording(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.recordingConfirmed || this.recordingBusy || ['playing', 'copying', 'paused'].includes(this.snapshot.state)) return;
    this.clearRecording();
    this.recordingBusy = true;
    try {
      const decoded = await this.fileAdapter.decode(file);
      this.recordingResult = runPcmVerification({
        testCase: {
          id: 'local-practice-recording-v1', version: 1, title: 'Local practice recording',
          purpose: 'Provides an unscored raw-decoder comparison after copy practice.', sourceKind: 'imported-file'
        },
        sourceName: decoded.sourceName, samples: decoded.samples, sampleRate: decoded.sampleRate,
        browserUserAgent: navigator.userAgent
      });
      this.recordingUrl = URL.createObjectURL(file);
      this.recordingName = file.name;
    } catch (error) {
      this.recordingError = error instanceof Error ? error.message : 'The local recording could not be prepared.';
    } finally {
      this.recordingBusy = false;
    }
  }

  compareRecording(): void {
    if (!this.recordingResult || !this.recordingUserCopy.trim()) return;
    this.recordingComparison = buildCopyComparison({
      userCopy: this.recordingUserCopy,
      rawDecoderText: this.recordingResult.rawText,
      referenceText: this.recordingReference,
      decoderConfidence: this.recordingResult.observations.meanCharacterConfidence,
      timingConfidence: this.recordingResult.observations.timingConfidence
    });
  }

  ngOnDestroy(): void {
    this.practice.exit();
    this.unsubscribe();
    this.revokeRecordingUrl();
  }

  private clearRecording(): void {
    this.revokeRecordingUrl();
    this.recordingError = ''; this.recordingName = ''; this.recordingUserCopy = '';
    this.recordingReference = ''; this.recordingResult = null; this.recordingComparison = null;
  }

  private revokeRecordingUrl(): void {
    if (this.recordingUrl) URL.revokeObjectURL(this.recordingUrl);
    this.recordingUrl = '';
  }
}
