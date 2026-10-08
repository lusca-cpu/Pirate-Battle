export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Wraps an angle to the range [-PI, PI). */
export function normalizeAngle(a: number): number {
  let r = (a + Math.PI) % TAU;
  if (r < 0) r += TAU;
  return r - Math.PI;
}

/** Shortest signed rotation that takes `current` to `target`. */
export function angleDiff(target: number, current: number): number {
  return normalizeAngle(target - current);
}

/** Rotates `current` toward `target` by at most `maxStep` radians. */
export function rotateToward(current: number, target: number, maxStep: number): number {
  const diff = angleDiff(target, current);
  if (Math.abs(diff) <= maxStep) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(diff) * maxStep);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDiff(b, a) * t;
}
