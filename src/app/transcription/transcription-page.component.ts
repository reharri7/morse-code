import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AcquiringCwDecoder, AcquiringCwSnapshot } from '../core/morse/acquiring-cw-decoder';
import { decodeSyntheticCw } from '../core/morse/cw-pipeline';
import { DecodedCharacterEvidence, TimingEvent, TimingEventKind } from '../core/morse/interfaces';
import { LockMode } from '../core/morse/tone-acquisition';
import { CaptureState, InputDevice, MicrophoneCapture } from '../input/microphone-capture';
import { InstallCardComponent } from '../product/install-card.component';
import { LocalProductStore } from '../product/local-product-store';
import { SessionToolsComponent } from '../product/session-tools.component';
import { VerificationComponent } from '../verification/verification.component';
import { LiveCopyComponent } from '../live-copy/live-copy.component';

@Component({
  selector: 'app-transcription-page',
  imports: [CommonModule, FormsModule, SessionToolsComponent, InstallCardComponent, VerificationComponent, LiveCopyComponent],
  templateUrl: './transcription-page.component.html',
  styleUrl: './transcription-page.component.css'
})
export class TranscriptionPageComponent implements OnInit, OnDestroy {
  readonly captureSupported = MicrophoneCapture.isSupported();
  readonly syntheticCheck = decodeSyntheticCw({
    text: 'CQ CQ DE K6RHE', wordsPerMinute: 20, toneFrequencyHz: 600, sampleRate: 8_000
  }).decoded.text;
  private readonly productStore = new LocalProductStore(window.localStorage);
  private readonly initialSettings = this.productStore.loadSettings();

  devices: readonly InputDevice[] = [];
  selectedDeviceId = this.initialSettings?.selectedDeviceId ?? '';
  lockMode: LockMode = this.initialSettings?.lockMode ?? 'automatic';
  scanMinFrequencyHz = this.initialSettings?.scanMinFrequencyHz ?? 300;
  scanMaxFrequencyHz = this.initialSettings?.scanMaxFrequencyHz ?? 1_200;
  manualFrequencyHz = this.initialSettings?.manualFrequencyHz ?? 600;
  captureState: CaptureState = this.captureSupported ? 'idle' : 'unsupported';
  statusMessage = this.captureSupported
    ? 'Choose an input, then start listening.'
    : 'This browser does not provide the Web Audio microphone features required for live capture.';
  snapshot: AcquiringCwSnapshot;
  selectedCharacterIndex: number | null = null;
  verificationCaptureActive = false;
  liveCopyActive = false;

  private capture: MicrophoneCapture | null = null;
  private session = this.createSession();
  private lastUiUpdate = 0;

  constructor(private readonly zone: NgZone) {
    this.snapshot = this.session.snapshot();
    if (this.captureSupported) {
      this.capture = new MicrophoneCapture({
        onFrame: (frame) => {
          const nextSnapshot = this.session.pushFrame(frame);
          const now = performance.now();
          if (now - this.lastUiUpdate >= 50) {
            this.lastUiUpdate = now;
            this.zone.run(() => this.snapshot = nextSnapshot);
          }
        },
        onStateChange: (state, message) => this.zone.run(() => {
          this.captureState = state;
          this.statusMessage = message ?? stateMessage(state);
        }),
        onDevicesChanged: (devices) => this.zone.run(() => this.useDevices(devices))
      });
    }
  }

  ngOnInit(): void {
    void this.refreshDevices();
  }

  ngOnDestroy(): void {
    void this.capture?.dispose();
  }

  async refreshDevices(): Promise<void> {
    if (!this.capture) return;
    try {
      this.useDevices(await this.capture.listInputDevices());
    } catch {
      this.statusMessage = 'Microphone devices could not be listed. Check browser permissions.';
    }
  }

  async startCapture(): Promise<void> {
    if (!this.capture || this.captureState === 'requesting-permission' || this.verificationCaptureActive) return;
    const { minimum, maximum, manual } = this.normalizedFrequencySettings();
    this.scanMinFrequencyHz = minimum;
    this.scanMaxFrequencyHz = maximum;
    this.manualFrequencyHz = manual;
    this.saveSettings();
    this.session = this.createSession();
    this.snapshot = this.session.snapshot();
    try {
      await this.capture.start(this.selectedDeviceId || undefined);
    } catch {
      // The capture adapter publishes a user-facing error state.
    }
  }

