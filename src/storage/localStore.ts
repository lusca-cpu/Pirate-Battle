import {
  DEFAULT_SETTINGS,
  validateSettings,
  type SessionSettings,
} from '../game/config';
import type { MatchResult } from '../game/types';

const SETTINGS_KEY = 'pirate-battle:settings:v1';
const LAST_RESULT_KEY = 'pirate-battle:last-result:v1';

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // storage blocked or corrupted: behave as if empty.
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Always returns valid settings: anything missing or out of range falls back to the defaults. */
export function loadSettings(): SessionSettings {
  const stored = read<Partial<SessionSettings>>(SETTINGS_KEY);
  const candidate: SessionSettings = {
    durationSec: Number(stored?.durationSec ?? DEFAULT_SETTINGS.durationSec),
    spawnIntervalSec: Number(stored?.spawnIntervalSec ?? DEFAULT_SETTINGS.spawnIntervalSec),
  };
  return Object.keys(validateSettings(candidate)).length === 0 ? candidate : { ...DEFAULT_SETTINGS };
}

/** Returns false (and stores nothing) when the values are invalid. */
export function saveSettings(settings: SessionSettings): boolean {
  if (Object.keys(validateSettings(settings)).length > 0) return false;
  return write(SETTINGS_KEY, settings);
}

export interface StoredResult extends MatchResult {
  matchId: string;
  settings: SessionSettings;
  endedAt: string;
}

export function loadLastResult(): StoredResult | null {
  return read<StoredResult>(LAST_RESULT_KEY);
}

export function saveLastResult(result: StoredResult): void {
  write(LAST_RESULT_KEY, result);
}
