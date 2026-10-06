import { MicrophoneCapture, MicrophoneCaptureEnvironment } from './microphone-capture';

describe('MicrophoneCapture', () => {
  it('requests unprocessed selected-device audio, forwards PCM, and releases every resource', async () => {
    const tracks: Array<{ track: MediaStreamTrack; stop: jasmine.Spy }> = [];
    const contexts: Array<{ context: AudioContext; close: jasmine.Spy; sourceDisconnect: jasmine.Spy; nodeDisconnect: jasmine.Spy; port: MessagePort }> = [];
    const getUserMedia = jasmine.createSpy('getUserMedia').and.callFake(async () => {
      const stop = jasmine.createSpy('track.stop');
      const track = { onended: null, stop } as unknown as MediaStreamTrack;
      tracks.push({ track, stop });
      return { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    });
    const mediaDevices = {
      getUserMedia,
      enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'radio-in', label: 'USB radio' }],
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    } as unknown as MediaDevices;
    let latestNode: AudioWorkletNode | null = null;
    const environment: MicrophoneCaptureEnvironment = {
      mediaDevices,
      workletModuleUrl: 'cw-audio-processor.js',
      createAudioContext: () => {
        const sourceDisconnect = jasmine.createSpy('source.disconnect');
        const source = { connect: jasmine.createSpy('source.connect'), disconnect: sourceDisconnect } as unknown as MediaStreamAudioSourceNode;
        const close = jasmine.createSpy('context.close').and.resolveTo();
        const context = {
          audioWorklet: { addModule: jasmine.createSpy('addModule').and.resolveTo() },
          resume: jasmine.createSpy('resume').and.resolveTo(),
          createMediaStreamSource: () => source,
          close,
          state: 'running'
        } as unknown as AudioContext;
        const nodeDisconnect = jasmine.createSpy('node.disconnect');
        const port = {
          onmessage: null,
          postMessage(message: { type?: string }) {
            if (message.type === 'flush') queueMicrotask(() => port.onmessage?.({ data: { type: 'flushed' } } as MessageEvent));
          }
        } as unknown as MessagePort;
        const node = { port, disconnect: nodeDisconnect } as unknown as AudioWorkletNode;
        latestNode = node;
        contexts.push({ context, close, sourceDisconnect, nodeDisconnect, port });
        return context;
      },
      createWorkletNode: () => latestNode as unknown as AudioWorkletNode
    };
    const frames: Float32Array[] = [];
    const states: string[] = [];
    const capture = new MicrophoneCapture({
      onFrame: (frame) => frames.push(frame.samples),
      onStateChange: (state) => states.push(state)
    }, environment);

    await capture.start('radio-in');
    expect(getUserMedia).toHaveBeenCalledWith(jasmine.objectContaining({
      audio: jasmine.objectContaining({
        deviceId: { exact: 'radio-in' },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      })
    }));
    contexts[0].port.onmessage?.({
      data: { type: 'pcm-frame', samples: new Float32Array([0.1, -0.1]), sampleRate: 48_000, startSample: 0 }
    } as MessageEvent);
    expect(frames.length).toBe(1);

    await capture.stop();
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(contexts[0].sourceDisconnect).toHaveBeenCalled();
    expect(contexts[0].nodeDisconnect).toHaveBeenCalled();
    expect(contexts[0].close).toHaveBeenCalled();
    expect(states).toContain('listening');
    expect(states.at(-1)).toBe('idle');

    await capture.start('radio-in');
    await capture.stop();
    expect(tracks.length).toBe(2);
    expect(tracks.every(({ stop }) => stop.calls.count() === 1)).toBeTrue();
    expect(contexts.every(({ close }) => close.calls.count() === 1)).toBeTrue();
  });

  it('uses stable fallback labels before microphone permission reveals names', async () => {
    const environment = {
      mediaDevices: {
        enumerateDevices: async () => [
          { kind: 'audioinput', deviceId: 'one', label: '' },
          { kind: 'videoinput', deviceId: 'camera', label: '' },
          { kind: 'audioinput', deviceId: 'two', label: '' }
        ],
        addEventListener: () => undefined,
        removeEventListener: () => undefined
      }
    } as unknown as MicrophoneCaptureEnvironment;
    const capture = new MicrophoneCapture({ onFrame: () => undefined }, environment);

    expect(await capture.listInputDevices()).toEqual([
      { deviceId: 'one', label: 'Microphone 1' },
      { deviceId: 'two', label: 'Microphone 2' }
    ]);
  });

  it('publishes a visible permission error when access is denied', async () => {
    const mediaDevices = {
      getUserMedia: async () => { throw new DOMException('Denied', 'NotAllowedError'); },
      enumerateDevices: async () => [],
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    } as unknown as MediaDevices;
    const states: Array<{ state: string; message?: string }> = [];
    const capture = new MicrophoneCapture({
      onFrame: () => undefined,
      onStateChange: (state, message) => states.push({ state, message })
    }, { mediaDevices } as unknown as MicrophoneCaptureEnvironment);

    await expectAsync(capture.start()).toBeRejected();
    expect(states.at(-1)?.state).toBe('error');
    expect(states.at(-1)?.message).toContain('permission was denied');
  });
});
