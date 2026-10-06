import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { AppComponent } from '../../app.component';
import { APP_ROUTES } from '../../app.routes';
import {
  LEARNING_PROGRESS_REPOSITORY,
  TRAINING_AUDIO_PLAYER,
  TrainingSessionService
} from '../application/training-session.service';
import { LearningProgressStore, LearningStorageLike } from '../infrastructure/learning-progress.store';
import { MorseAudioPlayer, MorseAudioService } from '../infrastructure/morse-audio.service';
import { KEYING_SIDETONE, KeyingSidetonePlayer } from '../infrastructure/keying-sidetone.service';
import {
  KEYING_CLOCK,
  KEYING_SCHEDULER,
  KeyingPracticePageComponent,
  KeyingScheduler
} from './keying-practice/keying-practice-page.component';

class ImmediateAudioPlayer implements MorseAudioPlayer {
  playCount = 0;
  cancelCount = 0;
  async prepare(): Promise<void> {}
  async playTimeline(): Promise<void> { this.playCount += 1; }
  cancel(): void { this.cancelCount += 1; }
  async dispose(): Promise<void> {}
}

class MemoryStorage implements LearningStorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

class SilentKeyingSidetone implements KeyingSidetonePlayer {
  startCount = 0;
  stopCount = 0;
  async start(): Promise<void> { this.startCount += 1; }
  stop(): void { this.stopCount += 1; }
  async dispose(): Promise<void> {}
}

class ManualKeyingScheduler implements KeyingScheduler {
  lastDelayMs = 0;
  private readonly pending: Array<{ callback: () => void; cancelled: boolean }> = [];

  schedule(callback: () => void, delayMs: number): unknown {
    const task = { callback, cancelled: false };
    this.lastDelayMs = delayMs;
    this.pending.push(task);
    return task;
  }

  cancel(handle: unknown): void {
    (handle as { cancelled: boolean }).cancelled = true;
  }

  flush(): void {
    for (const task of this.pending.splice(0)) {
      if (!task.cancelled) task.callback();
    }
  }
}

