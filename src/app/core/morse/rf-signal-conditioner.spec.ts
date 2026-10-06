import { RfSignalConditioner } from './rf-signal-conditioner';

describe('RfSignalConditioner', () => {
  it('removes DC, limits impulses, and applies only bounded normalization', () => {
    const conditioner = new RfSignalConditioner();
    const sampleRate = 8_000;
    const samples = Float32Array.from({ length: 4_096 }, (_, index) =>
      0.3 + (0.04 * Math.sin((2 * Math.PI * 600 * index) / sampleRate)) + (index === 2_000 ? 1.5 : 0)
    );
    let last: Float32Array = new Float32Array();
    for (let start = 0; start < samples.length; start += 512) {
      last = conditioner.pushFrame({
        samples: samples.slice(start, start + 512), sampleRate, startSample: start
      }).samples;
    }
    const snapshot = conditioner.snapshot();
    const mean = last.reduce((sum, sample) => sum + sample, 0) / last.length;

    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(snapshot.gain).toBeGreaterThanOrEqual(0.45);
    expect(snapshot.gain).toBeLessThanOrEqual(7);
    expect(snapshot.limitedSampleCount).toBeGreaterThan(0);
    expect(snapshot.removedDcLevel).toBeGreaterThan(0);
  });
});
