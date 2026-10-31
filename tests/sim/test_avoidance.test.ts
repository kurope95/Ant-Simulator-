import test from "node:test";
import assert from "node:assert/strict";

import { computeAvoidance, makeAvoidScratch, timeToCollision } from "../../src/sim/avoidance.js";
import { resolveAntOverlaps } from "../../src/sim/collide.js";
import { defaultParams, type SimParams } from "../../src/sim/params.js";
import { addColony, makeSetup } from "../../src/sim/setup.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import type { World } from "../../src/sim/world.js";

function emptyWorld(edit?: (params: SimParams) => void): World {
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 300;
  edit?.(params);
  const setup = makeSetup({ x: 400, y: 300 }, 3, "test");
  addColony(setup, { x: 20, y: 20 }, 0, 0);
  return worldFromSetup(setup, params);
}

// Adds an ant with an explicit velocity. Heading and velocity are set by hand
// so each test states exactly what the ants are doing.
function addAnt(
  world: World,
  x: number,
  y: number,
  heading: number,
  speed: number,
  uid = world.nextUid++,
): number {
  const index = world.ants.spawn({ pos: { x, y }, heading }, uid, speed, world.params);
  world.ants.velX[index] = Math.cos(heading) * speed;
  world.ants.velY[index] = Math.sin(heading) * speed;
  return index;
}

function prepare(world: World): void {
  world.spatialHash.build(
    world.ants.posX,
    world.ants.posY,
    world.ants.size(),
    world.size,
    world.params.hashCell,
  );
}

// Each parity of uid + tick is recomputed on alternate ticks, so run two.
function avoidOnBothParities(world: World): void {
  const scratch = makeAvoidScratch();
  prepare(world);
  world.tick = 0;
  computeAvoidance(world, scratch);
  world.tick = 1;
  computeAvoidance(world, scratch);
}

test("timeToCollision: closing ants meet after 0.15 s", () => {
  const t = timeToCollision(20, 0, -100, 0, 5);
  assert.ok(t !== null && Math.abs(t - 0.15) < 1e-9, `t=${t}`);
});

test("timeToCollision: ants moving apart never meet", () => {
  assert.equal(timeToCollision(20, 0, 100, 0, 5), null);
});

test("timeToCollision: ants already overlapping are left to PBD", () => {
  assert.equal(timeToCollision(3, 0, -100, 0, 5), null);
});

test("avoidance: head-on ants both sidestep to their own right", () => {
  const world = emptyWorld();
  const a = addAnt(world, 100, 150, 0, 50);
  const b = addAnt(world, 110, 150, Math.PI, 50);
  avoidOnBothParities(world);
  assert.ok(world.ants.avoidY[a] > 0, `A avoidY ${world.ants.avoidY[a]}`);
  assert.ok(world.ants.avoidY[b] < 0, `B avoidY ${world.ants.avoidY[b]}`);
});

test("avoidance: ants walking the same way don't react", () => {
  const world = emptyWorld();
  const a = addAnt(world, 100, 150, 0, 50);
  const b = addAnt(world, 108, 150, 0, 50);
  avoidOnBothParities(world);
  assert.equal(world.ants.avoidX[a], 0);
  assert.equal(world.ants.avoidY[a], 0);
  assert.equal(world.ants.avoidX[b], 0);
  assert.equal(world.ants.avoidY[b], 0);
});

test("avoidance: a carrier barely yields", () => {
  const world = emptyWorld();
  // Slow ants keep the push under the cap, so the mass ratio shows directly.
  const a = addAnt(world, 100, 150, 0, 10);
  const b = addAnt(world, 120, 150, Math.PI, 10);
  world.ants.mass[b] = 3;
  avoidOnBothParities(world);
  const magA = Math.hypot(world.ants.avoidX[a], world.ants.avoidY[a]);
  const magB = Math.hypot(world.ants.avoidX[b], world.ants.avoidY[b]);
  assert.ok(magB > 0, "carrier avoidance is non-zero");
  assert.ok(Math.abs(magA / magB - 3) < 0.05, `ratio ${(magA / magB).toFixed(3)}`);
});

test("avoidance: time-slicing keeps last value on the off tick", () => {
  const world = emptyWorld();
  const a = addAnt(world, 100, 150, 0, 50);
  addAnt(world, 110, 150, Math.PI, 50);
  prepare(world);
  // uid 0 + odd tick is odd: this ant must not be recomputed.
  world.tick = 1;
  world.ants.avoidX[a] = 7;
  world.ants.avoidY[a] = -3;
  computeAvoidance(world, makeAvoidScratch());
  assert.equal(world.ants.avoidX[a], 7);
  assert.equal(world.ants.avoidY[a], -3);
});

test("avoidance: capped at avoidMaxSpeedFactor times speed in a dense crowd", () => {
  const world = emptyWorld();
  for (let i = 0; i < 12; i++) {
    addAnt(world, 100 + i * 2, 150 + (i % 2) * 0.5, i % 2 === 0 ? 0 : Math.PI, 50);
  }
  avoidOnBothParities(world);
  const cap = world.params.avoidMaxSpeedFactor * 50;
  for (let i = 0; i < world.ants.size(); i++) {
    const mag = Math.hypot(world.ants.avoidX[i], world.ants.avoidY[i]);
    assert.ok(mag <= cap + 1e-4, `ant ${i} avoid ${mag.toFixed(3)} > cap ${cap}`);
  }
});

