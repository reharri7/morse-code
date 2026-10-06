import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));

if ('serviceWorker' in navigator && isDevMode()) {
  window.addEventListener('load', () => {
    const applicationScope = new URL('.', document.baseURI).href;
    void Promise.all([
      navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
        registrations
          .filter((registration) => registration.scope === applicationScope)
          .map((registration) => registration.unregister())
      )),
      'caches' in window
        ? caches.keys().then((keys) => Promise.all(
          keys.filter((key) => key.startsWith('cw-transcriber-shell-')).map((key) => caches.delete(key))
        ))
        : Promise.resolve([])
    ]).catch((error: unknown) => console.warn('Development cache cleanup could not finish.', error));
  });
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './' })
      .catch((error: unknown) => console.warn('Offline support could not start.', error));
  });
}
