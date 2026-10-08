import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

export interface SeoRouteData {
  readonly title: string;
  readonly description: string;
  readonly index?: boolean;
  readonly canonicalPath?: string;
}

const SITE_NAME = 'Morse Practice';
const SOCIAL_IMAGE_PATH = 'icons/morse-practice-social.png';
const SOCIAL_IMAGE_ALT = 'Morse Practice — learn, copy, and send CW';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private started = false;

  constructor(
    private readonly router: Router,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(DOCUMENT) private readonly document: Document
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe(() => this.updateForRoute(this.deepestSnapshot(this.router.routerState.snapshot.root)));
  }

  private updateForRoute(route: ActivatedRouteSnapshot): void {
    const seo = route.data['seo'] as SeoRouteData | undefined;
    if (!seo) return;

    const canonicalUrl = this.siteUrl(seo.canonicalPath ?? this.router.url.split(/[?#]/, 1)[0]);
    const imageUrl = this.siteUrl(SOCIAL_IMAGE_PATH);
    const robots = seo.index === false
      ? 'noindex, follow, noarchive'
      : 'index, follow, max-image-preview:large';

    this.title.setTitle(seo.title);
    this.setName('description', seo.description);
    this.setName('robots', robots);

    this.setProperty('og:title', seo.title);
    this.setProperty('og:description', seo.description);
    this.setProperty('og:type', 'website');
    this.setProperty('og:url', canonicalUrl);
    this.setProperty('og:site_name', SITE_NAME);
    this.setProperty('og:locale', 'en_US');
    this.setProperty('og:image', imageUrl);
    this.setProperty('og:image:type', 'image/png');
    this.setProperty('og:image:width', '1200');
    this.setProperty('og:image:height', '630');
    this.setProperty('og:image:alt', SOCIAL_IMAGE_ALT);

    this.setName('twitter:card', 'summary_large_image');
    this.setName('twitter:title', seo.title);
    this.setName('twitter:description', seo.description);
    this.setName('twitter:image', imageUrl);
    this.setName('twitter:image:alt', SOCIAL_IMAGE_ALT);

    this.setCanonical(canonicalUrl);
  }

  private deepestSnapshot(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
    let current = route;
    while (current.firstChild) current = current.firstChild;
    return current;
  }

  private siteUrl(path: string): string {
    const baseUrl = new URL(this.document.baseURI);
    const relativePath = path.replace(/^\//, '');
    return relativePath ? new URL(relativePath, baseUrl).href : baseUrl.href;
  }

  private setName(name: string, content: string): void {
    this.meta.updateTag({ name, content }, `name='${name}'`);
  }

  private setProperty(property: string, content: string): void {
    this.meta.updateTag({ property, content }, `property='${property}'`);
  }

  private setCanonical(href: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>("link[rel='canonical']");
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      this.document.head.appendChild(link);
    }
    link.href = href;
  }
}
