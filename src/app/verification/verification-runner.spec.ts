import { BUILT_IN_CASES, PORTABLE_CASE, runBuiltInVerification, runPcmVerification } from './verification-runner';

describe('production-path verification runner', () => {
  it('passes the beginner-facing clean case exactly without microphone access', () => {
    const result = runBuiltInVerification(PORTABLE_CASE);
    expect(result.passed).toBeTrue();
    expect(result.rawText).toBe('CQ CQ DE K6RHE');
    expect(result.stages.map((stage) => stage.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
    expect(result.metrics?.exact).toBeTrue();
    expect('samples' in (result as unknown as Record<string, unknown>)).toBeFalse();
  });

  it('keeps all five versioned deterministic checks reproducible', () => {
    const first = BUILT_IN_CASES.map((testCase) => runBuiltInVerification(testCase));
    const second = BUILT_IN_CASES.map((testCase) => runBuiltInVerification(testCase));
    expect(first.map((result) => result.rawText)).toEqual(second.map((result) => result.rawText));
    expect(first.every((result) => result.passed)).withContext(JSON.stringify(first.map((result) => ({
      id: result.case.id, rawText: result.rawText, stages: result.stages.map((stage) => [stage.id, stage.status])
    })))).toBeTrue();
  });

  it('diagnoses the first failed stage and does not claim accuracy without expected text', () => {
    const silent = runPcmVerification({
      testCase: { id: 'silent-v1', version: 1, title: 'Silent', purpose: 'test', sourceKind: 'imported-file' },
      sourceName: 'silent.wav', samples: new Float32Array(8_000), sampleRate: 8_000
    });
    expect(silent.firstFailedStage).toBe('input');
    expect(silent.stages.at(-1)?.status).toBe('not-run');
    expect(silent.metrics).toBeNull();
  });
});
