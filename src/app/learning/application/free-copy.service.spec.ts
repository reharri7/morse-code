import { MorseTimeline } from '../../core/morse/morse-timeline';
import { generateFreeCopyPassage } from '../domain/free-copy';
import { createInitialLearnerProfile } from '../domain/learning-score';
import { MorseAudioPlayer } from '../infrastructure/morse-audio.service';
import { FreeCopyService } from './free-copy.service';
import { LearningProgressRepository, TrainingClock } from './training-session.service';

describe('FreeCopyService', () => {
  it('hides generated truth until review and persists aligned character evidence', async () => {
    const progress = new MemoryProgress(36);
    const service = new FreeCopyService(new ImmediateAudio(), progress, new Clock());
    const expected = generateFreeCopyPassage({ currentSymbolCount: 36, wordCount: 8, seed: 'passage' })!;
    await service.start({ seed: 'passage', wordCount: 8 });
    expect(service.snapshot().expectedText).toBeNull();
    service.updateDraft(expected);
    expect(service.finish()).toBeTrue();
    expect(service.snapshot().state).toBe('review');
    expect(service.snapshot().expectedText).toBe(expected);
    expect(service.snapshot().comparison?.referenceScore?.correct).toBeTrue();
    expect(Object.values(progress.profile.characters).reduce((sum, item) => sum + item.attempts, 0)).toBe(expected.replaceAll(' ', '').length);
  });

  it('pauses by cancelling audio and resumes from the start without losing draft', async () => {
    const audio = new DeferredAudio();
    const service = new FreeCopyService(audio, new MemoryProgress(36), new Clock());
    void service.start({ seed: 'pause', wordCount: 6 });
    await Promise.resolve();
    service.updateDraft('CQ');
    service.pause();
    expect(service.snapshot().state).toBe('paused');
    expect(service.snapshot().draft).toBe('CQ');
    void service.resume();
    await Promise.resolve();
    expect(service.snapshot().state).toBe('playing');
    expect(service.snapshot().replayCount).toBe(1);
    expect(audio.cancelCount).toBeGreaterThan(1);
  });

  it('reports unavailable content at the initial K/M level', async () => {
    const service = new FreeCopyService(new ImmediateAudio(), new MemoryProgress(2), new Clock());
    await service.start({ seed: 1 });
    expect(service.snapshot().state).toBe('error');
    expect(service.snapshot().errorMessage).toContain('enough unlocked letters');
  });
});

class ImmediateAudio implements MorseAudioPlayer {
  async prepare(): Promise<void> {}
  async playTimeline(_timeline: MorseTimeline): Promise<void> {}
  cancel(): void {}
  async dispose(): Promise<void> {}
}

class DeferredAudio implements MorseAudioPlayer {
  cancelCount = 0;
  async prepare(): Promise<void> {}
  async playTimeline(_timeline: MorseTimeline): Promise<void> { await new Promise<void>(() => undefined); }
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
