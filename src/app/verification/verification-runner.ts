import { AcquiringCwDecoder, AcquiringCwSnapshot } from '../core/morse/acquiring-cw-decoder';
import { compareRawText } from '../core/morse/cw-benchmark';
import { PcmFrame } from '../core/morse/interfaces';
import { generateSyntheticCw } from '../core/morse/synthetic-cw';
import {
  VerificationCase, VerificationPcmInput, VerificationResult, VerificationStageId, VerificationStageResult
} from './verification-model';

export const PORTABLE_CASE: VerificationCase = {
  id: 'clean-15-v2', version: 2, title: 'Clean 15 WPM check',
  purpose: 'Proves the local acquisition, timing, and raw decoder path without using a microphone.',
  sourceKind: 'generated', expectedText: 'CQ CQ DE K6RHE', nominalToneFrequencyHz: 600, nominalWordsPerMinute: 15
};

export const BUILT_IN_CASES: readonly VerificationCase[] = [
  PORTABLE_CASE,
  {
    id: 'clean-25-v2', version: 2, title: 'Faster 25 WPM check',
    purpose: 'Checks clean acquisition and faster adaptive timing.', sourceKind: 'generated',
    expectedText: 'CQ CQ DE K6RHE', nominalToneFrequencyHz: 900, nominalWordsPerMinute: 25,
    detectorFrameSize: 64
  },
  {
    id: 'weak-noisy-18-v1', version: 1, title: 'Weak, noisy 18 WPM check',
    purpose: 'Checks representative deterministic noise handling.', sourceKind: 'generated',
    expectedText: 'CQ DE K1AXC', nominalToneFrequencyHz: 575, nominalWordsPerMinute: 18
  },
  {
    id: 'drift-20-v1', version: 1, title: 'Drifting tone check',
    purpose: 'Checks acquisition and tracking while pitch moves.', sourceKind: 'generated',
    expectedText: 'DRIFT TEST 73', nominalToneFrequencyHz: 620, nominalWordsPerMinute: 20
  },
  {
    id: 'two-tone-v1', version: 1, title: 'Nearby tone check',
    purpose: 'Checks that a keyed CW tone wins over a nearby steady carrier.', sourceKind: 'generated',
    expectedText: 'QRM TEST', nominalToneFrequencyHz: 710, nominalWordsPerMinute: 22
  }
];

export function renderBuiltInCase(testCase: VerificationCase): Float32Array {
  const amplitude = testCase.id === 'weak-noisy-18-v1' ? 0.13 : testCase.id === 'two-tone-v1' ? 0.2 : 0.72;
  const generated = generateSyntheticCw({
    text: testCase.expectedText ?? '', wordsPerMinute: testCase.nominalWordsPerMinute,
    toneFrequencyHz: testCase.nominalToneFrequencyHz, sampleRate: 8_000,
    amplitude,
    frequencyDriftHz: testCase.id === 'drift-20-v1' ? 55 : 0
  }).samples;
  const lead = new Float32Array(2_000);
  const trail = new Float32Array(4_800);
  const samples = concatenate([lead, generated, trail]);
  if (testCase.id === 'weak-noisy-18-v1') addDeterministicNoise(samples, 0.035, 73);
  if (testCase.id === 'two-tone-v1') {
    addDeterministicNoise(samples, 0.035, 404);
    addSteadyTone(samples, 790, 0.13, 8_000, lead.length, lead.length + generated.length);
  }
  return samples;
}

export function runBuiltInVerification(testCase: VerificationCase = PORTABLE_CASE, browserUserAgent?: string): VerificationResult {
  return runPcmVerification({
    testCase, sourceName: testCase.title, samples: renderBuiltInCase(testCase), sampleRate: 8_000, browserUserAgent
  });
}

/** Incremental production-path verification used by files and live acoustic repetitions. */
export class StreamingVerificationRun {
  private readonly session: AcquiringCwDecoder;
  private snapshot: AcquiringCwSnapshot;
  private sampleRate = 0;
  private sampleCount = 0;
  private sumSquares = 0;
  private peak = 0;
  private clippedSamples = 0;
  private firstStartSample: number | null = null;
  private lockedFrequencyHz: number | null = null;
  private acquisitionTimeMs: number | null = null;
  private lockLossCount = 0;
  private lockRecoveryCount = 0;
  private hadLock = false;
  private lossPending = false;
  private timingLearned = false;
  private finished = false;

  constructor(
    private readonly testCase: VerificationCase,
    private readonly sourceName: string,
    private readonly browserUserAgent?: string
  ) {
    this.session = new AcquiringCwDecoder({
      minFrequencyHz: 300, maxFrequencyHz: 1_200, frequencyStepHz: 10,
      detectorFrameSize: testCase.detectorFrameSize ?? 128,
      minimumPower: 0.000001, minimumSnrDb: 5, trackingRangeHz: 90
    });
    this.snapshot = this.session.snapshot();
  }

