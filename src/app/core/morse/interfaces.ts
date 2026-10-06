/**
 * Types shared by the CW DSP pipeline.  They deliberately have no Angular or
 * browser dependencies so the same decoder can run in tests, an AudioWorklet,
 * or a future server-free mobile build.
 */

export interface CwAudio {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly toneFrequencyHz: number;
  readonly unitDurationMs: number;
}

/** A bounded, monotonically positioned PCM block supplied by an input adapter. */
export interface PcmFrame {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly startSample: number;
}

export interface SyntheticCwOptions {
  readonly text: string;
  readonly wordsPerMinute?: number;
  /** Optional spacing speed for deterministic Farnsworth fixtures. */
  readonly spacingWordsPerMinute?: number;
  /** Deterministic per-section variation in [0, 0.45]. */
  readonly timingJitterFraction?: number;
  /** Linear audio-pitch change from the first sample to the last. */
  readonly frequencyDriftHz?: number;
  /** Deterministic slow fading depth in [0, 0.95]. */
  readonly fadingDepth?: number;
  readonly fadingCycles?: number;
  readonly toneFrequencyHz?: number;
  readonly sampleRate?: number;
  readonly amplitude?: number;
}

export type ToneState = 'tone' | 'silence';

export interface ToneSegment {
  readonly state: ToneState;
  readonly startSample: number;
  readonly endSample: number;
  readonly sampleRate: number;
  readonly averagePower: number;
}

export interface ToneDetector {
  detect(samples: Float32Array, sampleRate: number): ToneSegment[];
}

export type TimingEventKind = 'dit' | 'dah' | 'character-gap' | 'word-gap';

export interface TimingEvent {
  readonly kind: TimingEventKind;
  readonly durationMs: number;
  /** Timing-only confidence in [0, 1]; absent on legacy/reference events. */
  readonly confidence?: number;
  /** Relative distance from the selected 1/3/7-unit timing target. */
  readonly residual?: number;
  readonly reasons?: readonly string[];
}

export interface TimingClassification {
  readonly events: TimingEvent[];
  readonly estimatedDitDurationMs: number;
  readonly estimatedWordsPerMinute: number;
}

export interface DecodeResult {
  readonly text: string;
  readonly unknownSymbols: readonly string[];
  readonly characters: readonly DecodedCharacterEvidence[];
}

export interface DecodedCharacterEvidence {
  readonly character: string;
  readonly morse: string;
  readonly confidence: number;
  readonly reasons: readonly string[];
}