describe('M9D learning routes', () => {
  let fixture: ComponentFixture<AppComponent>;
  let router: Router;
  let training: TrainingSessionService;
  let audio: ImmediateAudioPlayer;
  let keyingNow: number;
  let keyingScheduler: ManualKeyingScheduler;

  beforeEach(async () => {
    audio = new ImmediateAudioPlayer();
    keyingNow = 0;
    keyingScheduler = new ManualKeyingScheduler();
    const progress = new LearningProgressStore(new MemoryStorage(), () => '2026-09-25T12:00:00.000Z');
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter(APP_ROUTES),
        { provide: MorseAudioService, useValue: audio },
        { provide: TRAINING_AUDIO_PLAYER, useValue: audio },
        { provide: KEYING_SIDETONE, useValue: new SilentKeyingSidetone() },
        { provide: KEYING_CLOCK, useValue: { now: () => keyingNow } },
        { provide: KEYING_SCHEDULER, useValue: keyingScheduler },
        { provide: LEARNING_PROGRESS_REPOSITORY, useValue: progress }
      ]
    }).compileComponents();
    router = TestBed.inject(Router);
    training = TestBed.inject(TrainingSessionService);
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
  });

  it('offers setup, introduction audio, and separate character/effective speeds', async () => {
    await navigate('/learn/setup');
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Sound check and introduction');
    expect(text).toContain('Hear K');
    expect(text).toContain('Hear M');
    expect(fixture.nativeElement.querySelector('#character-wpm').value).toBe('20');
    expect(fixture.nativeElement.querySelector('#effective-wpm').value).toBe('10');
    expect(text).toContain('never turns on your microphone');
  });

  it('keeps every practice mode visible in one compact menu', async () => {
    await navigate('/learn');
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Random groups');
    expect(text).toContain('Words');
    expect(text).toContain('Callsigns');
    expect(text).toContain('Contest copy');
    expect(text).toContain('Simulated QSO');
    expect(text).toContain('Free copy');
    expect(text).toContain('Sending');
    expect(text).not.toContain('Practice stays on this device');
  });

  it('starts the recommended character drill from the home page in one action', async () => {
    await navigate('/learn');
    fixture.debugElement.queryAll(By.css('button'))
      .find((button) => button.nativeElement.textContent.includes('Start character practice'))
      ?.triggerEventHandler('click');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/learn/session');
    expect(training.snapshot().state).toBe('awaiting-answer');
    expect(fixture.nativeElement.textContent).toContain('What character did you hear?');
  });

  it('starts a selected copy mode directly from the practice menu', async () => {
    await navigate('/learn');
    fixture.debugElement.queryAll(By.css('.practice-option'))
      .find((option) => option.nativeElement.textContent.includes('Random groups'))
      ?.triggerEventHandler('click');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/learn/copy?mode=groups&start=1');
    expect(fixture.nativeElement.textContent).toContain('Type what you heard');
    expect(fixture.nativeElement.textContent).not.toContain('Ready for 10 groups');
  });

  it('restarts a completed character session without returning to setup', async () => {
    await training.startSession({ seed: 'restart-flow', settings: { characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600, sessionLength: 20 } });
    for (let trial = 0; trial < 20; trial += 1) {
      training.submitAnswer(training.snapshot().currentTrial?.expectedSymbolId ?? '');
      await training.next();
    }
    await navigate('/learn/results');

    fixture.debugElement.queryAll(By.css('button'))
      .find((button) => button.nativeElement.textContent.includes('Practice again'))
      ?.triggerEventHandler('click');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/learn/session');
    expect(training.snapshot().state).toBe('awaiting-answer');
    expect(training.snapshot().attempts.length).toBe(0);
  });

  it('automatically checks a straight-key character after the character gap', async () => {
    await navigate('/learn/keying');
    expect(fixture.nativeElement.textContent).toContain('Learn to key CW');
    expect(fixture.nativeElement.querySelector('#keying-character').value).toBe('K');

    keyStroke(0, 180);
    keyStroke(240, 300);
    keyStroke(360, 540);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('−·−');
    expect(fixture.nativeElement.querySelector('.feedback-panel')).toBeNull();
    expect(keyingScheduler.lastDelayMs).toBe(180);

    keyingScheduler.flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Clean copy');
    expect(fixture.nativeElement.textContent).toContain('100%');
    expect(fixture.nativeElement.textContent).toContain('Reads as');
  });

  it('learns distinct paddle contacts on release and finishes a released dit', async () => {
    await navigate('/learn/keying');
    const input: HTMLSelectElement = fixture.nativeElement.querySelector('#keying-input');
    input.value = 'paddle';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    fixture.debugElement.queryAll(By.css('button'))
      .find((button) => button.nativeElement.textContent.includes('Set up paddle'))?.triggerEventHandler('click');
    keyStrokeFor('ControlLeft');
    keyStrokeFor('ControlRight');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Paddle ready');
    expect(fixture.nativeElement.textContent).toContain('ControlLeft');
    fixture.debugElement.queryAll(By.css('button'))
      .find((button) => button.nativeElement.textContent.includes('Start paddle practice'))?.triggerEventHandler('click');
    keyingNow = 0;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlLeft' }));
    keyingNow = 60;
    keyingScheduler.flush();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sent-readout strong').textContent).toBe('·');
    await navigate('/learn');
    keyingScheduler.flush();
  });

  it('automatically advances a passed paddle character after brief feedback', async () => {
    await navigate('/learn/keying');
    const page = fixture.debugElement.query(By.directive(KeyingPracticePageComponent))
      .componentInstance as KeyingPracticePageComponent;
    page.inputMode = 'paddle';
    page.ditCode = 'ControlLeft';
    page.dahCode = 'ControlRight';
    page.paddleArmed = true;
    page.strokes = [
      { downAtMs: 0, upAtMs: 180 },
      { downAtMs: 240, upAtMs: 300 },
      { downAtMs: 360, upAtMs: 540 }
    ];

    page.checkAttempt();
    fixture.detectChanges();

    expect(page.result?.passed).toBeTrue();
    expect(page.targetSymbolId).toBe('K');
    expect(page.status).toContain('automatically');
    expect(keyingScheduler.lastDelayMs).toBe(1_200);

    keyingScheduler.flush();
    fixture.detectChanges();

    expect(page.targetSymbolId).toBe('M');
    expect(page.result).toBeNull();
    expect(page.status).toContain('Next: M');
  });

  it('captures mouse paddles page-wide only during setup or armed practice and restores controls with Escape', async () => {
    await navigate('/learn/keying');
    const input: HTMLSelectElement = fixture.nativeElement.querySelector('#keying-input');
    input.value = 'paddle';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    fixture.debugElement.queryAll(By.css('button'))
      .find((button) => button.nativeElement.textContent.includes('Set up paddle'))?.triggerEventHandler('click');
    const contact = (button: number) => {
      window.dispatchEvent(new MouseEvent('mousedown', { button, bubbles: true, cancelable: true }));
      window.dispatchEvent(new MouseEvent('mouseup', { button, cancelable: true }));
      window.dispatchEvent(new MouseEvent(button === 2 ? 'auxclick' : 'click', { button, cancelable: true }));
    };
    contact(0);
    contact(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('same signal');
    contact(2);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Dit: Mouse left · Dah: Mouse right');
    expect(fixture.nativeElement.querySelector('dialog').open).toBeTrue();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog').open).toBeFalse();
    contact(2);
    expect(fixture.nativeElement.querySelector('.sent-readout strong').textContent).toBe('—');
    fixture.debugElement.queryAll(By.css('button'))
      .find((button) => button.nativeElement.textContent.includes('Start paddle practice'))?.triggerEventHandler('click');
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    window.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBeTrue();
    const wheel = new WheelEvent('wheel', { cancelable: true, deltaY: 100 });
    window.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBeTrue();
    const arrow = new KeyboardEvent('keydown', { code: 'ArrowDown', cancelable: true });
    window.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBeTrue();
    keyingNow = 0;
    contact(2);
    keyingNow = 180;
    keyingScheduler.flush();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sent-readout strong').textContent).toBe('−');
    keyingScheduler.flush();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Different character');
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    expect(dialog.textContent).toContain('attempt resets automatically');
    contact(0);
    fixture.detectChanges();
    expect(dialog.open).toBeTrue();
    expect(dialog.querySelector('.keying-target')?.textContent).toContain('K');
    expect(dialog.querySelector('.feedback-panel')).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    const normalWheel = new WheelEvent('wheel', { cancelable: true, deltaY: 100 });
    window.dispatchEvent(normalWheel);
    expect(normalWheel.defaultPrevented).toBeFalse();
    const normalMenu = new MouseEvent('contextmenu', { cancelable: true });
    window.dispatchEvent(normalMenu);
    expect(normalMenu.defaultPrevented).toBeFalse();
    await navigate('/learn');
    keyingScheduler.flush();
  });

  function keyStrokeFor(code: string): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  }

  it('cancels page-wide setup with Escape and removes capture listeners on navigation', async () => {
    await navigate('/learn/keying');
    const input: HTMLSelectElement = fixture.nativeElement.querySelector('#keying-input');
    input.value = 'paddle';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    fixture.debugElement.queryAll(By.css('button'))
      .find((button) => button.nativeElement.textContent.includes('Set up paddle'))?.triggerEventHandler('click');
    const setupWheel = new WheelEvent('wheel', { cancelable: true });
    window.dispatchEvent(setupWheel);
    expect(setupWheel.defaultPrevented).toBeTrue();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    const normalClick = new MouseEvent('click', { cancelable: true });
    window.dispatchEvent(normalClick);
    expect(normalClick.defaultPrevented).toBeFalse();
    fixture.detectChanges();
    fixture.debugElement.queryAll(By.css('button'))
      .find((button) => button.nativeElement.textContent.includes('Set up paddle'))?.triggerEventHandler('click');
    await navigate('/learn');
    const wheel = new WheelEvent('wheel', { cancelable: true });
    window.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBeFalse();
    keyingScheduler.flush();
  });

  it('runs an audio-first trial without revealing its answer before feedback', async () => {
    await navigate('/learn/setup');
    const start = fixture.debugElement.queryAll(By.css('button'))
      .find((button) => button.nativeElement.textContent.includes('Start practice'));
    start?.triggerEventHandler('click');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/learn/session');
    expect(training.snapshot().state).toBe('awaiting-answer');
    expect(fixture.nativeElement.querySelector('.feedback-panel')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('What character did you hear?');

    const expected = training.snapshot().currentTrial?.expectedSymbolId ?? '';
    expect(training.submitAnswer(expected)).toBeTrue();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Correct');
    expect(fixture.nativeElement.textContent).toContain('You heard:');
    expect(fixture.nativeElement.querySelector('.feedback-symbol strong').textContent).toBe(expected);
  });

  it('shows persisted per-character evidence on the progress route', async () => {
    await training.startSession({ seed: 'ui-progress', settings: { characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600, sessionLength: 20 } });
    const expected = training.snapshot().currentTrial?.expectedSymbolId ?? '';
    training.submitAnswer(expected);
    await navigate('/learn/progress');

    const row = [...fixture.nativeElement.querySelectorAll('tbody tr')]
      .find((item: HTMLElement) => item.textContent?.trim().startsWith(expected));
    expect(row?.textContent).toContain('100%');
    expect(row?.textContent).toContain('1');
  });

  it('accepts a direct keyboard answer when focus is outside a control', async () => {
    await training.startSession({ seed: 'keyboard', settings: { characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600, sessionLength: 20 } });
    await navigate('/learn/session');
    const expected = training.snapshot().currentTrial?.expectedSymbolId ?? '';

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: expected.toLowerCase(), bubbles: true }));
    fixture.detectChanges();

    expect(training.snapshot().state).toBe('showing-feedback');
    expect(training.snapshot().feedback?.correct).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Correct');
  });

  it('runs the focused answer and feedback loop without mouse input', async () => {
    await training.startSession({ seed: 'keyboard-loop', settings: { characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600, sessionLength: 20 } });
    await navigate('/learn/session');
    const expected = training.snapshot().currentTrial?.expectedSymbolId ?? '';
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#practice-answer');

    input.value = expected.toLowerCase();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(training.snapshot().state).toBe('showing-feedback');
    expect(training.snapshot().feedback?.correct).toBeTrue();

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(training.snapshot().state).toBe('awaiting-answer');
    expect(training.snapshot().trialNumber).toBe(2);
    expect(audio.playCount).toBe(2);
  });

  it('pauses active playback state when the session route is left', async () => {
    await training.startSession({ seed: 'route-exit', settings: { characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600, sessionLength: 20 } });
    await navigate('/learn/session');
    await navigate('/learn');

    expect(training.snapshot().state).toBe('paused');
    expect(audio.cancelCount).toBeGreaterThan(0);
  });

  it('offers a scored random-group route without revealing content before playback', async () => {
    await navigate('/learn/copy?mode=groups');
    expect(fixture.nativeElement.textContent).toContain('Ready for 10 groups');
    const start = fixture.debugElement.queryAll(By.css('button'))
      .find((button) => button.nativeElement.textContent.includes('Start group practice'));
    start?.triggerEventHandler('click');
    await waitForElement('#copy-answer');

    expect(fixture.nativeElement.textContent).toContain('Type what you heard');
    expect(fixture.nativeElement.querySelector('.feedback-panel')).toBeNull();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#copy-answer');
    input.value = 'KMKMK';
    input.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Expected');
    expect(fixture.nativeElement.textContent).toContain('Copy feedback');
    expect(fixture.nativeElement.querySelector('.feedback-panel')).not.toBeNull();
  });

  it('labels radio-format practice as local simulation before it starts', async () => {
    await navigate('/learn/radio?mode=qso');
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Follow a CW QSO');
    expect(text).toContain('Generated radio-format exercises');
    expect(text).toContain('not real stations or contacts');
    expect(text).toContain('<BT>');
    expect(text).toContain('<AR>');
    expect(text).not.toContain('Post-turn truth');
  });

  it('offers generated free copy and consent-gated local recordings', async () => {
    await navigate('/learn/free-copy');
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Free copy');
    expect(text).toContain('Type continuously while a longer passage plays');
    expect(text).toContain('licensed, public-domain, or consented');
    expect(fixture.nativeElement.querySelector('#practice-recording').disabled).toBeTrue();
  });

  async function navigate(url: string): Promise<void> {
    await router.navigateByUrl(url);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function waitForElement(selector: string): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await fixture.whenStable();
      fixture.detectChanges();
      if (fixture.nativeElement.querySelector(selector)) return;
      await Promise.resolve();
    }
  }

  function keyStroke(downAt: number, upAt: number): void {
    keyingNow = downAt;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    keyingNow = upAt;
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true }));
  }
});
