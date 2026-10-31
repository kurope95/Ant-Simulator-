import test from "node:test";
import assert from "node:assert/strict";

import { defaultParams } from "../../src/sim/params.js";
import { pickAnt } from "../../src/sim/picking.js";
import { makeWorld } from "../../src/sim/world.js";
import type { World } from "../../src/sim/world.js";

function worldWith(ants: { uid: number; x: number; y: number }[]): World {
  const world = makeWorld(defaultParams(), 1, { x: 800, y: 800 });
  for (const a of ants) {
    world.ants.spawn({ pos: { x: a.x, y: a.y } }, a.uid, 0, world.params);
  }
  return world;
}

test("picking: returns the nearest ant inside the radius", () => {
  const world = worldWith([
    { uid: 4, x: 100, y: 100 },
    { uid: 9, x: 104, y: 100 },
    { uid: 2, x: 300, y: 300 },
  ]);
  assert.equal(pickAnt(world, 103, 100, 10), 9);
  assert.equal(pickAnt(world, 99, 100, 10), 4);
});

test("picking: respects the radius and returns -1 when nothing is near", () => {
  const world = worldWith([{ uid: 4, x: 100, y: 100 }]);
  assert.equal(pickAnt(world, 115, 100, 10), -1);
  assert.equal(pickAnt(world, 110, 100, 10), 4);
});

test("picking: returns -1 in an empty world", () => {
  const world = worldWith([]);
  assert.equal(pickAnt(world, 0, 0, 1000), -1);
});

test("picking: a tie goes to the lower uid", () => {
  const world = worldWith([
    { uid: 7, x: 100, y: 100 },
    { uid: 3, x: 100, y: 100 },
    { uid: 5, x: 100, y: 100 },
  ]);
  assert.equal(pickAnt(world, 100, 100, 5), 3);
});
