import { encodeMorseText } from '../../core/morse/morse-sequence';
import { activeKochSymbols } from './koch-course';
import { createSeededRandom } from './seeded-random';

type SeededRandom = () => number;

export const RADIO_PRACTICE_DATA_VERSION = 1;

export interface SimulatedCallsign {
  readonly value: string;
  readonly simulated: true;
  readonly template: 'L-D-LL' | 'LL-D-L' | 'L-D-LLL' | 'LL-D-LL';
}

export interface RadioTokenConvention {
  readonly audioSymbol: '=' | '+';
  readonly display: '<BT>' | '<AR>';
  readonly meaning: string;
}

export const RADIO_TOKEN_CONVENTIONS: readonly RadioTokenConvention[] = Object.freeze([
  Object.freeze({ audioSymbol: '=', display: '<BT>', meaning: 'break between thoughts' }),
  Object.freeze({ audioSymbol: '+', display: '<AR>', meaning: 'end of message' })
]);

export const COMMON_CW_VOCABULARY_V1 = Object.freeze({
  id: 'common-cw-vocabulary', version: RADIO_PRACTICE_DATA_VERSION,
  entries: Object.freeze([
    Object.freeze({ text: 'CQ', meaning: 'calling any station' }),
    Object.freeze({ text: 'DE', meaning: 'from' }),
    Object.freeze({ text: 'RST', meaning: 'readability, strength, tone report' }),
    Object.freeze({ text: 'NAME', meaning: 'operator name follows' }),
    Object.freeze({ text: 'QTH', meaning: 'station location' }),
    Object.freeze({ text: 'TU', meaning: 'thank you' }),
    Object.freeze({ text: '73', meaning: 'best regards' })
  ])
});

export interface SimulatedCallsignOptions {
  readonly currentSymbolCount: number;
  readonly count: number;
  readonly seed: string | number;
}

export function generateSimulatedCallsigns(options: SimulatedCallsignOptions): readonly SimulatedCallsign[] {
  if (!Number.isInteger(options.count) || options.count < 0 || options.count > 100) {
    throw new Error('Callsign count must be an integer between 0 and 100.');
  }
  const active = activeKochSymbols(options.currentSymbolCount);
  const letters = active.filter((symbol) => /^[A-Z]$/.test(symbol));
  const digits = active.filter((symbol) => /^\d$/.test(symbol));
  if (options.count === 0 || letters.length < 2 || digits.length === 0) return Object.freeze([]);
  const random = createSeededRandom(options.seed);
  const templates: SimulatedCallsign['template'][] = ['L-D-LL', 'LL-D-L', 'L-D-LLL', 'LL-D-LL'];
  const seen = new Set<string>();
  const result: SimulatedCallsign[] = [];
  let attempts = 0;
  while (result.length < options.count && attempts < options.count * 30) {
    attempts += 1;
    const template = choose(templates, random);
    const parts = template.split('-').map((part) => {
      if (part === 'D') return choose(digits, random);
      return Array.from({ length: part.length }, () => choose(letters, random)).join('');
    });
    const value = parts.join('');
    if (seen.has(value)) continue;
    encodeMorseText(value);
    seen.add(value);
    result.push(Object.freeze({ value, simulated: true, template }));
  }
  return Object.freeze(result);
}

export interface RadioPracticeTrial {
  readonly id: string;
  readonly kind: 'callsign' | 'contest' | 'qso';
  readonly label: string;
  readonly audioText: string;
  readonly displayText: string;
  readonly explanation: string;
  readonly speaker: 'station-a' | 'station-b' | null;
}

export function generateContestTrials(options: SimulatedCallsignOptions): readonly RadioPracticeTrial[] {
  const callsigns = generateSimulatedCallsigns(options);
  if (!callsigns.length) return Object.freeze([]);
  const allowed = new Set(activeKochSymbols(options.currentSymbolCount));
  const reports = ['559', '579', '599'].filter((value) => [...value].every((symbol) => allowed.has(symbol)));
  const digits = [...allowed].filter((symbol) => /^\d$/.test(symbol));
  if (!reports.length || !digits.length) return Object.freeze([]);
  const random = createSeededRandom(`${options.seed}:contest`);
  return Object.freeze(callsigns.map((callsign, index) => {
    const report = choose(reports, random);
    const serial = Array.from({ length: 3 }, () => choose(digits, random)).join('');
    const audioText = `${callsign.value} ${report} ${serial}`;
    encodeMorseText(audioText);
    return Object.freeze({
      id: `contest-${index + 1}`, kind: 'contest' as const, label: 'Contest exchange',
      audioText, displayText: audioText,
      explanation: 'A simulated callsign, RST report, and three-digit serial. It is practice data, not a logged contact.',
      speaker: null
    });
  }));
}