test("avoidance: the result does not depend on ant order", () => {
  // Scattered positions, so no two distances tie. Same uids in both worlds,
  // spawned in opposite orders.
  const count = 60;
  const spots: { x: number; y: number; heading: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = i * 2.39996;
    spots.push({
      x: 150 + Math.cos(a) * 30 * Math.sqrt(((i * 0.618034) % 1)),
      y: 150 + Math.sin(a) * 30 * Math.sqrt(((i * 0.618034) % 1)),
      heading: (i * 1.3) % (2 * Math.PI),
    });
  }
  const build = (order: number[]): World => {
    const world = emptyWorld();
    for (const i of order) addAnt(world, spots[i].x, spots[i].y, spots[i].heading, 50, i);
    return world;
  };
  const forward = build(Array.from({ length: count }, (_, i) => i));
  const reverse = build(Array.from({ length: count }, (_, i) => count - 1 - i));
  for (const world of [forward, reverse]) {
    prepare(world);
    world.tick = 0;
    computeAvoidance(world, makeAvoidScratch());
    resolveAntOverlaps(world, world.collisionScratch);
  }
  for (let uid = 0; uid < count; uid++) {
    const f = forward.ants.indexOf(uid);
    const r = reverse.ants.indexOf(uid);
    assert.notEqual(f, null);
    assert.notEqual(r, null);
    assert.equal(forward.ants.posX[f as number], reverse.ants.posX[r as number], `uid ${uid} x`);
    assert.equal(forward.ants.posY[f as number], reverse.ants.posY[r as number], `uid ${uid} y`);
  }
});

test("avoidance: with a right bias an off-axis head-on pair passes on the right, mirror images", () => {
  // B sits a little to A's right, so the plain away rule sends both left.
  const plain = emptyWorld();
  const a0 = addAnt(plain, 100, 150, 0, 50);
  addAnt(plain, 112, 151, Math.PI, 50);
  avoidOnBothParities(plain);
  assert.ok(plain.ants.avoidY[a0] < 0, `away rule: A avoidY ${plain.ants.avoidY[a0]}`);

  const biased = emptyWorld((p) => {
    p.sidestepRightBias = 1;
  });
  const a = addAnt(biased, 100, 150, 0, 50);
  const b = addAnt(biased, 112, 151, Math.PI, 50);
  avoidOnBothParities(biased);
  const ants = biased.ants;
  assert.ok(ants.avoidY[a] > 0, `A avoidY ${ants.avoidY[a]}`);
  assert.ok(ants.avoidY[b] < 0, `B avoidY ${ants.avoidY[b]}`);
  // Both agree on who goes where: the pushes are mirror images.
  assert.ok(Math.abs(ants.avoidX[a] + ants.avoidX[b]) < 1e-3, `x ${ants.avoidX[a]} ${ants.avoidX[b]}`);
  assert.ok(Math.abs(ants.avoidY[a] + ants.avoidY[b]) < 1e-3, `y ${ants.avoidY[a]} ${ants.avoidY[b]}`);
});

test("avoidance: ants walking the same way don't both dodge, whatever the bias", () => {
  const world = emptyWorld((p) => {
    p.sidestepRightBias = 1;
    p.laneKeep = 1;
  });
  const a = addAnt(world, 100, 150, 0, 50);
  const b = addAnt(world, 108, 150, 0, 50);
  avoidOnBothParities(world);
  for (const i of [a, b]) {
    assert.equal(world.ants.avoidX[i], 0);
    assert.equal(world.ants.avoidY[i], 0);
  }
});

test("avoidance: lane keeping drifts right while an oncoming ant is ahead", () => {
  // The oncoming ant is well off to the left, so there is no collision course
  // and only lane keeping can push.
  const build = (laneKeep: number): { world: World; a: number } => {
    const world = emptyWorld((p) => {
      p.laneKeep = laneKeep;
    });
    const a = addAnt(world, 100, 150, 0, 50);
    addAnt(world, 115, 140, Math.PI, 50);
    avoidOnBothParities(world);
    return { world, a };
  };
  const off = build(0);
  assert.equal(off.world.ants.avoidY[off.a], 0);
  const on = build(0.5);
  const cap = on.world.params.avoidMaxSpeedFactor * 50;
  assert.ok(Math.abs(on.world.ants.avoidY[on.a] - 0.5 * cap) < 1e-4, `avoidY ${on.world.ants.avoidY[on.a]}`);
  assert.ok(Math.abs(on.world.ants.avoidX[on.a]) < 1e-4);
});

test("avoidance: with bias and lane keeping the result still does not depend on ant order", () => {
  const count = 60;
  const spots: { x: number; y: number; heading: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = i * 2.39996;
    spots.push({
      x: 150 + Math.cos(a) * 30 * Math.sqrt(((i * 0.618034) % 1)),
      y: 150 + Math.sin(a) * 30 * Math.sqrt(((i * 0.618034) % 1)),
      heading: (i * 1.3) % (2 * Math.PI),
    });
  }
  const build = (order: number[]): World => {
    const world = emptyWorld((p) => {
      p.sidestepRightBias = 0.5;
      p.laneKeep = 1;
    });
    for (const i of order) addAnt(world, spots[i].x, spots[i].y, spots[i].heading, 50, i);
    return world;
  };
  const forward = build(Array.from({ length: count }, (_, i) => i));
  const reverse = build(Array.from({ length: count }, (_, i) => count - 1 - i));
  for (const world of [forward, reverse]) avoidOnBothParities(world);
  for (let uid = 0; uid < count; uid++) {
    const f = forward.ants.indexOf(uid) as number;
    const r = reverse.ants.indexOf(uid) as number;
    assert.equal(forward.ants.avoidX[f], reverse.ants.avoidX[r], `uid ${uid} x`);
    assert.equal(forward.ants.avoidY[f], reverse.ants.avoidY[r], `uid ${uid} y`);
  }
});
