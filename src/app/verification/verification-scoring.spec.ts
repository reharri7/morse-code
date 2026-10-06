import { compareRawText } from '../core/morse/cw-benchmark';

describe('verification raw-text scoring', () => {
  it('scores an exact raw match without normalization', () => {
    const result = compareRawText('CQ DE K1ABC', 'CQ DE K1ABC');
    expect(result.exact).toBeTrue();
    expect(result.characterErrorRate).toBe(0);
    expect(result.wordErrorRate).toBe(0);
    expect(result.characterDiff.every((item) => item.kind === 'match')).toBeTrue();
  });

  it('aligns substitutions, insertions, deletions, and unknown characters', () => {
    const substitution = compareRawText('ABC', 'A?C');
    const insertion = compareRawText('AC', 'ABC');
    const deletion = compareRawText('ABC', 'AC');
    expect(substitution.characterErrors).toBe(1);
    expect(substitution.unknownSymbolCount).toBe(1);
    expect(substitution.characterDiff.some((item) => item.kind === 'substitution')).toBeTrue();
    expect(insertion.characterDiff.some((item) => item.kind === 'insertion')).toBeTrue();
    expect(deletion.characterDiff.some((item) => item.kind === 'deletion')).toBeTrue();
  });

  it('handles empty expected and actual values explicitly', () => {
    expect(compareRawText('', '').exact).toBeTrue();
    expect(compareRawText('', 'A').characterErrorRate).toBe(1);
    expect(compareRawText('A', '').characterErrorRate).toBe(1);
  });
});

