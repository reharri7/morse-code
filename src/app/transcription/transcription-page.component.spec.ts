import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranscriptionPageComponent } from './transcription-page.component';

describe('TranscriptionPageComponent', () => {
  let fixture: ComponentFixture<TranscriptionPageComponent>;

  beforeEach(async () => {
    window.localStorage.removeItem('cw-transcriber.product.v1');
    await TestBed.configureTestingModule({ imports: [TranscriptionPageComponent] }).compileComponents();
    fixture = TestBed.createComponent(TranscriptionPageComponent);
    fixture.detectChanges();
  });

  it('presents the primary listening workflow in plain language', () => {
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Ready to listen');
    expect(text).toContain('Start listening');
    expect(text).toContain('Live transcription');
    expect(text).toContain('What the decoder heard');
    expect(text).toContain('Recent characters');
    expect(text).toContain('Tones and spaces');
    expect(text).toContain('Signal troubleshooting');
    expect(text).toContain('Install this app');
    expect(text).toContain('Copy the live signal yourself');
    expect(text).toContain('CQ CQ DE K6RHE');
    expect(text).not.toContain('Timing guide');
  });

  it('keeps the live workflow first and secondary tools compact by default', () => {
    const transcript = fixture.nativeElement.querySelector('.transcript') as HTMLElement;
    const tools = fixture.nativeElement.querySelector('.operator-tools') as HTMLElement;
    const disclosures = [...fixture.nativeElement.querySelectorAll('.operator-tool')] as HTMLDetailsElement[];
    const characterDetails = fixture.nativeElement.querySelector('.character-details') as HTMLDetailsElement;

    expect(transcript.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(disclosures.length).toBe(5);
    expect(disclosures.every((detail) => !detail.open)).toBeTrue();
    expect(characterDetails.open).toBeFalse();
    expect(fixture.nativeElement.textContent).not.toContain('Automatic mode follows the clearest');
  });

  it('hides decoder answers and timing evidence during live copy', () => {
    const component = fixture.componentInstance;
    component.snapshot = { ...component.snapshot, rawText: 'CQ DE K1ABC' };
    component.setLiveCopyActive(true);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Decoder evidence is hidden');
    expect(text).not.toContain('CQ DE K1ABC');
    expect(text).not.toContain('Tones and spaces');
    expect(text).not.toContain('Radio context');
  });

  it('restores locally saved operator settings in a new app instance', () => {
    const component = fixture.componentInstance;
    component.selectedDeviceId = 'radio-input';
    component.lockMode = 'manual';
    component.scanMinFrequencyHz = 400;
    component.scanMaxFrequencyHz = 900;
    component.manualFrequencyHz = 650;
    component.saveSettings();
    fixture.destroy();

    fixture = TestBed.createComponent(TranscriptionPageComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedDeviceId).toBe('radio-input');
    expect(fixture.componentInstance.lockMode).toBe('manual');
    expect(fixture.componentInstance.manualFrequencyHz).toBe(650);
  });

  it('makes signal loss and automatic recovery visible without developer tools', () => {
    const component = fixture.componentInstance;
    component.captureState = 'listening';
    component.snapshot = {
      ...component.snapshot,
      acquisition: {
        ...component.snapshot.acquisition,
        state: 'lost',
        lockedFrequencyHz: null,
        transitionReason: 'No usable tone remained in the tracking range.'
      }
    };
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Signal lost');
    expect(text).toContain('Automatic mode will keep looking');
    expect(text).toContain('The app is searching again');
    expect(text).toContain('Lost');
  });

  it('points out competing tones and offers explicit tone choices', () => {
    const component = fixture.componentInstance;
    const candidate = (frequencyHz: number, snrDb: number, score: number) => ({
      frequencyHz, snrDb, score,
      power: 0.03, noisePower: 0.001, narrowness: 3, persistence: 0.9, dutyCycle: 0.5
    });
    component.captureState = 'listening';
    component.snapshot = {
      ...component.snapshot,
      acquisition: {
        ...component.snapshot.acquisition,
        state: 'locked',
        lockedFrequencyHz: 640,
        lockQuality: 0.83,
        snrDb: 18,
        candidates: [candidate(640, 18, 0.92), candidate(700, 12, 0.76)]
      }
    };
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('More than one tone is present');
    expect(text).toContain('Choose one if the text looks wrong');
    expect(text).toContain('640 Hz');
    expect(text).toContain('700 Hz');
    expect(fixture.nativeElement.querySelectorAll('.candidates button').length).toBe(2);
  });

  it('keeps an uncertain raw character and its timing evidence inspectable', () => {
    const component = fixture.componentInstance;
    component.captureState = 'listening';
    component.snapshot = {
      ...component.snapshot,
      rawText: '?',
      decodeConfidence: 0.31,
      recentEvents: [
        { kind: 'dit', durationMs: 63, confidence: 0.91 },
        { kind: 'dah', durationMs: 151, confidence: 0.42 },
        { kind: 'character-gap', durationMs: 174, confidence: 0.38 }
      ],
      characters: [{
        character: '?',
        morse: '.-',
        confidence: 0.31,
        reasons: ['ambiguous timing']
      }],
      timing: {
        ...component.snapshot.timing,
        state: 'tracking',
        elementDitDurationMs: 60,
        confidence: 0.38
      }
    };
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Raw transcript');
    expect(text).toContain('Character evidence');
    expect(text).toContain('·−');
    expect(text).toContain('not a known Morse character');
    expect(text).toContain('Uncertain');
    expect(fixture.nativeElement.querySelectorAll('.timeline-track > span').length).toBe(3);
  });

  it('shows radio-context clues beside, never in place of, the raw transcript', () => {
    const component = fixture.componentInstance;
    component.snapshot = {
      ...component.snapshot,
      rawText: 'CQ DE K6RHE K'
    };
    fixture.detectChanges();

    const rawOutput = fixture.nativeElement.querySelector('.transcript output');
    expect(rawOutput.textContent).toBe('CQ DE K6RHE K');
    expect(fixture.nativeElement.textContent).toContain('Radio context');
    expect(fixture.nativeElement.textContent).toContain('Possible amateur-radio callsign');
    expect(fixture.nativeElement.textContent).toContain('<K>');
  });
});
