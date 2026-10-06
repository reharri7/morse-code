import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SessionToolsComponent } from './session-tools.component';

describe('SessionToolsComponent', () => {
  let fixture: ComponentFixture<SessionToolsComponent>;

  beforeEach(async () => {
    window.localStorage.removeItem('cw-transcriber.product.v1');
    await TestBed.configureTestingModule({ imports: [SessionToolsComponent] }).compileComponents();
    fixture = TestBed.createComponent(SessionToolsComponent);
  });

  it('shows contextual clues while keeping the raw input separate', () => {
    fixture.componentRef.setInput('rawText', 'CQ DE K6RHE K');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Calling any station');
    expect(text).toContain('Possible amateur-radio callsign');
    expect(text).toContain('Invitation to transmit');
    expect(fixture.componentInstance.rawText).toBe('CQ DE K6RHE K');
  });

  it('applies a proposal only to the edited copy and saves both versions locally', () => {
    fixture.componentRef.setInput('rawText', 'RST 5NN');
    fixture.detectChanges();
    const proposal = fixture.componentInstance.annotations.find((item) => item.replacement === '599');

    fixture.componentInstance.useSuggestion(proposal!);
    fixture.componentInstance.saveCurrent();

    expect(fixture.componentInstance.rawText).toBe('RST 5NN');
    expect(fixture.componentInstance.editedText).toBe('RST 599');
    expect(fixture.componentInstance.sessions[0].rawText).toBe('RST 5NN');
    expect(fixture.componentInstance.sessions[0].editedText).toBe('RST 599');
  });
});
