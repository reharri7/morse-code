export type MorseSymbolCategory = 'letter' | 'number' | 'punctuation' | 'prosign';

export interface MorseSymbolDefinition {
  readonly id: string;
  readonly display: string;
  readonly pattern: string;
  readonly category: MorseSymbolCategory;
}

/** International Morse symbols useful for ordinary amateur-radio traffic. */
export const MORSE_BY_CHARACTER: Readonly<Record<string, string>> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.',
  H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.',
  O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-',
  V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.',
  '=': '-...-', '+': '.-.-.', '-': '-....-', '(': '-.--.', ')': '-.--.-',
  '@': '.--.-.', ':': '---...', ';': '-.-.-.', "'": '.----.',
  '!': '-.-.--', '&': '.-...'
};

export const CHARACTER_BY_MORSE: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(MORSE_BY_CHARACTER).map(([character, code]) => [code, character]))
);

/** Canonical catalog consumed by transcription, generation, and learning. */
export const MORSE_SYMBOLS: readonly MorseSymbolDefinition[] = Object.freeze(
  Object.entries(MORSE_BY_CHARACTER).map(([id, pattern]) => Object.freeze({
    id,
    display: id,
    pattern,
    category: categoryFor(id)
  }))
);

const SYMBOL_BY_ID: Readonly<Record<string, MorseSymbolDefinition>> = Object.freeze(
  Object.fromEntries(MORSE_SYMBOLS.map((symbol) => [symbol.id, symbol]))
);

export function getMorseSymbolDefinition(symbolId: string): MorseSymbolDefinition {
  const symbol = SYMBOL_BY_ID[symbolId];
  if (!symbol) throw new Error(`Unsupported Morse character: ${symbolId}`);
  return symbol;
}

function categoryFor(id: string): MorseSymbolCategory {
  if (/^[A-Z]$/.test(id)) return 'letter';
  if (/^[0-9]$/.test(id)) return 'number';
  return 'punctuation';
}
