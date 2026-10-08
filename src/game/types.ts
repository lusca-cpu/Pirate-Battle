export type ShipKind = 'player' | 'chaser' | 'shooter';
export type ProjectileOwner = 'player' | 'enemy';
export type MatchStatus = 'running' | 'paused' | 'ended';
export type EndReason = 'time_up' | 'player_destroyed';

/**
 * Heading convention: forward vector is (cos(heading), sin(heading)) with
 * the y axis pointing down (screen coordinates). heading = -PI/2 faces up.
 */
export interface Ship {
  id: number;
  kind: ShipKind;
  x: number;
  y: number;
  heading: number;
  /** Position at the previous simulation step, used for render interpolation. */
  px: number;
  py: number;
  pheading: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  cooldownFront: number;
  cooldownLeft: number;
  cooldownRight: number;
}

export interface Projectile {
  id: number;
  owner: ProjectileOwner;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  /** Remaining life, seconds. */
  ttl: number;
  alive: boolean;
}

/** One-shot facts for the renderer (effects, shake, flashes). */
export type SimEvent =
  | { type: 'shot'; x: number; y: number; owner: ProjectileOwner }
  | { type: 'hit'; x: number; y: number; targetId: number; target: 'player' | 'enemy' }
  | { type: 'impact'; x: number; y: number }
  | { type: 'destroyed'; x: number; y: number; id: number; kind: ShipKind; cause: 'shot' | 'ram' }
  | { type: 'over'; reason: EndReason }
  | { type: 'point' }
  | { type: 'splash'; x: number; y: number }
  | { type: 'collision'; x: number; y: number }
  | { type: 'lowHealth' }
  | { type: 'timeWarning' };

export interface InputState {
  forward: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  fireFront: boolean;
  fireLeft: boolean;
  fireRight: boolean;
}

export interface MatchResult {
  score: number;
  /** Active play time in seconds. */
  durationSec: number;
  reason: EndReason;
}

export function emptyInput(): InputState {
  return {
    forward: false,
    turnLeft: false,
    turnRight: false,
    fireFront: false,
    fireLeft: false,
    fireRight: false,
  };
}
