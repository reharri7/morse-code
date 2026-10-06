import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, Inject, InjectionToken, OnDestroy, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { encodeMorseText } from '../../../core/morse/morse-sequence';
import { getMorseSymbolDefinition } from '../../../core/morse/morse-table';
import { compileMorseTimeline } from '../../../core/morse/morse-timing';
import { TrainingSessionService } from '../../application/training-session.service';
import { analyzeKeyingAttempt, KeyingAttemptResult, KeyingStroke } from '../../domain/keying-analysis';
import { activeKochSymbols } from '../../domain/koch-course';
import { KEYING_SIDETONE, KeyingSidetonePlayer } from '../../infrastructure/keying-sidetone.service';
import { MorseAudioService } from '../../infrastructure/morse-audio.service';
import { PaddleKeyer } from '../../domain/paddle-keyer';

export interface KeyingClock {
  now(): number;
}

export interface KeyingScheduler {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export const KEYING_CLOCK = new InjectionToken<KeyingClock>(
  'KeyingClock',
  { providedIn: 'root', factory: () => ({ now: () => performance.now() }) }
);

export const KEYING_SCHEDULER = new InjectionToken<KeyingScheduler>(
  'KeyingScheduler',
  {
    providedIn: 'root',
    factory: () => ({
      schedule: (callback, delayMs) => setTimeout(callback, delayMs),
      cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
    })
  }
);

@Component({
  selector: 'app-keying-practice-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './keying-practice-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: '../learning-pages.css'
})
export class KeyingPracticePageComponent implements OnDestroy {
  @ViewChild('paddleDialog', { static: true }) private paddleDialog!: ElementRef<HTMLDialogElement>;
  private returnFocus: HTMLElement | null = null;
  readonly symbols: readonly string[];
  readonly speeds = [12, 15, 20, 25, 30, 40];
  targetSymbolId: string;
  characterWpm: number;
  toneFrequencyHz: number;
  strokes: KeyingStroke[] = [];
  result: KeyingAttemptResult | null = null;
  keyIsDown = false;
  status = 'Hold Space or the on-screen key for each mark.';
  audioError = '';
  private downAtMs: number | null = null;
  private autoCheckHandle: unknown | null = null;
  private autoAdvanceHandle: unknown | null = null;
  inputMode: 'straight' | 'paddle' = 'straight';
  setupSide: 'dit' | 'dah' | null = null;
  paddleArmed = false;
  private suppressNextClick = false;
  private readonly captureMouseDown = (event: MouseEvent) => this.handleMouseDown(event);
  private readonly captureMouseUp = (event: MouseEvent) => this.handleMouseUp(event);
  private readonly captureClick = (event: MouseEvent) => {
    if ((this.capturingPaddle || this.suppressNextClick) && !isPaddleControl(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    this.suppressNextClick = false;
  };
  private readonly blockScroll = (event: Event) => {
    if (this.capturingPaddle && !isPaddleControl(event.target)) event.preventDefault();
  };
  private readonly blockMenu = (event: Event) => {
    if (this.capturingPaddle || this.suppressNextClick) event.preventDefault();
  };
  ditCode = '';
  dahCode = '';
  setupMessage = 'Choose Set up paddle, then press and release each side.';
  private capturedCode = '';
  private paddleTimer: unknown | null = null;
  private paddleRunning = false;
  private readonly paddle = new PaddleKeyer();

  get paddleReady(): boolean { return Boolean(this.ditCode && this.dahCode); }
  get capturingPaddle(): boolean { return this.inputMode === 'paddle' && (this.paddleArmed || this.setupSide !== null); }

  startPaddlePractice(): void {
    if (!this.paddleReady || this.setupSide) return;
    this.clearAttempt();
    this.paddleArmed = true;
    this.openPaddleDialog();
    this.status = 'Paddle active. Escape closes practice.';
  }

  stopPaddlePractice(): void {
    this.paddleArmed = false;
    this.suppressNextClick = false;
    this.setupSide = null;
    if (this.paddleDialog?.nativeElement.open) {
      this.paddleDialog.nativeElement.close();
      this.changeDetector.detectChanges();
      this.returnFocus?.focus();
      this.returnFocus = null;
    }
    this.capturedCode = '';
    this.stopPaddle();
    this.cancelAutomaticCheck();
    this.cancelAutomaticAdvance();
    this.sidetone.stop();
    this.audio.cancel();
    this.keyIsDown = false;
    this.downAtMs = null;
    this.checkAttempt();
    this.status = 'Paddle stopped. Mouse and scrolling work normally.';
  }

  inputChanged(): void {
    this.stopPaddlePractice();
    this.clearAttempt();
  }

  setupPaddle(): void {
    this.stopPaddlePractice();
    this.clearAttempt();
    this.inputMode = 'paddle';
    this.ditCode = '';
    this.dahCode = '';
    this.capturedCode = '';
    this.setupSide = 'dit';
    this.openPaddleDialog();
    this.setupMessage = 'Press and release the side you want to use for dits.';
  }

  swapPaddles(): void {
    this.clearAttempt();
    [this.ditCode, this.dahCode] = [this.dahCode, this.ditCode];
  }

  constructor(
    private readonly changeDetector: ChangeDetectorRef,
    training: TrainingSessionService,
    private readonly audio: MorseAudioService,
    @Inject(KEYING_SIDETONE) private readonly sidetone: KeyingSidetonePlayer,
    @Inject(KEYING_CLOCK) private readonly clock: KeyingClock,
    @Inject(KEYING_SCHEDULER) private readonly scheduler: KeyingScheduler
  ) {
    window.addEventListener('mousedown', this.captureMouseDown, true);
    window.addEventListener('mouseup', this.captureMouseUp, true);
    window.addEventListener('click', this.captureClick, true);
    window.addEventListener('auxclick', this.captureClick, true);
    window.addEventListener('contextmenu', this.blockMenu, true);
    window.addEventListener('wheel', this.blockScroll, { capture: true, passive: false });
    window.addEventListener('touchmove', this.blockScroll, { capture: true, passive: false });
    training.reloadProfile();
    const profile = training.snapshot().profile;
    this.symbols = activeKochSymbols(profile.currentSymbolCount);
    this.targetSymbolId = this.symbols[0];
    this.characterWpm = profile.settings.characterWpm;
    this.toneFrequencyHz = profile.settings.toneFrequencyHz;
  }

  get targetPattern(): string {
    return getMorseSymbolDefinition(this.targetSymbolId).pattern;
  }

  get displayTargetPattern(): string {
    return displayPattern(this.targetPattern);
  }

  get spokenTargetPattern(): string {
    return [...this.targetPattern].map((mark) => mark === '.' ? 'dit' : 'dah').join(' ');
  }

  get sentPattern(): string {
    const ditMs = 1_200 / this.normalizedWpm();
    return this.strokes
      .map((stroke) => stroke.upAtMs - stroke.downAtMs < ditMs * 2 ? '.' : '-')
      .join('');
  }

  get displaySentPattern(): string {
    return this.sentPattern ? displayPattern(this.sentPattern) : '—';
  }

  async hearTarget(): Promise<void> {
    this.stopPaddle();
    this.releaseKey();
    this.audioError = '';
    this.status = `Playing ${this.targetSymbolId}.`;
    try {
      await this.audio.prepare();
      await this.audio.playTimeline(compileMorseTimeline(encodeMorseText(this.targetSymbolId), {
        characterWpm: this.normalizedWpm(),
        effectiveWpm: this.normalizedWpm(),
        toneFrequencyHz: this.toneFrequencyHz
      }));
      this.status = `Now send ${this.targetSymbolId} yourself.`;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.audioError = 'Sidetone audio could not start. You can still practice and receive timing feedback.';
      this.status = 'Send the displayed pattern with Space or the on-screen key.';
    }
  }

  beginKeying(event?: Event): void {
    event?.preventDefault();
    if (this.keyIsDown) return;
    this.cancelAutomaticCheck();
    if (this.result) this.clearAttempt();
    this.audio.cancel();
    this.audioError = '';
    this.keyIsDown = true;
    this.downAtMs = this.clock.now();
    this.status = 'Key down';
    void this.sidetone.start(this.toneFrequencyHz).catch(() => {
      this.audioError = 'Sidetone audio could not start. Your key timing is still being measured.';
    });
  }

  releaseKey(event?: Event): void {
    if (!this.keyIsDown || this.downAtMs === null) return;
    event?.preventDefault();
    const upAtMs = Math.max(this.clock.now(), this.downAtMs + 1);
    this.strokes = [...this.strokes, { downAtMs: this.downAtMs, upAtMs }];
    this.keyIsDown = false;
    this.downAtMs = null;
    this.sidetone.stop();
    this.status = `${this.strokes.length} mark${this.strokes.length === 1 ? '' : 's'} sent. Pause when the character is complete.`;
    this.scheduleAutomaticCheck();
  }

  checkAttempt(): void {
    if (!this.strokes.length || this.keyIsDown) return;
    this.cancelAutomaticCheck();
    this.result = analyzeKeyingAttempt(this.targetSymbolId, this.strokes, this.normalizedWpm());
    if (this.result.passed && this.paddleArmed) {
      this.status = 'Character passed. The next character will load automatically.';
      this.scheduleAutomaticAdvance();
    } else {
      this.status = this.result.passed ? 'Character passed.' : 'Send again when ready to retry automatically.';
    }
  }

  clearAttempt(): void {
    this.stopPaddle();
    this.cancelAutomaticCheck();
    this.cancelAutomaticAdvance();
    this.sidetone.stop();
    this.keyIsDown = false;
    this.downAtMs = null;
    this.strokes = [];
    this.result = null;
    this.status = 'Hold Space or the on-screen key for each mark.';
  }

  nextCharacter(): void {
    const index = this.symbols.indexOf(this.targetSymbolId);
    this.targetSymbolId = this.symbols[(index + 1) % this.symbols.length];
    this.clearAttempt();
    this.status = `Next: ${this.targetSymbolId}. Start sending when ready.`;
  }

  targetChanged(): void {
    this.clearAttempt();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (this.capturingPaddle && event.code === 'Escape') {
      event.preventDefault();
      this.stopPaddlePractice();
      return;
    }
    if (this.capturingPaddle && ['Space', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.code)) {
      event.preventDefault();
    }
    this.contactDown(event);
  }

  private contactDown(event: Pick<KeyboardEvent, 'code' | 'key' | 'repeat' | 'target' | 'preventDefault'>): void {
    if (this.setupSide) {
      event.preventDefault();
      if (!event.repeat && !this.capturedCode) {
        this.capturedCode = event.code || event.key;
        this.setupMessage = 'Signal detected. Release that paddle.';
      }
      return;
    }
    if (this.inputMode === 'paddle') {
      const code = event.code || event.key;
      if (!this.paddleArmed || !this.paddleReady || (code !== this.ditCode && code !== this.dahCode)) return;
      event.preventDefault();
      if (event.repeat) return;
      if (this.result?.passed) {
        this.nextCharacter();
        return;
      }
      if (this.result) this.clearAttempt();
      this.cancelAutomaticCheck();
      if (code === this.ditCode) this.paddle.dit = true;
      else this.paddle.dah = true;
      if (!this.paddleRunning) this.playPaddleElement();
      return;
    }
    if (event.code !== 'Space' || event.repeat || isFormControl(event.target)) return;
    event.preventDefault();
    this.beginKeying();
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent): void {
    this.contactUp(event);
  }

  private contactUp(event: Pick<KeyboardEvent, 'code' | 'key' | 'preventDefault'>): void {
    const code = event.code || event.key;
    if (this.setupSide) {
      event.preventDefault();
      if (code !== this.capturedCode) return;
      this.capturedCode = '';
      if (this.setupSide === 'dit') {
        this.ditCode = code;
        this.setupSide = 'dah';
        this.setupMessage = 'Now press and release the other side for dahs.';
      } else if (code === this.ditCode) {
        this.setupMessage = 'Both sides sent the same signal. Try the other side.';
      } else {
        this.dahCode = code;
        this.setupSide = null;
        this.setupMessage = 'Paddle ready. Hold either side to repeat; squeeze both to alternate.';
        this.startPaddlePractice();
      }
      return;
    }
    if (this.inputMode === 'paddle') {
      if (code !== this.ditCode && code !== this.dahCode) return;
      event.preventDefault();
      if (code === this.ditCode) this.paddle.dit = false;
      else this.paddle.dah = false;
      return;
    }
    if (event.code !== 'Space') return;
    event.preventDefault();
    this.releaseKey();
  }

  handleMouseDown(event: MouseEvent): void {
    if (!this.capturingPaddle || isPaddleControl(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.suppressNextClick = true;
    if (event.button !== 0 && event.button !== 2) return;
    this.contactDown({ code: mouseCode(event.button), key: '', repeat: false,
      target: event.target, preventDefault: () => event.preventDefault() });
  }

  handleMouseUp(event: MouseEvent): void {
    if (!this.capturingPaddle || isPaddleControl(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.button !== 0 && event.button !== 2) return;
    const code = mouseCode(event.button);
    if (code !== this.capturedCode && code !== this.ditCode && code !== this.dahCode) return;
    this.contactUp({ code, key: '', preventDefault: () => event.preventDefault() });
  }

  @HostListener('window:pointercancel')
  cancelPaddlePointer(): void {
    if (this.inputMode === 'paddle') this.stopPaddlePractice();
  }

  @HostListener('window:pointerup', ['$event'])
  @HostListener('window:pointercancel', ['$event'])
  handlePointerRelease(event: PointerEvent): void {
    if (this.inputMode === 'paddle') return;
    this.releaseKey(event);
  }

  @HostListener('window:blur')
  @HostListener('document:visibilitychange')
  suspendInput(): void {
    if (document.hidden || !document.hasFocus()) {
      this.stopPaddlePractice();
      this.clearAttempt();
    }
  }

  ngOnDestroy(): void {
    this.paddleDialog?.nativeElement.close();
    window.removeEventListener('mousedown', this.captureMouseDown, true);
    window.removeEventListener('mouseup', this.captureMouseUp, true);
    window.removeEventListener('click', this.captureClick, true);
    window.removeEventListener('auxclick', this.captureClick, true);
    window.removeEventListener('contextmenu', this.blockMenu, true);
    window.removeEventListener('wheel', this.blockScroll, true);
    window.removeEventListener('touchmove', this.blockScroll, true);
    this.paddleArmed = false;
    this.setupSide = null;
    this.stopPaddle();
    this.cancelAutomaticCheck();
    this.cancelAutomaticAdvance();
    this.sidetone.stop();
    this.keyIsDown = false;
    this.downAtMs = null;
    this.audio.cancel();
    void this.sidetone.dispose();
  }

  private playPaddleElement(): void {
    const element = this.paddle.next();
    if (!element) {
      this.paddleRunning = false;
      this.paddleTimer = null;
      return;
    }
    this.paddleRunning = true;
    this.beginKeying();
    const duration = (1_200 / this.normalizedWpm()) * (element === '.' ? 1 : 3);
    this.paddleTimer = this.scheduler.schedule(() => {
      this.releaseKey();
      this.paddleTimer = this.scheduler.schedule(() => this.playPaddleElement(), 1_200 / this.normalizedWpm());
    }, duration);
  }

  private openPaddleDialog(): void {
    if (this.paddleDialog.nativeElement.open) return;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.paddleDialog.nativeElement.showModal();
  }

  private stopPaddle(): void {
    if (this.paddleTimer !== null) this.scheduler.cancel(this.paddleTimer);
    this.paddleTimer = null;
    this.paddleRunning = false;
    this.paddle.reset();
  }

  private scheduleAutomaticCheck(): void {
    this.cancelAutomaticCheck();
    const characterGapMs = (1_200 / this.normalizedWpm()) * 3;
    this.autoCheckHandle = this.scheduler.schedule(() => {
      this.autoCheckHandle = null;
      this.checkAttempt();
    }, characterGapMs);
  }

  private cancelAutomaticCheck(): void {
    if (this.autoCheckHandle === null) return;
    this.scheduler.cancel(this.autoCheckHandle);
    this.autoCheckHandle = null;
  }

  private scheduleAutomaticAdvance(): void {
    this.cancelAutomaticAdvance();
    this.autoAdvanceHandle = this.scheduler.schedule(() => {
      this.autoAdvanceHandle = null;
      if (this.paddleArmed && this.result?.passed) this.nextCharacter();
    }, 1_200);
  }

  private cancelAutomaticAdvance(): void {
    if (this.autoAdvanceHandle === null) return;
    this.scheduler.cancel(this.autoAdvanceHandle);
    this.autoAdvanceHandle = null;
  }

  private normalizedWpm(): number {
    return Math.max(12, Math.min(40, Number(this.characterWpm) || 20));
  }
}

function displayPattern(pattern: string): string {
  return pattern.replaceAll('.', '·').replaceAll('-', '−');
}

function mouseCode(button: number): string {
  return button === 0 ? 'Mouse left' : 'Mouse right';
}

function isPaddleControl(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-paddle-control]'));
}

function isFormControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}
