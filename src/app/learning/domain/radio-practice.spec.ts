import { activeKochSymbols } from './koch-course';
import {
  generateContestTrials,
  generateSimulatedCallsigns,
  generateSimulatedQso,
  normalizeRadioCopyInput,
  RADIO_TOKEN_CONVENTIONS,
  radioDisplayText
} from './radio-practice';

describe('radio practice domain', () => {
  it('generates reproducible simulated callsigns from unlocked letters and numbers only', () => {
    const first = generateSimulatedCallsigns({ currentSymbolCount: 24, count: 12, seed: 'calls' });
    const second = generateSimulatedCallsigns({ currentSymbolCount: 24, count: 12, seed: 'calls' });
    const allowed = new Set(activeKochSymbols(24));
    expect(first).toEqual(second);
    expect(first.length).toBe(12);
    expect(first.every((item) => item.simulated && /^[A-Z]{1,2}\d[A-Z]{1,3}$/.test(item.value))).toBeTrue();
    expect(first.every((item) => [...item.value].every((symbol) => allowed.has(symbol)))).toBeTrue();
  });

  it('withholds callsigns until at least one number is unlocked', () => {
    expect(generateSimulatedCallsigns({ currentSymbolCount: 20, count: 3, seed: 1 })).toEqual([]);
  });

  it('creates encodable deterministic contest groups at the full level', () => {
    const trials = generateContestTrials({ currentSymbolCount: 36, count: 5, seed: 'contest' });
    expect(trials.length).toBe(5);
    expect(trials.every((trial) => /^[A-Z]{1,2}\d[A-Z]{1,3} 5[579]9 \d{3}$/.test(trial.audioText))).toBeTrue();
    expect(generateContestTrials({ currentSymbolCount: 36, count: 5, seed: 'contest' })).toEqual(trials);
  });

  it('builds a reproducible six-turn simulated QSO with inspectable truth', () => {
    const qso = generateSimulatedQso(36, 'qso-seed');
    expect(qso).not.toBeNull();
    expect(qso?.simulated).toBeTrue();
    expect(qso?.turns.length).toBe(6);
    expect(qso?.turns[0].audioText).toContain('CQ CQ DE');
    expect(qso?.turns.some((turn) => turn.audioText.includes('RST 599'))).toBeTrue();
    expect(qso?.turns.some((turn) => turn.displayText.includes('<BT>'))).toBeTrue();
    expect(generateSimulatedQso(36, 'qso-seed')).toEqual(qso);
  });

  it('documents reversible display conventions for procedural signals', () => {
    expect(RADIO_TOKEN_CONVENTIONS.map((item) => item.display)).toEqual(['<BT>', '<AR>']);
    expect(radioDisplayText('CQ = TEST +')).toBe('CQ <BT> TEST <AR>');
    expect(normalizeRadioCopyInput('cq <bt> test <ar>')).toBe('CQ = TEST +');
  });
});
