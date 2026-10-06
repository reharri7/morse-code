import { activeKochSymbols } from './koch-course';
import { buildCopyComparison, generateFreeCopyPassage } from './free-copy';

describe('free copy domain', () => {
  it('generates reproducible longer passages from unlocked words', () => {
    const first = generateFreeCopyPassage({ currentSymbolCount: 36, wordCount: 8, seed: 'free' });
    const second = generateFreeCopyPassage({ currentSymbolCount: 36, wordCount: 8, seed: 'free' });
    const allowed = new Set(activeKochSymbols(36));
    expect(first).toBe(second);
    expect(first?.split(' ').length).toBe(8);
    expect([...(first ?? '').replaceAll(' ', '')].every((symbol) => allowed.has(symbol))).toBeTrue();
  });

  it('keeps reference scoring separate from decoder alignment', () => {
    const result = buildCopyComparison({
      userCopy: 'CQ DE K1ABC', referenceText: 'CQ DE K1ABC', rawDecoderText: 'CQ DE K?ABC',
      characters: [{ character: '?', morse: '..--', confidence: 0.2, reasons: ['ambiguous'] }],
      timingConfidence: 0.35
    });
    expect(result.basis).toBe('reference');
    expect(result.referenceScore?.correct).toBeTrue();
    expect(result.decoderAlignment?.correct).toBeFalse();
    expect(result.decoderConfidence).toBe(0.2);
  });

  it('never scores uncertain decoder output as ground truth without a reference', () => {
    const result = buildCopyComparison({ userCopy: 'CQ', rawDecoderText: 'C?' });
    expect(result.basis).toBe('decoder-unscored');
    expect(result.referenceScore).toBeNull();
    expect(result.explanation).toContain('informational only');
  });
});
