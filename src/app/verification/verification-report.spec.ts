import { buildVerificationJson, buildVerificationText } from './verification-report';
import { buildAcousticVerificationJson, buildAcousticVerificationText } from './verification-report';
import { runBuiltInVerification } from './verification-runner';

describe('verification reports', () => {
  it('exports raw evidence and metrics without PCM or corrected text', () => {
    const result = runBuiltInVerification();
    const text = buildVerificationText(result);
    const json = buildVerificationJson(result);
    expect(text).toContain('RAW ACTUAL');
    expect(text).toContain('Character error rate');
    expect(json).toContain('"pcmIncluded": false');
    expect(json).not.toContain('samples');
    expect(json).not.toContain('"editedText":');
  });

  it('exports all acoustic repetitions without audio', () => {
    const repetition = runBuiltInVerification();
    const result = {
      schemaVersion: 1 as const,
      completedAt: new Date(0).toISOString(), deviceLabel: 'Built-in microphone',
      roomNoiseRms: 0.001, levelCheckRms: 0.2, levelCheckPeak: 0.4, level: 'usable' as const,
      repetitions: [repetition, repetition, repetition], provisionalCharacterErrorRateTarget: 0.1,
      passingRepetitionCount: 3, provisionalPass: true, calibrationStatus: 'provisional-unmeasured' as const
    };
    const text = buildAcousticVerificationText(result);
    const json = buildAcousticVerificationJson(result);
    expect(text).toContain('REPETITION 3');
    expect(text).toContain('PROVISIONAL');
    expect(json).toContain('"pcmIncluded": false');
    expect(json).not.toContain('"samples":');
  });
});
