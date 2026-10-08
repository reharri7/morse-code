import { VerificationResult } from './verification-model';
import { AcousticVerificationResult } from './acoustic-verification';

export function buildVerificationText(result: VerificationResult): string {
  const lines = [
    'Morse Practice receiver verification report',
    `Completed: ${result.completedAt}`,
    `Case: ${result.case.id} (version ${result.case.version})`,
    `Source: ${result.case.sourceKind} — ${result.sourceName}`,
    `Browser: ${result.observations.browserUserAgent ?? '(not recorded)'}`,
    `Overall: ${result.passed ? 'PASS' : 'NEEDS ATTENTION'}`,
    '',
    'STAGES'
  ];
  for (const stage of result.stages) {
    lines.push(`- ${stage.label}: ${stage.status.toUpperCase()} — ${stage.summary}`);
  }
  lines.push('', 'RAW EXPECTED', result.expectedText ?? '(not supplied)', '', 'RAW ACTUAL', result.rawText || '(empty)');
  if (result.metrics) {
    lines.push(
      '', 'RAW SCORE',
      `Exact: ${result.metrics.exact ? 'yes' : 'no'}`,
      `Character error rate: ${(result.metrics.characterErrorRate * 100).toFixed(2)}%`,
      `Word error rate: ${(result.metrics.wordErrorRate * 100).toFixed(2)}%`,
      `Unknown-character rate: ${(result.metrics.unknownSymbolRate * 100).toFixed(2)}%`
    );
  }
  lines.push('', 'RECOMMENDATION', result.recommendation, '', 'No PCM, edited text, or context-corrected text is included.');
  return `${lines.join('\n')}\n`;
}

export function buildVerificationJson(result: VerificationResult): string {
  return JSON.stringify({
    ...result,
    privacy: { pcmIncluded: false, editedTextIncluded: false, contextCorrectionsIncluded: false }
  }, null, 2);
}

export function buildAcousticVerificationText(result: AcousticVerificationResult): string {
  const lines = [
    'Morse Practice acoustic receiver verification report',
    `Completed: ${result.completedAt}`,
    `Microphone: ${result.deviceLabel}`,
    'Calibration: PROVISIONAL — target MacBook baseline not yet measured',
    `Level check: ${result.level}`,
    `Room noise RMS: ${result.roomNoiseRms.toFixed(6)}`,
    `Level-check RMS: ${result.levelCheckRms.toFixed(6)}`,
    `Level-check peak: ${result.levelCheckPeak.toFixed(6)}`,
    `Provisional target: at least 2 of 3 repetitions at or below ${(result.provisionalCharacterErrorRateTarget * 100).toFixed(0)}% CER`,
    `Provisional outcome: ${result.provisionalPass ? 'MET' : 'NOT MET'} (${result.passingRepetitionCount} of 3)`,
    ''
  ];
  result.repetitions.forEach((repetition, index) => {
    lines.push(
      `REPETITION ${index + 1}`,
      `Raw expected: ${repetition.expectedText ?? '(not supplied)'}`,
      `Raw actual: ${repetition.rawText || '(empty)'}`,
      `CER: ${((repetition.metrics?.characterErrorRate ?? 1) * 100).toFixed(2)}%`,
      `Tone: ${repetition.observations.acquiredToneFrequencyHz === null ? 'not found' : `${Math.round(repetition.observations.acquiredToneFrequencyHz)} Hz`}`,
    );
    for (const stage of repetition.stages) {
      lines.push(`- ${stage.label}: ${stage.status.toUpperCase()} — ${stage.summary}`);
    }
    lines.push('');
  });
  lines.push('No PCM, edited text, or context-corrected text is included.');
  return `${lines.join('\n')}\n`;
}

export function buildAcousticVerificationJson(result: AcousticVerificationResult): string {
  return JSON.stringify({
    ...result,
    privacy: { pcmIncluded: false, editedTextIncluded: false, contextCorrectionsIncluded: false }
  }, null, 2);
}
