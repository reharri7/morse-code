import { PcmFrame } from '../core/morse/interfaces';

export type CaptureState = 'idle' | 'requesting-permission' | 'listening' | 'stopping' | 'error' | 'unsupported';

export interface InputDevice {
  readonly deviceId: string;
  readonly label: string;
}

export interface MicrophoneCaptureCallbacks {
  readonly onFrame: (frame: PcmFrame) => void;
  readonly onStateChange?: (state: CaptureState, message?: string) => void;
  readonly onDevicesChanged?: (devices: readonly InputDevice[]) => void;
}

export interface MicrophoneCaptureEnvironment {
  readonly mediaDevices: MediaDevices;
  readonly createAudioContext: () => AudioContext;
  readonly createWorkletNode: (context: AudioContext) => AudioWorkletNode;
  readonly workletModuleUrl: string;
}

export class MicrophoneCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private state: CaptureState = 'idle';
  private stopping = false;
  private flushResolver: (() => void) | null = null;
  private readonly onDeviceChange = () => void this.publishDevices();

  constructor(
    private readonly callbacks: MicrophoneCaptureCallbacks,
    private readonly environment: MicrophoneCaptureEnvironment = browserEnvironment()
  ) {
    this.environment.mediaDevices.addEventListener?.('devicechange', this.onDeviceChange);
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined';
  }

  get captureState(): CaptureState {
    return this.state;
  }

  async listInputDevices(): Promise<readonly InputDevice[]> {
    const devices = await this.environment.mediaDevices.enumerateDevices();
    let microphoneNumber = 0;
    return devices
      .filter((device) => device.kind === 'audioinput')
      .map((device) => {
        microphoneNumber += 1;
        return { deviceId: device.deviceId, label: device.label || `Microphone ${microphoneNumber}` };
      });
  }

  async start(deviceId?: string): Promise<void> {
    await this.stop();
    this.stopping = false;
    this.setState('requesting-permission');
    try {
      this.stream = await this.environment.mediaDevices.getUserMedia({
        video: false,
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          channelCount: { ideal: 1 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      this.context = this.environment.createAudioContext();
      await this.context.audioWorklet.addModule(this.environment.workletModuleUrl);
      await this.context.resume();
      this.source = this.context.createMediaStreamSource(this.stream);
      this.worklet = this.environment.createWorkletNode(this.context);
      this.worklet.port.onmessage = (event: MessageEvent) => this.handleWorkletMessage(event);
      this.source.connect(this.worklet);
      for (const track of this.stream.getAudioTracks()) track.onended = () => this.handleDeviceLoss();
      this.setState('listening');
      await this.publishDevices();
    } catch (error) {
      await this.releaseResources();
      this.setState('error', captureErrorMessage(error));
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.stream && !this.context && !this.worklet) {
      if (this.state !== 'unsupported') this.setState('idle');
      return;
    }
    this.stopping = true;
    this.setState('stopping');
    await this.flushWorklet();
    await this.releaseResources();
    this.stopping = false;
    this.setState('idle');
  }

  async dispose(): Promise<void> {
    this.environment.mediaDevices.removeEventListener?.('devicechange', this.onDeviceChange);
    await this.stop();
  }

  private handleWorkletMessage(event: MessageEvent): void {
    if (event.data?.type === 'pcm-frame' && event.data.samples instanceof Float32Array) {
      this.callbacks.onFrame({
        samples: event.data.samples,
        sampleRate: event.data.sampleRate,
        startSample: event.data.startSample
      });
    } else if (event.data?.type === 'flushed') {
      this.flushResolver?.();
      this.flushResolver = null;
    }
  }

  private async flushWorklet(): Promise<void> {
    if (!this.worklet) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.flushResolver = null;
        resolve();
      };
      this.flushResolver = finish;
      this.worklet?.port.postMessage({ type: 'flush' });
      window.setTimeout(finish, 150);
    });
  }

  private async releaseResources(): Promise<void> {
    this.source?.disconnect();
    this.worklet?.disconnect();
    if (this.worklet) this.worklet.port.onmessage = null;
    for (const track of this.stream?.getTracks() ?? []) {
      track.onended = null;
      track.stop();
    }
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.source = null;
    this.worklet = null;
    this.stream = null;
    this.context = null;
  }

  private handleDeviceLoss(): void {
    if (this.stopping) return;
    void this.releaseResources().finally(() => this.setState('error', 'The selected microphone was disconnected or stopped.'));
  }

  private async publishDevices(): Promise<void> {
    try {
      this.callbacks.onDevicesChanged?.(await this.listInputDevices());
    } catch {
      this.callbacks.onDevicesChanged?.([]);
    }
  }

  private setState(state: CaptureState, message?: string): void {
    this.state = state;
    this.callbacks.onStateChange?.(state, message);
  }
}

function browserEnvironment(): MicrophoneCaptureEnvironment {
  if (!MicrophoneCapture.isSupported()) throw new Error('Live microphone capture is not supported by this browser.');
  return {
    mediaDevices: navigator.mediaDevices,
    createAudioContext: () => new AudioContext({ latencyHint: 'interactive' }),
    createWorkletNode: (context) => new AudioWorkletNode(context, 'cw-audio-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: 'explicit'
    }),
    workletModuleUrl: new URL('cw-audio-processor.js', document.baseURI).toString()
  };
}

function captureErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Microphone permission was denied. Allow access and try again.';
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'The selected microphone is unavailable. Choose another input.';
    if (error.name === 'NotReadableError' || error.name === 'AbortError') return 'The microphone is busy or could not be started.';
  }
  return 'Live capture could not start. Check the microphone and browser permissions.';
}
