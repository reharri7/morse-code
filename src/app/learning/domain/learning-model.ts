import { MorseTimelineSegment } from '../../core/morse/morse-timeline';

export type MorseSymbolId = string;
export type TrainingSessionLength = 20 | 40 | 60;

export interface KochCourse {
  readonly id: 'international-receive';
  readonly version: 1;
  readonly symbolOrder: readonly MorseSymbolId[];
  readonly initialSymbolCount: 2;
}

export type TrainingSessionState =
  | 'idle'
  | 'preparing'
  | 'playing'
  | 'awaiting-answer'
  | 'showing-feedback'
  | 'paused'
  | 'complete'
  | 'error';

export interface TrainingSettings {
  readonly characterWpm: number;
  readonly effectiveWpm: number;
  readonly toneFrequencyHz: number;
  readonly sessionLength: TrainingSessionLength;
}

export const DEFAULT_TRAINING_SETTINGS: TrainingSettings = Object.freeze({
  characterWpm: 20,
  effectiveWpm: 10,
  toneFrequencyHz: 600,
  sessionLength: 40
});

export interface RecognitionTrial {
  readonly id: string;
  readonly ordinal: number;
  readonly expectedSymbolId: MorseSymbolId;
  readonly timeline: readonly MorseTimelineSegment[];
}

export interface RecognitionAttempt {
  readonly trialId: string;
  readonly expectedSymbolId: MorseSymbolId;
  readonly enteredSymbolId: MorseSymbolId | null;
  readonly correct: boolean;
  readonly replayCount: number;
  readonly recognitionLatencyMs: number | null;
  readonly answeredAt: string;
}

export interface CharacterStatistics {
  readonly symbolId: MorseSymbolId;
  readonly attempts: number;
  readonly correct: number;
  readonly unassistedAttempts: number;
  readonly unassistedCorrect: number;
  readonly replayCount: number;
  readonly latencyTotalMs: number;
  readonly latencySampleCount: number;
  readonly rollingUnassistedResults: readonly boolean[];
  readonly rollingRecognitionLatenciesMs: readonly number[];
  readonly confusions: Readonly<Record<MorseSymbolId, number>>;
  readonly lastPracticedAt: string | null;
}

export interface LearningSessionSummary {
  readonly id: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly courseId: string;
  readonly courseVersion: number;
  readonly level: number;
  readonly settings: TrainingSettings;
  readonly attempts: number;
  readonly correct: number;
  readonly unassistedAccuracy: number | null;
  readonly meanRecognitionLatencyMs: number | null;
  readonly introducedSymbolId: MorseSymbolId | null;
}

export interface RecentUnassistedAttempt {
  readonly symbolId: MorseSymbolId;
  readonly correct: boolean;
  readonly answeredAt: string;
}

export interface LearnerProfileV1 {
  readonly schemaVersion: 1;
  readonly courseId: string;
  readonly courseVersion: number;
  readonly currentSymbolCount: number;
  readonly settings: TrainingSettings;
  readonly characters: Readonly<Record<MorseSymbolId, CharacterStatistics>>;
  readonly recentUnassistedAttempts: readonly RecentUnassistedAttempt[];
  readonly recentSessions: readonly LearningSessionSummary[];
  readonly updatedAt: string;
}
