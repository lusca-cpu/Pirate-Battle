/**
 * Central, typed gameplay configuration.
 * Balancing changes live here only: the systems never hard-code numbers.
 * Distances are in logical arena units (pixels of the 1280x720 arena),
 * times in seconds, angles in radians.
 */

export interface ShipStats {
  maxHp: number;
  /** Forward speed, units/second. */
  speed: number;
  /** Rotation speed, radians/second. */
  turnSpeed: number;
  /** Radius of each body circle used for collisions. */
  radius: number;
  /** Distance from the hull center to the bow/stern collision circles. */
  hullHalfLength: number;
}

export interface ProjectileStats {
  speed: number;
  damage: number;
  /** Seconds before the projectile disappears (defines its range). */
  lifetime: number;
  radius: number;
}

export interface PlayerConfig extends ShipStats {
  frontCooldown: number;
  sideCooldown: number;
  /** Distance between the three parallel side projectiles. */
  sideSpread: number;
  /** Distance from the hull center to where side shots leave the ship. */
  sideOffset: number;
  /** Distance from the hull center to where front shots leave the ship. */
  muzzleOffset: number;
  projectile: ProjectileStats;
}

export interface ChaserConfig extends ShipStats {
  /** Damage dealt to the player when it rams the ship (it explodes). */
  contactDamage: number;
}

export interface ShooterConfig extends ShipStats {
  /** Distance from the player at which it starts shooting. */
  attackRange: number;
  /** It stops approaching once it is this close. */
  preferredDistance: number;
  cooldown: number;
  /** Maximum aiming error (radians) allowed to fire. */
  aimTolerance: number;
  muzzleOffset: number;
  projectile: ProjectileStats;
}

export interface SpawnConfig {
  /** Spawn points must be at least this far from the player. */
  minPlayerDistance: number;
  /** Distance kept from the arena edges when picking a spawn point. */
  edgeMargin: number;
  /** Extra free space required around a spawn point. */
  clearance: number;
  maxAlive: number;
  /** Relative chance of each type (after the guaranteed first two spawns). */
  weights: { chaser: number; shooter: number };
  maxAttempts: number;
}

/** The two values the player can change in the Options screen. */
export interface SessionSettings {
  /** Active play time, seconds. */
  durationSec: number;
  /** Seconds between enemy spawns. */
  spawnIntervalSec: number;
}

export interface GameConfig {
  session: SessionSettings;
  arena: { width: number; height: number };
  playerStart: { x: number; y: number; heading: number };
  player: PlayerConfig;
  chaser: ChaserConfig;
  shooter: ShooterConfig;
  spawn: SpawnConfig;
}

export const SESSION_LIMITS = {
  durationSec: { min: 60, max: 180, step: 10 },
  spawnIntervalSec: { min: 1, max: 10, step: 0.5 },
} as const;

export const DEFAULT_SETTINGS: SessionSettings = {
  durationSec: 120,
  spawnIntervalSec: 3,
};

export type SettingsErrors = Partial<Record<keyof SessionSettings, string>>;

export function validateSettings(s: SessionSettings): SettingsErrors {
  const errors: SettingsErrors = {};
  const d = SESSION_LIMITS.durationSec;
  const sp = SESSION_LIMITS.spawnIntervalSec;
  if (!Number.isFinite(s.durationSec) || s.durationSec < d.min || s.durationSec > d.max) {
    errors.durationSec = `Game session time must be between ${d.min} and ${d.max} seconds.`;
  }
  if (!Number.isFinite(s.spawnIntervalSec) || s.spawnIntervalSec < sp.min || s.spawnIntervalSec > sp.max) {
    errors.spawnIntervalSec = `Enemy spawn time must be between ${sp.min} and ${sp.max} seconds.`;
  }
  return errors;
}

const BASE_CONFIG: Omit<GameConfig, 'session'> = {
  arena: { width: 1280, height: 720 },
  playerStart: { x: 640, y: 600, heading: -Math.PI / 2 },
  player: {
    maxHp: 100,
    speed: 170,
    turnSpeed: 2.4,
    radius: 14,
    hullHalfLength: 17,
    frontCooldown: 0.35,
    sideCooldown: 1.2,
    sideSpread: 14,
    sideOffset: 16,
    muzzleOffset: 34,
    projectile: { speed: 520, damage: 10, lifetime: 0.9, radius: 5 },
  },
  chaser: {
    maxHp: 30,
    speed: 120,
    turnSpeed: 2.0,
    radius: 14,
    hullHalfLength: 17,
    contactDamage: 20,
  },
  shooter: {
    maxHp: 40,
    speed: 85,
    turnSpeed: 1.6,
    radius: 14,
    hullHalfLength: 17,
    attackRange: 380,
    preferredDistance: 300,
    cooldown: 1.8,
    aimTolerance: 0.15,
    muzzleOffset: 34,
    projectile: { speed: 340, damage: 8, lifetime: 1.5, radius: 5 },
  },
  spawn: {
    minPlayerDistance: 320,
    edgeMargin: 40,
    clearance: 12,
    maxAlive: 12,
    weights: { chaser: 0.5, shooter: 0.5 },
    maxAttempts: 40,
  },
};

/**
 * Builds the config snapshot used by one match. Always returns a fresh deep
 * copy, so later edits in Options never affect a match in progress.
 */
export function createConfig(settings: SessionSettings = DEFAULT_SETTINGS): GameConfig {
  const copy = JSON.parse(JSON.stringify(BASE_CONFIG)) as Omit<GameConfig, 'session'>;
  return { ...copy, session: { ...settings } };
}
