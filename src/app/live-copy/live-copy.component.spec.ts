import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LiveCopyComponent } from './live-copy.component';

describe('LiveCopyComponent', () => {
  let fixture: ComponentFixture<LiveCopyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LiveCopyComponent] }).compileComponents();
    fixture = TestBed.createComponent(LiveCopyComponent);
    fixture.componentRef.setInput('rawText', 'CQ DE K?ABC');
    fixture.componentRef.setInput('characters', [{ character: '?', morse: '..--', confidence: 0.25, reasons: ['ambiguous'] }]);
    fixture.componentRef.setInput('timingConfidence', 0.4);
    fixture.detectChanges();
  });

  it('emits focus state and reveals receiver evidence only after the attempt', () => {
    const states: boolean[] = [];
    fixture.componentInstance.activeChange.subscribe((value) => states.push(value));
    fixture.componentInstance.start();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('CQ DE K?ABC');
    fixture.componentInstance.userCopy = 'CQ DE K1ABC';
    fixture.componentInstance.finish();
    fixture.detectChanges();
    expect(states).toEqual([true, false]);
    expect(fixture.nativeElement.textContent).toContain('Immutable raw decoder text');
    expect(fixture.nativeElement.textContent).toContain('CQ DE K?ABC');
    expect(fixture.nativeElement.textContent).toContain('informational only');
  });

  it('scores only against an optional trusted reference', () => {
    fixture.componentInstance.start();
    fixture.componentInstance.userCopy = 'CQ DE K1ABC';
    fixture.componentInstance.referenceText = 'CQ DE K1ABC';
    fixture.componentInstance.finish();
    expect(fixture.componentInstance.comparison?.basis).toBe('reference');
    expect(fixture.componentInstance.comparison?.referenceScore?.correct).toBeTrue();
  });
});
