import { createArena, type Arena } from './arena';
import {
  circleHitsShip,
  hitsObstacle,
  isPoseFree,
  outsideArena,
  shipsOverlap,
  type BodyShape,
} from './collision';
import type { GameConfig, ProjectileStats, ShipStats } from './config';
import { angleDiff, normalizeAngle, rotateToward } from './math';
import { Rng } from './rng';
import {
  emptyInput,
  type EndReason,
  type InputState,
  type MatchResult,
  type MatchStatus,
  type Projectile,
  type ProjectileOwner,
  type Ship,
  type ShipKind,
  type SimEvent,
} from './types';

/** Distances probed ahead of an enemy to avoid islands. */
const LOOKAHEAD = 70;
/** Heading offsets tried (in order) when the direct path is blocked. */
const AVOID_OFFSETS = [0, 0.5, 1.0, 1.5, 2.0];

/**
 * Pure game rules. It knows nothing about React, PixiJS or the DOM:
 * it only advances state when `step(dt)` is called, which makes it
 * deterministic (seeded RNG, fixed dt) and easy to test headlessly.
 */
export class Simulation {
  readonly config: GameConfig;
  readonly arena: Arena;

  player: Ship;
  enemies: Ship[] = [];
  projectiles: Projectile[] = [];

  status: MatchStatus = 'running';
  endReason: EndReason | null = null;
  score = 0;
  /** Active play time, seconds. Only advances while running. */
  elapsed = 0;

  input: InputState = emptyInput();

  private events: SimEvent[] = [];
  private nextId = 1;
  private rng: Rng;
  private spawnTimer: number;
  private spawnCount = 0;

  constructor(config: GameConfig, seed = 1) {
    this.config = config;
    this.arena = createArena(config);
    this.rng = new Rng(seed);
    this.spawnTimer = config.session.spawnIntervalSec;

    const p = config.player;
    this.player = this.createShip('player', config.playerStart.x, config.playerStart.y, config.playerStart.heading, p);
  }

  get timeLeft(): number {
    return Math.max(0, this.config.session.durationSec - this.elapsed);
  }

  get result(): MatchResult | null {
    if (this.status !== 'ended' || !this.endReason) return null;
    return { score: this.score, durationSec: this.elapsed, reason: this.endReason };
  }

  /** Returns and clears the events produced since the last call. */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  pause(): void {
    if (this.status === 'running') this.status = 'paused';
  }

  resume(): void {
    if (this.status === 'paused') this.status = 'running';
  }

  /** Advances the simulation by `dt` seconds of active play. */
  step(dt: number): void {
    if (this.status !== 'running') return;

    this.elapsed = Math.min(this.elapsed + dt, this.config.session.durationSec);

    this.storePrevious();
    this.updatePlayer(dt);
    this.updateSpawns(dt);
    this.updateEnemies(dt);
    this.separateEnemies();
    this.updateProjectiles(dt);
    this.resolveRamming();
    this.cleanup();
    this.checkEnd();
  }

  // ---------------------------------------------------------------- ships

  private shapeOf(kind: ShipKind): BodyShape {
    const s: ShipStats = kind === 'player' ? this.config.player : kind === 'chaser' ? this.config.chaser : this.config.shooter;
    return { radius: s.radius, halfLength: s.hullHalfLength };
  }

  private createShip(kind: ShipKind, x: number, y: number, heading: number, stats: ShipStats): Ship {
    return {
      id: this.nextId++,
      kind,
      x,
      y,
      heading,
      px: x,
      py: y,
      pheading: heading,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      alive: true,
      cooldownFront: 0,
      cooldownLeft: 0,
      cooldownRight: 0,
    };
  }

  private storePrevious(): void {
    for (const s of [this.player, ...this.enemies]) {
      s.px = s.x;
      s.py = s.y;
      s.pheading = s.heading;
    }
    for (const p of this.projectiles) {
      p.px = p.x;
      p.py = p.y;
    }
  }

