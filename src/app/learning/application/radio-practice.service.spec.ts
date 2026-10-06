import { MorseTimeline } from '../../core/morse/morse-timeline';
import { createInitialLearnerProfile } from '../domain/learning-score';
import { MorseAudioPlayer } from '../infrastructure/morse-audio.service';
import { LearningProgressRepository, TrainingClock } from './training-session.service';
import { RadioPracticeService } from './radio-practice.service';

describe('RadioPracticeService', () => {
  it('withholds unavailable callsign content honestly', async () => {
    const service = new RadioPracticeService(new ImmediateAudio(), new MemoryProgress(20), new Clock());
    await service.start('callsigns', { seed: 'locked' });
    expect(service.snapshot().state).toBe('error');
    expect(service.snapshot().errorMessage).toContain('after a number');
  });

  it('plays and scores simulated callsigns through shared timeline audio', async () => {
    const audio = new ImmediateAudio();
    const progress = new MemoryProgress(36);
    const service = new RadioPracticeService(audio, progress, new Clock());
    await service.start('callsigns', { seed: 'calls', trials: 2 });
    const expected = service.snapshot().currentTrial?.audioText ?? '';
    expect(service.snapshot().state).toBe('answering');
    expect(service.snapshot().currentTrial?.explanation).toContain('not assigned');
    expect(service.submit(expected)).toBeTrue();
    expect(service.snapshot().feedback?.score.correct).toBeTrue();
    expect(service.snapshot().transcript.length).toBe(1);
    expect(audio.timelines.length).toBe(1);
    expect(Object.values(progress.profile.characters).reduce((sum, item) => sum + item.attempts, 0)).toBe(expected.length);
  });

  it('advances through a deterministic QSO and keeps expected, entered, and explanation separate', async () => {
    const service = new RadioPracticeService(new ImmediateAudio(), new MemoryProgress(36), new Clock());
    await service.start('qso', { seed: 'qso' });
    const first = service.snapshot().currentTrial!;
    expect(first.displayText).toContain('<AR>');
    expect(service.submit(first.displayText)).toBeTrue();
    expect(service.snapshot().feedback?.enteredText).toContain('<AR>');
    expect(service.snapshot().feedback?.trial.explanation).toContain('calls any station');
    await service.next();
    expect(service.snapshot().trialNumber).toBe(2);
    expect(service.snapshot().currentTrial?.label).toBe('Answering the call');
  });

  it('cancels and clears transient radio state on exit', async () => {
    const audio = new ImmediateAudio();
    const service = new RadioPracticeService(audio, new MemoryProgress(36), new Clock());
    await service.start('contest', { seed: 3, trials: 2 });
    service.exit();
    expect(service.snapshot().state).toBe('idle');
    expect(service.snapshot().transcript).toEqual([]);
    expect(audio.cancelCount).toBeGreaterThan(0);
  });
});

class ImmediateAudio implements MorseAudioPlayer {
  timelines: MorseTimeline[] = [];
  cancelCount = 0;
  async prepare(): Promise<void> {}
  async playTimeline(timeline: MorseTimeline): Promise<void> { this.timelines.push(timeline); }
  cancel(): void { this.cancelCount += 1; }
  async dispose(): Promise<void> {}
}

class MemoryProgress implements LearningProgressRepository {
  profile = createInitialLearnerProfile('2026-09-25T00:00:00.000Z');
  lastWriteSucceeded = true;
  constructor(level: number) { this.profile = { ...this.profile, currentSymbolCount: level }; }
  load() { return this.profile; }
  save(profile: typeof this.profile) { this.profile = profile; return profile; }
}

class Clock implements TrainingClock {
  index = 0;
  monotonicMs(): number { return 0; }
  nowIso(): string { this.index += 1; return new Date(this.index * 1_000).toISOString(); }
}
