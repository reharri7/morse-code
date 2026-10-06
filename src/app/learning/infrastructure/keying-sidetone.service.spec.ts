import { MorseAudioContext } from './morse-audio.service';
import { KeyingSidetoneService } from './keying-sidetone.service';

describe('KeyingSidetoneService', () => {
  it('starts one local tone, envelopes it off, and closes its context', async () => {
    const fake = new FakeKeyingContext();
    const service = new KeyingSidetoneService({ createAudioContext: () => fake.context });

    await service.start(650);
    await service.start(650);
    expect(fake.resume).toHaveBeenCalled();
    expect(fake.oscillators.length).toBe(1);
    expect(fake.oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(650, 1);
    expect(fake.oscillators[0].start).toHaveBeenCalledWith(1);

    service.stop();
    expect(fake.oscillators[0].stop).toHaveBeenCalledWith(1.004);
    fake.oscillators[0].onended?.();
    expect(fake.oscillators[0].disconnect).toHaveBeenCalled();
    expect(fake.gains[0].disconnect).toHaveBeenCalled();

    await service.dispose();
    expect(fake.close).toHaveBeenCalled();
  });

  it('does not start a delayed tone after the key has already been released', async () => {
    let finishResume: (() => void) | undefined;
    const fake = new FakeKeyingContext();
    fake.state = 'suspended';
    fake.resume.and.callFake(() => new Promise<void>((resolve) => finishResume = resolve));
    const service = new KeyingSidetoneService({ createAudioContext: () => fake.context });

    const starting = service.start(600);
    service.stop();
    finishResume?.();
    await starting;

    expect(fake.oscillators.length).toBe(0);
  });
});

class FakeKeyingContext {
  state = 'suspended';
  readonly resume = jasmine.createSpy('resume').and.callFake(async () => this.state = 'running');
  readonly close = jasmine.createSpy('close').and.callFake(async () => this.state = 'closed');
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
  readonly context: MorseAudioContext;

  constructor() {
    this.context = {
      get currentTime() { return 1; },
      destination: {} as AudioNode,
      get state() { return stateProxy(); },
      createOscillator: () => this.createOscillator(),
      createGain: () => this.createGain(),
      resume: this.resume,
      close: this.close
    };
    const stateProxy = () => this.state;
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
