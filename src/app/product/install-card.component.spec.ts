import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InstallCardComponent } from './install-card.component';

describe('InstallCardComponent', () => {
  let fixture: ComponentFixture<InstallCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [InstallCardComponent] }).compileComponents();
    fixture = TestBed.createComponent(InstallCardComponent);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('explains that decoding remains available when offline', () => {
    fixture.componentInstance.isOnline = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Offline now—decoding still works');
  });

  it('exposes a browser install offer only after the browser provides one', async () => {
    const prompt = jasmine.createSpy().and.resolveTo();
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(event, {
      prompt: { value: prompt },
      userChoice: { value: Promise.resolve({ outcome: 'accepted', platform: 'web' }) }
    });

    window.dispatchEvent(event);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Install app');

    await fixture.componentInstance.installApp();
    expect(prompt).toHaveBeenCalled();
  });
});
