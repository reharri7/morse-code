import { generateSyntheticCw } from './synthetic-cw';
import { StreamingCwDecoder } from './streaming-cw-decoder';

describe('StreamingCwDecoder', () => {
  it('decodes the M1 oracle from bounded, arbitrarily split PCM frames', () => {
    const audio = generateSyntheticCw({
      text: 'CQ CQ DE K6RHE',
      wordsPerMinute: 20,
      toneFrequencyHz: 600,
      sampleRate: 8_000
    });
    const session = new StreamingCwDecoder({
      targetFrequencyHz: 600,
      frameSize: 64,
      powerThreshold: 0.04
    });

    let startSample = 0;
    const chunkSizes = [320, 768, 512, 1_024];
    let chunkIndex = 0;
    while (startSample < audio.samples.length) {
      const endSample = Math.min(startSample + chunkSizes[chunkIndex % chunkSizes.length], audio.samples.length);
      session.pushFrame({ samples: audio.samples.slice(startSample, endSample), sampleRate: audio.sampleRate, startSample });
      startSample = endSample;
      chunkIndex += 1;
    }

    const result = session.flush();
    expect(result.rawText).toBe('CQ CQ DE K6RHE');
    expect(result.unknownSymbols).toEqual([]);
    expect(result.processedSampleCount).toBe(audio.samples.length);
    expect(result.droppedFrameCount).toBe(0);
    expect(result.markCount).toBeGreaterThan(0);
    expect(Math.abs(result.timing.characterWordsPerMinute - 20)).toBeLessThan(1);
    expect(result.timing.state).toBe('tracking');
  });

  it('reports discontinuities and keeps only bounded diagnostic history', () => {
    const session = new StreamingCwDecoder({ targetFrequencyHz: 600, eventHistoryLimit: 8 });
    const silence = new Float32Array(4_096);
    session.pushFrame({ samples: silence, sampleRate: 8_000, startSample: 0 });
    const result = session.pushFrame({ samples: silence, sampleRate: 8_000, startSample: 5_000 });

    expect(result.droppedFrameCount).toBe(1);
    expect(result.recentEvents.length).toBeLessThanOrEqual(8);
  });
});
