import { CwAudio, SyntheticCwOptions } from './interfaces';
import { encodeMorseText } from './morse-sequence';
import { compileMorseTimeline, timingProfileFromLegacySpacingWpm } from './morse-timing';

const DEFAULT_WPM = 20;
const DEFAULT_TONE_HZ = 600;
const DEFAULT_SAMPLE_RATE = 8_000;
const DEFAULT_AMPLITUDE = 0.75;

/**
 * Produces deterministic, phase-continuous CW.  Timing uses the PARIS standard:
 * a dit is 1.2 / WPM seconds; inter-element, character and word gaps are 1, 3,
 * and 7 dits respectively.  This is intentionally a clean test source, not a
 * radio-channel simulation.
 */
export function generateSyntheticCw(options: SyntheticCwOptions): CwAudio {
  const wordsPerMinute = options.wordsPerMinute ?? DEFAULT_WPM;
  const spacingWordsPerMinute = options.spacingWordsPerMinute ?? wordsPerMinute;
  const timingJitterFraction = options.timingJitterFraction ?? 0;
  const frequencyDriftHz = options.frequencyDriftHz ?? 0;
  const fadingDepth = options.fadingDepth ?? 0;
  const fadingCycles = options.fadingCycles ?? 2;
  const toneFrequencyHz = options.toneFrequencyHz ?? DEFAULT_TONE_HZ;
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const amplitude = options.amplitude ?? DEFAULT_AMPLITUDE;

  if (!Number.isFinite(sampleRate) || !Number.isFinite(amplitude) || !Number.isFinite(timingJitterFraction) || !Number.isFinite(frequencyDriftHz) || !Number.isFinite(fadingDepth) || !Number.isFinite(fadingCycles) || sampleRate <= 0 || amplitude <= 0 || amplitude > 1 || timingJitterFraction < 0 || timingJitterFraction > 0.45 || fadingDepth < 0 || fadingDepth > 0.95 || fadingCycles <= 0) {
    throw new Error('Synthetic CW options must use positive WPM, frequency, sample rate, and an amplitude in (0, 1].');
  }

  const profile = timingProfileFromLegacySpacingWpm(wordsPerMinute, spacingWordsPerMinute, toneFrequencyHz);
  const sequence = encodeMorseText(options.text);
  if (!sequence.normalizedText) {
    return { samples: new Float32Array(), sampleRate, toneFrequencyHz, unitDurationMs: 1_200 / wordsPerMinute };
  }
  const timeline = compileMorseTimeline(sequence, profile);

  const samplesPerUnit = Math.max(1, Math.round((1.2 * sampleRate) / wordsPerMinute));
  const samplesPerSpacingUnit = Math.max(1, Math.round((1.2 * sampleRate) / spacingWordsPerMinute));
  const sectionLengths = timeline.segments.map((segment, index) => {
    const unitSamples = segment.timingBasis === 'spacing' ? samplesPerSpacingUnit : samplesPerUnit;
    const jitter = timingJitterFraction
      ? 1 + (timingJitterFraction * Math.sin((index + 1) * 2.399963229728653))
      : 1;
    return Math.max(1, Math.round(segment.unitCount * unitSamples * jitter));
  });
  const totalSamples = sectionLengths.reduce((sum, length) => sum + length, 0);
  const samples = new Float32Array(totalSamples);
  let sampleIndex = 0;
  let phase = 0;
  for (let sectionIndex = 0; sectionIndex < timeline.segments.length; sectionIndex += 1) {
    const section = timeline.segments[sectionIndex];
    const sectionSamples = sectionLengths[sectionIndex];
    if (section.kind === 'tone') {
      for (let offset = 0; offset < sectionSamples; offset += 1) {
        const absoluteIndex = sampleIndex + offset;
        const progress = absoluteIndex / Math.max(1, totalSamples - 1);
        const fade = 1 - (fadingDepth * (0.5 + (0.5 * Math.sin(2 * Math.PI * fadingCycles * progress))));
        samples[absoluteIndex] = amplitude * fade * Math.sin(phase);
        phase += (2 * Math.PI * (toneFrequencyHz + (frequencyDriftHz * progress))) / sampleRate;
      }
    } else {
      for (let offset = 0; offset < sectionSamples; offset += 1) {
        const progress = (sampleIndex + offset) / Math.max(1, totalSamples - 1);
        phase += (2 * Math.PI * (toneFrequencyHz + (frequencyDriftHz * progress))) / sampleRate;
      }
    }
    sampleIndex += sectionSamples;
  }

  return { samples, sampleRate, toneFrequencyHz, unitDurationMs: (samplesPerUnit / sampleRate) * 1_000 };
}
