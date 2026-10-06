import { CwRawTextMetrics } from '../core/morse/cw-benchmark';

export type VerificationSourceKind = 'generated' | 'imported-file' | 'portable-clip' | 'acoustic-test';
export type VerificationStageId = 'input' | 'tone' | 'lock' | 'timing' | 'decode' | 'match';
export type VerificationStageStatus = 'pass' | 'warning' | 'fail' | 'not-run';

export interface VerificationCase {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly purpose: string;
  readonly sourceKind: VerificationSourceKind;
  readonly expectedText?: string;
  readonly nominalToneFrequencyHz?: number;
  readonly nominalWordsPerMinute?: number;
  readonly detectorFrameSize?: number;
}

export interface VerificationStageResult {
  readonly id: VerificationStageId;
  readonly label: string;
  readonly status: VerificationStageStatus;
  readonly summary: string;
  readonly detail: string;
}

export interface VerificationObservations {
  readonly browserUserAgent: string | null;
  readonly sampleRate: number;
  readonly sampleCount: number;
  readonly durationSeconds: number;
  readonly rmsLevel: number;
  readonly peakLevel: number;
  readonly clippedSampleRate: number;
  readonly acquiredToneFrequencyHz: number | null;
  readonly acquisitionTimeMs: number | null;
  readonly lockLossCount: number;
  readonly lockRecoveryCount: number;
  readonly characterWordsPerMinute: number;
  readonly effectiveWordsPerMinute: number;
  readonly timingConfidence: number;
  readonly meanCharacterConfidence: number;
}

export interface VerificationResult {
  readonly schemaVersion: 1;
  readonly case: VerificationCase;
  readonly sourceName: string;
  readonly completedAt: string;
  readonly passed: boolean;
  readonly rawText: string;
  readonly expectedText: string | null;
  readonly stages: readonly VerificationStageResult[];
  readonly firstFailedStage: VerificationStageId | null;
  readonly recommendation: string;
  readonly metrics: CwRawTextMetrics | null;
  readonly observations: VerificationObservations;
}

export interface VerificationPcmInput {
  readonly testCase: VerificationCase;
  readonly sourceName: string;
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly browserUserAgent?: string;
}
