import { DecodedCharacterEvidence } from '../core/morse/interfaces';

export type ContextKind = 'callsign' | 'operating-term' | 'prosign' | 'signal-report';

export interface HamContextAnnotation {
  readonly id: string;
  readonly kind: ContextKind;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly sourceText: string;
  readonly title: string;
  readonly explanation: string;
  readonly confidence: number;
  readonly displayText?: string;
  readonly replacement?: string;
}

interface TermDefinition {
  readonly kind: Exclude<ContextKind, 'callsign'>;
  readonly title: string;
  readonly explanation: string;
  readonly displayText?: string;
  readonly replacement?: string;
}

const TERMS: Readonly<Record<string, TermDefinition>> = {
  CQ: { kind: 'operating-term', title: 'Calling any station', explanation: 'CQ is a general call inviting another station to answer.' },
  DE: { kind: 'operating-term', title: 'From', explanation: 'DE introduces the station that is transmitting.' },
  K: { kind: 'prosign', title: 'Invitation to transmit', explanation: 'K hands the frequency to any station.', displayText: '<K>' },
  KN: { kind: 'prosign', title: 'Named station only', explanation: 'KN invites only the station being called to transmit.', displayText: '<KN>' },
  AR: { kind: 'prosign', title: 'End of message', explanation: 'AR marks the end of a message.', displayText: '<AR>' },
  SK: { kind: 'prosign', title: 'End of contact', explanation: 'SK indicates that the contact is finished.', displayText: '<SK>' },
  BT: { kind: 'prosign', title: 'Separator', explanation: 'BT separates sections of a message.', displayText: '<BT>' },
  RST: { kind: 'operating-term', title: 'Signal report', explanation: 'RST introduces readability, strength, and tone ratings.' },
  QTH: { kind: 'operating-term', title: 'Station location', explanation: 'QTH refers to a station’s location.' },
  QSL: { kind: 'operating-term', title: 'Acknowledgement', explanation: 'QSL asks for or confirms receipt.' },
  '73': { kind: 'operating-term', title: 'Best regards', explanation: '73 is the traditional closing meaning best regards.' },
  '88': { kind: 'operating-term', title: 'Love and kisses', explanation: '88 is a traditional friendly closing.' },
  '5NN': {
    kind: 'signal-report', title: 'Shorthand signal report 599',
    explanation: 'Operators often send N as a shorter substitute for the digit 9.', replacement: '599'
  }
};

const CALLSIGN = /^(?:[A-Z]{1,2}\d[A-Z]{1,4}|\d[A-Z]{1,2}\d[A-Z]{1,4})(?:\/[A-Z0-9]+)?$/;
const TOKEN = /[A-Z0-9]+(?:\/[A-Z0-9]+)?/g;

/** Reads operating context from immutable raw decoder output. It never changes that text. */
export function analyzeHamContext(
  rawText: string,
  characters: readonly DecodedCharacterEvidence[] = []
): readonly HamContextAnnotation[] {
  const annotations: HamContextAnnotation[] = [];
  const upper = rawText.toUpperCase();
  for (const match of upper.matchAll(TOKEN)) {
    const sourceStart = match.index;
    const sourceText = rawText.slice(sourceStart, sourceStart + match[0].length);
    const token = match[0];
    const term = TERMS[token];
    if (term) {
      annotations.push({
        id: `${term.kind}-${sourceStart}-${token}`,
        kind: term.kind,
        sourceStart,
        sourceEnd: sourceStart + token.length,
        sourceText,
        title: term.title,
        explanation: term.explanation,
        confidence: evidenceConfidence(characters, rawText, sourceStart, token.length),
        displayText: term.displayText,
        replacement: term.replacement
      });
      continue;
    }
    if (CALLSIGN.test(token)) {
      annotations.push({
        id: `callsign-${sourceStart}-${token}`,
        kind: 'callsign',
        sourceStart,
        sourceEnd: sourceStart + token.length,
        sourceText,
        title: 'Possible amateur-radio callsign',
        explanation: 'This has the letter-and-number shape commonly used by amateur-radio callsigns. No online lookup was performed.',
        confidence: evidenceConfidence(characters, rawText, sourceStart, token.length)
      });
    }
  }
  return annotations;
}

function evidenceConfidence(
  characters: readonly DecodedCharacterEvidence[], rawText: string, start: number, length: number
): number {
  if (!characters.length) return 0.75;
  const evidenceStart = rawText.slice(0, start).replace(/\s/g, '').length;
  const evidenceLength = rawText.slice(start, start + length).replace(/\s/g, '').length;
  const evidence = characters.slice(evidenceStart, evidenceStart + evidenceLength).filter((item) => item.character !== ' ');
  if (!evidence.length) return 0.5;
  return evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length;
}
