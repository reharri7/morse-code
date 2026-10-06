import { PcmFrame } from './interfaces';
import { StreamingMorseDecoder } from './morse-decoder';
import { generateSyntheticCw } from './synthetic-cw';
import { StreamingCwDecoder, StreamingCwSnapshot } from './streaming-cw-decoder';

describe('Milestone 4 adaptive timing', () => {
  it('decodes the labeled clean speed range without a supplied WPM', () => {
    for (const wordsPerMinute of [8, 12, 20, 30, 40]) {
      const result = decode({ text: 'CQ DE K1ABC', wordsPerMinute });
      expect(characterErrorRate('CQ DE K1ABC', result.rawText))
        .withContext(`${wordsPerMinute} WPM produced ${result.rawText}`)
        .toBe(0);
      expect(Math.abs(result.timing.characterWordsPerMinute - wordsPerMinute))
        .withContext(`${wordsPerMinute} WPM estimate was ${result.timing.characterWordsPerMinute}`)
        .toBeLessThan(2);
    }
  });

  it('decodes deterministic 18% timing jitter with per-event confidence', () => {
    const result = decode({
      text: 'TEST JITTER 73', wordsPerMinute: 18, timingJitterFraction: 0.18
    });

    expect(characterErrorRate('TEST JITTER 73', result.rawText)).toBe(0);
    expect(result.recentEvents.length).toBeGreaterThan(0);
    expect(result.recentEvents.every((event) =>
      event.confidence !== undefined && event.confidence >= 0 && event.confidence <= 1
    )).toBeTrue();
    expect(result.characters.every((character) => character.confidence >= 0 && character.confidence <= 1)).toBeTrue();
  });

  it('separates Farnsworth element and spacing speeds', () => {
    const result = decode({
      text: 'CQ DE K1ABC', wordsPerMinute: 20, spacingWordsPerMinute: 8
    });

    expect(characterErrorRate('CQ DE K1ABC', result.rawText)).toBe(0);
    expect(Math.abs(result.timing.characterWordsPerMinute - 20)).toBeLessThan(2);
    expect(result.timing.spacingUnitDurationMs).toBeGreaterThan(result.timing.elementDitDurationMs * 2);
    expect(result.timing.effectiveWordsPerMinute).toBeLessThan(result.timing.characterWordsPerMinute - 4);
  });

  it('follows a gradual speed change without merging or splitting characters', () => {
    const speeds = [12, 14, 16, 18, 20];
    const sampleRate = 8_000;
    const parts: Float32Array[] = [];
    speeds.forEach((speed, index) => {
      parts.push(generateSyntheticCw({ text: 'CQ', wordsPerMinute: speed, sampleRate, toneFrequencyHz: 600 }).samples);
      if (index < speeds.length - 1) {
        parts.push(new Float32Array(Math.round((7 * 1_200 * sampleRate) / (speed * 1_000))));
      }
    });
    const session = new StreamingCwDecoder({
      targetFrequencyHz: 600,
      frameSize: 64,
      powerThreshold: 0.04,
      timing: { markHistoryLimit: 16, gapHistoryLimit: 12, maximumUpdateFraction: 0.15 }
    });
    feedFrames(session, concatenate(parts), sampleRate);
    const result = session.flush();

    expect(result.rawText).toBe('CQ CQ CQ CQ CQ');
    expect(result.timing.characterWordsPerMinute).toBeGreaterThan(17);
    expect(result.timing.characterWordsPerMinute).toBeLessThan(22);
  });

  it('makes an unknown Morse sequence explicit with zero character confidence', () => {
    const decoder = new StreamingMorseDecoder();
    for (let index = 0; index < 6; index += 1) {
      decoder.push({ kind: 'dit', durationMs: 60, confidence: 0.9 });
    }
    const result = decoder.finish();

    expect(result.text).toBe('?');
    expect(result.unknownSymbols).toEqual(['......']);
    expect(result.characters[0].confidence).toBe(0);
    expect(result.characters[0].reasons).toContain('unknown Morse sequence');
  });
});

function decode(options: {
  text: string;
  wordsPerMinute: number;
  spacingWordsPerMinute?: number;
  timingJitterFraction?: number;
}): StreamingCwSnapshot {
  const audio = generateSyntheticCw({
    ...options, toneFrequencyHz: 600, sampleRate: 8_000, amplitude: 0.75
  });
  const session = new StreamingCwDecoder({
    targetFrequencyHz: 600, frameSize: 64, powerThreshold: 0.04
  });
  feedFrames(session, audio.samples, audio.sampleRate);
  return session.flush();
}

function feedFrames(session: StreamingCwDecoder, samples: Float32Array, sampleRate: number): void {
  let startSample = 0;
  const chunkSizes = [320, 512, 768, 1_024];
  let chunkIndex = 0;
  while (startSample < samples.length) {
    const endSample = Math.min(samples.length, startSample + chunkSizes[chunkIndex % chunkSizes.length]);
    const frame: PcmFrame = { samples: samples.slice(startSample, endSample), sampleRate, startSample };
    session.pushFrame(frame);
    startSample = endSample;
    chunkIndex += 1;
  }
}

function concatenate(parts: readonly Float32Array[]): Float32Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function characterErrorRate(expected: string, actual: string): number {
  const rows = Array.from({ length: expected.length + 1 }, () => new Array<number>(actual.length + 1).fill(0));
  for (let row = 0; row <= expected.length; row += 1) rows[row][0] = row;
  for (let column = 0; column <= actual.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= expected.length; row += 1) {
    for (let column = 1; column <= actual.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (expected[row - 1] === actual[column - 1] ? 0 : 1)
      );
    }
  }
  return rows[expected.length][actual.length] / Math.max(1, expected.length);
}
