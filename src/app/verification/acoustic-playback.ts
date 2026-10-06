export interface SpeakerPlaybackEnvironment {
  readonly createAudioContext: () => AudioContext;
}

/** Explicit test-only speaker output. Live transcription never uses this adapter. */
export class SpeakerPlayback {
  private context: AudioContext | null = null;
  private readonly activeSources = new Set<AudioBufferSourceNode>();

  constructor(private readonly environment: SpeakerPlaybackEnvironment = browserPlaybackEnvironment()) {}

  static isSupported(): boolean {
    return typeof AudioContext !== 'undefined';
  }

  async prepare(): Promise<void> {
    await this.ensureContext();
  }

  async playTone(frequencyHz: number, durationMs: number, signal?: AbortSignal): Promise<void> {
    const sampleRate = 8_000;
    const samples = new Float32Array(Math.round((durationMs / 1_000) * sampleRate));
    for (let index = 0; index < samples.length; index += 1) {
      const edge = Math.min(1, index / 80, (samples.length - index - 1) / 80);
      samples[index] = 0.45 * Math.max(0, edge) * Math.sin((2 * Math.PI * frequencyHz * index) / sampleRate);
    }
    await this.playPcm(samples, sampleRate, signal);
  }

  async playPcm(samples: Float32Array, sampleRate: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw abortError();
    const context = await this.ensureContext();
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.activeSources.add(source);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: DOMException) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        source.disconnect();
        this.activeSources.delete(source);
        if (error) reject(error);
        else resolve();
      };
      const onAbort = () => {
        try { source.stop(); } catch { /* already stopped */ }
        finish(abortError());
      };
      source.onended = () => finish();
      signal?.addEventListener('abort', onAbort, { once: true });
      source.start();
    });
  }

  async stop(): Promise<void> {
    for (const source of this.activeSources) {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
    }
    this.activeSources.clear();
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.context = null;
  }

  private async ensureContext(): Promise<AudioContext> {
    this.context ??= this.environment.createAudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }
}

function browserPlaybackEnvironment(): SpeakerPlaybackEnvironment {
  if (!SpeakerPlayback.isSupported()) throw new Error('Speaker playback is unavailable in this browser.');
  return { createAudioContext: () => new AudioContext({ latencyHint: 'playback' }) };
}

function abortError(): DOMException {
  return new DOMException('Acoustic verification was cancelled.', 'AbortError');
}
