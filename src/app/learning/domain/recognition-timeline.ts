import { encodeMorseText } from '../../core/morse/morse-sequence';
import { compileMorseTimeline } from '../../core/morse/morse-timing';
import { MorseTimeline, MorseTimingProfile } from '../../core/morse/morse-timeline';

/**
 * Compiles one recognition prompt plus its inter-character thinking space.
 * The boundary is derived from the same two-symbol timeline used everywhere
 * else, so standard and Farnsworth spacing cannot diverge in training.
 */
export function compileRecognitionPromptTimeline(
  symbolId: string,
  profile: MorseTimingProfile
): MorseTimeline {
  const character = compileMorseTimeline(encodeMorseText(symbolId), profile);
  const paired = compileMorseTimeline(encodeMorseText(`${symbolId}${symbolId}`), profile);
  const boundary = paired.segments[character.segments.length];
  if (!boundary || boundary.role !== 'character-gap') {
    throw new Error('Recognition prompt could not derive a character boundary.');
  }
  const segments = Object.freeze([...character.segments, boundary]);
  return Object.freeze({
    segments,
    durationMs: segments.reduce((total, segment) => total + segment.durationMs, 0),
    timing: character.timing
  });
}
