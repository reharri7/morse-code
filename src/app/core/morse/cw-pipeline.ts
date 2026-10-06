import { classifyCwTiming } from './timing-classifier';
import { decodeMorseEvents } from './morse-decoder';
import { GoertzelToneDetector } from './goertzel-tone-detector';
import { CwAudio, DecodeResult, SyntheticCwOptions, TimingClassification, ToneSegment } from './interfaces';
import { generateSyntheticCw } from './synthetic-cw';

export interface CwPipelineResult {
  readonly audio: CwAudio;
  readonly toneSegments: readonly ToneSegment[];
  readonly timing: TimingClassification;
  readonly decoded: DecodeResult;
}

/** Milestone 1 reference composition. Future input adapters feed this raw pipeline. */
export function decodeSyntheticCw(options: SyntheticCwOptions): CwPipelineResult {
  const audio = generateSyntheticCw(options);
  const detector = new GoertzelToneDetector({ targetFrequencyHz: audio.toneFrequencyHz });
  const toneSegments = detector.detect(audio.samples, audio.sampleRate);
  const timing = classifyCwTiming(toneSegments, audio.unitDurationMs);
  return { audio, toneSegments, timing, decoded: decodeMorseEvents(timing.events) };
}
