import { load } from '@tauri-apps/plugin-store';
import { readOptions, writeOptions } from '../services/settings';
import { DEFAULT_OPTIONS } from '../types';

vi.mock('@tauri-apps/plugin-store', () => ({ load: vi.fn() }));

function mockStore(initial: unknown = { ...DEFAULT_OPTIONS }) {
  let value = initial;
  const store = {
    get: vi.fn(async () => value),
    set: vi.fn(async (_key: string, next: unknown) => {
      value = next;
    }),
    save: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(load).mockResolvedValue(store as never);
  return store;
}

describe('remembered QR options', () => {
  it('uses a separate settings file and restores all three options', async () => {
    const saved = { size: 768, margin: 6, errorCorrectionLevel: 'H' as const };
    const store = mockStore(saved);
    expect(await readOptions()).toEqual(saved);
    expect(load).toHaveBeenCalledWith('settings.json', {
      autoSave: false,
      defaults: { options: DEFAULT_OPTIONS },
    });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('rejects invalid saved values', async () => {
    for (const options of [
      null,
      {},
      { ...DEFAULT_OPTIONS, size: 0 },
      { ...DEFAULT_OPTIONS, margin: 1.5 },
      { ...DEFAULT_OPTIONS, errorCorrectionLevel: 'X' },
    ]) {
      mockStore(options);
      await expect(readOptions()).rejects.toThrow();
    }
  });

  it('serializes rapid changes and keeps the newest complete snapshot', async () => {
    const store = mockStore();
    await readOptions();
    const first = { ...DEFAULT_OPTIONS, size: 768 };
    const last = { ...first, margin: 6, errorCorrectionLevel: 'H' as const };
    const firstSave = writeOptions(first);
    const lastSave = writeOptions(last);
    // Later mutation of the caller's object must not change an already queued write.
    last.margin = 9;
    await Promise.all([firstSave, lastSave]);
    expect(store.set.mock.calls.map((call) => call[1])).toEqual([first, { ...last, margin: 6 }]);
    expect(await store.get()).toEqual({ ...last, margin: 6 });
    expect(store.save).toHaveBeenCalledTimes(2);
  });

  it('rolls back failed writes and still allows a later successful change', async () => {
    const store = mockStore();
    await readOptions();
    store.save.mockRejectedValueOnce(new Error('Disk full'));
    await expect(writeOptions({ ...DEFAULT_OPTIONS, margin: 8 })).rejects.toThrow('Disk full');
    expect(await store.get()).toEqual(DEFAULT_OPTIONS);
    await writeOptions({ ...DEFAULT_OPTIONS, size: 1024 });
    expect(await store.get()).toEqual({ ...DEFAULT_OPTIONS, size: 1024 });
  });
});
