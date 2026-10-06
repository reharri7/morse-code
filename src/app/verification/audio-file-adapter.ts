import { decodeWav } from './wav-codec';

export const MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 5 * 60;

export interface DecodedAudioFile {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly durationSeconds: number;
  readonly sourceName: string;
}

interface BrowserAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
}

interface BrowserAudioContext {
  decodeAudioData(data: ArrayBuffer): Promise<BrowserAudioBuffer>;
  close(): Promise<void>;
}

export interface AudioFileAdapterDependencies {
  readonly createAudioContext?: () => BrowserAudioContext;
}

export class AudioFileAdapter {
  constructor(private readonly dependencies: AudioFileAdapterDependencies = {}) {}

  async decode(file: File, signal?: AbortSignal): Promise<DecodedAudioFile> {
    if (file.size > MAX_AUDIO_FILE_BYTES) throw new Error('Choose an audio file no larger than 25 MB.');
    if (!file.size) throw new Error('The selected audio file is empty.');
    if (signal?.aborted) throw abortError();
    const data = await file.arrayBuffer();
    if (signal?.aborted) throw abortError();
    let decoded: { samples: Float32Array; sampleRate: number; durationSeconds: number };
    if (isWav(file, data)) {
      decoded = decodeWav(data);
    } else {
      decoded = await this.decodeWithBrowser(data, signal);
    }
    if (decoded.durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
      throw new Error('Choose a recording no longer than five minutes.');
    }
    if (!decoded.samples.length) throw new Error('The recording contains no audio samples.');
    if (signal?.aborted) throw abortError();
    return { ...decoded, sourceName: file.name };
  }

  private async decodeWithBrowser(data: ArrayBuffer, signal?: AbortSignal): Promise<DecodedAudioFile> {
    const context = this.dependencies.createAudioContext?.() ?? createNativeAudioContext();
    try {
      let audio: BrowserAudioBuffer;
      try {
        audio = await context.decodeAudioData(data.slice(0));
      } catch {
        throw new Error('This browser could not decode the selected audio format. WAV is supported everywhere in this app.');
      }
      if (signal?.aborted) throw abortError();
      const samples = new Float32Array(audio.length);
      for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
        const input = audio.getChannelData(channel);
        for (let index = 0; index < samples.length; index += 1) samples[index] += input[index] / audio.numberOfChannels;
      }
      return { samples, sampleRate: audio.sampleRate, durationSeconds: audio.duration, sourceName: '' };
    } finally {
      await context.close();
    }
  }
}

function isWav(file: File, data: ArrayBuffer): boolean {
  if (file.type === 'audio/wav' || file.type === 'audio/x-wav' || file.name.toLowerCase().endsWith('.wav')) return true;
  if (data.byteLength < 12) return false;
  const bytes = new Uint8Array(data, 0, 12);
  return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WAVE';
}

function createNativeAudioContext(): BrowserAudioContext {
  const Constructor = window.AudioContext;
  if (!Constructor) throw new Error('This browser cannot decode compressed audio. Choose a WAV file instead.');
  return new Constructor() as unknown as BrowserAudioContext;
}

function abortError(): DOMException {
  return new DOMException('Audio-file verification was cancelled.', 'AbortError');
}

