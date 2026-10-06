import { Inject, Injectable, InjectionToken } from '@angular/core';
import { MorseTimeline } from '../../core/morse/morse-timeline';

const OUTPUT_GAIN = 0.35;
const ENVELOPE_SECONDS = 0.004;
const START_DELAY_SECONDS = 0.01;

export interface MorseAudioContext {
  readonly currentTime: number;
  readonly destination: AudioNode;
  readonly state: string;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface MorseAudioEnvironment {
  readonly createAudioContext: () => MorseAudioContext;
}

export interface MorseAudioPlayer {
  prepare(): Promise<void>;
  playTimeline(timeline: MorseTimeline, signal?: AbortSignal): Promise<void>;
  cancel(): void;
  dispose(): Promise<void>;
}

export const MORSE_AUDIO_ENVIRONMENT = new InjectionToken<MorseAudioEnvironment>(
  'MorseAudioEnvironment',
  { providedIn: 'root', factory: browserMorseAudioEnvironment }
);

/** Browser-edge renderer for an already compiled Morse timeline. */
@Injectable({ providedIn: 'root' })
export class MorseAudioService implements MorseAudioPlayer {
  private context: MorseAudioContext | null = null;
  private activePlayback: { readonly cancel: () => void } | null = null;

  constructor(@Inject(MORSE_AUDIO_ENVIRONMENT) private readonly environment: MorseAudioEnvironment) {}

  static isSupported(): boolean {
    return typeof AudioContext !== 'undefined';
  }

  get isPlaying(): boolean {
    return this.activePlayback !== null;
  }

  async prepare(): Promise<void> {
    await this.ensureContext();
  }

  async playTimeline(timeline: MorseTimeline, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw cancelledError();
    if (!timeline.segments.length || timeline.durationMs <= 0) {
      throw new Error('Morse practice audio has no playable timeline.');
    }
    this.cancel();
    const context = await this.ensureContext();
    if (signal?.aborted) throw cancelledError();

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    const startAt = context.currentTime + START_DELAY_SECONDS;
    let cursor = startAt;
    oscillator.frequency.setValueAtTime(timeline.timing.profile.toneFrequencyHz, startAt);
    gain.gain.cancelScheduledValues(startAt);
    gain.gain.setValueAtTime(0, startAt);

    for (const segment of timeline.segments) {
      const endAt = cursor + (segment.durationMs / 1_000);
      if (segment.kind === 'tone') {
        const envelope = Math.min(ENVELOPE_SECONDS, (segment.durationMs / 1_000) / 4);
        gain.gain.setValueAtTime(0, cursor);
        gain.gain.linearRampToValueAtTime(OUTPUT_GAIN, cursor + envelope);
        gain.gain.setValueAtTime(OUTPUT_GAIN, Math.max(cursor + envelope, endAt - envelope));
        gain.gain.linearRampToValueAtTime(0, endAt);
      } else {
        gain.gain.setValueAtTime(0, cursor);
        gain.gain.setValueAtTime(0, endAt);
      }
      cursor = endAt;
    }

    oscillator.connect(gain);
    gain.connect(context.destination);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: DOMException | Error) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        oscillator.onended = null;
        oscillator.disconnect();
        gain.disconnect();
        if (this.activePlayback?.cancel === cancel) this.activePlayback = null;
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => {
        finish(cancelledError());
        try { oscillator.stop(); } catch { /* already stopped */ }
      };
      const onAbort = () => cancel();
      oscillator.onended = () => finish();
      signal?.addEventListener('abort', onAbort, { once: true });
      this.activePlayback = { cancel };
      try {
        oscillator.start(startAt);
        oscillator.stop(cursor);
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Morse practice audio could not be scheduled.'));
      }
    });
  }

  cancel(): void {
    this.activePlayback?.cancel();
  }

  async dispose(): Promise<void> {
    this.cancel();
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

function browserMorseAudioEnvironment(): MorseAudioEnvironment {
  return {
    createAudioContext: () => {
      if (!MorseAudioService.isSupported()) {
        throw new Error('Practice audio is unavailable in this browser.');
      }
      return new AudioContext({ latencyHint: 'interactive' });
    }
  };
}

function cancelledError(): DOMException {
  return new DOMException('Morse practice audio was cancelled.', 'AbortError');
}
