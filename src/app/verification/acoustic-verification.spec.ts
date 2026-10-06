import { MicrophoneCapture, MicrophoneCaptureCallbacks } from '../input/microphone-capture';
import {
  AcousticVerificationController, AcousticVerificationEnvironment, AcousticVerificationTimings
} from './acoustic-verification';

describe('guided acoustic verification controller', () => {
  it('streams all three repetitions through production decoding and cleans up across two runs', async () => {
    const harness = createHarness();
    const controller = new AcousticVerificationController(harness.environment);

    const first = await controller.run({ deviceLabel: 'Built-in microphone', browserUserAgent: 'test' });
    const second = await controller.run({ deviceLabel: 'Built-in microphone', browserUserAgent: 'test' });

    for (const run of [first, second]) {
      expect(run.repetitions.length).toBe(3);
      expect(run.repetitions.map((result) => result.rawText)).toEqual([
        'CQ CQ DE K6RHE', 'CQ CQ DE K6RHE', 'CQ CQ DE K6RHE'
      ]);
      expect(run.level).toBe('usable');
      expect(run.passingRepetitionCount).toBe(3);
      expect(run.provisionalPass).toBeTrue();
      expect(run.calibrationStatus).toBe('provisional-unmeasured');
    }
    expect(harness.captureDispose.calls.count()).toBe(2);
    expect(harness.playbackStop.calls.count()).toBe(2);
  });

  it('cancels an active run and releases capture and playback', async () => {
    const harness = createHarness({ holdWait: true });
    const controller = new AcousticVerificationController(harness.environment);
    const running = controller.run({ deviceLabel: 'Test microphone' });
    await Promise.resolve();
    await expectAsync(controller.run({ deviceLabel: 'Second microphone' }))
      .toBeRejectedWithError(/already running/);
    controller.cancel();

    await expectAsync(running).toBeRejectedWithError(DOMException, /cancelled/);
    expect(harness.captureStop).toHaveBeenCalled();
    expect(harness.captureDispose).toHaveBeenCalled();
    expect(harness.playbackStop).toHaveBeenCalled();
    expect(controller.isRunning).toBeFalse();
  });

  it('surfaces device loss and still performs complete cleanup', async () => {
    const harness = createHarness({ failDeviceOnWait: true });
    const controller = new AcousticVerificationController(harness.environment);

    await expectAsync(controller.run({ deviceLabel: 'Removed microphone' }))
      .toBeRejectedWithError(/disconnected/);
    expect(harness.captureDispose).toHaveBeenCalled();
    expect(harness.playbackStop).toHaveBeenCalled();
  });

  it('handles permission denial and playback failure without leaking resources', async () => {
    const denied = createHarness({ denyPermission: true });
    await expectAsync(new AcousticVerificationController(denied.environment).run({ deviceLabel: 'Denied' }))
      .toBeRejectedWithError(DOMException, /Denied/);
    expect(denied.captureDispose).toHaveBeenCalled();
    expect(denied.playbackStop).toHaveBeenCalled();

    const failedPlayback = createHarness({ failPlayback: true });
    await expectAsync(new AcousticVerificationController(failedPlayback.environment).run({ deviceLabel: 'Test' }))
      .toBeRejectedWithError(/Speaker playback failed/);
    expect(failedPlayback.captureDispose).toHaveBeenCalled();
    expect(failedPlayback.playbackStop).toHaveBeenCalled();
  });
});

function createHarness(options: {
  holdWait?: boolean;
  failDeviceOnWait?: boolean;
  denyPermission?: boolean;
  failPlayback?: boolean;
} = {}) {
  let callbacks: MicrophoneCaptureCallbacks | null = null;
  let startSample = 0;
  let failed = false;
  const captureStop = jasmine.createSpy('capture.stop').and.resolveTo();
  const captureDispose = jasmine.createSpy('capture.dispose').and.resolveTo();
  const playbackStop = jasmine.createSpy('playback.stop').and.resolveTo();

  const emit = (samples: Float32Array, sampleRate = 8_000) => {
    let offset = 0;
    while (offset < samples.length) {
      const end = Math.min(samples.length, offset + 512);
      callbacks?.onFrame({ samples: samples.slice(offset, end), sampleRate, startSample });
      startSample += end - offset;
      offset = end;
    }
  };
  const timings: AcousticVerificationTimings = {
    roomNoiseMs: 0, levelToneMs: 0, levelSettleMs: 0,
    countdownStepMs: 0, repetitionSettleMs: 0, interRepetitionMs: 0
  };
  const environment: AcousticVerificationEnvironment = {
    timings,
    createCapture: (nextCallbacks) => {
      callbacks = nextCallbacks;
      return {
        start: options.denyPermission
          ? jasmine.createSpy('capture.start').and.rejectWith(new DOMException('Denied', 'NotAllowedError'))
          : jasmine.createSpy('capture.start').and.resolveTo(),
        stop: captureStop,
        dispose: captureDispose
      } as unknown as MicrophoneCapture;
    },
    createPlayback: () => ({
      prepare: async () => undefined,
      playTone: async () => {
        if (options.failPlayback) throw new Error('Speaker playback failed.');
        emit(new Float32Array(1_024).fill(0.2));
      },
      playPcm: async (samples, sampleRate) => emit(samples, sampleRate),
      stop: playbackStop
    }),
    wait: (_milliseconds, signal) => {
      if (options.failDeviceOnWait && !failed) {
        failed = true;
        callbacks?.onStateChange?.('error', 'The selected microphone was disconnected.');
        return new Promise<void>(() => undefined);
      }
      if (options.holdWait) {
        return new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () =>
          reject(new DOMException('Acoustic verification was cancelled.', 'AbortError')), { once: true }));
      }
      emit(new Float32Array(512).fill(0.001));
      return Promise.resolve();
    }
  };
  return { environment, captureStop, captureDispose, playbackStop };
}