  setVerificationCaptureActive(active: boolean): void {
    this.verificationCaptureActive = active;
  }

  setLiveCopyActive(active: boolean): void {
    this.liveCopyActive = active;
  }

  async stopCapture(): Promise<void> {
    if (!this.capture) return;
    await this.capture.stop();
    this.snapshot = this.session.flush();
  }

  resetTranscript(): void {
    this.session = this.createSession();
    this.snapshot = this.session.snapshot();
    this.selectedCharacterIndex = null;
    this.statusMessage = this.captureState === 'listening'
      ? 'Listening with a fresh transcript.'
      : stateMessage(this.captureState);
  }

  changeLockMode(): void {
    const { minimum, maximum, manual } = this.normalizedFrequencySettings();
    this.scanMinFrequencyHz = minimum;
    this.scanMaxFrequencyHz = maximum;
    this.manualFrequencyHz = manual;
    this.saveSettings();
    if (this.isListening) {
      this.snapshot = this.session.setManualFrequency(this.lockMode === 'manual' ? this.manualFrequencyHz : null);
    } else {
      this.session = this.createSession();
      this.snapshot = this.session.snapshot();
    }
  }

  lockCandidate(frequencyHz: number): void {
    this.lockMode = 'manual';
    this.manualFrequencyHz = Math.round(frequencyHz);
    this.saveSettings();
    this.snapshot = this.session.setManualFrequency(this.manualFrequencyHz);
  }

  reacquireAutomatically(): void {
    this.lockMode = 'automatic';
    this.saveSettings();
    this.snapshot = this.session.setManualFrequency(null);
  }

  saveSettings(): void {
    const { minimum, maximum, manual } = this.normalizedFrequencySettings();
    this.productStore.saveSettings({
      selectedDeviceId: this.selectedDeviceId,
      lockMode: this.lockMode,
      scanMinFrequencyHz: minimum,
      scanMaxFrequencyHz: maximum,
      manualFrequencyHz: manual
    });
  }

  get isBusy(): boolean {
    return this.captureState === 'requesting-permission' || this.captureState === 'stopping';
  }

  get isListening(): boolean {
    return this.captureState === 'listening';
  }

  get signalDb(): string {
    if (!this.snapshot.signalLevel) return '≤ −80 dBFS';
    return `${Math.max(-80, 20 * Math.log10(this.snapshot.signalLevel)).toFixed(1)} dBFS`;
  }

  get recentMarks(): string {
    const marks = this.snapshot.recentEvents.map((event) => {
      if (event.kind === 'dit') return '·';
      if (event.kind === 'dah') return '−';
      if (event.kind === 'word-gap') return ' / ';
      return ' ';
    }).join('').replace(/\s+/g, ' ');
    return marks || '—';
  }

  get lockedFrequency(): string {
    const frequency = this.snapshot.acquisition.lockedFrequencyHz;
    return frequency === null ? 'Scanning' : `${Math.round(frequency)} Hz`;
  }

  get lockQuality(): string {
    return `${Math.round(this.snapshot.acquisition.lockQuality * 100)}%`;
  }

  get characterSpeed(): string {
    const speed = this.snapshot.timing.characterWordsPerMinute;
    return speed ? `${Math.round(speed)} WPM` : 'Learning…';
  }

  get overallSpeed(): string {
    const speed = this.snapshot.timing.effectiveWordsPerMinute;
    return speed ? `${Math.round(speed)} WPM` : 'Learning…';
  }

  get timingQuality(): string {
    const confidence = this.snapshot.timing.confidence;
    if (this.snapshot.timing.state === 'acquiring') return 'Learning';
    if (confidence >= 0.75) return 'Strong';
    if (confidence >= 0.5) return 'Usable';
    return 'Uncertain';
  }

  get decodeQuality(): string {
    if (!this.snapshot.characters.length) return 'Waiting';
    if (this.snapshot.decodeConfidence >= 0.8) return 'Strong';
    if (this.snapshot.decodeConfidence >= 0.55) return 'Usable';
    return 'Uncertain';
  }

  get backgroundNoise(): string {
    const level = this.snapshot.conditioning.noiseLevel;
    if (!level) return '≤ −80 dBFS';
    return `${Math.max(-80, 20 * Math.log10(level)).toFixed(1)} dBFS`;
  }

