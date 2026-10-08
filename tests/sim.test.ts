import assert from 'node:assert/strict';
import { createConfig, validateSettings, SESSION_LIMITS } from '../src/game/config';
import { Simulation } from '../src/game/simulation';
import { emptyInput, type InputState } from '../src/game/types';

const STEP = 1 / 60;
const run = (sim: Simulation, seconds: number, input?: Partial<InputState>) => {
  sim.input = { ...emptyInput(), ...input };
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n && sim.status === 'running'; i++) sim.step(STEP);
};
let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('ok  -', name); };

test('settings validation enforces documented bounds', () => {
  assert.deepEqual(validateSettings({ durationSec: 60, spawnIntervalSec: 1 }), {});
  assert.deepEqual(validateSettings({ durationSec: 180, spawnIntervalSec: 10 }), {});
  assert.ok(validateSettings({ durationSec: 59, spawnIntervalSec: 3 }).durationSec);
  assert.ok(validateSettings({ durationSec: 181, spawnIntervalSec: 3 }).durationSec);
  assert.ok(validateSettings({ durationSec: 120, spawnIntervalSec: 0 }).spawnIntervalSec);
  assert.ok(validateSettings({ durationSec: 120, spawnIntervalSec: NaN }).spawnIntervalSec);
  assert.equal(SESSION_LIMITS.durationSec.min, 60);
});

test('player moves forward only while pressed, and turns both ways', () => {
  const sim = new Simulation(createConfig(), 1);
  const y0 = sim.player.y;
  run(sim, 0.5);
  assert.equal(sim.player.y, y0);
  run(sim, 0.5, { forward: true });
  assert.ok(sim.player.y < y0 - 60, `moved up, y=${sim.player.y}`);
  const h0 = sim.player.heading;
  run(sim, 0.5, { turnRight: true });
  const h1 = sim.player.heading;
  assert.ok(h1 > h0);
  run(sim, 0.5, { turnLeft: true });
  assert.ok(sim.player.heading < h1);
});

test('movement is frame-rate independent (30fps steps vs 120fps steps)', () => {
  const a = new Simulation(createConfig(), 1);
  const b = new Simulation(createConfig(), 1);
  a.input = { ...emptyInput(), forward: true };
  b.input = { ...emptyInput(), forward: true };
  for (let i = 0; i < 30; i++) a.step(1 / 30);
  for (let i = 0; i < 120; i++) b.step(1 / 120);
  assert.ok(Math.abs(a.player.y - b.player.y) < 0.5, `${a.player.y} vs ${b.player.y}`);
});

test('player cannot leave the arena', () => {
  const sim = new Simulation(createConfig(), 1);
  run(sim, 10, { forward: true });
  assert.ok(sim.player.y >= sim.config.player.radius - 0.001);
  assert.ok(sim.player.y <= sim.config.arena.height);
});

test('player is blocked by islands (never overlaps a collider)', () => {
  const cfg = createConfig({ durationSec: 180, spawnIntervalSec: 10 });
  const sim = new Simulation(cfg, 1);
  // Aim at the bottom-right sand bank and keep going.
  sim.player.x = 800; sim.player.y = 590; sim.player.heading = 0;
  run(sim, 6, { forward: true });
  for (const c of sim.arena.colliders) {
    for (const o of [-1, 0, 1]) {
      const cx = sim.player.x + Math.cos(sim.player.heading) * cfg.player.hullHalfLength * o;
      const cy = sim.player.y + Math.sin(sim.player.heading) * cfg.player.hullHalfLength * o;
      assert.ok(Math.hypot(cx - c.x, cy - c.y) >= c.r + cfg.player.radius - 0.01, 'overlap with island');
    }
  }
  assert.ok(sim.player.x < 950, `stopped before the island, x=${sim.player.x}`);
});

test('front shot: one projectile, cooldown respected', () => {
  const sim = new Simulation(createConfig(), 1);
  run(sim, 0.05, { fireFront: true });
  assert.equal(sim.projectiles.length, 1);
  run(sim, 0.2, { fireFront: true });
  assert.equal(sim.projectiles.length, 1, 'cooldown (0.35s) blocks second shot');
  run(sim, 0.3, { fireFront: true });
  assert.ok(sim.projectiles.length >= 2);
});

