import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { APP_ROUTES } from './app.routes';

describe('AppComponent routing shell', () => {
  let fixture: ComponentFixture<AppComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(APP_ROUTES)]
    }).compileComponents();
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
  });

  it('redirects the root to the preserved transcription screen', async () => {
    await router.navigateByUrl('/');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/transcribe');
    expect(fixture.nativeElement.textContent).toContain('Start listening');
    expect(fixture.nativeElement.textContent).toContain('What the decoder heard');
  });

  it('offers first-class receive and practice navigation', async () => {
    await router.navigateByUrl('/learn');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/learn');
    expect(fixture.nativeElement.textContent).toContain('Practice Morse');
    expect(fixture.nativeElement.querySelector('nav a.active')?.textContent).toContain('Practice');
  });
});
