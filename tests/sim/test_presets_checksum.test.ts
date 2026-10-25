import test from "node:test";
import assert from "node:assert/strict";

import { worldChecksum } from "../../src/sim/checksum.js";
import { defaultParams } from "../../src/sim/params.js";
import { quickStartSetup } from "../../src/sim/presets.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import { stepWorld } from "../../src/sim/world.js";

test("presets: the meadow quick start places a nest, food and 200 ants", () => {
  const world = worldFromSetup(quickStartSetup(1), defaultParams());
  assert.equal(world.colonies.length, 1);
  const colony = world.colonies[0];
  assert.deepEqual(colony.nest, { x: 400, y: 540 });
  assert.equal(colony.population, 200);
  assert.equal(world.ants.size(), 200);
  assert.equal(world.nextUid, 200);
  assert.equal(world.food.items.length, 2);
  assert.deepEqual(world.food.items[0].pos, { x: 1000, y: 720 });
  assert.equal(world.food.items[0].amount, 6000);
  for (let i = 0; i < world.ants.size(); i++) {
    const dist = Math.hypot(world.ants.posX[i] - 400, world.ants.posY[i] - 540);
    assert.ok(dist <= 26, `ant ${i} is ${dist} u from the nest`);
  }
});

test("checksum: equal meadow worlds hash equally and different seeds differ", () => {
  const a = worldFromSetup(quickStartSetup(7), defaultParams());
  const b = worldFromSetup(quickStartSetup(7), defaultParams());
  const c = worldFromSetup(quickStartSetup(8), defaultParams());
  assert.equal(worldChecksum(a), worldChecksum(b));
  assert.notEqual(worldChecksum(a), worldChecksum(c));
});

test("checksum: moving one ant changes the hash", () => {
  const a = worldFromSetup(quickStartSetup(7), defaultParams());
  const b = worldFromSetup(quickStartSetup(7), defaultParams());
  b.ants.posX[3] += 1;
  assert.notEqual(worldChecksum(a), worldChecksum(b));
});

test("determinism: the same seed reproduces meadow after 600 ticks", () => {
  const a = worldFromSetup(quickStartSetup(7), defaultParams());
  const b = worldFromSetup(quickStartSetup(7), defaultParams());
  for (let i = 0; i < 600; i++) {
    stepWorld(a);
    stepWorld(b);
  }
  assert.equal(worldChecksum(a), worldChecksum(b));
  assert.equal(a.ants.size(), b.ants.size());
});

test("meadow: 7,200 ticks keep a live colony and a trail", { timeout: 120_000 }, () => {
  const world = worldFromSetup(quickStartSetup(1), defaultParams());
  for (let i = 0; i < 7200; i++) stepWorld(world);
  const colony = world.colonies[0];
  assert.ok(colony.deliveredTotal >= 5, `delivered ${colony.deliveredTotal}`);
  // Tick 7,200 is the first-generation starvation minimum (76 ants, Task 8 ruling);
  // the full population floor is asserted at 10,800. This guard only catches collapse.
  assert.ok(world.ants.size() >= 40, `ants ${world.ants.size()}`);
  let homeCells = 0;
  let foodCells = 0;
  for (let cell = 0; cell < world.markers.owner.length; cell++) {
    if (world.markers.owner[cell] !== 0) continue;
    if (world.markers.toHome[cell] > 0.02) homeCells++;
    if (world.markers.toFood[cell] > 0.02) foodCells++;
  }
  assert.ok(homeCells >= 20, `to_home cells ${homeCells}`);
  assert.ok(foodCells >= 20, `to_food cells ${foodCells}`);
  for (let i = 0; i < world.ants.size(); i++) {
    assert.ok(Number.isFinite(world.ants.posX[i]));
    assert.ok(Number.isFinite(world.ants.posY[i]));
    assert.ok(Number.isFinite(world.ants.energy[i]));
    assert.ok(Number.isFinite(world.ants.heading[i]));
  }
});

test("meadow: a trail forms and food is delivered within 10,800 ticks", { timeout: 120_000 }, () => {
  const world = worldFromSetup(quickStartSetup(1), defaultParams());
  for (let i = 0; i < 10800; i++) stepWorld(world);
  const colony = world.colonies[0];
  assert.ok(colony.deliveredTotal >= 5, `delivered ${colony.deliveredTotal}`);
  assert.ok(world.ants.size() >= 100, `ants ${world.ants.size()}`);
  let homeCells = 0;
  let foodCells = 0;
  for (let cell = 0; cell < world.markers.owner.length; cell++) {
    if (world.markers.owner[cell] !== 0) continue;
    if (world.markers.toHome[cell] > 0.02) homeCells++;
    if (world.markers.toFood[cell] > 0.02) foodCells++;
  }
  assert.ok(homeCells >= 20, `to_home cells ${homeCells}`);
  assert.ok(foodCells >= 20, `to_food cells ${foodCells}`);
  for (let i = 0; i < world.ants.size(); i++) {
    assert.ok(Number.isFinite(world.ants.posX[i]));
    assert.ok(Number.isFinite(world.ants.posY[i]));
    assert.ok(Number.isFinite(world.ants.energy[i]));
    assert.ok(Number.isFinite(world.ants.heading[i]));
  }
});
