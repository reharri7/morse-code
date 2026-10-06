import { encodeMorseText } from '../../core/morse/morse-sequence';
import { compileMorseTimeline } from '../../core/morse/morse-timing';
import { MorseAudioContext, MorseAudioService } from './morse-audio.service';

describe('MorseAudioService', () => {
  it('resumes on preparation and schedules one oscillator from the shared timeline', async () => {
    const fake = new FakeAudioContext('suspended', 0.25);
    const service = new MorseAudioService({ createAudioContext: () => fake.context });
    const timeline = compileMorseTimeline(encodeMorseText('K'), {
      characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 650
    });

    await service.prepare();
    const playing = service.playTimeline(timeline);
    await Promise.resolve();

    expect(fake.resume).toHaveBeenCalled();
    expect(fake.oscillators.length).toBe(1);
    expect(fake.oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(650, 0.26);
    expect(fake.oscillators[0].start).toHaveBeenCalledWith(0.26);
    expect(fake.oscillators[0].stop).toHaveBeenCalledWith(0.26 + (timeline.durationMs / 1_000));
    expect(service.isPlaying).toBeTrue();

    fake.finishLatest();
    await playing;
    expect(service.isPlaying).toBeFalse();
    expect(fake.oscillators[0].disconnect).toHaveBeenCalled();
    expect(fake.gains[0].disconnect).toHaveBeenCalled();
  });

  it('cancels a previous schedule before rapid replay', async () => {
    const fake = new FakeAudioContext('running', 0);
    const service = new MorseAudioService({ createAudioContext: () => fake.context });
    const timeline = compileMorseTimeline(encodeMorseText('M'), {
      characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600
    });
    await service.prepare();
    const first = service.playTimeline(timeline);
    await Promise.resolve();
    const firstResult = first.catch((error: unknown) => error);
    const second = service.playTimeline(timeline);
    await Promise.resolve();

    const cancellation = await firstResult;
    expect(cancellation).toEqual(jasmine.objectContaining({ name: 'AbortError' }));
    expect(fake.oscillators[0].stop).toHaveBeenCalled();
    expect(fake.oscillators[0].disconnect).toHaveBeenCalled();
    expect(fake.oscillators.length).toBe(2);

    fake.finishLatest();
    await second;
  });

  it('honors abort and closes every owned resource on disposal', async () => {
    const fake = new FakeAudioContext('running', 0);
    const service = new MorseAudioService({ createAudioContext: () => fake.context });
    const timeline = compileMorseTimeline(encodeMorseText('K'), {
      characterWpm: 20, effectiveWpm: 10, toneFrequencyHz: 600
    });
    const controller = new AbortController();
    const playing = service.playTimeline(timeline, controller.signal).catch((error: unknown) => error);
    await Promise.resolve();
    controller.abort();
    expect(await playing).toEqual(jasmine.objectContaining({ name: 'AbortError' }));

    const second = service.playTimeline(timeline).catch((error: unknown) => error);
    await Promise.resolve();
    await service.dispose();
    expect(await second).toEqual(jasmine.objectContaining({ name: 'AbortError' }));
    expect(fake.close).toHaveBeenCalled();
    expect(service.isPlaying).toBeFalse();
  });

  it('reports empty audio and context startup failures', async () => {
    const failed = new MorseAudioService({ createAudioContext: () => { throw new Error('blocked'); } });
    await expectAsync(failed.prepare()).toBeRejectedWithError('blocked');

    const fake = new FakeAudioContext('running', 0);
    const service = new MorseAudioService({ createAudioContext: () => fake.context });
    const timing = compileMorseTimeline(encodeMorseText('E'), {
      characterWpm: 20, effectiveWpm: 20, toneFrequencyHz: 600
    }).timing;
    await expectAsync(service.playTimeline({ segments: [], durationMs: 0, timing }))
      .toBeRejectedWithError(/no playable timeline/);
  });
});

class FakeAudioContext {
  readonly resume = jasmine.createSpy('resume').and.callFake(async () => { this.state = 'running'; });
  readonly close = jasmine.createSpy('close').and.callFake(async () => { this.state = 'closed'; });
  readonly oscillators: Array<{
    frequency: { setValueAtTime: jasmine.Spy };
    start: jasmine.Spy;
    stop: jasmine.Spy;
    disconnect: jasmine.Spy;
    onended: (() => void) | null;
  }> = [];
  readonly gains: Array<{
    gain: {
      cancelScheduledValues: jasmine.Spy;
      setValueAtTime: jasmine.Spy;
      linearRampToValueAtTime: jasmine.Spy;
    };
    disconnect: jasmine.Spy;
  }> = [];
  state: string;
  readonly context: MorseAudioContext;

  constructor(state: string, currentTime: number) {
    this.state = state;
    this.context = {
      get currentTime() { return currentTime; },
      destination: {} as AudioNode,
      get state() { return stateProxy(); },
      createOscillator: () => this.createOscillator(),
      createGain: () => this.createGain(),
      resume: this.resume,
      close: this.close
    };
    const stateProxy = () => this.state;
  }

  finishLatest(): void {
    this.oscillators[this.oscillators.length - 1].onended?.();
  }

  private createOscillator(): OscillatorNode {
    const oscillator = {
      type: 'sine',
      frequency: { setValueAtTime: jasmine.createSpy('frequency.setValueAtTime') },
      connect: jasmine.createSpy('oscillator.connect'),
      disconnect: jasmine.createSpy('oscillator.disconnect'),
      start: jasmine.createSpy('oscillator.start'),
      stop: jasmine.createSpy('oscillator.stop'),
      onended: null as (() => void) | null
    };
    this.oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  }

  private createGain(): GainNode {
    const gain = {
      gain: {
        cancelScheduledValues: jasmine.createSpy('gain.cancelScheduledValues'),
        setValueAtTime: jasmine.createSpy('gain.setValueAtTime'),
        linearRampToValueAtTime: jasmine.createSpy('gain.linearRampToValueAtTime')
      },
      connect: jasmine.createSpy('gain.connect'),
      disconnect: jasmine.createSpy('gain.disconnect')
    };
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }
}
