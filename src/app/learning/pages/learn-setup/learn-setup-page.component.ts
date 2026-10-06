import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { encodeMorseText } from '../../../core/morse/morse-sequence';
import { getMorseSymbolDefinition } from '../../../core/morse/morse-table';
import { compileMorseTimeline } from '../../../core/morse/morse-timing';
import { TrainingSessionService } from '../../application/training-session.service';
import { activeKochSymbols } from '../../domain/koch-course';
import { TrainingSessionLength, TrainingSettings } from '../../domain/learning-model';
import { MorseAudioService } from '../../infrastructure/morse-audio.service';

@Component({
  selector: 'app-learn-setup-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './learn-setup-page.component.html',
  styleUrl: '../learning-pages.css'
})
export class LearnSetupPageComponent implements OnDestroy {
  characterWpm: number;
  effectiveWpm: number;
  toneFrequencyHz: number;
  sessionLength: TrainingSessionLength;
  reviewSymbolCount: number;
  introStatus = 'Use speakers or headphones. Learning never turns on your microphone.';
  starting = false;
  readonly audioSupported = MorseAudioService.isSupported();

  constructor(
    private readonly training: TrainingSessionService,
    private readonly audio: MorseAudioService,
    private readonly router: Router
  ) {
    const settings = training.snapshot().profile.settings;
    this.characterWpm = settings.characterWpm;
    this.effectiveWpm = settings.effectiveWpm;
    this.toneFrequencyHz = settings.toneFrequencyHz;
    this.sessionLength = settings.sessionLength;
    this.reviewSymbolCount = training.snapshot().profile.currentSymbolCount;
  }

  get introductionSymbols(): readonly string[] {
    return activeKochSymbols(this.reviewSymbolCount).slice(-2);
  }

  get reviewLevels(): readonly { readonly count: number; readonly label: string }[] {
    const profile = this.training.snapshot().profile;
    return Array.from({ length: profile.currentSymbolCount - 1 }, (_, index) => {
      const count = index + 2;
      const newest = activeKochSymbols(count).at(-1);
      return { count, label: count === profile.currentSymbolCount ? `All ${count} unlocked characters` : `Review through ${newest} (${count})` };
    });
  }

  pattern(symbol: string): string {
    return getMorseSymbolDefinition(symbol).pattern.replaceAll('.', '·').replaceAll('-', '−');
  }

  async hear(symbol: string): Promise<void> {
    const settings = this.normalizedSettings();
    this.introStatus = `Playing ${symbol}.`;
    try {
      await this.audio.prepare();
      await this.audio.playTimeline(compileMorseTimeline(encodeMorseText(symbol), settings));
      this.introStatus = `${symbol} finished. Play it again or start practice.`;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.introStatus = 'Practice audio could not start. Check browser audio permissions and try again.';
    }
  }

  startPractice(): void {
    if (this.starting) return;
    this.starting = true;
    this.audio.cancel();
    void this.training.startSession({
      settings: this.normalizedSettings(),
      reviewSymbolCount: this.reviewSymbolCount
    })
      .finally(() => this.starting = false);
    void this.router.navigateByUrl('/learn/session');
  }

  ngOnDestroy(): void {
    this.audio.cancel();
  }

  private normalizedSettings(): TrainingSettings {
    const characterWpm = Math.max(12, Math.min(40, Number(this.characterWpm) || 20));
    return {
      characterWpm,
      effectiveWpm: Math.max(5, Math.min(characterWpm, Number(this.effectiveWpm) || 10)),
      toneFrequencyHz: Math.max(300, Math.min(1_000, Number(this.toneFrequencyHz) || 600)),
      sessionLength: this.sessionLength === 20 || this.sessionLength === 60 ? this.sessionLength : 40
    };
  }
}