  get levelAdjustment(): string {
    return `${this.snapshot.conditioning.gain.toFixed(1)}×`;
  }

  get currentDeviceLabel(): string {
    return this.devices.find((device) => device.deviceId === this.selectedDeviceId)?.label || 'System default microphone';
  }

  get operatorStateKey(): string {
    if (this.captureState !== 'listening') return this.captureState;
    return this.snapshot.acquisition.state;
  }

  get operatorStatus(): { title: string; detail: string } {
    if (this.captureState === 'unsupported') {
      return { title: 'Microphone unavailable', detail: 'Open this page in a browser that supports microphone audio.' };
    }
    if (this.captureState === 'error') {
      return { title: 'Microphone needs attention', detail: this.statusMessage };
    }
    if (this.captureState === 'requesting-permission') {
      return { title: 'Waiting for permission', detail: 'Choose Allow in the browser microphone message.' };
    }
    if (this.captureState === 'stopping') {
      return { title: 'Finishing this session', detail: 'The microphone is being released safely.' };
    }
    if (this.captureState !== 'listening') {
      return { title: 'Ready to listen', detail: 'Choose your microphone and place it near the radio or speaker.' };
    }
    if (this.snapshot.acquisition.state === 'searching') {
      return { title: 'Finding a CW tone', detail: 'Play the transmission. The app is listening for a steady Morse-code pitch.' };
    }
    if (this.snapshot.acquisition.state === 'lost') {
      return { title: 'Signal lost', detail: 'The CW tone disappeared. Automatic mode will keep looking for it.' };
    }
    if (this.snapshot.acquisition.state === 'degraded') {
      return { title: 'Signal is difficult', detail: 'The tone is weak or noisy. Keep the microphone close and reduce other sounds.' };
    }
    if (this.snapshot.timing.state === 'acquiring') {
      return { title: 'Tone found—learning its rhythm', detail: 'A few more dits and dahs are needed before text appears.' };
    }
    return { title: 'Receiving CW', detail: 'The tone and timing are being followed locally on this device.' };
  }

  get signalQuality(): string {
    if (this.snapshot.acquisition.state === 'lost') return 'Lost';
    if (this.snapshot.acquisition.state === 'searching') return 'Searching';
    const snr = this.snapshot.acquisition.snrDb;
    if (snr === null) return 'Waiting';
    if (snr >= 15) return 'Clear';
    if (snr >= 8) return 'Fair';
    return 'Weak';
  }

  get lockGuidance(): string {
    if (this.lockMode === 'manual') {
      return `You chose ${this.lockedFrequency}. The app will stay on this pitch until you return to automatic.`;
    }
    if (this.snapshot.acquisition.state === 'lost') {
      return 'The app is searching again. Restarting the source or moving the microphone closer may help.';
    }
    if (this.snapshot.acquisition.state === 'locked' && this.snapshot.acquisition.candidates.length > 1) {
      return 'More than one tone is present. If the text looks wrong, open signal settings and choose another tone.';
    }
    return 'Automatic mode follows the clearest Morse-like tone it can find.';
  }

  get hasActionableLockGuidance(): boolean {
    return this.lockMode === 'manual' || this.snapshot.acquisition.state === 'lost' ||
      (this.snapshot.acquisition.state === 'locked' && this.snapshot.acquisition.candidates.length > 1);
  }

  get timelineEvents(): readonly TimelineViewEvent[] {
    const unitMs = this.snapshot.timing.elementDitDurationMs || 60;
    return this.snapshot.recentEvents.slice(-42).map((event, index) => ({
      id: `${event.kind}-${index}-${Math.round(event.durationMs)}`,
      kind: event.kind,
      label: timingEventLabel(event),
      symbol: timingEventSymbol(event.kind),
      width: Math.round(Math.max(7, Math.min(62, (event.durationMs / unitMs) * 9))),
      quality: this.confidenceClass(event.confidence ?? 0)
    }));
  }

  get timelineDescription(): string {
    if (!this.snapshot.recentEvents.length) return 'No Morse timing has been detected yet.';
    return this.snapshot.recentEvents.slice(-42).map((event) => timingEventLabel(event)).join(', ');
  }

  get recentCharacters(): readonly CharacterView[] {
    const start = Math.max(0, this.snapshot.characters.length - 24);
    return this.snapshot.characters.slice(start).map((evidence, offset) => ({
      index: start + offset,
      evidence,
      quality: this.confidenceClass(evidence.confidence)
    }));
  }

