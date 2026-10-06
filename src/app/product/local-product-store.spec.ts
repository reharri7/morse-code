import { LocalProductStore, OperatorSettings, SavedCwSession, StorageLike } from './local-product-store';

class MemoryStorage implements StorageLike {
  value: string | null = null;
  getItem(): string | null { return this.value; }
  setItem(_key: string, value: string): void { this.value = value; }
}

const settings: OperatorSettings = {
  selectedDeviceId: 'built-in', lockMode: 'manual', scanMinFrequencyHz: 350,
  scanMaxFrequencyHz: 950, manualFrequencyHz: 625
};

function session(id: string): SavedCwSession {
  return {
    id, savedAt: '2026-09-15T12:00:00.000Z', rawText: 'CQ DE K1ABC', editedText: 'CQ DE K1ABC', annotations: [],
    metadata: { deviceLabel: 'Microphone', toneFrequencyHz: 625, characterWordsPerMinute: 20, effectiveWordsPerMinute: 18 }
  };
}

describe('LocalProductStore', () => {
  it('round-trips settings and saved sessions without audio', () => {
    const storage = new MemoryStorage();
    const store = new LocalProductStore(storage);
    store.saveSettings(settings);
    store.saveSession(session('one'));

    expect(store.loadSettings()).toEqual(settings);
    expect(store.loadSessions()[0].rawText).toBe('CQ DE K1ABC');
    expect(storage.value).not.toContain('samples');
  });

  it('migrates a legacy transcript shape and tolerates corrupt storage', () => {
    const storage = new MemoryStorage();
    storage.value = JSON.stringify({ schemaVersion: 0, transcripts: [{ text: '73', savedAt: '2026-01-02T00:00:00.000Z' }] });
    expect(new LocalProductStore(storage).loadSessions()[0].rawText).toBe('73');

    storage.value = '{bad json';
    expect(new LocalProductStore(storage).loadSessions()).toEqual([]);
  });

  it('bounds retained sessions and keeps the newest first', () => {
    const storage = new MemoryStorage();
    const store = new LocalProductStore(storage);
    for (let index = 0; index < 30; index += 1) store.saveSession(session(String(index)));
    expect(store.loadSessions().length).toBe(25);
    expect(store.loadSessions()[0].id).toBe('29');
  });

  it('reports a full or unavailable storage area without interrupting decoding', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }
    };
    const store = new LocalProductStore(storage);
    expect(() => store.saveSession(session('one'))).not.toThrow();
    expect(store.lastWriteSucceeded).toBeFalse();
  });
});
