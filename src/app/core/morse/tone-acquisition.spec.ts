import { AcquiringCwDecoder } from './acquiring-cw-decoder';
import { PcmFrame } from './interfaces';
import { generateSyntheticCw } from './synthetic-cw';
import { ToneAcquisitionTracker } from './tone-acquisition';

describe('Milestone 3 tone acquisition', () => {
  it('finds an unknown clean tone and replays pre-roll into the exact raw decoder', () => {
    const audio = generateSyntheticCw({
      text: 'CQ DE K1ABC', wordsPerMinute: 20, toneFrequencyHz: 735, sampleRate: 48_000
    });
    const session = new AcquiringCwDecoder({
      minFrequencyHz: 400,
      maxFrequencyHz: 1_000,
      frequencyStepHz: 10,
      detectorFrameSize: 128,
      minimumPower: 0.00001
    });

    feedFrames((frame) => session.pushFrame(frame), audio.samples, audio.sampleRate, 512);
    const result = session.flush();

    expect(result.acquisition.state).toBe('locked');
    expect(result.acquisition.lockedFrequencyHz).toBeCloseTo(735, -1);
    expect(result.acquisition.lockQuality).toBeGreaterThan(0.3);
    expect(result.rawText).toBe('CQ DE K1ABC');
  });

  it('tracks modest drift, declares sustained loss, and reacquires a new tone', () => {
    const tracker = new ToneAcquisitionTracker({
      minFrequencyHz: 400, maxFrequencyHz: 1_000, frequencyStepHz: 10,
      acquireScans: 3, degradeScans: 3, loseScans: 7, trackingRangeHz: 60
    });
    let startSample = 0;
    const initial = generateSyntheticCw({ text: 'CQ', wordsPerMinute: 20, toneFrequencyHz: 650, sampleRate: 8_000, amplitude: 0.6 });
    startSample = feedFrames((frame) => tracker.pushFrame(frame), initial.samples, 8_000, 512, startSample);
    expect(tracker.snapshot().state).toBe('locked');
    expect(tracker.snapshot().lockedFrequencyHz).toBeCloseTo(650, -1);

    const drifted = generateSyntheticCw({ text: 'CQ', wordsPerMinute: 20, toneFrequencyHz: 675, sampleRate: 8_000, amplitude: 0.6 });
    startSample = feedFrames((frame) => tracker.pushFrame(frame), drifted.samples, 8_000, 512, startSample);
    expect(tracker.snapshot().state).toBe('locked');
    expect(tracker.snapshot().lockedFrequencyHz).toBeGreaterThan(660);

    startSample = feedFrames((frame) => tracker.pushFrame(frame), new Float32Array(5_000), 8_000, 512, startSample);
    expect(tracker.snapshot().state).toBe('lost');

    const reacquired = generateSyntheticCw({ text: 'CQ', wordsPerMinute: 20, toneFrequencyHz: 820, sampleRate: 8_000, amplitude: 0.6 });
    feedFrames((frame) => tracker.pushFrame(frame), reacquired.samples, 8_000, 512, startSample);
    expect(tracker.snapshot().state).toBe('locked');
    expect(tracker.snapshot().lockedFrequencyHz).toBeCloseTo(820, -1);
  });

  it('holds a manual frequency when a stronger nearby tone competes', () => {
    const sampleRate = 8_000;
    const tracker = new ToneAcquisitionTracker({
      minFrequencyHz: 400,
      maxFrequencyHz: 1_000,
      frequencyStepHz: 10,
      trackingRangeHz: 45,
      manualFrequencyHz: 640
    });
    const selected = sine(6_000, 640, sampleRate, 0.4);
    const competing = sine(6_000, 700, sampleRate, 0.75);
    const mixture = new Float32Array(selected.length);
    for (let index = 0; index < mixture.length; index += 1) mixture[index] = selected[index] + competing[index];

    feedFrames((frame) => tracker.pushFrame(frame), mixture, sampleRate, 512);
    const result = tracker.snapshot();
    expect(result.mode).toBe('manual');
    expect(result.state).toBe('locked');
    expect(result.lockedFrequencyHz).toBe(640);
    expect(result.candidates.some((candidate) => candidate.frequencyHz > 680)).toBeTrue();
  });
});

function feedFrames(
  consume: (frame: PcmFrame) => unknown,
  samples: Float32Array,
  sampleRate: number,
  chunkSize: number,
  initialStartSample = 0
): number {
  let offset = 0;
  while (offset < samples.length) {
    const end = Math.min(samples.length, offset + chunkSize);
    consume({ samples: samples.slice(offset, end), sampleRate, startSample: initialStartSample + offset });
    offset = end;
  }
  return initialStartSample + samples.length;
}

function sine(length: number, frequencyHz: number, sampleRate: number, amplitude: number): Float32Array {
  return Float32Array.from({ length }, (_, index) => amplitude * Math.sin((2 * Math.PI * frequencyHz * index) / sampleRate));
}