  pushFrame(frame: PcmFrame): void {
    if (this.finished) throw new Error('A completed verification run cannot accept more audio.');
    if (!Number.isFinite(frame.sampleRate) || frame.sampleRate <= 0) throw new Error('Verification audio needs a valid sample rate.');
    if (this.sampleRate && frame.sampleRate !== this.sampleRate) throw new Error('The verification sample rate changed during the run.');
    this.sampleRate = frame.sampleRate;
    this.firstStartSample ??= frame.startSample;
    for (const sample of frame.samples) {
      this.sumSquares += sample * sample;
      this.peak = Math.max(this.peak, Math.abs(sample));
      if (Math.abs(sample) >= 0.99) this.clippedSamples += 1;
    }
    this.sampleCount += frame.samples.length;
    const priorState = this.snapshot.acquisition.state;
    this.snapshot = this.session.pushFrame(frame);
    if (this.snapshot.acquisition.lockedFrequencyHz !== null) {
      this.lockedFrequencyHz = this.snapshot.acquisition.lockedFrequencyHz;
    }
    if (!this.hadLock && this.snapshot.acquisition.state === 'locked') {
      this.hadLock = true;
      const elapsedSamples = (frame.startSample + frame.samples.length) - (this.firstStartSample ?? frame.startSample);
      this.acquisitionTimeMs = (elapsedSamples / frame.sampleRate) * 1_000;
    }
    if (this.snapshot.acquisition.state === 'lost' && priorState !== 'lost') {
      this.lockLossCount += 1;
      this.lossPending = true;
    }
    if (this.lossPending && this.snapshot.acquisition.state === 'locked') {
      this.lockRecoveryCount += 1;
      this.lossPending = false;
    }
    this.timingLearned ||= this.snapshot.timing.state === 'tracking';
  }

  finish(): VerificationResult {
    if (this.finished) throw new Error('Verification was already finished.');
    this.finished = true;
    this.snapshot = this.session.flush();
    this.timingLearned ||= this.snapshot.timing.state === 'tracking';
    const levels = {
      rms: this.sampleCount ? Math.sqrt(this.sumSquares / this.sampleCount) : 0,
      peak: this.peak,
      clippedRate: this.clippedSamples / Math.max(1, this.sampleCount)
    };
    const metrics = this.testCase.expectedText === undefined
      ? null
      : compareRawText(this.testCase.expectedText, this.snapshot.rawText);
    const stages = buildStages(
      this.sampleCount, levels, this.hadLock, this.lockedFrequencyHz, this.timingLearned, this.snapshot, metrics
    );
    const firstFailed = stages.find((stage) => stage.status === 'fail')?.id ?? null;
    return {
      schemaVersion: 1,
      case: this.testCase,
      sourceName: this.sourceName,
      completedAt: new Date().toISOString(),
      passed: firstFailed === null,
      rawText: this.snapshot.rawText,
      expectedText: this.testCase.expectedText ?? null,
      stages,
      firstFailedStage: firstFailed,
      recommendation: recommendationFor(firstFailed),
      metrics,
      observations: {
        browserUserAgent: this.browserUserAgent ?? null,
        sampleRate: this.sampleRate,
        sampleCount: this.sampleCount,
        durationSeconds: this.sampleRate ? this.sampleCount / this.sampleRate : 0,
        rmsLevel: levels.rms,
        peakLevel: levels.peak,
        clippedSampleRate: levels.clippedRate,
        acquiredToneFrequencyHz: this.lockedFrequencyHz,
        acquisitionTimeMs: this.acquisitionTimeMs,
        lockLossCount: this.lockLossCount,
        lockRecoveryCount: this.lockRecoveryCount,
        characterWordsPerMinute: this.snapshot.timing.characterWordsPerMinute,
        effectiveWordsPerMinute: this.snapshot.timing.effectiveWordsPerMinute,
        timingConfidence: this.snapshot.timing.confidence,
        meanCharacterConfidence: meanConfidence(this.snapshot)
      }
    };
  }
}

export function runPcmVerification(input: VerificationPcmInput): VerificationResult {
  if (!Number.isFinite(input.sampleRate) || input.sampleRate <= 0) throw new Error('Verification audio needs a valid sample rate.');
  const run = new StreamingVerificationRun(input.testCase, input.sourceName, input.browserUserAgent);
  let offset = 0;
  while (offset < input.samples.length) {
    const end = Math.min(input.samples.length, offset + 512);
    run.pushFrame({ samples: input.samples.subarray(offset, end), sampleRate: input.sampleRate, startSample: offset });
    offset = end;
  }
  return run.finish();
}

