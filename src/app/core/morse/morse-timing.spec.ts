import { MORSE_BY_CHARACTER, MORSE_SYMBOLS, getMorseSymbolDefinition } from './morse-table';
import { decodeSyntheticCw } from './cw-pipeline';
import { encodeMorseText } from './morse-sequence';
import { compileMorseTimeline, resolveMorseTiming, timingProfileFromLegacySpacingWpm } from './morse-timing';
import { generateSyntheticCw } from './synthetic-cw';

describe('shared Morse representation and timing', () => {
  it('exposes one reversible, categorized catalog for every supported symbol', () => {
    expect(MORSE_SYMBOLS.length).toBe(Object.keys(MORSE_BY_CHARACTER).length);
    expect(new Set(MORSE_SYMBOLS.map((symbol) => symbol.id)).size).toBe(MORSE_SYMBOLS.length);
    expect(new Set(MORSE_SYMBOLS.map((symbol) => symbol.pattern)).size).toBe(MORSE_SYMBOLS.length);

    for (const symbol of MORSE_SYMBOLS) {
      expect(getMorseSymbolDefinition(symbol.id).pattern).toBe(MORSE_BY_CHARACTER[symbol.id]);
      expect(['letter', 'number', 'punctuation', 'prosign']).toContain(symbol.category);
    }
  });

  it('round-trips every supported catalog symbol through shared generation and decoding', () => {
    const text = MORSE_SYMBOLS.map((symbol) => symbol.id).join('');
    const result = decodeSyntheticCw({
      text, wordsPerMinute: 20, toneFrequencyHz: 600, sampleRate: 8_000
    });
    expect(result.decoded.text).toBe(text);
    expect(result.decoded.unknownSymbols).toEqual([]);
  });

  it('normalizes text into canonical symbols and explicit boundaries', () => {
    const sequence = encodeMorseText('  cQ\n de  ');
    expect(sequence.normalizedText).toBe('CQ DE');
    expect(sequence.symbolCount).toBe(4);
    expect(sequence.tokens).toEqual([
      { kind: 'symbol', symbolId: 'C' },
      { kind: 'character-boundary' },
      { kind: 'symbol', symbolId: 'Q' },
      { kind: 'word-boundary' },
      { kind: 'symbol', symbolId: 'D' },
      { kind: 'character-boundary' },
      { kind: 'symbol', symbolId: 'E' }
    ]);
    expect(() => encodeMorseText('OK_')).toThrowError('Unsupported Morse character: _');
  });

  it('compiles standard 1/3/7 timing without browser or Angular dependencies', () => {
    const timeline = compileMorseTimeline(encodeMorseText('ET E'), {
      characterWpm: 20, effectiveWpm: 20, toneFrequencyHz: 600
    });

    expect(timeline.timing.elementUnitMs).toBeCloseTo(60, 10);
    expect(timeline.timing.spacingUnitMs).toBeCloseTo(60, 10);
    expect(timeline.segments.map(({ role, durationMs }) => [role, durationMs])).toEqual([
      ['dit', 60],
      ['character-gap', 180],
      ['dah', 180],
      ['word-gap', 420],
      ['dit', 60]
    ]);
  });

  it('uses true PARIS effective WPM by expanding only character and word boundaries', () => {
    const timing = resolveMorseTiming({ characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600 });
    const expectedSpacingUnitMs = (6_000 - (31 * 60)) / 19;
    expect(timing.elementUnitMs).toBeCloseTo(60, 10);
    expect(timing.spacingUnitMs).toBeCloseTo(expectedSpacingUnitMs, 10);

    const timeline = compileMorseTimeline(encodeMorseText('EE E'), timing.profile);
    expect(timeline.segments.filter((segment) => segment.role === 'dit').every((segment) => segment.durationMs === 60)).toBeTrue();
    expect(timeline.segments.find((segment) => segment.role === 'character-gap')?.durationMs)
      .toBeCloseTo(3 * expectedSpacingUnitMs, 10);
    expect(timeline.segments.find((segment) => segment.role === 'word-gap')?.durationMs)
      .toBeCloseTo(7 * expectedSpacingUnitMs, 10);
  });

  it('preserves the legacy spacing-unit generator contract exactly', () => {
    const profile = timingProfileFromLegacySpacingWpm(18, 8, 600);
    const resolved = resolveMorseTiming(profile);
    expect(resolved.elementUnitMs).toBeCloseTo(1_200 / 18, 10);
    expect(resolved.spacingUnitMs).toBeCloseTo(150, 10);

    const audio = generateSyntheticCw({
      text: 'EE E', wordsPerMinute: 18, spacingWordsPerMinute: 8,
      toneFrequencyHz: 600, sampleRate: 8_000
    });
    const elementSamples = Math.round((1.2 * 8_000) / 18);
    const spacingSamples = Math.round((1.2 * 8_000) / 8);
    expect(audio.samples.length).toBe((3 * elementSamples) + (10 * spacingSamples));
  });

  it('rejects invalid or impossible timing profiles', () => {
    expect(() => resolveMorseTiming({ characterWpm: 0, effectiveWpm: 10, toneFrequencyHz: 600 }))
      .toThrowError(/Character WPM/);
    expect(() => resolveMorseTiming({ characterWpm: 20, effectiveWpm: 21, toneFrequencyHz: 600 }))
      .toThrowError(/cannot exceed/);
    expect(() => resolveMorseTiming({ characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: Number.NaN }))
      .toThrowError(/Tone frequency/);
  });
});
