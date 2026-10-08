import { Application, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import {
  GRASS_COLS,
  GRASS_TILES,
  SAND_COLS,
  SAND_TILES,
  TILE_SIZE,
  type IslandVisual,
} from '../game/arena';
import { lerp, lerpAngle } from '../game/math';
import type { Simulation } from '../game/simulation';
import type { Ship, ShipKind, SimEvent } from '../game/types';
import { shipTextureName, type GameTextures } from './assets';

const SHIP_SCALE = 0.6;
const BAR_WIDTH = 64;
const BAR_OFFSET_Y = -46;
const WATER_COLOR = 0x2ea6d9;

interface HealthBar {
  root: Container;
  fill: Sprite;
  mask: Graphics;
  lastRatio: number;
}

interface ShipView {
  hull: Container;
  sprite: Sprite;
  fire: Sprite;
  bar: HealthBar;
  textureName: string;
  flash: number;
}

interface Effect {
  sprite: Sprite;
  age: number;
  life: number;
  from: number;
  to: number;
  frames: Texture[];
}

/**
 * Draws a Simulation with PixiJS. It never changes game state: every frame
 * it reads the simulation, syncs display objects and plays one-shot effects.
 */
export class PixiRenderer {
  readonly world = new Container();

  private readonly waterLayer = new Container();
  private readonly islandLayer = new Container();
  private readonly shipLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly effectLayer = new Container();
  private readonly uiLayer = new Container();

  private water: TilingSprite;
  private bakedTextures: Texture[] = [];
  private shipViews = new Map<number, ShipView>();
  private projectileViews = new Map<number, Sprite>();
  private effects: Effect[] = [];
  private shake = 0;
  private time = 0;
  private destroyed = false;

  constructor(
    private readonly app: Application,
    private readonly tex: GameTextures,
    private readonly arenaWidth: number,
    private readonly arenaHeight: number,
    visuals: IslandVisual[],
  ) {
    this.world.addChild(
      this.waterLayer,
      this.islandLayer,
      this.shipLayer,
      this.projectileLayer,
      this.effectLayer,
      this.uiLayer,
    );
    this.app.stage.addChild(this.world);

    this.water = new TilingSprite({
      texture: this.texture('tile_73'),
      width: arenaWidth,
      height: arenaHeight,
    });
    this.waterLayer.addChild(this.water);

    this.buildIslands(visuals);
    this.layout();
    this.app.renderer.on('resize', this.layout);
  }

  // ---------------------------------------------------------------- setup

  private texture(name: string): Texture {
    const t = this.tex[name];
    if (!t) throw new Error(`Texture not loaded: ${name}`);
    return t;
  }

  /** Assembles an island from its 64px tiles and bakes it into one texture (no seams when scaled). */
  private bakeIsland(tiles: number[], cols: number): Texture {
    const c = new Container();
    tiles.forEach((id, i) => {
      const s = new Sprite(this.texture(`tile_${id}`));
      s.position.set((i % cols) * TILE_SIZE, Math.floor(i / cols) * TILE_SIZE);
      c.addChild(s);
    });
    const baked = this.app.renderer.generateTexture(c);
    c.destroy({ children: true });
    this.bakedTextures.push(baked);
    return baked;
  }

  private buildIslands(visuals: IslandVisual[]): void {
    const sandTex = this.bakeIsland(SAND_TILES, SAND_COLS);
    const grassTex = this.bakeIsland(GRASS_TILES, GRASS_COLS);

    // Two passes: ground first, then rocks and palms on top of it.
    const isGround = (v: IslandVisual): boolean => v.kind === 'sand' || v.kind === 'grass';
    for (const v of [...visuals.filter(isGround), ...visuals.filter((x) => !isGround(x))]) {
      let texture: Texture;
      switch (v.kind) {
        case 'sand':
          texture = sandTex;
          break;
        case 'grass':
          texture = grassTex;
          break;
        default:
          texture = this.texture(`tile_${v.tile}`);
      }
      const s = new Sprite(texture);
      s.anchor.set(0.5);
      s.position.set(v.x, v.y);
      s.scale.set(v.scale);
      if (v.kind === 'palm') s.rotation = v.rotation;
      this.islandLayer.addChild(s);
    }
  }

  /** Fits the 16:9 arena inside the canvas (letterboxed, proportions kept). */
  private layout = (): void => {
    if (this.destroyed) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const scale = Math.min(w / this.arenaWidth, h / this.arenaHeight);
    this.world.scale.set(scale);
    this.baseX = (w - this.arenaWidth * scale) / 2;
    this.baseY = (h - this.arenaHeight * scale) / 2;
    this.world.position.set(this.baseX, this.baseY);
  };
  private baseX = 0;
  private baseY = 0;

  // ---------------------------------------------------------------- frame

  /**
   * @param alpha interpolation between the previous and current simulation step (0..1)
   * @param dt    seconds of *visual* time to advance (0 while paused)
   */
  update(sim: Simulation, alpha: number, dt: number): void {
    if (this.destroyed) return;
    this.time += dt;

    this.handleEvents(sim.drainEvents());
    this.syncShips(sim, alpha, dt);
    this.syncProjectiles(sim, alpha);
    this.updateEffects(dt);

    // Slowly drifting water.
    this.water.tilePosition.set(this.time * 6, this.time * 3);

    // Camera shake when the player is hit.
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const m = this.shake * 40;
      this.world.position.set(
        this.baseX + (Math.random() - 0.5) * m,
        this.baseY + (Math.random() - 0.5) * m,
      );
    } else {
      this.world.position.set(this.baseX, this.baseY);
    }
  }

  // ---------------------------------------------------------------- ships

  private syncShips(sim: Simulation, alpha: number, dt: number): void {
    const alive = new Set<number>();
    const ships: Ship[] = sim.player.alive ? [sim.player, ...sim.enemies] : [...sim.enemies];

    for (const ship of ships) {
      alive.add(ship.id);
      let view = this.shipViews.get(ship.id);
      if (!view) {
        view = this.createShipView(ship);
        this.shipViews.set(ship.id, view);
      }
      this.updateShipView(view, ship, alpha, dt);
    }

    for (const [id, view] of this.shipViews) {
      if (!alive.has(id)) {
        this.destroyShipView(view);
        this.shipViews.delete(id);
      }
    }
  }

  private createShipView(ship: Ship): ShipView {
    const ratio = ship.hp / ship.maxHp;
    const kind = ship.kind as ShipKind;
    const textureName = shipTextureName(kind, ratio);

    const hull = new Container();
    const sprite = new Sprite(this.texture(textureName));
    sprite.anchor.set(0.5);
    sprite.scale.set(SHIP_SCALE);
    hull.addChild(sprite);

    const fire = new Sprite(this.texture('fire_1'));
    fire.anchor.set(0.5, 0.8);
    fire.scale.set(0.8);
    fire.position.set(0, -6);
    fire.visible = false;
    hull.addChild(fire);

    this.shipLayer.addChild(hull);

    const bar = this.createHealthBar(ship.kind === 'player');
    this.uiLayer.addChild(bar.root);

    return { hull, sprite, fire, bar, textureName, flash: 0 };
  }

  private createHealthBar(isPlayer: boolean): HealthBar {
    const root = new Container();
    const frame = new Sprite(this.texture('enemy_health_frame'));
    const fill = new Sprite(this.texture(isPlayer ? 'enemy_health_fill_green' : 'enemy_health_fill_red'));
    const scale = BAR_WIDTH / frame.texture.width;
    for (const s of [frame, fill]) {
      s.anchor.set(0.5);
      s.scale.set(scale);
    }
    const mask = new Graphics();
    fill.mask = mask;
    root.addChild(frame, fill, mask);
    return { root, fill, mask, lastRatio: -1 };
  }

  private setBarRatio(bar: HealthBar, ratio: number): void {
    if (ratio === bar.lastRatio) return;
    bar.lastRatio = ratio;
    const w = BAR_WIDTH;
    const h = bar.fill.height;
    bar.mask.clear();
    bar.mask.rect(-w / 2, -h / 2, w * ratio, h).fill(0xffffff);
  }

  private updateShipView(view: ShipView, ship: Ship, alpha: number, dt: number): void {
    const x = lerp(ship.px, ship.x, alpha);
    const y = lerp(ship.py, ship.y, alpha);
    const heading = lerpAngle(ship.pheading, ship.heading, alpha);

    view.hull.position.set(x, y);
    // The sprites are drawn with the bow pointing down (+y), heading 0 points right (+x).
    view.hull.rotation = heading - Math.PI / 2;
    view.bar.root.position.set(x, y + BAR_OFFSET_Y);

    const ratio = Math.max(0, ship.hp / ship.maxHp);
    this.setBarRatio(view.bar, ratio);

    const name = shipTextureName(ship.kind, ratio);
    if (name !== view.textureName) {
      view.textureName = name;
      view.sprite.texture = this.texture(name);
    }

    // Burning ships once they are badly hurt.
    view.fire.visible = ratio <= 0.5;
    if (view.fire.visible) {
      view.fire.texture = this.texture(Math.floor(this.time * 8) % 2 === 0 ? 'fire_1' : 'fire_2');
    }

    if (view.flash > 0) {
      view.flash = Math.max(0, view.flash - dt);
      view.sprite.tint = 0xff7070;
    } else {
      view.sprite.tint = 0xffffff;
    }
  }

  private destroyShipView(view: ShipView): void {
    view.hull.destroy({ children: true });
    view.bar.root.destroy({ children: true });
  }

  // ---------------------------------------------------------- projectiles

  private syncProjectiles(sim: Simulation, alpha: number): void {
    const alive = new Set<number>();
    for (const p of sim.projectiles) {
      alive.add(p.id);
      let sprite = this.projectileViews.get(p.id);
      if (!sprite) {
        sprite = new Sprite(this.texture('cannon_ball'));
        sprite.anchor.set(0.5);
        this.projectileLayer.addChild(sprite);
        this.projectileViews.set(p.id, sprite);
      }
      sprite.position.set(lerp(p.px, p.x, alpha), lerp(p.py, p.y, alpha));
    }
    for (const [id, sprite] of this.projectileViews) {
      if (!alive.has(id)) {
        sprite.destroy();
        this.projectileViews.delete(id);
      }
    }
  }

  // -------------------------------------------------------------- effects

  private handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          this.addEffect(['explosion_3'], e.x, e.y, 0.14, 0.2, 0.45, 0xffe08a);
          break;
        case 'impact':
          this.addEffect(['explosion_3'], e.x, e.y, 0.3, 0.4, 0.8, 0xd6ecff);
          break;
        case 'hit': {
          this.addEffect(['explosion_3'], e.x, e.y, 0.22, 0.4, 0.7);
          const view = this.shipViews.get(e.targetId);
          if (view) view.flash = 0.12;
          if (e.target === 'player') this.shake = 0.18;
          break;
        }
        case 'destroyed': {
          const big = e.kind === 'player' ? 1.6 : 1.2;
          this.addEffect(['explosion_1', 'explosion_2', 'explosion_3'], e.x, e.y, 0.6, 0.5 * big, 1.5 * big);
          if (e.cause === 'ram' || e.kind === 'player') this.shake = Math.max(this.shake, 0.25);
          break;
        }
      }
    }
  }

  private addEffect(
    frameNames: string[],
    x: number,
    y: number,
    life: number,
    from: number,
    to: number,
    tint = 0xffffff,
  ): void {
    const frames = frameNames.map((n) => this.texture(n));
    const sprite = new Sprite(frames[0]);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.tint = tint;
    sprite.scale.set(from);
    this.effectLayer.addChild(sprite);
    this.effects.push({ sprite, age: 0, life, from, to, frames });
  }

  private updateEffects(dt: number): void {
    for (const fx of this.effects) {
      fx.age += dt;
      const t = Math.min(1, fx.age / fx.life);
      fx.sprite.scale.set(lerp(fx.from, fx.to, t));
      fx.sprite.alpha = 1 - t * t;
      const frame = fx.frames[Math.min(fx.frames.length - 1, Math.floor(t * fx.frames.length))];
      if (frame) fx.sprite.texture = frame;
    }
    this.effects = this.effects.filter((fx) => {
      if (fx.age >= fx.life) {
        fx.sprite.destroy();
        return false;
      }
      return true;
    });
  }

  // -------------------------------------------------------------- cleanup

  /** Releases every display object and baked texture created by this renderer. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.renderer.off('resize', this.layout);
    this.shipViews.clear();
    this.projectileViews.clear();
    this.effects = [];
    this.world.destroy({ children: true });
    for (const t of this.bakedTextures) t.destroy(true);
    this.bakedTextures = [];
  }
}

export { WATER_COLOR };