  /**
   * Rotates and moves a ship, blocking it against islands and arena edges.
   * A rotation that would push the hull into an obstacle is rejected, and
   * a blocked move slides along the free axis.
   */
  private moveShip(ship: Ship, turn: number, forwardDistance: number, margin = 0): void {
    const shape = this.shapeOf(ship.kind);

    if (turn !== 0) {
      const newHeading = normalizeAngle(ship.heading + turn);
      if (isPoseFree(this.arena, shape, ship.x, ship.y, newHeading, margin)) {
        ship.heading = newHeading;
      }
    }

    if (forwardDistance !== 0) {
      const nx = ship.x + Math.cos(ship.heading) * forwardDistance;
      const ny = ship.y + Math.sin(ship.heading) * forwardDistance;
      if (isPoseFree(this.arena, shape, nx, ny, ship.heading, margin)) {
        ship.x = nx;
        ship.y = ny;
      } else if (isPoseFree(this.arena, shape, nx, ship.y, ship.heading, margin)) {
        ship.x = nx;
      } else if (isPoseFree(this.arena, shape, ship.x, ny, ship.heading, margin)) {
        ship.y = ny;
      }
    }
  }

  // --------------------------------------------------------------- player

  private updatePlayer(dt: number): void {
    const p = this.player;
    const cfg = this.config.player;
    const input = this.input;

    p.cooldownFront = Math.max(0, p.cooldownFront - dt);
    p.cooldownLeft = Math.max(0, p.cooldownLeft - dt);
    p.cooldownRight = Math.max(0, p.cooldownRight - dt);

    const turnDir = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
    this.moveShip(p, turnDir * cfg.turnSpeed * dt, input.forward ? cfg.speed * dt : 0);

    if (input.fireFront && p.cooldownFront <= 0) {
      p.cooldownFront = cfg.frontCooldown;
      this.fireFront(p, cfg.muzzleOffset, cfg.projectile, 'player');
    }
    if (input.fireLeft && p.cooldownLeft <= 0) {
      p.cooldownLeft = cfg.sideCooldown;
      this.fireBroadside(p, -1);
    }
    if (input.fireRight && p.cooldownRight <= 0) {
      p.cooldownRight = cfg.sideCooldown;
      this.fireBroadside(p, 1);
    }
  }

  private spawnProjectile(
    owner: ProjectileOwner,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    stats: ProjectileStats,
  ): void {
    this.projectiles.push({
      id: this.nextId++,
      owner,
      x,
      y,
      px: x,
      py: y,
      vx: dirX * stats.speed,
      vy: dirY * stats.speed,
      damage: stats.damage,
      radius: stats.radius,
      ttl: stats.lifetime,
      alive: true,
    });
  }

  private fireFront(ship: Ship, muzzle: number, stats: ProjectileStats, owner: ProjectileOwner): void {
    const fx = Math.cos(ship.heading);
    const fy = Math.sin(ship.heading);
    const x = ship.x + fx * muzzle;
    const y = ship.y + fy * muzzle;
    this.spawnProjectile(owner, x, y, fx, fy, stats);
    this.events.push({ type: 'shot', x, y, owner });
  }

  /** side: -1 = left of the ship, +1 = right. Fires three parallel projectiles. */
  private fireBroadside(ship: Ship, side: -1 | 1): void {
    const cfg = this.config.player;
    const fx = Math.cos(ship.heading);
    const fy = Math.sin(ship.heading);
    // With y pointing down, the ship's right-hand side is (-fy, fx).
    const sx = -fy * side;
    const sy = fx * side;
    for (let i = -1; i <= 1; i++) {
      const x = ship.x + sx * cfg.sideOffset + fx * cfg.sideSpread * i;
      const y = ship.y + sy * cfg.sideOffset + fy * cfg.sideSpread * i;
      this.spawnProjectile('player', x, y, sx, sy, cfg.projectile);
    }
    this.events.push({
      type: 'shot',
      x: ship.x + sx * cfg.sideOffset,
      y: ship.y + sy * cfg.sideOffset,
      owner: 'player',
    });
  }

  // --------------------------------------------------------------- spawns

