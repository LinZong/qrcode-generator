import { load, type Store } from '@tauri-apps/plugin-store';
import { DEFAULT_OPTIONS, type QrOptions } from '../types';
import { validateOptions } from './qr';

let settingsStore: Store | undefined;
let saveQueue: Promise<void> = Promise.resolve();

function parseOptions(value: unknown): QrOptions {
  if (!value || typeof value !== 'object') throw new Error('Invalid saved options.');
  const candidate = value as QrOptions;
  validateOptions(candidate);
  return {
    size: candidate.size,
    margin: candidate.margin,
    errorCorrectionLevel: candidate.errorCorrectionLevel,
  };
}

export async function readOptions(): Promise<QrOptions> {
  settingsStore = await load('settings.json', {
    autoSave: false,
    defaults: { options: DEFAULT_OPTIONS },
  });
  return parseOptions(await settingsStore.get('options'));
}

export function writeOptions(options: QrOptions): Promise<void> {
  const snapshot = parseOptions(options);
  // Serialize changes so an earlier save cannot overwrite the newest selection.
  const operation = saveQueue.then(async () => {
    if (!settingsStore) throw new Error('Options storage is unavailable.');
    const previous = await settingsStore.get('options');
    await settingsStore.set('options', snapshot);
    try {
      await settingsStore.save();
    } catch (error) {
      await settingsStore.set('options', previous);
      throw error;
    }
  });
  saveQueue = operation.catch(() => {});
  return operation;
}
