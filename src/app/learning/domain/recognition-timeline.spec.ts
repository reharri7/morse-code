import { encodeMorseText } from '../../core/morse/morse-sequence';
import { compileMorseTimeline } from '../../core/morse/morse-timing';
import { MorseTimingProfile } from '../../core/morse/morse-timeline';
import { compileRecognitionPromptTimeline } from './recognition-timeline';

describe('recognition prompt timeline', () => {
  const profiles: readonly MorseTimingProfile[] = [
    { characterWpm: 12, effectiveWpm: 12, toneFrequencyHz: 500 },
    { characterWpm: 12, effectiveWpm: 6, toneFrequencyHz: 500 },
    { characterWpm: 20, effectiveWpm: 20, toneFrequencyHz: 600 },
    { characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600 },
    { characterWpm: 40, effectiveWpm: 40, toneFrequencyHz: 700 },
    { characterWpm: 40, effectiveWpm: 20, toneFrequencyHz: 700 }
  ];

  for (const profile of profiles) {
    it(`uses the shared compiler boundary at ${profile.characterWpm}/${profile.effectiveWpm} WPM`, () => {
      const prompt = compileRecognitionPromptTimeline('K', profile);
      const character = compileMorseTimeline(encodeMorseText('K'), profile);
      const paired = compileMorseTimeline(encodeMorseText('KK'), profile);
      const expectedBoundary = paired.segments[character.segments.length];

      expect(prompt.segments.slice(0, -1)).toEqual(character.segments);
      expect(prompt.segments.at(-1)).toEqual(expectedBoundary);
      expect(prompt.segments.at(-1)).toEqual(jasmine.objectContaining({
        kind: 'silence', role: 'character-gap', timingBasis: 'spacing', unitCount: 3
      }));
      expect(prompt.durationMs).toBeCloseTo(character.durationMs + expectedBoundary.durationMs, 9);
    });
  }

  it('makes Farnsworth thinking space longer without stretching the character', () => {
    const standard = compileRecognitionPromptTimeline('M', {
      characterWpm: 20, effectiveWpm: 20, toneFrequencyHz: 600
    });
    const farnsworth = compileRecognitionPromptTimeline('M', {
      characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600
    });

    expect(farnsworth.segments.slice(0, -1)).toEqual(standard.segments.slice(0, -1));
    expect(farnsworth.segments.at(-1)!.durationMs).toBeGreaterThan(standard.segments.at(-1)!.durationMs);
  });
});
