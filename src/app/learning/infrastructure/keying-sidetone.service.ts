import { Inject, Injectable, InjectionToken, inject } from '@angular/core';
import { MORSE_AUDIO_ENVIRONMENT, MorseAudioContext, MorseAudioEnvironment } from './morse-audio.service';

const OUTPUT_GAIN = 0.3;
const ENVELOPE_SECONDS = 0.004;

export interface KeyingSidetonePlayer {
  start(frequencyHz: number): Promise<void>;
  stop(): void;
  dispose(): Promise<void>;
}

export const KEYING_SIDETONE = new InjectionToken<KeyingSidetonePlayer>(
  'KeyingSidetone',
  { providedIn: 'root', factory: () => inject(KeyingSidetoneService) }
);

/** Browser-edge, press-and-hold sidetone. Key timing remains owned by the caller. */
@Injectable({ providedIn: 'root' })
export class KeyingSidetoneService implements KeyingSidetonePlayer {
  private context: MorseAudioContext | null = null;
  private active: { readonly oscillator: OscillatorNode; readonly gain: GainNode } | null = null;
  private requested = false;

  constructor(@Inject(MORSE_AUDIO_ENVIRONMENT) private readonly environment: MorseAudioEnvironment) {}

  async start(frequencyHz: number): Promise<void> {
    if (!Number.isFinite(frequencyHz) || frequencyHz < 300 || frequencyHz > 1_000) {
      throw new Error('Keying sidetone must be between 300 and 1,000 Hz.');
    }
    if (this.requested) return;
    this.requested = true;
    const context = await this.ensureContext();
    if (!this.requested || this.active) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequencyHz, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(OUTPUT_GAIN, now + ENVELOPE_SECONDS);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      if (this.active?.oscillator === oscillator) this.active = null;
    };
    this.active = { oscillator, gain };
    oscillator.start(now);
  }

  stop(): void {
    this.requested = false;
    const active = this.active;
    if (!active || !this.context) return;
    this.active = null;
    const stopAt = this.context.currentTime + ENVELOPE_SECONDS;
    active.gain.gain.cancelScheduledValues(this.context.currentTime);
    active.gain.gain.setValueAtTime(OUTPUT_GAIN, this.context.currentTime);
    active.gain.gain.linearRampToValueAtTime(0, stopAt);
    try { active.oscillator.stop(stopAt); } catch { /* already stopped */ }
  }

  async dispose(): Promise<void> {
    this.stop();
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') await context.close();
  }

  private async ensureContext(): Promise<MorseAudioContext> {
    if (this.context?.state === 'closed') this.context = null;
    this.context ??= this.environment.createAudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }
}