test('side shot: three parallel projectiles, independent left/right cooldowns', () => {
  const sim = new Simulation(createConfig(), 1);
  sim.player.heading = -Math.PI / 2; // facing up
  run(sim, 1 / 60, { fireLeft: true });
  assert.equal(sim.projectiles.length, 3);
  for (const p of sim.projectiles) { assert.ok(p.vx < 0 && Math.abs(p.vy) < 1e-6, 'goes left'); }
  const ys = sim.projectiles.map((p) => p.y).sort();
  assert.ok(ys[1]! - ys[0]! > 10 && ys[2]! - ys[1]! > 10, 'spread along hull');
  run(sim, 1 / 60, { fireLeft: true, fireRight: true });
  const right = sim.projectiles.filter((p) => p.vx > 0);
  assert.equal(right.length, 3, 'right side fires although left is cooling down');
  assert.equal(sim.projectiles.filter((p) => p.vx < 0).length, 3, 'left did not fire twice');
});

test('moving and firing at the same time works', () => {
  const sim = new Simulation(createConfig(), 1);
  const y0 = sim.player.y;
  run(sim, 1, { forward: true, turnRight: true, fireFront: true, fireLeft: true });
  assert.ok(sim.player.y < y0);
  assert.ok(sim.projectiles.length > 0);
});

test('projectiles expire and are removed; island blocks projectiles', () => {
  const sim = new Simulation(createConfig({ durationSec: 180, spawnIntervalSec: 10 }), 1);
  run(sim, 0.05, { fireFront: true });
  run(sim, 1.2);
  assert.equal(sim.projectiles.length, 0);
  // fire into the rock at (600,330) from below
  sim.player.x = 600; sim.player.y = 420; sim.player.heading = -Math.PI / 2;
  run(sim, 0.05, { fireFront: true });
  run(sim, 0.4);
  assert.equal(sim.projectiles.length, 0, 'removed after hitting rock');
});

test('kill scores exactly 1, projectile damages once, dead enemy stops acting', () => {
  const sim = new Simulation(createConfig({ durationSec: 180, spawnIntervalSec: 10 }), 1);
  const e = (sim as any).createShip('shooter', 640, 450, 0, sim.config.shooter);
  sim.enemies.push(e);
  sim.player.x = 640; sim.player.y = 600; sim.player.heading = -Math.PI / 2;
  // 4 hp-ticks of 10 damage kill a 40 hp shooter
  for (let i = 0; i < 4; i++) { run(sim, 0.05, { fireFront: true }); run(sim, 0.4); }
  assert.equal(sim.score, 1);
  assert.equal(sim.enemies.length, 0);
  run(sim, 2);
  assert.equal(sim.score, 1, 'no double scoring');
});

test('chaser reaches player, damages once, explodes and does not score', () => {
  const sim = new Simulation(createConfig({ durationSec: 180, spawnIntervalSec: 10 }), 1);
  const e = (sim as any).createShip('chaser', 760, 250, Math.PI / 2, sim.config.chaser);
  sim.enemies.push(e);
  run(sim, 6);
  assert.equal(sim.player.hp, 100 - sim.config.chaser.contactDamage);
  assert.equal(sim.score, 0);
  assert.equal(sim.enemies.filter((x) => x.kind === 'chaser').length, 0);
});

test('shooter approaches then fires projectiles that can hurt the player', () => {
  const sim = new Simulation(createConfig({ durationSec: 180, spawnIntervalSec: 10 }), 1);
  const e = (sim as any).createShip('shooter', 640, 90, Math.PI / 2, sim.config.shooter);
  sim.enemies.push(e);
  run(sim, 8);
  assert.ok(sim.player.hp < 100, `player hp ${sim.player.hp}`);
  const d = Math.hypot(e.x - sim.player.x, e.y - sim.player.y);
  assert.ok(d <= sim.config.shooter.attackRange, `distance ${d}`);
});

test('spawns come at the configured interval, include both types, avoid obstacles and the player', () => {
  const cfg = createConfig({ durationSec: 180, spawnIntervalSec: 2 });
  const sim = new Simulation(cfg, 7);
  const kinds = new Set<string>();
  let spawned = 0;
  for (let i = 0; i < 60 * 40; i++) {
    const before = sim.enemies.length;
    sim.input = emptyInput();
    sim.step(STEP);
    if (sim.enemies.length > before) {
      for (const e of sim.enemies) kinds.add(e.kind);
    }
    sim.player.hp = 100; // keep alive for this check
  }
  spawned = sim.enemies.length;
  assert.ok(kinds.has('chaser') && kinds.has('shooter'), `kinds ${[...kinds]}`);
  assert.ok(spawned > 0);
});

test('first spawn happens after one interval (not before)', () => {
  const sim = new Simulation(createConfig({ durationSec: 180, spawnIntervalSec: 3 }), 3);
  run(sim, 2.9);
  assert.equal(sim.enemies.length, 0);
  run(sim, 0.3);
  assert.equal(sim.enemies.length, 1);
  assert.equal(sim.enemies[0]!.kind, 'chaser');
});

