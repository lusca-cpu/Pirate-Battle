import type { MatchRecord } from '../api/contracts';
import type { SessionSettings } from '../game/config';

export const DEFAULT_FIXTURE_CONFIG: SessionSettings = {
  durationSec: 120,
  spawnIntervalSec: 3,
};

const names = ['Blackbeard', 'Anne Bonny', 'Calico Jack', 'Morgan', 'Silver'];

export const FIXTURE_MATCHES: MatchRecord[] = names.map((_name, index) => ({
  matchId: `fixture-${index + 1}`,
  playerId: `fixture-player-${index + 1}`,
  playedAt: new Date(Date.UTC(2026, 8, 1 + index)).toISOString(),
  score: 900 - index * 110,
  durationSec: 120,
  endReason: 'time_up',
  config: DEFAULT_FIXTURE_CONFIG,
}));

export function readConfirmedRecords(): MatchRecord[] {
  try {
    const raw = window.localStorage.getItem('pirate-battle:mock-records:v1');
    return raw ? (JSON.parse(raw) as MatchRecord[]) : [];
  } catch {
    return [];
  }
}

export function writeConfirmedRecords(records: MatchRecord[]): void {
  try { window.localStorage.setItem('pirate-battle:mock-records:v1', JSON.stringify(records)); } catch { /* noop */ }
}

export function ensureFixtures(): MatchRecord[] {
  const current = readConfirmedRecords();
  if (current.length) return current;
  writeConfirmedRecords(FIXTURE_MATCHES);
  return FIXTURE_MATCHES;
}
