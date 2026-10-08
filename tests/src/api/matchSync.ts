import type { MatchRecord } from './contracts';
import { registerMatch } from './client';

const PENDING_KEY = 'pirate-battle:pending-matches:v1';
const PLAYER_ID_KEY = 'pirate-battle:player-id:v1';

function readPending(): MatchRecord[] {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as MatchRecord[]) : [];
  } catch {
    return [];
  }
}

function writePending(items: MatchRecord[]): void {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(items));
  } catch {
    // A blocked localStorage must never interrupt gameplay.
  }
}

export function getPlayerId(): string {
  try {
    const existing = window.localStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    const id = `player-${crypto.randomUUID()}`;
    window.localStorage.setItem(PLAYER_ID_KEY, id);
    return id;
  } catch {
    return 'player-local';
  }
}

export function loadPendingMatches(): MatchRecord[] {
  return readPending();
}

export function addPendingMatch(record: MatchRecord): void {
  const current = readPending();
  if (current.some((item) => item.matchId === record.matchId)) return;
  writePending([...current, record]);
}

export function removePendingMatch(matchId: string): void {
  writePending(readPending().filter((item) => item.matchId !== matchId));
}

/**
 * The same matchId is reused on every retry. The mock/API treats it as the
 * idempotency key, so a timeout after a successful write cannot create a duplicate.
 */
export async function syncPendingMatch(record: MatchRecord): Promise<void> {
  addPendingMatch(record);
  await registerMatch(record);
  removePendingMatch(record.matchId);
}
