import { SpeakerPlayback } from './acoustic-playback';

describe('test-only speaker playback adapter', () => {
  it('connects only explicit test audio and closes its context', async () => {
    const close = jasmine.createSpy('close').and.resolveTo();
    const disconnect = jasmine.createSpy('disconnect');
    const connect = jasmine.createSpy('connect');
    const copyToChannel = jasmine.createSpy('copyToChannel');
    const source = {
      buffer: null,
      onended: null as (() => void) | null,
      connect,
      disconnect,
      start: () => queueMicrotask(() => source.onended?.(new Event('ended'))),
      stop: jasmine.createSpy('stop')
    } as unknown as AudioBufferSourceNode;
    const context = {
      state: 'running', destination: {}, close,
      createBuffer: () => ({ copyToChannel }),
      createBufferSource: () => source
    } as unknown as AudioContext;
    const playback = new SpeakerPlayback({ createAudioContext: () => context });

    await playback.playPcm(new Float32Array([0, 0.2, -0.2]), 8_000);
    await playback.stop();

    expect(copyToChannel).toHaveBeenCalled();
    expect(connect).toHaveBeenCalledWith(context.destination);
    expect(disconnect).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});
