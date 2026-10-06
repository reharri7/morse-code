import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VerificationComponent } from './verification.component';

describe('VerificationComponent', () => {
  let fixture: ComponentFixture<VerificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [VerificationComponent] }).compileComponents();
    fixture = TestBed.createComponent(VerificationComponent);
    fixture.detectChanges();
  });

  it('explains all software verification layers and their limits in plain language', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Verify the app');
    expect(text).toContain('Quick self-test');
    expect(text).toContain('Test an audio file');
    expect(text).toContain('Download the test clip');
    expect(text).toContain('Test microphone and speakers');
    expect(text).toContain('disconnected headphones');
    expect(text).toContain('without using the microphone');
    expect(text).toContain('Nothing is uploaded');
  });

  it('prevents a second microphone session while live listening is active', () => {
    fixture.componentInstance.liveCaptureActive = true;
    fixture.componentInstance.acousticConfirmed = true;
    fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('button')]
      .find((item: HTMLButtonElement) => item.textContent?.includes('Start guided test')) as HTMLButtonElement;
    expect(button.disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Only one microphone session can run at a time');
  });

  it('shows a stage-by-stage exact raw result after the quick self-test', async () => {
    await fixture.componentInstance.runQuickTest();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Verification passed');
    expect(text).toContain('Audio was heard');
    expect(text).toContain('Tone found');
    expect(text).toContain('Raw text matched exactly');
    expect(text).toContain('CQ CQ DE K6RHE');
  });
});
