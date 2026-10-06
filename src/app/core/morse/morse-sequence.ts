import { getMorseSymbolDefinition } from './morse-table';

export type MorseToken =
  | { readonly kind: 'symbol'; readonly symbolId: string }
  | { readonly kind: 'character-boundary' }
  | { readonly kind: 'word-boundary' };

export interface MorseSequence {
  readonly normalizedText: string;
  readonly tokens: readonly MorseToken[];
  readonly symbolCount: number;
}

/** Converts supported text into canonical symbols and explicit boundaries. */
export function encodeMorseText(text: string): MorseSequence {
  const normalizedText = text.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!normalizedText) {
    return Object.freeze({ normalizedText, tokens: Object.freeze([]), symbolCount: 0 });
  }

  const tokens: MorseToken[] = [];
  let symbolCount = 0;
  const words = normalizedText.split(' ');
  words.forEach((word, wordIndex) => {
    [...word].forEach((symbolId, symbolIndex) => {
      getMorseSymbolDefinition(symbolId);
      tokens.push(Object.freeze({ kind: 'symbol', symbolId }));
      symbolCount += 1;
      if (symbolIndex < word.length - 1) {
        tokens.push(Object.freeze({ kind: 'character-boundary' }));
      } else if (wordIndex < words.length - 1) {
        tokens.push(Object.freeze({ kind: 'word-boundary' }));
      }
    });
  });

  return Object.freeze({
    normalizedText,
    tokens: Object.freeze(tokens),
    symbolCount
  });
}
