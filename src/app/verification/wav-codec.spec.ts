import { generateSyntheticCw } from '../core/morse/synthetic-cw';
import { runPcmVerification } from './verification-runner';
import { decodeWav, encodeMonoPcm16Wav } from './wav-codec';

describe('portable WAV codec', () => {
  it('round-trips the protected known message through file PCM and production decoding', () => {
    const expectedText = 'CQ CQ DE K6RHE';
    const audio = generateSyntheticCw({ text: expectedText, wordsPerMinute: 15, toneFrequencyHz: 600, sampleRate: 8_000 });
    const decoded = decodeWav(encodeMonoPcm16Wav(audio.samples, audio.sampleRate));
    const result = runPcmVerification({
      testCase: {
        id: 'wav-round-trip-v1', version: 1, title: 'WAV round trip', purpose: 'test',
        sourceKind: 'portable-clip', expectedText, nominalToneFrequencyHz: 600, nominalWordsPerMinute: 15
      },
      sourceName: 'round-trip.wav', samples: decoded.samples, sampleRate: decoded.sampleRate
    });
    expect(decoded.channelCount).toBe(1);
    expect(result.rawText).toBe(expectedText);
    expect(result.metrics?.exact).toBeTrue();
  });

  it('rejects invalid or empty WAV content', () => {
    expect(() => decodeWav(new ArrayBuffer(12))).toThrowError(/valid WAV/);
    const empty = encodeMonoPcm16Wav(new Float32Array(), 8_000);
    expect(() => decodeWav(empty)).toThrowError(/no usable audio data/);
  });
});
