import { AcquiringCwDecoder, AcquiringCwSnapshot } from '../core/morse/acquiring-cw-decoder';
import { CwBenchmarkObservation } from '../core/morse/cw-benchmark';
import { PcmFrame } from '../core/morse/interfaces';
import { generateSyntheticCw } from '../core/morse/synthetic-cw';
import { AcquisitionState } from '../core/morse/tone-acquisition';

export interface RfChannelCondition {
  readonly whiteNoiseAmplitude?: number;
  readonly dcOffset?: number;
  readonly humFrequencyHz?: number;
  readonly humAmplitude?: number;
  readonly impulseEverySamples?: number;
  readonly impulseAmplitude?: number;
  readonly adjacentToneFrequencyHz?: number;
  readonly adjacentToneAmplitude?: number;
  readonly seed?: number;
}

export interface RfFixtureDefinition {
  readonly id: string;
  readonly referenceText: string;
  readonly sourceType: 'deterministic-synthetic';
  readonly sampleRate: number;
  readonly toneFrequencyHz: number;
  readonly frequencyDriftHz?: number;
  readonly wordsPerMinute: number;
  readonly amplitude: number;
  readonly fadingDepth?: number;
  readonly fadingCycles?: number;
  readonly outageAfterText?: string;
  readonly outageDurationMs?: number;
  readonly resumeToneFrequencyHz?: number;
  readonly acceptedToneFrequenciesHz?: readonly number[];
  readonly condition: RfChannelCondition;
  readonly license: string;
  readonly tags: readonly string[];
}

export function runRfFixture(fixture: RfFixtureDefinition): CwBenchmarkObservation {
  const samples = renderRfFixture(fixture);
  const session = new AcquiringCwDecoder({
    minFrequencyHz: 400,
    maxFrequencyHz: 1_000,
    frequencyStepHz: 10,
    detectorFrameSize: 128,
    minimumPower: 0.000001,
    minimumSnrDb: 5,
    trackingRangeHz: 90
  });
  let offset = 0;
  let previousState: AcquisitionState = 'searching';
  let acquisitionTimeMs: number | null = null;
  let falseLockCount = 0;
  let lockLossCount = 0;
  let lockRecoveryCount = 0;
  let lossPending = false;
  let snapshot = session.snapshot();
  while (offset < samples.length) {
    const end = Math.min(samples.length, offset + 512);
    const frame: PcmFrame = { samples: samples.slice(offset, end), sampleRate: fixture.sampleRate, startSample: offset };
    snapshot = session.pushFrame(frame);
    const state = snapshot.acquisition.state;
    if (state === 'locked' && previousState !== 'locked') {
      if (acquisitionTimeMs === null) acquisitionTimeMs = (end / fixture.sampleRate) * 1_000;
      if (lossPending) {
        lockRecoveryCount += 1;
        lossPending = false;
      }
      const expectedFrequencies = fixture.acceptedToneFrequenciesHz ?? [
        fixture.toneFrequencyHz + ((fixture.frequencyDriftHz ?? 0) * (end / Math.max(1, samples.length)))
      ];
      if (snapshot.acquisition.lockedFrequencyHz === null ||
        expectedFrequencies.every((frequency) =>
          Math.abs((snapshot.acquisition.lockedFrequencyHz as number) - frequency) > 55
        )) {
        falseLockCount += 1;
      }
    }
    if (state === 'lost' && previousState !== 'lost') {
      lockLossCount += 1;
      lossPending = true;
    }
    previousState = state;
    offset = end;
  }
  snapshot = session.flush();
  return {
    rawText: snapshot.rawText,
    unknownSymbolCount: snapshot.unknownSymbols.length,
    acquisitionTimeMs,
    falseLockCount,
    lockLossCount,
    lockRecoveryCount,
    meanCharacterConfidence: snapshot.characters.length
      ? snapshot.characters.reduce((sum, character) => sum + character.confidence, 0) / snapshot.characters.length
      : 0
  };
}

export function renderRfFixture(fixture: RfFixtureDefinition): Float32Array {
  const render = (text: string, toneFrequencyHz: number) => generateSyntheticCw({
    text,
    wordsPerMinute: fixture.wordsPerMinute,
    toneFrequencyHz,
    frequencyDriftHz: fixture.frequencyDriftHz,
    sampleRate: fixture.sampleRate,
    amplitude: fixture.amplitude,
    fadingDepth: fixture.fadingDepth,
    fadingCycles: fixture.fadingCycles
  }).samples;
  let source: Float32Array;
  if (fixture.outageAfterText && fixture.outageDurationMs) {
    const remainingText = fixture.referenceText.slice(fixture.outageAfterText.length).trim();
    const first = render(fixture.outageAfterText, fixture.toneFrequencyHz);
    const outage = new Float32Array(Math.round((fixture.outageDurationMs / 1_000) * fixture.sampleRate));
    const second = render(remainingText, fixture.resumeToneFrequencyHz ?? fixture.toneFrequencyHz);
    source = concatenate([first, outage, second]);
  } else {
    source = render(fixture.referenceText, fixture.toneFrequencyHz);
  }
  const output = new Float32Array(source.length);
  const condition = fixture.condition;
  let randomState = (condition.seed ?? 1) >>> 0;
  let adjacentPhase = 0;
  for (let index = 0; index < output.length; index += 1) {
    randomState = ((1_664_525 * randomState) + 1_013_904_223) >>> 0;
    const whiteNoise = (((randomState / 0xffff_ffff) * 2) - 1) * (condition.whiteNoiseAmplitude ?? 0);
    const hum = (condition.humAmplitude ?? 0) * Math.sin(
      (2 * Math.PI * (condition.humFrequencyHz ?? 60) * index) / fixture.sampleRate
    );
    let adjacent = 0;
    if (condition.adjacentToneFrequencyHz && condition.adjacentToneAmplitude) {
      adjacent = condition.adjacentToneAmplitude * Math.sin(adjacentPhase);
      adjacentPhase += (2 * Math.PI * condition.adjacentToneFrequencyHz) / fixture.sampleRate;
    }
    const impulse = condition.impulseEverySamples && index > 0 && index % condition.impulseEverySamples === 0
      ? (condition.impulseAmplitude ?? 0)
      : 0;
    output[index] = source[index] + whiteNoise + hum + adjacent + impulse + (condition.dcOffset ?? 0);
  }
  return output;
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

export function asFixtureDefinitions(value: unknown): readonly RfFixtureDefinition[] {
  const manifest = value as { readonly fixtures?: readonly RfFixtureDefinition[] };
  if (!manifest.fixtures?.length) throw new Error('RF fixture manifest must contain labeled fixtures.');
  return manifest.fixtures;
}
