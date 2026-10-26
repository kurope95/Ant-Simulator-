import test from "node:test";
import assert from "node:assert/strict";

import { defaultParams } from "../../src/sim/params.js";
import { inspectAnt } from "../../src/sim/inspect.js";
import { antName } from "../../src/sim/names.js";
import { AntRole, AntState } from "../../src/sim/types.js";
import { makeWorld } from "../../src/sim/world.js";
import type { World } from "../../src/sim/world.js";

function worldWith(uids: number[]): World {
  const world = makeWorld(defaultParams(), 1, { x: 800, y: 800 });
  uids.forEach((uid, i) => {
    world.ants.spawn({ pos: { x: 10 + i, y: 20 + i }, colony: 0, role: AntRole.Explorer }, uid, 3, world.params);
  });
  return world;
}

test("inspect: returns the fields of a known ant", () => {
  const world = worldWith([5, 6]);
  world.ants.state[1] = AntState.ReturningFood;
  world.ants.energy[1] = 42;
  const snap = inspectAnt(world, 6);
  assert.ok(snap !== null);
  assert.equal(snap.uid, 6);
  assert.equal(snap.name, antName(6));
  assert.equal(snap.role, AntRole.Explorer);
  assert.equal(snap.state, AntState.ReturningFood);
  assert.equal(snap.carrying, true);
  assert.equal(snap.x, 11);
  assert.equal(snap.y, 21);
  assert.equal(snap.energy, 42);
  assert.equal(snap.speed, 3);
});

test("inspect: a foraging ant is not carrying", () => {
  const world = worldWith([5]);
  const snap = inspectAnt(world, 5);
  assert.equal(snap?.carrying, false);
});

test("inspect: null for a uid that is not alive", () => {
  const world = worldWith([5]);
  assert.equal(inspectAnt(world, 99), null);
});

test("inspect: a uid still resolves to its ant after another ant is removed", () => {
  const world = worldWith([10, 11, 12]);
  world.ants.removeSwap(0);
  assert.equal(inspectAnt(world, 10), null);
  const snap = inspectAnt(world, 12);
  assert.ok(snap !== null);
  assert.equal(snap.x, 12);
  assert.equal(snap.y, 22);
});
