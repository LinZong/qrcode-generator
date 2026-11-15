import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import {
  addHistory,
  HISTORY_LIMIT,
  parseHistory,
  readHistory,
  writeHistory,
} from '../services/history';
import { DEFAULT_OPTIONS, type HistoryEntry } from '../types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/plugin-store', () => ({ load: vi.fn() }));

const entry = (text: string): HistoryEntry => ({
  id: text,
  text,
  options: { ...DEFAULT_OPTIONS },
  generatedAt: '2026-01-01T00:00:00.000Z',
});

describe('history', () => {
  it('deduplicates exact input and settings, refreshes time, and preserves distinct settings', () => {
    const entries = [entry('first'), entry('second')];
    const next = addHistory(entries, entries[1], new Date('2026-02-01T00:00:00Z'));
    expect(next.map((e) => e.id)).toEqual(['second', 'first']);
    expect(next[0].generatedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(
      addHistory(next, { ...next[0], options: { ...DEFAULT_OPTIONS, margin: 0 } }),
    ).toHaveLength(3);
    expect(addHistory(next, { text: 'second ', options: DEFAULT_OPTIONS })).toHaveLength(3);
  });

  it('keeps the latest 500 records and does not persist image data', () => {
    const entries = Array.from({ length: HISTORY_LIMIT }, (_, i) => entry(String(i)));
    const next = addHistory(entries, { text: 'new', options: DEFAULT_OPTIONS });
    expect(next).toHaveLength(HISTORY_LIMIT);
    expect(next[0].text).toBe('new');
    expect(next.at(-1)?.text).toBe('498');
    expect(next[0]).not.toHaveProperty('svg');
  });

  it('rejects malformed and duplicate entries rather than silently discarding data', () => {
    for (const value of [
      null,
      {},
      [null],
      [{}],
      [{ ...entry('x'), options: null }],
      [entry('x'), entry('x')],
      [{ ...entry('x'), generatedAt: 'bad' }],
    ]) {
      expect(() => parseHistory(value)).toThrow();
    }
    expect(parseHistory([entry('ok')])).toEqual([entry('ok')]);
  });

  it('validates the original file before loading defaults, then explicitly saves', async () => {
    const store = {
      get: vi.fn(async (key: string) => (key === 'version' ? 1 : [entry('old')])),
      set: vi.fn(),
      save: vi.fn(),
    };
    vi.mocked(load).mockResolvedValue(store as never);
    expect(await readHistory()).toEqual([entry('old')]);
    expect(invoke).toHaveBeenCalledWith('validate_history_file');
    expect(load).toHaveBeenCalledWith('history.json', {
      autoSave: false,
      defaults: { version: 1, entries: [] },
    });
    await writeHistory([]);
    expect(store.save).toHaveBeenCalledOnce();
  });

  it('blocks writes when the existing file is damaged', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Invalid JSON'));
    await expect(readHistory()).rejects.toThrow('Invalid JSON');
    expect(load).not.toHaveBeenCalled();
    await expect(writeHistory([])).rejects.toThrow('unavailable');
  });

  it('rolls back the store cache after a write failure', async () => {
    const store = {
      get: vi.fn(async (key: string) => (key === 'version' ? 1 : [entry('old')])),
      set: vi.fn(),
      save: vi.fn().mockRejectedValue(new Error('Disk full')),
    };
    vi.mocked(load).mockResolvedValue(store as never);
    await readHistory();
    await expect(writeHistory([])).rejects.toThrow('Disk full');
    expect(store.set).toHaveBeenLastCalledWith('entries', [entry('old')]);
  });
});
