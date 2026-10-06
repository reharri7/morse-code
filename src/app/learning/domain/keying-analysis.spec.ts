import { analyzeKeyingAttempt } from './keying-analysis';

describe('straight-key analysis', () => {
  it('recognizes an accurately sent K at the requested speed', () => {
    const result = analyzeKeyingAttempt('K', [
      { downAtMs: 0, upAtMs: 180 },
      { downAtMs: 240, upAtMs: 300 },
      { downAtMs: 360, upAtMs: 540 }
    ], 20);

    expect(result.sentPattern).toBe('-.-');
    expect(result.decodedSymbolId).toBe('K');
    expect(result.patternCorrect).toBeTrue();
    expect(result.rhythmScore).toBe(100);
    expect(result.passed).toBeTrue();
  });

  it('reports the character that an incorrect pattern resembles', () => {
    const result = analyzeKeyingAttempt('K', [
      { downAtMs: 0, upAtMs: 60 },
      { downAtMs: 120, upAtMs: 180 },
      { downAtMs: 240, upAtMs: 420 }
    ], 20);

    expect(result.sentPattern).toBe('..-');
    expect(result.decodedSymbolId).toBe('U');
    expect(result.patternCorrect).toBeFalse();
    expect(result.passed).toBeFalse();
    expect(result.guidance).toContain('reads as U');
  });

  it('separates recognizable content from poor timing and rejects malformed traces', () => {
    const slow = analyzeKeyingAttempt('M', [
      { downAtMs: 0, upAtMs: 300 },
      { downAtMs: 450, upAtMs: 750 }
    ], 20);

    expect(slow.patternCorrect).toBeTrue();
    expect(slow.rhythmScore).toBeLessThan(70);
    expect(slow.passed).toBeFalse();
    expect(analyzeKeyingAttempt('E', [], 20).decodedSymbolId).toBeNull();
    expect(() => analyzeKeyingAttempt('K', [{ downAtMs: 10, upAtMs: 5 }], 20)).toThrowError(/positive/);
  });
});
