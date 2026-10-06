import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputDevice } from '../input/microphone-capture';
import {
  AcousticProgress, AcousticVerificationController, AcousticVerificationResult
} from './acoustic-verification';
import { AudioFileAdapter } from './audio-file-adapter';
import { VerificationCase, VerificationResult } from './verification-model';
import {
  buildAcousticVerificationJson, buildAcousticVerificationText, buildVerificationJson, buildVerificationText
} from './verification-report';
import {
  BUILT_IN_CASES, PORTABLE_CASE, renderBuiltInCase, runBuiltInVerification, runPcmVerification
} from './verification-runner';
import { encodeMonoPcm16Wav } from './wav-codec';

@Component({
  selector: 'app-verification',
  imports: [CommonModule, FormsModule],
  templateUrl: './verification.component.html',
  styleUrl: './verification.component.css'
})
export class VerificationComponent implements OnDestroy {
  @Input() inputDevices: readonly InputDevice[] = [];
  @Input() liveCaptureActive = false;
  @Output() acousticActiveChange = new EventEmitter<boolean>();
  @Input() set preferredDeviceId(value: string) {
    if (!this.acousticBusy) this.acousticDeviceId = value;
  }

  readonly builtInCases = BUILT_IN_CASES;
  readonly portableCase = PORTABLE_CASE;
  readonly acousticSupported = AcousticVerificationController.isSupported();
  expectedFileText = '';
  result: VerificationResult | null = null;
  suiteResults: readonly VerificationResult[] = [];
  busy = false;
  busyMessage = '';
  errorMessage = '';
  acousticConfirmed = false;
  acousticDeviceId = '';
  acousticBusy = false;
  acousticProgress: AcousticProgress | null = null;
  acousticResult: AcousticVerificationResult | null = null;
  acousticRepetitions: readonly VerificationResult[] = [];
  acousticError = '';
  private abortController: AbortController | null = null;
  private readonly fileAdapter = new AudioFileAdapter();
  private readonly acousticController = this.acousticSupported ? new AcousticVerificationController() : null;

  get canCancel(): boolean {
    return this.abortController !== null;
  }

  get acousticDeviceLabel(): string {
    return this.inputDevices.find((device) => device.deviceId === this.acousticDeviceId)?.label || 'System default microphone';
  }

  ngOnDestroy(): void {
    this.abortController?.abort();
    this.acousticController?.cancel();
    if (this.acousticBusy) this.acousticActiveChange.emit(false);
  }

  async runQuickTest(): Promise<void> {
    await this.runAction('Running the local decoder check…', () => {
      this.suiteResults = [];
      this.result = runBuiltInVerification(PORTABLE_CASE, navigator.userAgent);
    });
  }

  async runFullSuite(): Promise<void> {
    await this.runAction('Running five deterministic checks…', () => {
      this.suiteResults = BUILT_IN_CASES.map((testCase) => runBuiltInVerification(testCase, navigator.userAgent));
      this.result = this.suiteResults[0] ?? null;
    });
  }

  async selectAudioFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.busy) return;
    this.abortController = new AbortController();
    await this.runAction(`Decoding ${file.name} locally…`, async () => {
      const decoded = await this.fileAdapter.decode(file, this.abortController?.signal);
      const testCase: VerificationCase = {
        id: 'imported-audio-v1', version: 1, title: 'Imported audio file',
        purpose: 'Checks a local recording through the production acquisition and raw decoder path.',
        sourceKind: 'imported-file',
        expectedText: this.expectedFileText.length ? this.expectedFileText : undefined
      };
      this.suiteResults = [];
      this.result = runPcmVerification({
        testCase, sourceName: decoded.sourceName, samples: decoded.samples, sampleRate: decoded.sampleRate,
        browserUserAgent: navigator.userAgent
      });
    });
    this.abortController = null;
    input.value = '';
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.busy = false;
    this.busyMessage = '';
    this.errorMessage = 'Verification cancelled. The selected audio was discarded.';
  }

  async startAcousticTest(): Promise<void> {
    if (!this.acousticController || this.acousticBusy || this.liveCaptureActive || !this.acousticConfirmed) return;
    this.acousticBusy = true;
    this.acousticError = '';
    this.acousticResult = null;
    this.acousticRepetitions = [];
    this.acousticActiveChange.emit(true);
    try {
      this.acousticResult = await this.acousticController.run({
        deviceId: this.acousticDeviceId || undefined,
        deviceLabel: this.acousticDeviceLabel,
        browserUserAgent: navigator.userAgent
      }, {
        onProgress: (progress) => this.acousticProgress = progress,
        onRepetition: (result) => this.acousticRepetitions = [...this.acousticRepetitions, result]
      });
    } catch (error) {
      this.acousticError = error instanceof DOMException && error.name === 'AbortError'
        ? 'Microphone and speaker verification was cancelled. All audio resources were released.'
        : error instanceof Error ? error.message : 'Microphone and speaker verification could not finish.';
    } finally {
      this.acousticBusy = false;
      this.acousticActiveChange.emit(false);
    }
  }

  cancelAcousticTest(): void {
    this.acousticController?.cancel();
  }

  exportAcousticResult(format: 'text' | 'json'): void {
    if (!this.acousticResult) return;
    const contents = format === 'json'
      ? buildAcousticVerificationJson(this.acousticResult)
      : buildAcousticVerificationText(this.acousticResult);
    this.download(
      new Blob([contents], { type: format === 'json' ? 'application/json' : 'text/plain' }),
      `cw-acoustic-verification.${format === 'json' ? 'json' : 'txt'}`
    );
  }

  showSuiteResult(result: VerificationResult): void {
    this.result = result;
  }

  downloadPortableClip(): void {
    const samples = renderBuiltInCase(PORTABLE_CASE);
    const wav = encodeMonoPcm16Wav(samples, 8_000);
    this.download(new Blob([wav], { type: 'audio/wav' }), 'cw-verification-clean-15-v2.wav');
  }

  exportResult(format: 'text' | 'json'): void {
    if (!this.result) return;
    const contents = format === 'json' ? buildVerificationJson(this.result) : buildVerificationText(this.result);
    const type = format === 'json' ? 'application/json' : 'text/plain';
    this.download(new Blob([contents], { type }), `cw-verification-${this.result.case.id}.${format === 'json' ? 'json' : 'txt'}`);
  }

  diffLabel(item: NonNullable<VerificationResult['metrics']>['characterDiff'][number]): string {
    if (item.kind === 'match') return item.actual === ' ' ? 'matching space' : `matching ${item.actual}`;
    if (item.kind === 'substitution') return `expected ${printable(item.expected)}, received ${printable(item.actual)}`;
    if (item.kind === 'insertion') return `extra ${printable(item.actual)}`;
    return `missing ${printable(item.expected)}`;
  }

  diffSymbol(expected: string, actual: string): string {
    return printable(actual || expected);
  }

  private async runAction(message: string, action: () => void | Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.busyMessage = message;
    this.errorMessage = '';
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      await action();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.errorMessage = error instanceof Error ? error.message : 'Verification could not finish.';
      }
    } finally {
      this.busy = false;
      this.busyMessage = '';
    }
  }

  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function printable(value: string): string {
  return value === ' ' ? 'space' : value || 'nothing';
}
