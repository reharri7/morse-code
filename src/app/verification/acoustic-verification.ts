import { PcmFrame } from '../core/morse/interfaces';
import { MicrophoneCapture, MicrophoneCaptureCallbacks } from '../input/microphone-capture';
import { SpeakerPlayback } from './acoustic-playback';
import { VerificationCase, VerificationResult } from './verification-model';
import { PORTABLE_CASE, renderBuiltInCase, StreamingVerificationRun } from './verification-runner';

export type AcousticPhase =
  'permission' | 'room-noise' | 'level-check' | 'countdown' | 'repetition' | 'finishing' | 'complete';
export type AcousticLevel = 'too-quiet' | 'usable' | 'clipping';

export interface AcousticProgress {
  readonly phase: AcousticPhase;
  readonly message: string;
  readonly countdown?: number;
  readonly repetition?: number;
}

export interface AcousticVerificationResult {
  readonly schemaVersion: 1;
  readonly completedAt: string;
  readonly deviceLabel: string;
  readonly roomNoiseRms: number;
  readonly levelCheckRms: number;
  readonly levelCheckPeak: number;
  readonly level: AcousticLevel;
  readonly repetitions: readonly VerificationResult[];
  readonly provisionalCharacterErrorRateTarget: number;
  readonly passingRepetitionCount: number;
  readonly provisionalPass: boolean;
  readonly calibrationStatus: 'provisional-unmeasured';
}

export interface AcousticVerificationCallbacks {
  readonly onProgress?: (progress: AcousticProgress) => void;
  readonly onRepetition?: (result: VerificationResult, repetition: number) => void;
}

export interface AcousticVerificationTimings {
  readonly roomNoiseMs: number;
  readonly levelToneMs: number;
  readonly levelSettleMs: number;
  readonly countdownStepMs: number;
  readonly repetitionSettleMs: number;
  readonly interRepetitionMs: number;
}

interface PlaybackAdapter {
  prepare(): Promise<void>;
  playTone(frequencyHz: number, durationMs: number, signal?: AbortSignal): Promise<void>;
  playPcm(samples: Float32Array, sampleRate: number, signal?: AbortSignal): Promise<void>;
  stop(): Promise<void>;
}

export interface AcousticVerificationEnvironment {
  readonly createCapture: (callbacks: MicrophoneCaptureCallbacks) => MicrophoneCapture;
  readonly createPlayback: () => PlaybackAdapter;
  readonly wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly timings: AcousticVerificationTimings;
}

export interface AcousticVerificationOptions {
  readonly deviceId?: string;
  readonly deviceLabel: string;
  readonly browserUserAgent?: string;
}

const ACOUSTIC_CASE: VerificationCase = {
  ...PORTABLE_CASE,
  id: 'acoustic-clean-15-v2',
  title: 'Speaker-to-microphone 15 WPM check',
  purpose: 'Exercises speaker playback, room acoustics, the selected microphone, and the production raw decoder.',
  sourceKind: 'acoustic-test'
};

export class AcousticVerificationController {
  private running = false;
  private abortController: AbortController | null = null;
  private capture: MicrophoneCapture | null = null;
  private playback: PlaybackAdapter | null = null;
  private collector: LevelCollector | null = null;
  private repetitionRun: StreamingVerificationRun | null = null;
  private deviceFailureRejectors: Array<(error: Error) => void> = [];
  private deviceFailure: Error | null = null;

  constructor(private readonly environment: AcousticVerificationEnvironment = browserEnvironment()) {}

  static isSupported(): boolean {
    return MicrophoneCapture.isSupported() && SpeakerPlayback.isSupported();
  }

  get isRunning(): boolean {
    return this.running;
  }

