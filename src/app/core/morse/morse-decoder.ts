import { DecodeResult, DecodedCharacterEvidence, TimingEvent } from './interfaces';
import { CHARACTER_BY_MORSE } from './morse-table';

/** Stateful event decoder used by live sessions without repeatedly decoding history. */
export class StreamingMorseDecoder {
  private text = '';
  private currentCode = '';
  private readonly unknownSymbols: string[] = [];
  private readonly characters: DecodedCharacterEvidence[] = [];
  private currentConfidences: number[] = [];
  private currentReasons: string[] = [];

  push(event: TimingEvent): DecodeResult {
    if (event.kind === 'dit' || event.kind === 'dah') {
      this.currentCode += event.kind === 'dit' ? '.' : '-';
      this.currentConfidences.push(event.confidence ?? 1);
      this.currentReasons.push(...(event.reasons ?? []));
    }
    else if (event.kind === 'character-gap') this.flushCharacter();
    else {
      this.flushCharacter();
      if (this.text && !this.text.endsWith(' ')) this.text += ' ';
    }
    return this.result();
  }

  finish(): DecodeResult {
    this.flushCharacter();
    return this.result();
  }

  result(): DecodeResult {
    return { text: this.text.trimEnd(), unknownSymbols: [...this.unknownSymbols], characters: [...this.characters] };
  }

  reset(): void {
    this.text = '';
    this.currentCode = '';
    this.unknownSymbols.length = 0;
    this.characters.length = 0;
    this.currentConfidences = [];
    this.currentReasons = [];
  }

  private flushCharacter(): void {
    if (!this.currentCode) return;
    const character = CHARACTER_BY_MORSE[this.currentCode];
    const decodedCharacter = character ?? '?';
    if (character) this.text += character;
    else {
      this.text += '?';
      this.unknownSymbols.push(this.currentCode);
    }
    const timingConfidence = this.currentConfidences.length
      ? this.currentConfidences.reduce((sum, value) => sum + value, 0) / this.currentConfidences.length
      : 0;
    this.characters.push({
      character: decodedCharacter,
      morse: this.currentCode,
      confidence: character ? timingConfidence : 0,
      reasons: character
        ? [...new Set(this.currentReasons)]
        : [...new Set([...this.currentReasons, 'unknown Morse sequence'])]
    });
    this.currentCode = '';
    this.currentConfidences = [];
    this.currentReasons = [];
  }
}

/** Turns classified timing events into text; it has no knowledge of audio or UI. */
export function decodeMorseEvents(events: readonly TimingEvent[]): DecodeResult {
  const decoder = new StreamingMorseDecoder();
  for (const event of events) decoder.push(event);
  return decoder.finish();
}
