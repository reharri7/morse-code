import { AudioFileAdapter, MAX_AUDIO_FILE_BYTES } from './audio-file-adapter';
import { encodeMonoPcm16Wav } from './wav-codec';

describe('local audio-file adapter', () => {
  it('decodes a deterministic WAV without requesting microphone permission and supports a second run', async () => {
    const adapter = new AudioFileAdapter({ createAudioContext: () => { throw new Error('should not use browser decoding'); } });
    const wav = encodeMonoPcm16Wav(new Float32Array([0, 0.25, -0.25, 0]), 8_000);
    const file = new File([wav], 'known.wav', { type: 'audio/wav' });
    const first = await adapter.decode(file);
    const second = await adapter.decode(file);
    expect(first.sampleRate).toBe(8_000);
    expect(first.samples.length).toBe(4);
    expect(second.samples).not.toBe(first.samples);
  });

  it('rejects oversized, empty, corrupt, and cancelled inputs with useful errors', async () => {
    const adapter = new AudioFileAdapter();
    const oversized = {
      name: 'large.wav', type: 'audio/wav', size: MAX_AUDIO_FILE_BYTES + 1,
      arrayBuffer: async () => new ArrayBuffer(0)
    } as File;
    await expectAsync(adapter.decode(oversized)).toBeRejectedWithError(/25 MB/);
    await expectAsync(adapter.decode(new File([], 'empty.wav', { type: 'audio/wav' }))).toBeRejectedWithError(/empty/);
    await expectAsync(adapter.decode(new File([new Uint8Array(64)], 'corrupt.wav', { type: 'audio/wav' }))).toBeRejectedWithError(/valid WAV/);
    const controller = new AbortController();
    controller.abort();
    const wav = new File([encodeMonoPcm16Wav(new Float32Array([0]), 8_000)], 'cancel.wav', { type: 'audio/wav' });
    await expectAsync(adapter.decode(wav, controller.signal)).toBeRejectedWithError(DOMException, /cancelled/);
  });

  it('rejects overlong browser-decoded audio and always closes the decoder context', async () => {
    let closed = false;
    const adapter = new AudioFileAdapter({
      createAudioContext: () => ({
        decodeAudioData: async () => ({
          numberOfChannels: 1, length: 1, sampleRate: 8_000, duration: 301,
          getChannelData: () => new Float32Array([0.2])
        }),
        close: async () => { closed = true; }
      })
    });
    const file = new File([new Uint8Array([1, 2, 3])], 'overlong.mp3', { type: 'audio/mpeg' });
    await expectAsync(adapter.decode(file)).toBeRejectedWithError(/five minutes/);
    expect(closed).toBeTrue();
  });
});
