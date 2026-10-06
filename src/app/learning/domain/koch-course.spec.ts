import { activeKochSymbols, INTERNATIONAL_RECEIVE_COURSE_V1, validateKochCourse } from './koch-course';

describe('international receive Koch course', () => {
  it('uses the versioned K/M-first order and covers every letter and number once', () => {
    expect(INTERNATIONAL_RECEIVE_COURSE_V1.id).toBe('international-receive');
    expect(INTERNATIONAL_RECEIVE_COURSE_V1.version).toBe(1);
    expect(INTERNATIONAL_RECEIVE_COURSE_V1.initialSymbolCount).toBe(2);
    expect(INTERNATIONAL_RECEIVE_COURSE_V1.symbolOrder.slice(0, 2)).toEqual(['K', 'M']);
    expect(INTERNATIONAL_RECEIVE_COURSE_V1.symbolOrder.length).toBe(36);
    expect(new Set(INTERNATIONAL_RECEIVE_COURSE_V1.symbolOrder).size).toBe(36);
    expect(() => validateKochCourse(INTERNATIONAL_RECEIVE_COURSE_V1)).not.toThrow();
  });

  it('returns only the active prefix and rejects invalid levels', () => {
    expect(activeKochSymbols(3)).toEqual(['K', 'M', 'U']);
    expect(() => activeKochSymbols(1)).toThrowError(/outside the course bounds/);
    expect(() => activeKochSymbols(37)).toThrowError(/outside the course bounds/);
  });

  it('rejects a duplicate or punctuation-bearing course definition', () => {
    expect(() => validateKochCourse({
      ...INTERNATIONAL_RECEIVE_COURSE_V1,
      symbolOrder: ['K', 'K']
    })).toThrowError(/duplicate/);
    expect(() => validateKochCourse({
      ...INTERNATIONAL_RECEIVE_COURSE_V1,
      symbolOrder: ['K', '?']
    })).toThrowError(/letter or number/);
  });
});
