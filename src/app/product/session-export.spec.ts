import { buildSessionJson, buildSessionText } from './session-export';
import { SavedCwSession } from './local-product-store';

describe('session export', () => {
  const record: SavedCwSession = {
    id: 'test', savedAt: '2026-09-15T12:00:00.000Z', rawText: '5NN', editedText: '599',
    annotations: [{
      id: 'report', kind: 'signal-report', sourceStart: 0, sourceEnd: 3, sourceText: '5NN',
      title: 'Shorthand signal report 599', explanation: 'N means 9.', confidence: 0.9, replacement: '599'
    }],
    metadata: { deviceLabel: 'Mic', toneFrequencyHz: 600, characterWordsPerMinute: 20, effectiveWordsPerMinute: 20 }
  };

  it('labels raw, edited, and contextual text separately in text exports', () => {
    const output = buildSessionText(record);
    expect(output).toContain('RAW TRANSCRIPT');
    expect(output).toContain('EDITED COPY');
    expect(output).toContain('CONTEXT NOTES');
  });

  it('includes a schema version and preserves raw text in JSON exports', () => {
    const output = JSON.parse(buildSessionJson(record));
    expect(output.schemaVersion).toBe(1);
    expect(output.rawText).toBe('5NN');
    expect(output.editedText).toBe('599');
  });
});
