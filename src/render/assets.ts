import { Assets, type Texture } from 'pixi.js';
import { GRASS_TILES, SAND_TILES } from '../game/arena';

const BASE = `${import.meta.env.BASE_URL}assets/png/default/`;

/** Ship color index -> sprite numbers. See stage rules in shipTextureName(). */
export const SHIP_COLOR = { player: 1, chaser: 2, shooter: 3 } as const;

const TILE_IDS = [...SAND_TILES, ...GRASS_TILES, 49, 50, 51, 70, 71, 72, 73];
const SHIP_IDS: number[] = [];
for (const color of Object.values(SHIP_COLOR)) {
  for (let stage = 0; stage < 4; stage++) SHIP_IDS.push(1 + color + stage * 6);
}

/** key (used by the game) -> url. */
function buildManifest(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const id of TILE_IDS) m[`tile_${id}`] = `${BASE}tiles/tile_${id}.png`;
  for (const id of SHIP_IDS) m[`ship_${id}`] = `${BASE}ships/ship_${id}.png`;
  m['cannon_ball'] = `${BASE}ship_parts/cannon_ball.png`;
  for (const n of [1, 2, 3]) m[`explosion_${n}`] = `${BASE}effects/explosion_${n}.png`;
  for (const n of [1, 2]) m[`fire_${n}`] = `${BASE}effects/fire_${n}.png`;
  m['enemy_health_frame'] = `${BASE}ui/hud/enemy_health_frame.png`;
  m['enemy_health_fill_green'] = `${BASE}ui/hud/enemy_health_fill_green.png`;
  m['enemy_health_fill_red'] = `${BASE}ui/hud/enemy_health_fill_red.png`;
  m['health_frame'] = `${BASE}ui/hud/health_frame.png`;
  return m;
}

export type GameTextures = Record<string, Texture>;

export class AssetLoadError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AssetLoadError';
  }
}

/**
 * Loads (or returns from the PixiJS cache) every texture the match needs.
 * Calling it again after a failure is the "retry" action. Textures stay in
 * the Assets cache across matches, so restarting never reloads files.
 */
export async function loadGameTextures(onProgress?: (ratio: number) => void): Promise<GameTextures> {
  const manifest = buildManifest();
  const keys = Object.keys(manifest);
  const urls = keys.map((k) => manifest[k] as string);

  try {
    const loaded = (await Assets.load<Texture>(urls, (p) => onProgress?.(p))) as Record<string, Texture>;
    const textures: GameTextures = {};
    keys.forEach((key, i) => {
      const tex = loaded[urls[i] as string];
      if (!tex) throw new AssetLoadError(`Missing texture: ${key}`);
      textures[key] = tex;
    });
    onProgress?.(1);
    return textures;
  } catch (error) {
    // Forget partial results so that a retry fetches the failed files again.
    await Assets.unload(urls).catch(() => undefined);
    if (error instanceof AssetLoadError) throw error;
    throw new AssetLoadError('Could not load the game assets. Check your connection and try again.', error);
  }
}

/** Ships look worse as they lose health: 4 sprites per color. */
export function shipTextureName(kind: keyof typeof SHIP_COLOR, hpRatio: number): string {
  const stage = hpRatio > 0.75 ? 0 : hpRatio > 0.5 ? 1 : hpRatio > 0.25 ? 2 : 3;
  return `ship_${1 + SHIP_COLOR[kind] + stage * 6}`;
}
