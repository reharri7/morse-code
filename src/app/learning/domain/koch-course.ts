import { getMorseSymbolDefinition } from '../../core/morse/morse-table';
import { KochCourse, MorseSymbolId } from './learning-model';

const COURSE_ORDER = 'K M U R E S N A P T L W I J Z F O Y V G 5 Q 9 2 H 3 8 B 4 7 C 1 D 6 0 X'.split(' ');

export const INTERNATIONAL_RECEIVE_COURSE_V1: KochCourse = Object.freeze({
  id: 'international-receive',
  version: 1,
  symbolOrder: Object.freeze(COURSE_ORDER),
  initialSymbolCount: 2
});

export function validateKochCourse(course: KochCourse): void {
  if (course.initialSymbolCount !== 2 || course.symbolOrder.length < course.initialSymbolCount) {
    throw new Error('A Koch course must begin with exactly two available symbols.');
  }
  if (new Set(course.symbolOrder).size !== course.symbolOrder.length) {
    throw new Error('A Koch course cannot contain duplicate symbols.');
  }
  for (const symbolId of course.symbolOrder) {
    const definition = getMorseSymbolDefinition(symbolId);
    if (definition.category !== 'letter' && definition.category !== 'number') {
      throw new Error(`Koch course symbol must be a letter or number: ${symbolId}`);
    }
  }
}

export function activeKochSymbols(
  currentSymbolCount: number,
  course: KochCourse = INTERNATIONAL_RECEIVE_COURSE_V1
): readonly MorseSymbolId[] {
  validateKochCourse(course);
  if (!Number.isInteger(currentSymbolCount) ||
      currentSymbolCount < course.initialSymbolCount ||
      currentSymbolCount > course.symbolOrder.length) {
    throw new Error('Current Koch symbol count is outside the course bounds.');
  }
  return course.symbolOrder.slice(0, currentSymbolCount);
}