export interface SimulatedQso {
  readonly id: string;
  readonly simulated: true;
  readonly stations: readonly [string, string];
  readonly turns: readonly RadioPracticeTrial[];
}

const PRACTICE_NAMES = Object.freeze(['ADA', 'LEE', 'SAM', 'IVAN', 'NORA']);
const PRACTICE_QTHS = Object.freeze(['NORTH', 'EAST', 'WEST', 'COAST', 'RIDGE']);

export function generateSimulatedQso(currentSymbolCount: number, seed: string | number): SimulatedQso | null {
  const callsigns = generateSimulatedCallsigns({ currentSymbolCount, count: 2, seed: `${seed}:calls` });
  if (callsigns.length < 2) return null;
  const allowed = new Set(activeKochSymbols(currentSymbolCount));
  const eligible = (values: readonly string[]) => values.filter((value) => [...value].every((symbol) => allowed.has(symbol)));
  const names = eligible(PRACTICE_NAMES);
  const qths = eligible(PRACTICE_QTHS);
  const required = ['CQ', 'DE', 'UR', 'RST', 'NAME', 'QTH', 'TU', '73', '599'];
  if (!names.length || !qths.length || required.some((value) => [...value].some((symbol) => !allowed.has(symbol)))) return null;
  const random = createSeededRandom(`${seed}:details`);
  const [stationA, stationB] = callsigns.map((item) => item.value) as [string, string];
  const nameA = choose(names, random);
  const nameB = choose(names.filter((name) => name !== nameA).length ? names.filter((name) => name !== nameA) : names, random);
  const qthA = choose(qths, random);
  const qthB = choose(qths.filter((qth) => qth !== qthA).length ? qths.filter((qth) => qth !== qthA) : qths, random);
  const definitions: readonly [string, string, string, 'station-a' | 'station-b'][] = [
    ['Calling CQ', `CQ CQ DE ${stationA} ${stationA} +`, 'Station A calls any station, identifies twice, then sends <AR>.', 'station-a'],
    ['Answering the call', `${stationA} DE ${stationB} K`, 'Station B answers and invites Station A to transmit.', 'station-b'],
    ['Report and details', `${stationB} DE ${stationA} = UR RST 599 = NAME ${nameA} = QTH ${qthA} K`, 'Station A sends an RST report, simulated name, and simulated location.', 'station-a'],
    ['Return report', `${stationA} DE ${stationB} = UR RST 599 = NAME ${nameB} = QTH ${qthB} K`, 'Station B returns the same fields.', 'station-b'],
    ['Sign-off', `${stationB} DE ${stationA} TU 73 +`, 'Station A thanks Station B and signs off with best regards.', 'station-a'],
    ['Final sign-off', `${stationA} DE ${stationB} TU 73 +`, 'Station B closes the simulated contact.', 'station-b']
  ];
  const turns = definitions.map(([label, audioText, explanation, speaker], index) => {
    encodeMorseText(audioText);
    return Object.freeze({
      id: `qso-${index + 1}`, kind: 'qso' as const, label, audioText,
      displayText: radioDisplayText(audioText), explanation, speaker
    });
  });
  const stations: readonly [string, string] = Object.freeze([stationA, stationB]);
  return Object.freeze({ id: `simulated-qso-${String(seed)}`, simulated: true, stations, turns: Object.freeze(turns) });
}

export function radioDisplayText(audioText: string): string {
  return audioText.replaceAll('=', '<BT>').replaceAll('+', '<AR>');
}

export function normalizeRadioCopyInput(value: string): string {
  return value.toUpperCase().replaceAll('<BT>', '=').replaceAll('<AR>', '+');
}

function choose<T>(values: readonly T[], random: SeededRandom): T {
  return values[Math.floor(random() * values.length)];
}