  get selectedCharacter(): DecodedCharacterEvidence | null {
    if (!this.snapshot.characters.length) return null;
    const index = this.selectedCharacterIndex ?? this.snapshot.characters.length - 1;
    return this.snapshot.characters[index] ?? this.snapshot.characters.at(-1) ?? null;
  }

  get selectedCharacterExplanation(): string {
    const character = this.selectedCharacter;
    if (!character) return 'Decoded characters will appear here with their timing evidence.';
    if (character.character === '?') return 'This dot-and-dash pattern is not a known Morse character, so it remains a question mark.';
    if (character.confidence >= 0.8) return 'The detected timing closely matches this Morse character.';
    if (character.confidence >= 0.55) return 'The character is usable, but some timing was outside the strongest match.';
    return 'This character is uncertain. Treat it as heard evidence rather than a correction.';
  }

  selectCharacter(index: number): void {
    this.selectedCharacterIndex = index;
  }

  confidenceLabel(confidence: number): string {
    if (confidence >= 0.8) return 'Strong';
    if (confidence >= 0.55) return 'Usable';
    return 'Uncertain';
  }

  confidenceClass(confidence: number): ConfidenceClass {
    if (confidence >= 0.8) return 'strong';
    if (confidence >= 0.55) return 'usable';
    return 'uncertain';
  }

  morseDisplay(morse: string): string {
    return morse.replaceAll('.', '·').replaceAll('-', '−');
  }

  candidateClarity(snrDb: number): string {
    if (snrDb >= 15) return 'Clear';
    if (snrDb >= 8) return 'Fair';
    return 'Weak';
  }

  private createSession(): AcquiringCwDecoder {
    const { minimum, maximum, manual } = this.normalizedFrequencySettings();
    return new AcquiringCwDecoder({
      minFrequencyHz: minimum,
      maxFrequencyHz: maximum,
      frequencyStepHz: 10,
      manualFrequencyHz: this.lockMode === 'manual' ? manual : undefined,
      detectorFrameSize: 128
    });
  }

  private normalizedFrequencySettings(): { minimum: number; maximum: number; manual: number } {
    const minimum = Math.max(100, Math.min(1_900, Number(this.scanMinFrequencyHz) || 300));
    const maximum = Math.max(minimum + 10, Math.min(2_000, Number(this.scanMaxFrequencyHz) || 1_200));
    const manual = Math.max(minimum, Math.min(maximum, Number(this.manualFrequencyHz) || 600));
    return { minimum, maximum, manual };
  }

  private useDevices(devices: readonly InputDevice[]): void {
    this.devices = devices;
    if (!devices.some((device) => device.deviceId === this.selectedDeviceId)) {
      this.selectedDeviceId = devices[0]?.deviceId ?? '';
    }
  }
}

function stateMessage(state: CaptureState): string {
  const messages: Record<CaptureState, string> = {
    idle: 'Choose an input, then start listening.',
    'requesting-permission': 'Waiting for microphone permission…',
    listening: 'Listening locally. No audio leaves this browser.',
    stopping: 'Stopping and releasing the microphone…',
    error: 'Live capture encountered an error.',
    unsupported: 'Live microphone capture is unsupported in this browser.'
  };
  return messages[state];
}

type ConfidenceClass = 'strong' | 'usable' | 'uncertain';

interface TimelineViewEvent {
  readonly id: string;
  readonly kind: TimingEventKind;
  readonly label: string;
  readonly symbol: string;
  readonly width: number;
  readonly quality: ConfidenceClass;
}

interface CharacterView {
  readonly index: number;
  readonly evidence: DecodedCharacterEvidence;
  readonly quality: ConfidenceClass;
}

function timingEventSymbol(kind: TimingEventKind): string {
  if (kind === 'dit') return '·';
  if (kind === 'dah') return '−';
  if (kind === 'word-gap') return '/';
  return '';
}

function timingEventLabel(event: TimingEvent): string {
  const duration = Math.round(event.durationMs);
  const label: Record<TimingEventKind, string> = {
    dit: 'short tone',
    dah: 'long tone',
    'character-gap': 'letter space',
    'word-gap': 'word space'
  };
  return `${label[event.kind]}, ${duration} milliseconds`;
}
