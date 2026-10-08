import type { GameConfig } from './config';

/** Static circular obstacle. Islands are built from several circles. */
export interface CircleCollider {
  x: number;
  y: number;
  r: number;
}

/**
 * How an island is drawn. The renderer assembles it from the individual
 * 64x64 tile PNGs (assets/png/default/tiles/tile_N.png).
 */
export type IslandVisual =
  | { kind: 'sand'; x: number; y: number; scale: number }
  | { kind: 'grass'; x: number; y: number; scale: number }
  | { kind: 'rock'; tile: 49 | 50 | 51; x: number; y: number; scale: number }
  | { kind: 'palm'; tile: 70 | 71 | 72; x: number; y: number; scale: number; rotation: number };

export interface Arena {
  width: number;
  height: number;
  colliders: CircleCollider[];
  visuals: IslandVisual[];
}

/** Tile layout (in 64px tiles) of the two composed islands. */
export const SAND_TILES = [1, 2, 3, 17, 18, 19, 33, 34, 35];
export const GRASS_TILES = [6, 7, 8, 9, 22, 23, 24, 25, 38, 39, 40, 41, 54, 55, 56, 57];
export const SAND_COLS = 3;
export const GRASS_COLS = 4;
export const TILE_SIZE = 64;

/**
 * A rounded-square island of `size` units is approximated by a 3x3 grid of
 * overlapping circles. This is cheap to test and leaves no gaps.
 */
function squareIslandColliders(cx: number, cy: number, size: number): CircleCollider[] {
  const out: CircleCollider[] = [];
  const step = size * 0.3;
  const r = size * 0.2;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      out.push({ x: cx + i * step, y: cy + j * step, r });
    }
  }
  return out;
}

export function createArena(config: GameConfig): Arena {
  const colliders: CircleCollider[] = [];
  const visuals: IslandVisual[] = [];

  // Top-left grass island.
  const grassA = { x: 230, y: 200, scale: 1.1 };
  visuals.push({ kind: 'grass', ...grassA });
  colliders.push(...squareIslandColliders(grassA.x, grassA.y, GRASS_COLS * TILE_SIZE * grassA.scale));

  // Top-right grass island (smaller).
  const grassB = { x: 1070, y: 170, scale: 0.85 };
  visuals.push({ kind: 'grass', ...grassB });
  colliders.push(...squareIslandColliders(grassB.x, grassB.y, GRASS_COLS * TILE_SIZE * grassB.scale));

  // Bottom-right sand bank.
  const sand = { x: 1040, y: 575, scale: 1.3 };
  visuals.push({ kind: 'sand', ...sand });
  colliders.push(...squareIslandColliders(sand.x, sand.y, SAND_COLS * TILE_SIZE * sand.scale));

  // Rocks in open water.
  const rocks = [
    { tile: 50 as const, x: 600, y: 330, scale: 1.4 },
    { tile: 49 as const, x: 360, y: 520, scale: 1.2 },
  ];
  for (const rock of rocks) {
    visuals.push({ kind: 'rock', ...rock });
    colliders.push({ x: rock.x, y: rock.y, r: TILE_SIZE * rock.scale * 0.36 });
  }

  // Decorations on the islands (no collision of their own).
  visuals.push({ kind: 'palm', tile: 71, x: 190, y: 170, scale: 1.0, rotation: 0.3 });
  visuals.push({ kind: 'palm', tile: 72, x: 290, y: 250, scale: 0.9, rotation: -0.4 });
  visuals.push({ kind: 'palm', tile: 70, x: 1090, y: 150, scale: 0.8, rotation: 0.8 });

  return { width: config.arena.width, height: config.arena.height, colliders, visuals };
}