  async run(
    options: AcousticVerificationOptions,
    callbacks: AcousticVerificationCallbacks = {}
  ): Promise<AcousticVerificationResult> {
    if (this.running) throw new Error('An acoustic verification is already running.');
    this.running = true;
    this.deviceFailure = null;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.playback = this.environment.createPlayback();
    this.capture = this.environment.createCapture({
      onFrame: (frame) => this.handleFrame(frame),
      onStateChange: (state, message) => {
        if (state === 'error') this.rejectDeviceFailure(new Error(message ?? 'The microphone stopped during verification.'));
      }
    });
    const repetitions: VerificationResult[] = [];
    try {
      this.publish(callbacks, 'permission', 'Waiting for microphone permission…');
      const playbackReady = this.playback.prepare();
      const captureReady = this.capture.start(options.deviceId);
      await this.guarded(Promise.all([playbackReady, captureReady]), signal);

      this.collector = new LevelCollector();
      this.publish(callbacks, 'room-noise', 'Listening to the room for two seconds…');
      await this.guarded(this.environment.wait(this.environment.timings.roomNoiseMs, signal), signal);
      const roomNoise = this.collector.snapshot();

      this.collector = new LevelCollector();
      this.publish(callbacks, 'level-check', 'Playing a short level-check tone…');
      await this.guarded(this.playback.playTone(600, this.environment.timings.levelToneMs, signal), signal);
      await this.guarded(this.environment.wait(this.environment.timings.levelSettleMs, signal), signal);
      const levelCheck = this.collector.snapshot();
      const level = classifyLevel(roomNoise.rms, levelCheck);

      for (let count = 3; count >= 1; count -= 1) {
        this.publish(callbacks, 'countdown', `Starting in ${count}…`, { countdown: count });
        await this.guarded(this.environment.wait(this.environment.timings.countdownStepMs, signal), signal);
      }

      const playbackSamples = renderBuiltInCase(PORTABLE_CASE);
      for (let repetition = 1; repetition <= 3; repetition += 1) {
        this.repetitionRun = new StreamingVerificationRun(
          ACOUSTIC_CASE, `Acoustic repetition ${repetition}`, options.browserUserAgent
        );
        this.collector = null;
        this.publish(callbacks, 'repetition', `Playing and decoding repetition ${repetition} of 3…`, { repetition });
        await this.guarded(this.playback.playPcm(playbackSamples, 8_000, signal), signal);
        await this.guarded(this.environment.wait(this.environment.timings.repetitionSettleMs, signal), signal);
        const result = this.repetitionRun.finish();
        this.repetitionRun = null;
        repetitions.push(result);
        callbacks.onRepetition?.(result, repetition);
        if (repetition < 3) {
          await this.guarded(this.environment.wait(this.environment.timings.interRepetitionMs, signal), signal);
        }
      }

      this.publish(callbacks, 'finishing', 'Releasing microphone and speaker resources…');
      const passingRepetitionCount = repetitions.filter((result) => repetitionMeetsProvisionalTarget(result)).length;
      const provisionalPass = level === 'usable' && passingRepetitionCount >= 2;
      const result: AcousticVerificationResult = {
        schemaVersion: 1,
        completedAt: new Date().toISOString(),
        deviceLabel: options.deviceLabel,
        roomNoiseRms: roomNoise.rms,
        levelCheckRms: levelCheck.rms,
        levelCheckPeak: levelCheck.peak,
        level,
        repetitions,
        provisionalCharacterErrorRateTarget: 0.1,
        passingRepetitionCount,
        provisionalPass,
        calibrationStatus: 'provisional-unmeasured'
      };
      this.publish(callbacks, 'complete', provisionalPass
        ? 'The provisional acoustic target was met.'
        : 'The acoustic path needs attention; review every repetition.');
      return result;
    } finally {
      this.collector = null;
      this.repetitionRun = null;
      this.abortController = null;
      this.deviceFailureRejectors = [];
      this.deviceFailure = null;
      await Promise.allSettled([this.playback?.stop(), this.capture?.dispose()]);
      this.playback = null;
      this.capture = null;
      this.running = false;
    }
  }

  cancel(): void {
    this.abortController?.abort();
    void this.playback?.stop();
    void this.capture?.stop();
  }

  private handleFrame(frame: PcmFrame): void {
    this.collector?.push(frame.samples);
    this.repetitionRun?.pushFrame(frame);
  }

  private publish(
    callbacks: AcousticVerificationCallbacks,
    phase: AcousticPhase,
    message: string,
    extra: Pick<AcousticProgress, 'countdown' | 'repetition'> = {}
  ): void {
    callbacks.onProgress?.({ phase, message, ...extra });
  }

  private guarded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(abortError());
    if (this.deviceFailure) return Promise.reject(this.deviceFailure);
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => this.deviceFailureRejectors.push(reject)),
      new Promise<T>((_, reject) => signal.addEventListener('abort', () => reject(abortError()), { once: true }))
    ]);
  }

  private rejectDeviceFailure(error: Error): void {
    this.deviceFailure = error;
    for (const reject of this.deviceFailureRejectors.splice(0)) reject(error);
  }
}

class LevelCollector {
  private sampleCount = 0;
  private sumSquares = 0;
  private peak = 0;
  private clipped = 0;

  push(samples: Float32Array): void {
    for (const sample of samples) {
      this.sampleCount += 1;
      this.sumSquares += sample * sample;
      this.peak = Math.max(this.peak, Math.abs(sample));
      if (Math.abs(sample) >= 0.99) this.clipped += 1;
    }
  }

  snapshot(): { rms: number; peak: number; clippedRate: number } {
    return {
      rms: this.sampleCount ? Math.sqrt(this.sumSquares / this.sampleCount) : 0,
      peak: this.peak,
      clippedRate: this.clipped / Math.max(1, this.sampleCount)
    };
  }
}

function classifyLevel(
  roomNoiseRms: number,
  level: { rms: number; peak: number; clippedRate: number }
): AcousticLevel {
  if (level.peak >= 0.99 || level.clippedRate > 0.005) return 'clipping';
  if (level.rms < Math.max(0.005, roomNoiseRms * 2)) return 'too-quiet';
  return 'usable';
}

function repetitionMeetsProvisionalTarget(result: VerificationResult): boolean {
  const tone = result.observations.acquiredToneFrequencyHz;
  const correctTone = tone !== null && Math.abs(tone - 600) <= 55;
  return correctTone && (result.metrics?.characterErrorRate ?? 1) <= 0.1;
}

function browserEnvironment(): AcousticVerificationEnvironment {
  return {
    createCapture: (callbacks) => new MicrophoneCapture(callbacks),
    createPlayback: () => new SpeakerPlayback(),
    wait: abortableWait,
    timings: {
      roomNoiseMs: 2_000,
      levelToneMs: 800,
      levelSettleMs: 300,
      countdownStepMs: 1_000,
      repetitionSettleMs: 350,
      interRepetitionMs: 900
    }
  };
}

function abortableWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(finish, milliseconds);
    const onAbort = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    function finish() {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): DOMException {
  return new DOMException('Acoustic verification was cancelled.', 'AbortError');
}
