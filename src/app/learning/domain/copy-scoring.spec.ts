import { scoreCopyText } from './copy-scoring';

describe('copy scoring', () => {
  it('normalizes case and whitespace for an exact result', () => {
    expect(scoreCopyText('KM UR', ' km   ur ')).toEqual(jasmine.objectContaining({
      enteredText: 'KM UR', correct: true, characterErrors: 0
    }));
  });

  it('records substitutions and deletions against expected characters', () => {
    const score = scoreCopyText('KMUR', 'KMR');
    expect(score.characterErrors).toBe(1);
    expect(score.outcomes.map((item) => item.expectedSymbolId)).toEqual(['K', 'M', 'U', 'R']);
    expect(score.outcomes.filter((item) => !item.correct).length).toBe(1);
    expect(score.outcomes.find((item) => item.expectedSymbolId === 'U')?.enteredSymbolId).toBeNull();
  });

  it('records a confusion substitution without inventing correctness', () => {
    const score = scoreCopyText('KM', 'KU');
    expect(score.outcomes[1]).toEqual({ expectedSymbolId: 'M', enteredSymbolId: 'U', correct: false });
  });
});
