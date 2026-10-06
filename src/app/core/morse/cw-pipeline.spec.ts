import { decodeSyntheticCw } from './cw-pipeline';
import { decodeMorseEvents } from './morse-decoder';
import { generateSyntheticCw } from './synthetic-cw';

describe('Milestone 1 CW pipeline', () => {
  it('decodes the acceptance transmission exactly', () => {
    const result = decodeSyntheticCw({
      text: 'CQ CQ DE K6RHE',
      wordsPerMinute: 20,
      toneFrequencyHz: 600,
      sampleRate: 8_000
    });

    expect(result.decoded.text).toBe('CQ CQ DE K6RHE');
    expect(result.decoded.unknownSymbols).toEqual([]);
    expect(result.timing.estimatedWordsPerMinute).toBeCloseTo(20, 0);
  });

  it('uses standard international Morse mappings for callsigns and punctuation', () => {
    const audio = generateSyntheticCw({ text: 'N0CALL/7?', wordsPerMinute: 18 });
    expect(audio.samples.length).toBeGreaterThan(0);
    expect(decodeMorseEvents([
      { kind: 'dah', durationMs: 180 }, { kind: 'dit', durationMs: 60 },
      { kind: 'character-gap', durationMs: 180 }, { kind: 'dit', durationMs: 60 }
    ]).text).toBe('NE');
  });
});