  private updateSpawns(dt: number): void {
    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0) {
      this.spawnTimer += this.config.session.spawnIntervalSec;
      if (this.enemies.filter((e) => e.alive).length < this.config.spawn.maxAlive) {
        this.trySpawnEnemy();
      }
    }
  }

  private pickEnemyKind(): 'chaser' | 'shooter' {
    // Guarantee that both types show up in the first two spawns.
    if (this.spawnCount === 0) return 'chaser';
    if (this.spawnCount === 1) return 'shooter';
    const w = this.config.spawn.weights;
    return this.rng.next() * (w.chaser + w.shooter) < w.chaser ? 'chaser' : 'shooter';
  }

  private trySpawnEnemy(): void {
    const sp = this.config.spawn;
    const kind = this.pickEnemyKind();
    const stats: ShipStats = kind === 'chaser' ? this.config.chaser : this.config.shooter;
    const shape = this.shapeOf(kind);

    for (let i = 0; i < sp.maxAttempts; i++) {
      const x = this.rng.range(sp.edgeMargin, this.arena.width - sp.edgeMargin);
      const y = this.rng.range(sp.edgeMargin, this.arena.height - sp.edgeMargin);
      const dx = x - this.player.x;
      const dy = y - this.player.y;
      if (dx * dx + dy * dy < sp.minPlayerDistance * sp.minPlayerDistance) continue;

      const heading = Math.atan2(dy * -1, dx * -1);
      if (!isPoseFree(this.arena, shape, x, y, heading, sp.clearance)) continue;

      const ship = this.createShip(kind, x, y, heading, stats);
      if (this.enemies.some((e) => e.alive && shipsOverlap(shape, ship, this.shapeOf(e.kind), e))) continue;

      this.enemies.push(ship);
      this.spawnCount++;
      return;
    }
    // No valid point found this time: the next interval simply tries again.
  }

  // -------------------------------------------------------------- enemies

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.kind === 'chaser') this.updateChaser(e, dt);
      else this.updateShooter(e, dt);
    }
  }

  /**
   * Picks the heading to follow: the direct line to the target if the way
   * is free, otherwise the closest free deviation (simple island avoidance).
   */
  private steerHeading(ship: Ship, targetAngle: number): number {
    const shape = this.shapeOf(ship.kind);
    const side = ship.id % 2 === 0 ? 1 : -1;
    for (const offset of AVOID_OFFSETS) {
      for (const sign of offset === 0 ? [1] : [side, -side]) {
        const h = normalizeAngle(targetAngle + offset * sign);
        const px = ship.x + Math.cos(h) * LOOKAHEAD;
        const py = ship.y + Math.sin(h) * LOOKAHEAD;
        if (isPoseFree(this.arena, shape, px, py, h, 2)) return h;
      }
    }
    return targetAngle;
  }

  private updateChaser(e: Ship, dt: number): void {
    const cfg = this.config.chaser;
    const target = Math.atan2(this.player.y - e.y, this.player.x - e.x);
    const desired = this.steerHeading(e, target);
    const newHeading = rotateToward(e.heading, desired, cfg.turnSpeed * dt);
    this.moveShip(e, angleDiff(newHeading, e.heading), cfg.speed * dt);
  }

  private updateShooter(e: Ship, dt: number): void {
    const cfg = this.config.shooter;
    e.cooldownFront = Math.max(0, e.cooldownFront - dt);

    const dx = this.player.x - e.x;
    const dy = this.player.y - e.y;
    const distance = Math.hypot(dx, dy);
    const target = Math.atan2(dy, dx);
    const approaching = distance > cfg.preferredDistance;

    // While approaching it avoids islands; once in position it just aims.
    const desired = approaching ? this.steerHeading(e, target) : target;
    const newHeading = rotateToward(e.heading, desired, cfg.turnSpeed * dt);
    this.moveShip(e, angleDiff(newHeading, e.heading), approaching ? cfg.speed * dt : 0);

    const aimError = Math.abs(angleDiff(target, e.heading));
    if (distance <= cfg.attackRange && aimError <= cfg.aimTolerance && e.cooldownFront <= 0) {
      e.cooldownFront = cfg.cooldown;
      this.fireFront(e, cfg.muzzleOffset, cfg.projectile, 'enemy');
    }
  }

  /** Keeps enemies from stacking on top of each other. */
  private separateEnemies(): void {
    const list = this.enemies.filter((e) => e.alive);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = this.shapeOf(a.kind).radius + this.shapeOf(b.kind).radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          this.nudge(a, (-dx / d) * push, (-dy / d) * push);
          this.nudge(b, (dx / d) * push, (dy / d) * push);
        }
      }
    }
  }

  private nudge(ship: Ship, dx: number, dy: number): void {
    const shape = this.shapeOf(ship.kind);
    if (isPoseFree(this.arena, shape, ship.x + dx, ship.y + dy, ship.heading)) {
      ship.x += dx;
      ship.y += dy;
    }
  }

  // ---------------------------------------------------------- projectiles

  private updateProjectiles(dt: number): void {
    const playerShape = this.shapeOf('player');

    for (const p of this.projectiles) {
      if (!p.alive) continue;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ttl -= dt;

      if (p.ttl <= 0 || outsideArena(this.arena, p.x, p.y)) {
        p.alive = false;
        continue;
      }
      if (hitsObstacle(this.arena, p.x, p.y, p.radius)) {
        p.alive = false;
        this.events.push({ type: 'impact', x: p.x, y: p.y });
        continue;
      }

      if (p.owner === 'player') {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (circleHitsShip(this.shapeOf(e.kind), e, p.x, p.y, p.radius)) {
            p.alive = false; // damage is applied once: the projectile is gone.
            this.damageEnemy(e, p.damage, p.x, p.y);
            break;
          }
        }
      } else if (circleHitsShip(playerShape, this.player, p.x, p.y, p.radius)) {
        p.alive = false;
        this.damagePlayer(p.damage, p.x, p.y);
      }
    }
  }

  private damageEnemy(e: Ship, amount: number, x: number, y: number): void {
    e.hp = Math.max(0, e.hp - amount);
    this.events.push({ type: 'hit', x, y, targetId: e.id, target: 'enemy' });
    if (e.hp <= 0 && e.alive) {
      e.alive = false;
      this.score += 1; // only kills by the player's projectiles score.
      this.events.push({ type: 'destroyed', x: e.x, y: e.y, id: e.id, kind: e.kind, cause: 'shot' });
    }
  }

  private damagePlayer(amount: number, x: number, y: number): void {
    if (this.player.hp <= 0) return;
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.events.push({ type: 'hit', x, y, targetId: this.player.id, target: 'player' });
    if (this.player.hp <= 0) {
      this.player.alive = false;
      this.events.push({
        type: 'destroyed',
        x: this.player.x,
        y: this.player.y,
        id: this.player.id,
        kind: 'player',
        cause: 'shot',
      });
    }
  }

  /** A chaser that touches the player hurts it and explodes (no score). */
  private resolveRamming(): void {
    if (!this.player.alive) return;
    const playerShape = this.shapeOf('player');
    for (const e of this.enemies) {
      if (!e.alive || e.kind !== 'chaser') continue;
      if (shipsOverlap(this.shapeOf('chaser'), e, playerShape, this.player)) {
        e.alive = false;
        e.hp = 0;
        this.events.push({ type: 'destroyed', x: e.x, y: e.y, id: e.id, kind: 'chaser', cause: 'ram' });
        this.damagePlayer(this.config.chaser.contactDamage, e.x, e.y);
      }
    }
  }

  private cleanup(): void {
    this.enemies = this.enemies.filter((e) => e.alive);
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  // ------------------------------------------------------------------ end

  private checkEnd(): void {
    if (this.player.hp <= 0) this.end('player_destroyed');
    else if (this.elapsed >= this.config.session.durationSec) this.end('time_up');
  }

  private end(reason: EndReason): void {
    this.status = 'ended';
    this.endReason = reason;
  }
}
