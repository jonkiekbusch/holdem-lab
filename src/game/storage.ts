// Saves your bankroll and settings on this device. Everything is wrapped so that a browser that
// blocks storage (private windows, some previews) just means nothing is remembered.

import { DEFAULT_SETTINGS, isSpeed, isStackDepth, type Settings } from "./settings.ts";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SavedGame {
  version: 1;
  /** Chips you own that are not on the table. */
  wallet: number;
  /** Chips in front of you at the table when the last hand finished. */
  heroStack: number;
  settings: Settings;
}

const KEY = "holdem-lab:game";

const isCount = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;

export function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadSavedGame(store: KeyValueStore | null): SavedGame | null {
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedGame> & { settings?: Partial<Settings> };
    if (data.version !== 1 || !isCount(data.wallet) || !isCount(data.heroStack)) return null;
    return {
      version: 1,
      wallet: data.wallet,
      heroStack: data.heroStack,
      settings: {
        stackDepth: isStackDepth(data.settings?.stackDepth) ? data.settings.stackDepth : DEFAULT_SETTINGS.stackDepth,
        speed: isSpeed(data.settings?.speed) ? data.settings.speed : DEFAULT_SETTINGS.speed,
      },
    };
  } catch {
    return null;
  }
}

export function saveGame(store: KeyValueStore | null, game: SavedGame): void {
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(game));
  } catch {
    /* storage full or blocked: carry on without saving */
  }
}
