import type { MatchStatus } from '../game/types';

/**
 * What React needs to know about the running match. The simulation updates
 * it only when a displayed value actually changes (score, whole seconds,
 * whole hit points, status), so React never re-renders per frame.
 */
export interface HudSnapshot {
  status: MatchStatus;
  score: number;
  timeLeftSec: number;
  hp: number;
  maxHp: number;
}

export const INITIAL_HUD: HudSnapshot = {
  status: 'running',
  score: 0,
  timeLeftSec: 0,
  hp: 0,
  maxHp: 0,
};

type Listener = () => void;

/** Minimal external store, compatible with React's useSyncExternalStore. */
export class GameStore {
  private snapshot: HudSnapshot = INITIAL_HUD;
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): HudSnapshot => this.snapshot;

  set(next: HudSnapshot): void {
    const s = this.snapshot;
    if (
      s.status === next.status &&
      s.score === next.score &&
      s.timeLeftSec === next.timeLeftSec &&
      s.hp === next.hp &&
      s.maxHp === next.maxHp
    ) {
      return;
    }
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }
}
