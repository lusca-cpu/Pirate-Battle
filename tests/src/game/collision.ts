import type { Arena } from './arena';
import type { Ship } from './types';

/** Collision body of a ship: three circles along its hull (stern, center, bow). */
export interface BodyShape {
  radius: number;
  halfLength: number;
}

const OFFSETS = [-1, 0, 1] as const;

export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

/** True when a ship body placed at (x, y, heading) is inside the arena and clear of obstacles. */
export function isPoseFree(
  arena: Arena,
  shape: BodyShape,
  x: number,
  y: number,
  heading: number,
  margin = 0,
): boolean {
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  const r = shape.radius + margin;
  for (const o of OFFSETS) {
    const cx = x + fx * shape.halfLength * o;
    const cy = y + fy * shape.halfLength * o;
    if (cx - r < 0 || cy - r < 0 || cx + r > arena.width || cy + r > arena.height) return false;
    for (const c of arena.colliders) {
      if (circlesOverlap(cx, cy, r, c.x, c.y, c.r)) return false;
    }
  }
  return true;
}

/** True when a point-like projectile touches any obstacle. */
export function hitsObstacle(arena: Arena, x: number, y: number, radius: number): boolean {
  for (const c of arena.colliders) {
    if (circlesOverlap(x, y, radius, c.x, c.y, c.r)) return true;
  }
  return false;
}

export function outsideArena(arena: Arena, x: number, y: number): boolean {
  return x < 0 || y < 0 || x > arena.width || y > arena.height;
}

/** Circle vs ship body test (used for projectiles and ramming). */
export function circleHitsShip(
  shape: BodyShape,
  ship: Ship,
  x: number,
  y: number,
  radius: number,
): boolean {
  const fx = Math.cos(ship.heading);
  const fy = Math.sin(ship.heading);
  for (const o of OFFSETS) {
    const cx = ship.x + fx * shape.halfLength * o;
    const cy = ship.y + fy * shape.halfLength * o;
    if (circlesOverlap(x, y, radius, cx, cy, shape.radius)) return true;
  }
  return false;
}

/** Ship body vs ship body test. */
export function shipsOverlap(
  shapeA: BodyShape,
  a: Ship,
  shapeB: BodyShape,
  b: Ship,
): boolean {
  const afx = Math.cos(a.heading);
  const afy = Math.sin(a.heading);
  for (const o of OFFSETS) {
    const ax = a.x + afx * shapeA.halfLength * o;
    const ay = a.y + afy * shapeA.halfLength * o;
    if (circleHitsShip(shapeB, b, ax, ay, shapeA.radius)) return true;
  }
  return false;
}
