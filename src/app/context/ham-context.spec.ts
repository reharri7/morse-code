import { analyzeHamContext } from './ham-context';

describe('analyzeHamContext', () => {
  it('recognizes operating terms and callsign shapes without changing the raw text', () => {
    const raw = 'CQ CQ DE K6RHE K';
    const annotations = analyzeHamContext(raw);

    expect(raw).toBe('CQ CQ DE K6RHE K');
    expect(annotations.filter((item) => item.sourceText === 'CQ').length).toBe(2);
    expect(annotations.find((item) => item.sourceText === 'K6RHE')?.kind).toBe('callsign');
    expect(annotations.find((item) => item.sourceText === 'K')?.displayText).toBe('<K>');
  });

  it('offers 5NN expansion only as an explicit edited-copy proposal', () => {
    const [annotation] = analyzeHamContext('5NN');
    expect(annotation.sourceText).toBe('5NN');
    expect(annotation.replacement).toBe('599');
  });

  it('does not invent context for arbitrary or uncertain text', () => {
    expect(analyzeHamContext('HELLO ? WORLD')).toEqual([]);
  });
});
