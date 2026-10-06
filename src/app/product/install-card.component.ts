import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';

@Component({
  selector: 'app-install-card',
  imports: [CommonModule],
  templateUrl: './install-card.component.html',
  styleUrl: './install-card.component.css'
})
export class InstallCardComponent implements OnInit, OnDestroy {
  isOnline = navigator.onLine;
  offlineReady = false;
  installAvailable = false;
  isInstalled = window.matchMedia('(display-mode: standalone)').matches;

  private installPrompt: InstallPromptEvent | null = null;
  private readonly onlineHandler = (): void => { this.zone.run(() => this.isOnline = true); };
  private readonly offlineHandler = (): void => { this.zone.run(() => this.isOnline = false); };
  private readonly installHandler = (event: Event): void => {
    event.preventDefault();
    this.zone.run(() => {
      this.installPrompt = event as InstallPromptEvent;
      this.installAvailable = true;
    });
  };
  private readonly installedHandler = (): void => {
    this.zone.run(() => {
      this.isInstalled = true;
      this.installAvailable = false;
      this.installPrompt = null;
    });
  };

  constructor(private readonly zone: NgZone) {
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
    window.addEventListener('beforeinstallprompt', this.installHandler);
    window.addEventListener('appinstalled', this.installedHandler);
  }

  ngOnInit(): void {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready.then(() => this.zone.run(() => this.offlineReady = true));
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
    window.removeEventListener('beforeinstallprompt', this.installHandler);
    window.removeEventListener('appinstalled', this.installedHandler);
  }

  async installApp(): Promise<void> {
    if (!this.installPrompt) return;
    await this.installPrompt.prompt();
    const choice = await this.installPrompt.userChoice;
    if (choice.outcome === 'accepted') this.installAvailable = false;
    this.installPrompt = null;
  }

  get offlineStatus(): string {
    if (!this.isOnline) return 'Offline now—decoding still works';
    if (this.offlineReady) return 'Ready for offline use';
    return 'Preparing offline use';
  }

  get installGuidance(): string {
    if (this.isInstalled) return 'This app is installed and can open like any other app.';
    if (this.installAvailable) return 'Install it for a dedicated window and offline access.';
    return 'Use your browser’s Install or Add to Home Screen command when it appears.';
  }
}

interface InstallPromptEvent extends Event {
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed'; readonly platform: string }>;
  prompt(): Promise<void>;
}
