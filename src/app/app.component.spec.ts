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

  it('redirects the root to the learning home', async () => {
    await router.navigateByUrl('/');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/learn');
    expect(fixture.nativeElement.textContent).toContain('Character practice');
    expect(fixture.nativeElement.textContent).toContain('Practice modes');

    await router.navigateByUrl('/missing-route');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe('/learn');
  });

  it('presents learning first and keeps receive available', async () => {
    await router.navigateByUrl('/learn');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/learn');
    expect(fixture.nativeElement.querySelector('.app-mark')?.textContent).toContain('Morse Practice');
    expect(fixture.nativeElement.textContent).toContain('Character practice');
    expect(fixture.nativeElement.querySelector('nav a:first-child')?.textContent).toContain('Learn');
    expect(fixture.nativeElement.querySelector('nav a.active')?.textContent).toContain('Learn');
    expect(fixture.nativeElement.querySelector('nav a:last-child')?.textContent).toContain('Receive');
  });
});
