import { Application, type Ticker } from 'pixi.js';
import type { GameConfig } from '../game/config';
import { Simulation } from '../game/simulation';
import type { MatchResult } from '../game/types';
import { InputController } from '../input/InputController';
import type { GameTextures } from '../render/assets';
import { PixiRenderer, WATER_COLOR } from '../render/PixiRenderer';
import type { GameStore } from './gameStore';

/** The simulation always advances in fixed steps, whatever the display frame rate is. */
const STEP = 1 / 60;
/** Longest frame time we are willing to catch up on (avoids a spiral after a stall). */
const MAX_FRAME = 0.25;

export interface EngineOptions {
  host: HTMLElement;
  config: GameConfig;
  textures: GameTextures;
  store: GameStore;
  seed?: number;
  onEnd: (result: MatchResult) => void;
  /** Aborted by React cleanup. Makes creation safe under StrictMode double-mounts. */
  signal: AbortSignal;
}

/**
 * Owns everything that lives for exactly one match: PixiJS application,
 * simulation, renderer, input listeners and the ticker. `destroy()` releases
 * all of it, so leaving the match or restarting leaves nothing behind.
 */
export class GameEngine {
  readonly input: InputController;
  private accumulator = 0;
  private ended = false;
  private destroyed = false;

  private constructor(
    private readonly app: Application,
    private readonly sim: Simulation,
    private readonly renderer: PixiRenderer,
    private readonly store: GameStore,
    private readonly onEnd: (result: MatchResult) => void,
  ) {
    this.input = new InputController(this.togglePause);
    this.input.attach();

    this.app.ticker.add(this.tick);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
    this.publish();
  }

  static async create(opts: EngineOptions): Promise<GameEngine | null> {
    const app = new Application();
    await app.init({
      resizeTo: opts.host,
      background: WATER_COLOR,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });

    // React may have unmounted us while init() was running.
    if (opts.signal.aborted) {
      app.destroy({ removeView: true }, { children: true });
      return null;
    }

    opts.host.appendChild(app.canvas);

    const sim = new Simulation(opts.config, opts.seed ?? (Date.now() & 0xffffffff));
    const renderer = new PixiRenderer(
      app,
      opts.textures,
      opts.config.arena.width,
      opts.config.arena.height,
      sim.arena.visuals,
    );
    return new GameEngine(app, sim, renderer, opts.store, opts.onEnd);
  }

  // ------------------------------------------------------------------ API

  get status() {
    return this.sim.status;
  }

  pause = (): void => {
    if (this.sim.status !== 'running') return;
    this.sim.pause();
    this.input.clear();
    this.input.gameKeysActive = false;
    this.publish();
  };

  /** Resuming is always an explicit player action; nothing is replayed from the paused time. */
  resume = (): void => {
    if (this.sim.status !== 'paused') return;
    this.input.clear();
    this.input.gameKeysActive = true;
    this.accumulator = 0;
    this.sim.resume();
    this.publish();
  };

  togglePause = (): void => {
    if (this.sim.status === 'running') this.pause();
    else if (this.sim.status === 'paused') this.resume();
  };

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
    this.app.ticker.remove(this.tick);
    this.input.detach();
    this.renderer.destroy();
    this.app.destroy({ removeView: true }, { children: true });
  }

  // ----------------------------------------------------------------- loop

  private tick = (ticker: Ticker): void => {
    if (this.destroyed) return;
    const frame = Math.min(ticker.deltaMS / 1000, MAX_FRAME);

    if (this.sim.status === 'running') {
      this.sim.input = this.input.state;
      this.accumulator += frame;
      while (this.accumulator >= STEP && this.sim.status === 'running') {
        this.sim.step(STEP);
        this.accumulator -= STEP;
      }
    }

    // Visuals freeze while paused or finished (dt = 0).
    const visualDt = this.sim.status === 'running' ? frame : 0;
    this.renderer.update(this.sim, this.sim.status === 'running' ? this.accumulator / STEP : 1, visualDt);
    this.publish();

    if (this.sim.status === 'ended' && !this.ended) {
      this.ended = true;
      this.input.clear();
      this.input.gameKeysActive = false;
      const result = this.sim.result;
      if (result) this.onEnd(result);
    }
  };

  private publish(): void {
    const s = this.sim;
    this.store.set({
      status: s.status,
      score: s.score,
      timeLeftSec: Math.ceil(s.timeLeft),
      hp: Math.ceil(s.player.hp),
      maxHp: s.player.maxHp,
    });
  }

  private onVisibility = (): void => {
    if (document.hidden) this.pause();
  };

  private onBlur = (): void => {
    this.pause();
  };
}
