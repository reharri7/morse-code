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

  it('publishes route-specific search and social metadata', async () => {
    await router.navigateByUrl('/learn');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.title).toBe('Learn Morse Code — Morse Practice');
    expect(metaName('description')).toContain('adaptive listening drills');
    expect(metaName('robots')).toBe('index, follow, max-image-preview:large');
    expect(metaProperty('og:title')).toBe('Learn Morse Code — Morse Practice');
    expect(metaProperty('og:type')).toBe('website');
    expect(metaProperty('og:image')).toMatch(/\/icons\/morse-practice-social\.png$/);
    expect(metaProperty('og:image:width')).toBe('1200');
    expect(metaName('twitter:card')).toBe('summary_large_image');
    expect(document.head.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href).toMatch(/\/learn$/);

    await router.navigateByUrl('/learn/results?from=session');
    await fixture.whenStable();

    expect(document.title).toBe('Morse Practice Results — Morse Practice');
    expect(metaName('robots')).toBe('noindex, follow, noarchive');
    expect(metaProperty('og:url')).toMatch(/\/learn\/results$/);
    expect(document.head.querySelectorAll("link[rel='canonical']").length).toBe(1);
  });
});

function metaName(name: string): string | null {
  return document.head.querySelector<HTMLMetaElement>(`meta[name='${name}']`)?.content ?? null;
}

function metaProperty(property: string): string | null {
  return document.head.querySelector<HTMLMetaElement>(`meta[property='${property}']`)?.content ?? null;
}
