import { HamContextAnnotation } from '../context/ham-context';

export interface OperatorSettings {
  readonly selectedDeviceId: string;
  readonly lockMode: 'automatic' | 'manual';
  readonly scanMinFrequencyHz: number;
  readonly scanMaxFrequencyHz: number;
  readonly manualFrequencyHz: number;
}

export interface SavedCwSession {
  readonly id: string;
  readonly savedAt: string;
  readonly rawText: string;
  readonly editedText: string;
  readonly annotations: readonly HamContextAnnotation[];
  readonly metadata: {
    readonly deviceLabel: string;
    readonly toneFrequencyHz: number | null;
    readonly characterWordsPerMinute: number;
    readonly effectiveWordsPerMinute: number;
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredProductData {
  readonly schemaVersion: 1;
  readonly settings: OperatorSettings | null;
  readonly sessions: readonly SavedCwSession[];
}

interface LegacyProductData {
  readonly schemaVersion?: 0;
  readonly settings?: Partial<OperatorSettings>;
  readonly transcripts?: readonly { readonly text?: string; readonly savedAt?: string }[];
}

const STORAGE_KEY = 'cw-transcriber.product.v1';
const MAX_SESSIONS = 25;
const MAX_TRANSCRIPT_LENGTH = 100_000;

export class LocalProductStore {
  lastWriteSucceeded = true;

  constructor(private readonly storage: StorageLike) {}

  loadSettings(): OperatorSettings | null {
    return this.read().settings;
  }

  saveSettings(settings: OperatorSettings): void {
    const current = this.read();
    this.write({ ...current, settings: sanitizeSettings(settings) });
  }

  loadSessions(): readonly SavedCwSession[] {
    return this.read().sessions;
  }

  saveSession(session: SavedCwSession): readonly SavedCwSession[] {
    const current = this.read();
    const safe = sanitizeSession(session);
    const sessions = [safe, ...current.sessions.filter((item) => item.id !== safe.id)].slice(0, MAX_SESSIONS);
    this.write({ ...current, sessions });
    return sessions;
  }

  deleteSession(id: string): readonly SavedCwSession[] {
    const current = this.read();
    const sessions = current.sessions.filter((session) => session.id !== id);
    this.write({ ...current, sessions });
    return sessions;
  }

  private read(): StoredProductData {
    try {
      const value = this.storage.getItem(STORAGE_KEY);
      if (!value) return emptyData();
      const parsed = JSON.parse(value) as StoredProductData | LegacyProductData;
      if (parsed.schemaVersion === 1 && 'sessions' in parsed) {
        return {
          schemaVersion: 1,
          settings: parsed.settings ? sanitizeSettings(parsed.settings) : null,
          sessions: Array.isArray(parsed.sessions) ? parsed.sessions.map(sanitizeSession).slice(0, MAX_SESSIONS) : []
        };
      }
      return migrateLegacy(parsed);
    } catch {
      return emptyData();
    }
  }

  private write(data: StoredProductData): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
      this.lastWriteSucceeded = true;
    } catch {
      // Storage can be unavailable or full. The live decoder must continue regardless.
      this.lastWriteSucceeded = false;
    }
  }
}

function emptyData(): StoredProductData {
  return { schemaVersion: 1, settings: null, sessions: [] };
}

function sanitizeSettings(settings: Partial<OperatorSettings>): OperatorSettings {
  const minimum = clampNumber(settings.scanMinFrequencyHz, 100, 1_900, 300);
  const maximum = clampNumber(settings.scanMaxFrequencyHz, minimum + 10, 2_000, 1_200);
  return {
    selectedDeviceId: typeof settings.selectedDeviceId === 'string' ? settings.selectedDeviceId : '',
    lockMode: settings.lockMode === 'manual' ? 'manual' : 'automatic',
    scanMinFrequencyHz: minimum,
    scanMaxFrequencyHz: maximum,
    manualFrequencyHz: clampNumber(settings.manualFrequencyHz, minimum, maximum, 600)
  };
}

function sanitizeSession(session: SavedCwSession): SavedCwSession {
  return {
    id: String(session.id).slice(0, 120),
    savedAt: validDate(session.savedAt),
    rawText: String(session.rawText).slice(0, MAX_TRANSCRIPT_LENGTH),
    editedText: String(session.editedText).slice(0, MAX_TRANSCRIPT_LENGTH),
    annotations: Array.isArray(session.annotations) ? session.annotations.slice(0, 500) : [],
    metadata: {
      deviceLabel: String(session.metadata?.deviceLabel ?? '').slice(0, 200),
      toneFrequencyHz: finiteOrNull(session.metadata?.toneFrequencyHz),
      characterWordsPerMinute: finiteOrZero(session.metadata?.characterWordsPerMinute),
      effectiveWordsPerMinute: finiteOrZero(session.metadata?.effectiveWordsPerMinute)
    }
  };
}

function migrateLegacy(legacy: LegacyProductData): StoredProductData {
  const sessions = (legacy.transcripts ?? []).map((entry, index): SavedCwSession => ({
    id: `migrated-${index}-${entry.savedAt ?? 'unknown'}`,
    savedAt: validDate(entry.savedAt),
    rawText: String(entry.text ?? '').slice(0, MAX_TRANSCRIPT_LENGTH),
    editedText: String(entry.text ?? '').slice(0, MAX_TRANSCRIPT_LENGTH),
    annotations: [],
    metadata: { deviceLabel: '', toneFrequencyHz: null, characterWordsPerMinute: 0, effectiveWordsPerMinute: 0 }
  })).slice(0, MAX_SESSIONS);
  return { schemaVersion: 1, settings: legacy.settings ? sanitizeSettings(legacy.settings) : null, sessions };
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, numeric)) : fallback;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function finiteOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function validDate(value: unknown): string {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return value;
  return new Date(0).toISOString();
}
