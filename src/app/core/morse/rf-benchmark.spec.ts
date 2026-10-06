import manifest from '../../../../test/fixtures/cw/manifest.json';
import { asFixtureDefinitions, runRfFixture } from '../../testing/rf-fixture';
import { benchmarkFailures, buildCwBenchmarkReport, CwBenchmarkThresholds } from './cw-benchmark';

describe('Milestone 5 RF-like benchmark gate', () => {
  it('publishes every labeled result and passes the aggregate thresholds', () => {
    const fixtures = asFixtureDefinitions(manifest);
    const report = buildCwBenchmarkReport(fixtures.map((fixture) => ({
      fixture,
      observation: runRfFixture(fixture)
    })));
    expect(report.fixtures.length).toBe(fixtures.length);
    expect(report.fixtures.every((fixture) => fixture.tags.includes('gate'))).toBeTrue();
    const thresholds = (manifest as { readonly thresholds: CwBenchmarkThresholds }).thresholds;
    expect(benchmarkFailures(report, thresholds))
      .withContext(JSON.stringify(report))
      .toEqual([]);
    expect(report.fixtures.find((fixture) => fixture.id === 'clean-oracle')?.exact).toBeTrue();
    expect(report.fixtures.find((fixture) => fixture.id === 'loss-and-reacquisition')?.lockRecoveryCount).toBe(1);
  });
});