function buildStages(
  sampleCount: number,
  levels: { rms: number; peak: number; clippedRate: number },
  hadLock: boolean,
  lockedFrequencyHz: number | null,
  timingLearned: boolean,
  snapshot: AcquiringCwSnapshot,
  metrics: ReturnType<typeof compareRawText> | null
): VerificationStageResult[] {
  const inputStatus = !sampleCount || levels.peak < 0.002 ? 'fail' : levels.clippedRate > 0.01 ? 'warning' : 'pass';
  return [
    stage('input', 'Audio input', inputStatus,
      inputStatus === 'pass' ? 'Audio was heard' : inputStatus === 'warning' ? 'Audio was heard but clipped' : 'No usable audio was heard',
      `Peak ${(levels.peak * 100).toFixed(1)}%; average ${(levels.rms * 100).toFixed(1)}%.`),
    stage('tone', 'Tone', lockedFrequencyHz === null ? 'fail' : 'pass',
      lockedFrequencyHz === null ? 'No CW tone was found' : `Tone found near ${Math.round(lockedFrequencyHz)} Hz`,
      'The production scanner searched the configured CW pitch range.'),
    stage('lock', 'Signal lock', hadLock ? 'pass' : 'fail',
      hadLock ? 'The tone was locked' : 'The signal never reached a stable lock',
      snapshot.acquisition.transitionReason),
    stage('timing', 'Timing', timingLearned ? 'pass' : 'fail',
      timingLearned ? `Timing learned near ${Math.round(snapshot.timing.characterWordsPerMinute)} WPM` : 'Morse timing was not learned',
      `Timing confidence ${Math.round(snapshot.timing.confidence * 100)}%.`),
    stage('decode', 'Raw decode', snapshot.rawText.length ? 'pass' : 'fail',
      snapshot.rawText.length ? `${snapshot.rawText.length} raw characters decoded` : 'No characters were decoded',
      snapshot.rawText || 'The decoder produced no raw text.'),
    metrics
      ? stage('match', 'Expected match', metrics.exact ? 'pass' : 'fail',
        metrics.exact ? 'Raw text matched exactly' : `${metrics.characterErrors} character error${metrics.characterErrors === 1 ? '' : 's'}`,
        `CER ${(metrics.characterErrorRate * 100).toFixed(1)}%; WER ${(metrics.wordErrorRate * 100).toFixed(1)}%.`)
      : stage('match', 'Expected match', 'not-run', 'No expected text supplied',
        'The raw decode is shown, but accuracy cannot be claimed without a reference.')
  ];
}

function stage(
  id: VerificationStageId, label: string, status: VerificationStageResult['status'], summary: string, detail: string
): VerificationStageResult {
  return { id, label, status, summary, detail };
}

function recommendationFor(firstFailed: VerificationStageId | null): string {
  if (firstFailed === 'input') return 'Choose a valid recording with audible CW. Very quiet or empty audio cannot be tested.';
  if (firstFailed === 'tone') return 'Check that the recording contains a steady CW pitch between 300 and 1200 Hz.';
  if (firstFailed === 'lock') return 'Reduce competing tones or try a cleaner recording so the CW pitch can remain stable.';
  if (firstFailed === 'timing') return 'Use a longer sample with several complete letters and clear spaces.';
  if (firstFailed === 'decode') return 'A tone was found, but no complete Morse characters were recovered. Inspect pitch and timing details.';
  if (firstFailed === 'match') return 'Compare the highlighted raw differences. The score never uses edited text or context suggestions.';
  return 'Every requested verification stage passed. This result does not test room acoustics or the microphone.';
}

function meanConfidence(snapshot: AcquiringCwSnapshot): number {
  return snapshot.characters.length
    ? snapshot.characters.reduce((sum, item) => sum + item.confidence, 0) / snapshot.characters.length
    : 0;
}

function addDeterministicNoise(samples: Float32Array, amplitude: number, seed: number): void {
  let state = seed >>> 0;
  for (let index = 0; index < samples.length; index += 1) {
    state = ((1_664_525 * state) + 1_013_904_223) >>> 0;
    samples[index] += (((state / 0xffff_ffff) * 2) - 1) * amplitude;
  }
}

function addSteadyTone(
  samples: Float32Array, frequencyHz: number, amplitude: number, sampleRate: number,
  start = 0, end = samples.length
): void {
  for (let index = start; index < end; index += 1) {
    samples[index] += amplitude * Math.sin((2 * Math.PI * frequencyHz * index) / sampleRate);
  }
}

function concatenate(parts: readonly Float32Array[]): Float32Array {
  const result = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
