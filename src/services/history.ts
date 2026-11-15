import { load, type Store } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';
import { inputKey, validateInput } from './qr';
import type { HistoryEntry, QrInput } from '../types';

export const HISTORY_LIMIT = 500;
let historyStore: Store | undefined;

function newHistoryId(): string {
  // getRandomValues is available on older WebKit versions without randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function parseHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value) || value.length > HISTORY_LIMIT)
    throw new Error('Invalid history file.');
  const ids = new Set<string>();
  const keys = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid history entry.');
    const e = item as HistoryEntry;
    if (
      typeof e.id !== 'string' ||
      !e.id ||
      typeof e.text !== 'string' ||
      typeof e.generatedAt !== 'string' ||
      !Number.isFinite(Date.parse(e.generatedAt)) ||
      !e.options
    ) {
      throw new Error('Invalid history entry.');
    }
    validateInput(e);
    const key = inputKey(e);
    if (ids.has(e.id) || keys.has(key)) throw new Error('Duplicate history entry.');
    ids.add(e.id);
    keys.add(key);
    return { id: e.id, text: e.text, generatedAt: e.generatedAt, options: { ...e.options } };
  });
}

export async function readHistory(): Promise<HistoryEntry[]> {
  // Do not enable writes until the entire existing document has been validated.
  historyStore = undefined;
  await invoke('validate_history_file');
  const store = await load('history.json', {
    autoSave: false,
    defaults: { version: 1, entries: [] },
  });
  if ((await store.get('version')) !== 1) throw new Error('Unsupported history version.');
  const entries = parseHistory(await store.get('entries'));
  historyStore = store;
  return entries;
}

export async function writeHistory(entries: HistoryEntry[]): Promise<void> {
  if (!historyStore)
    throw new Error('History is unavailable. The existing file has not been changed.');
  const previous = await historyStore.get('entries');
  await historyStore.set('entries', entries);
  try {
    await historyStore.save();
  } catch (error) {
    await historyStore.set('entries', previous);
    throw error;
  }
}

export function addHistory(
  entries: HistoryEntry[],
  input: QrInput,
  now = new Date(),
): HistoryEntry[] {
  const key = inputKey(input);
  const existing = entries.find((entry) => inputKey(entry) === key);
  return [
    {
      id: existing?.id ?? newHistoryId(),
      generatedAt: now.toISOString(),
      text: input.text,
      options: { ...input.options },
    },
    ...entries.filter((entry) => inputKey(entry) !== key),
  ].slice(0, HISTORY_LIMIT);
}
