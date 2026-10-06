import { DecodedCharacterEvidence } from '../../core/morse/interfaces';
import { CopyScore, normalizeCopyText, scoreCopyText } from './copy-scoring';
import { generateWordExercises } from './practice-content';

export interface FreeCopyPassageOptions {
  readonly currentSymbolCount: number;
  readonly wordCount: number;
  readonly seed: string | number;
}

export function generateFreeCopyPassage(options: FreeCopyPassageOptions): string | null {
  if (!Number.isInteger(options.wordCount) || options.wordCount < 4 || options.wordCount > 16) {
    throw new Error('Free-copy word count must be an integer between 4 and 16.');
  }
  const words = generateWordExercises({
    currentSymbolCount: options.currentSymbolCount,
    count: options.wordCount,
    seed: options.seed
  });
  if (words.length !== options.wordCount) return null;
  const passage = words.join(' ');
  return [...passage.replaceAll(' ', '')].length <= 100 ? passage : words.slice(0, 8).join(' ');
}

export type CopyComparisonBasis = 'reference' | 'decoder-unscored' | 'none';

export interface CopyComparison {
  readonly userCopy: string;
  readonly rawDecoderText: string;
  readonly referenceText: string | null;
  readonly basis: CopyComparisonBasis;
  readonly referenceScore: CopyScore | null;
  readonly decoderAlignment: CopyScore | null;
  readonly decoderConfidence: number | null;
  readonly timingConfidence: number | null;
  readonly explanation: string;
}

export function buildCopyComparison(options: {
  readonly userCopy: string;
  readonly rawDecoderText?: string;
  readonly referenceText?: string;
  readonly characters?: readonly DecodedCharacterEvidence[];
  readonly decoderConfidence?: number | null;
  readonly timingConfidence?: number | null;
}): CopyComparison {
  const userCopy = normalizeCopyText(options.userCopy);
  const rawDecoderText = normalizeCopyText(options.rawDecoderText ?? '');
  const referenceText = normalizeCopyText(options.referenceText ?? '') || null;
  const referenceScore = userCopy && referenceText ? scoreCopyText(referenceText, userCopy) : null;
  const decoderAlignment = userCopy && rawDecoderText ? scoreCopyText(rawDecoderText, userCopy) : null;
  const confidenceValues = (options.characters ?? []).map((item) => item.confidence).filter(Number.isFinite);
  const decoderConfidence = options.decoderConfidence !== undefined && options.decoderConfidence !== null && Number.isFinite(options.decoderConfidence)
    ? Math.max(0, Math.min(1, options.decoderConfidence))
    : confidenceValues.length
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : null;
  const timingConfidence = options.timingConfidence !== undefined && options.timingConfidence !== null && Number.isFinite(options.timingConfidence)
    ? Math.max(0, Math.min(1, options.timingConfidence))
    : null;
  const basis: CopyComparisonBasis = referenceScore ? 'reference' : decoderAlignment ? 'decoder-unscored' : 'none';
  const explanation = referenceScore
    ? 'Accuracy is scored only against the optional reference text.'
    : decoderAlignment
      ? 'The decoder alignment is informational only because uncertain receiver text is not guaranteed truth.'
      : 'Add reference text for accuracy scoring, or receive some raw decoder text for an unscored comparison.';
  return Object.freeze({
    userCopy, rawDecoderText, referenceText, basis, referenceScore, decoderAlignment,
    decoderConfidence, timingConfidence, explanation
  });
}
