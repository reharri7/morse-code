import { compileMorseTimeline } from '../../core/morse/morse-timing';
import { COMMON_WORD_CORPUS_V1 } from '../data/common-words';
import { INTERNATIONAL_RECEIVE_COURSE_V1 } from './koch-course';
import {
  eligiblePracticeWords,
  encodePracticeGroups,
  generateRandomGroups,
  generateWordExercises
} from './practice-content';

describe('M10 practice content', () => {
  it('generates reproducible groups using unlocked symbols only', () => {
    const options = { currentSymbolCount: 6, groupCount: 8, groupLength: 5, seed: 'groups-v1' };
    const first = generateRandomGroups(options);
    expect(first).toEqual(generateRandomGroups(options));
    expect(first.every((group) => group.length === 5)).toBeTrue();
    const active = new Set(INTERNATIONAL_RECEIVE_COURSE_V1.symbolOrder.slice(0, 6));
    expect(first.every((group) => [...group].every((symbol) => active.has(symbol)))).toBeTrue();
  });

  it('encodes character gaps within groups and word gaps between groups', () => {
    const timeline = compileMorseTimeline(encodePracticeGroups(['KM', 'MK']), {
      characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600
    });
    expect(timeline.segments.filter((segment) => segment.role === 'character-gap').length).toBe(2);
    expect(timeline.segments.filter((segment) => segment.role === 'word-gap').length).toBe(1);
  });

  it('filters the versioned local word corpus to the unlocked alphabet', () => {
    expect(COMMON_WORD_CORPUS_V1.license).toBe('CC0-1.0');
    const eligible = eligiblePracticeWords(14);
    const allowed = new Set(INTERNATIONAL_RECEIVE_COURSE_V1.symbolOrder.slice(0, 14));
    expect(eligible.length).toBeGreaterThan(0);
    expect(eligible.every((word) => [...word].every((symbol) => allowed.has(symbol)))).toBeTrue();
    expect(eligiblePracticeWords(2)).toEqual([]);
  });

  it('selects eligible words reproducibly without immediate repeats', () => {
    const first = generateWordExercises({ currentSymbolCount: 20, count: 40, seed: 73 });
    expect(first).toEqual(generateWordExercises({ currentSymbolCount: 20, count: 40, seed: 73 }));
    expect(first.length).toBe(40);
    expect(first.every((word, index) => index === 0 || word !== first[index - 1])).toBeTrue();
  });

  it('validates group bounds and returns no words when none are eligible', () => {
    expect(() => generateRandomGroups({ currentSymbolCount: 2, groupCount: 1, groupLength: 1, seed: 1 }))
      .toThrowError(/Group length/);
    expect(generateWordExercises({ currentSymbolCount: 2, count: 10, seed: 1 })).toEqual([]);
  });
});
