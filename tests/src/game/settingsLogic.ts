import { SESSION_LIMITS, type SessionSettings } from './config';

/** Moves a setting one step up (+1) or down (-1), always staying inside its documented limits. */
export function stepSetting(key: keyof SessionSettings, value: number, direction: 1 | -1): number {
  const limit = SESSION_LIMITS[key];
  const next = Math.round((value + direction * limit.step) * 100) / 100;
  return Math.min(limit.max, Math.max(limit.min, next));
}

/** Parses what the player typed. Empty or invalid text becomes NaN (rejected by validation). */
export function parseSettingInput(raw: string): number {
  const text = raw.trim().replace(',', '.');
  return text === '' ? NaN : Number(text);
}