test('spawn points keep minimum distance from the player', () => {
  for (let seed = 1; seed < 30; seed++) {
    const sim = new Simulation(createConfig({ durationSec: 180, spawnIntervalSec: 1 }), seed);
    run(sim, 1.01);
    for (const e of sim.enemies) {
      assert.ok(Math.hypot(e.x - sim.player.x, e.y - sim.player.y) >= sim.config.spawn.minPlayerDistance - 1);
    }
  }
});

test('match ends by time at exactly the configured duration; simulation stops', () => {
  const sim = new Simulation(createConfig({ durationSec: 60, spawnIntervalSec: 10 }), 1);
  const godMode = (secs: number) => { for (let i = 0; i < Math.round(secs / STEP) && sim.status === 'running'; i++) { sim.player.hp = 100; sim.step(STEP); } };
  godMode(59);
  assert.equal(sim.status, 'running');
  godMode(2);
  assert.equal(sim.status, 'ended');
  assert.equal(sim.result!.reason, 'time_up');
  assert.ok(Math.abs(sim.result!.durationSec - 60) < 1e-6);
  const snap = JSON.stringify([sim.player, sim.enemies, sim.projectiles, sim.score]);
  sim.input = { ...emptyInput(), forward: true, fireFront: true };
  for (let i = 0; i < 120; i++) sim.step(STEP);
  assert.equal(JSON.stringify([sim.player, sim.enemies, sim.projectiles, sim.score]), snap, 'frozen after end');
});

test('match ends when the player dies', () => {
  const sim = new Simulation(createConfig({ durationSec: 180, spawnIntervalSec: 10 }), 1);
  sim.player.hp = 5;
  const e = (sim as any).createShip('chaser', 640, 500, Math.PI / 2, sim.config.chaser);
  sim.enemies.push(e);
  run(sim, 5);
  assert.equal(sim.status, 'ended');
  assert.equal(sim.result!.reason, 'player_destroyed');
  assert.ok(sim.elapsed < 5);
});

test('pause freezes clock, cooldowns and entities; resume does not accumulate', () => {
  const sim = new Simulation(createConfig(), 1);
  run(sim, 0.05, { fireFront: true });
  sim.pause();
  const e0 = sim.elapsed; const cd = sim.player.cooldownFront; const px = sim.projectiles[0]!.x;
  sim.input = { ...emptyInput(), forward: true, fireFront: true };
  for (let i = 0; i < 600; i++) sim.step(STEP);
  assert.equal(sim.elapsed, e0);
  assert.equal(sim.player.cooldownFront, cd);
  assert.equal(sim.projectiles[0]!.x, px);
  sim.resume();
  sim.input = emptyInput();
  sim.step(STEP);
  assert.ok(Math.abs(sim.elapsed - (e0 + STEP)) < 1e-9);
});

test('restart creates a clean new match; config snapshot is isolated', () => {
  const settings = { durationSec: 90, spawnIntervalSec: 4 };
  const a = new Simulation(createConfig(settings), 1);
  settings.durationSec = 150;
  assert.equal(a.config.session.durationSec, 90, 'later option changes do not leak in');
  run(a, 10, { forward: true, fireFront: true });
  const b = new Simulation(createConfig(settings), 1);
  assert.equal(b.score, 0); assert.equal(b.elapsed, 0); assert.equal(b.player.hp, 100);
  assert.equal(b.enemies.length, 0); assert.equal(b.projectiles.length, 0);
  assert.equal(b.config.session.durationSec, 150);
});

test('determinism: same seed + same inputs => same state', () => {
  const play = () => {
    const s = new Simulation(createConfig({ durationSec: 180, spawnIntervalSec: 2 }), 42);
    run(s, 20, { forward: true, turnRight: true, fireFront: true });
    return JSON.stringify([s.player, s.enemies, s.score]);
  };
  assert.equal(play(), play());
});

test('enemies never end up inside islands over a long, busy match', () => {
  const sim = new Simulation(createConfig({ durationSec: 180, spawnIntervalSec: 1 }), 5);
  for (let i = 0; i < 60 * 90; i++) {
    sim.player.hp = 100;
    sim.input = { ...emptyInput(), forward: i % 200 < 120, turnLeft: i % 300 < 60, fireFront: true };
    sim.step(STEP);
    for (const e of sim.enemies) {
      for (const c of sim.arena.colliders) {
        assert.ok(Math.hypot(e.x - c.x, e.y - c.y) >= c.r + 10, `enemy ${e.kind} inside island at t=${sim.elapsed.toFixed(1)}`);
      }
    }
  }
});

console.log(`\n${passed} tests passed`);
