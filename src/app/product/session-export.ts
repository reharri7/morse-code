import { SavedCwSession } from './local-product-store';

export function buildSessionText(session: SavedCwSession): string {
  const lines = [
    'Morse Practice receiver session',
    `Saved: ${session.savedAt}`,
    '',
    'RAW TRANSCRIPT — unchanged decoder output',
    session.rawText || '(empty)'
  ];
  if (session.editedText !== session.rawText) {
    lines.push('', 'EDITED COPY — user-controlled', session.editedText || '(empty)');
  }
  if (session.annotations.length) {
    lines.push('', 'CONTEXT NOTES — suggestions only');
    for (const item of session.annotations) lines.push(`- ${item.sourceText}: ${item.title}`);
  }
  return `${lines.join('\n')}\n`;
}

export function buildSessionJson(session: SavedCwSession): string {
  return JSON.stringify({ schemaVersion: 1, ...session }, null, 2);
}
