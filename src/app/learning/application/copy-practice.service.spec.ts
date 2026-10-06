import { MorseTimeline } from '../../core/morse/morse-timeline';
import { createInitialLearnerProfile } from '../domain/learning-score';
import { MorseAudioPlayer } from '../infrastructure/morse-audio.service';
import { LearningProgressRepository, TrainingClock } from './training-session.service';
import { CopyPracticeService } from './copy-practice.service';

describe('CopyPracticeService', () => {
  it('runs a reproducible group trial and persists character-level evidence', async () => {
    const audio = new ImmediateAudio();
    const progress = new MemoryProgress();
    const service = new CopyPracticeService(audio, progress, new Clock());
    await service.start('groups', { seed: 'group-session', trials: 2, groupLength: 3 });
    const expected = service.snapshot().expectedText!;
    expect(service.snapshot().state).toBe('answering');
    expect(expected.length).toBe(3);
    expect(service.submit(`${expected.slice(0, 2)}X`)).toBeTrue();
    expect(service.snapshot().feedback?.characterErrors).toBe(1);
    expect(Object.values(service.snapshot().profile.characters).reduce((sum, item) => sum + item.attempts, 0)).toBe(3);
    await service.next();
    expect(service.snapshot().trialNumber).toBe(2);
    expect(audio.timelines.length).toBe(2);
  });

  it('keeps word practice unavailable until the alphabet can spell corpus words', async () => {
    const service = new CopyPracticeService(new ImmediateAudio(), new MemoryProgress(), new Clock());
    await service.start('words', { seed: 'words' });
    expect(service.snapshot().state).toBe('error');
    expect(service.snapshot().errorMessage).toContain('more letters are unlocked');
  });

  it('generates and scores words using only unlocked characters', async () => {
    const progress = new MemoryProgress();
    progress.profile = { ...progress.profile, currentSymbolCount: 20 };
    const service = new CopyPracticeService(new ImmediateAudio(), progress, new Clock());
    await service.start('words', { seed: 'word-session', trials: 2 });
    const expected = service.snapshot().expectedText!;

    expect(service.snapshot().state).toBe('answering');
    expect(expected.length).toBeGreaterThan(1);
    expect(service.submit(expected)).toBeTrue();
    expect(service.snapshot().feedback?.correct).toBeTrue();
    expect(Object.values(service.snapshot().profile.characters).reduce((sum, item) => sum + item.attempts, 0)).toBe(expected.length);
  });

  it('cancels playback on exit', async () => {
    const audio = new ImmediateAudio();
    const service = new CopyPracticeService(audio, new MemoryProgress(), new Clock());
    await service.start('groups', { seed: 1 });
    service.exit();
    expect(service.snapshot().state).toBe('idle');
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
  load() { return this.profile; }
  save(profile: typeof this.profile) { this.profile = profile; return profile; }
}

class Clock implements TrainingClock {
  index = 0;
  monotonicMs(): number { return 0; }
  nowIso(): string { this.index += 1; return new Date(this.index * 1_000).toISOString(); }
}
