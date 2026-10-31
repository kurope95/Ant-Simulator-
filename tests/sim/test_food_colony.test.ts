import test from "node:test";
import assert from "node:assert/strict";

import { addFoodSource, foodRadius, makeFoodSources } from "../../src/sim/food.js";
import { makeColony, nestRadius } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { FoodKind } from "../../src/sim/setup.js";

test("food: radius follows the amount, clamped to the minimum", () => {
  const params = defaultParams();
  const at = (amount: number) =>
    foodRadius({ pos: { x: 0, y: 0 }, amount, infinite: false }, params);
  assert.equal(at(500), 12);
  assert.equal(at(2000), 24);
  assert.equal(at(1), params.foodMinR);
  assert.equal(foodRadius({ pos: { x: 0, y: 0 }, amount: 0, infinite: true }, params), 24);
});

test("food: findTouching returns the nearest source in range", () => {
  const params = defaultParams();
  const sources = makeFoodSources();
  addFoodSource(sources, { x: 100, y: 0 }, 500, false);
  addFoodSource(sources, { x: 0, y: 0 }, 500, false);
  assert.equal(sources.findTouching({ x: 96, y: 0 }, params.antRadius, params), 0);
  addFoodSource(sources, { x: 97, y: 0 }, 500, false);
  assert.equal(sources.findTouching({ x: 96, y: 0 }, params.antRadius, params), 2);
  assert.equal(sources.findTouching({ x: 60, y: 0 }, params.antRadius, params), -1);
  assert.equal(sources.findTouching({ x: 500, y: 500 }, params.antRadius, params), -1);
});

test("food: takeOne decrements, reports the unit and never empties an infinite source", () => {
  const sources = makeFoodSources();
  addFoodSource(sources, { x: 0, y: 0 }, 2, false);
  assert.equal(sources.takeOne(0), true);
  assert.equal(sources.items[0].amount, 1);
  assert.equal(sources.takeOne(0), true);
  assert.equal(sources.items[0].amount, 0);
  assert.equal(sources.takeOne(0), false);
  addFoodSource(sources, { x: 10, y: 0 }, 0, true);
  assert.equal(sources.takeOne(1), true);
  assert.equal(sources.takeOne(1), true);
});

test("food: removeEmpty drops spent sources and keeps the rest in order", () => {
  const sources = makeFoodSources();
  addFoodSource(sources, { x: 1, y: 0 }, 0, false);
  addFoodSource(sources, { x: 2, y: 0 }, 5, false);
  addFoodSource(sources, { x: 3, y: 0 }, 0, true);
  sources.removeEmpty();
  assert.deepEqual(sources.items.map((s) => s.pos.x), [2, 3]);
});

test("colony: starts empty and holds a 120-sample delivery history", () => {
  const colony = makeColony(2, { x: 5, y: 6 });
  assert.equal(colony.id, 2);
  assert.deepEqual(colony.nest, { x: 5, y: 6 });
  assert.equal(colony.foodPool, 0);
  assert.equal(colony.population, 0);
  assert.equal(colony.deliveredTotal, 0);
  assert.equal(colony.deliveredLastSample, 0);
  assert.equal(colony.extinct, false);
  assert.equal(colony.deliveredPerSecond.size(), 0);
  for (let i = 0; i < 130; i++) colony.deliveredPerSecond.push(i);
  assert.equal(colony.deliveredPerSecond.size(), 120);
  assert.equal(colony.deliveredPerSecond.get(0), 10);
});

test("food: addFoodSource assigns monotonic uids and keeps the kind", () => {
  const sources = makeFoodSources();
  addFoodSource(sources, { x: 0, y: 0 }, 100, false, FoodKind.Leaves);
  addFoodSource(sources, { x: 10, y: 0 }, 200, false);
  assert.deepEqual(sources.items.map((s) => [s.uid, s.kind]), [[1, FoodKind.Leaves], [2, FoodKind.Seeds]]);
  sources.items.shift();
  addFoodSource(sources, { x: 20, y: 0 }, 300);
  assert.equal(sources.items.at(-1)!.uid, 3);
});

test("colony: nest radius grows with the square root of the population", () => {
  const params = defaultParams();
  const colony = makeColony(0, { x: 0, y: 0 });
  assert.equal(nestRadius(colony, params), 20);
  colony.population = 400;
  assert.equal(nestRadius(colony, params), 28);
});

test("food: a pile grows like a population, capped at its size; eaten to the last piece it dies for good", () => {
  const sources = makeFoodSources();
  sources.items.push({ uid: 1, pos: { x: 10, y: 10 }, amount: 500, capacity: 1000, infinite: false, kind: FoodKind.Seeds });
  // At half its size it grows fastest: rate x amount x (1 - amount / capacity) a minute.
  sources.regrow(60, 0.4);
  assert.ok(Math.abs(sources.items[0].amount - 600) < 1, `${sources.items[0].amount}`);
  // Nearly bare, it adds almost nothing.
  sources.items[0].amount = 2;
  sources.regrow(60, 0.4);
  assert.ok(sources.items[0].amount < 3, `${sources.items[0].amount}`);
  // It never grows past its capacity.
  sources.items[0].amount = 990;
  for (let i = 0; i < 100; i++) sources.regrow(60, 0.4);
  assert.ok(sources.items[0].amount <= 1000);
  // Taking the last piece kills it: no growth, gone after a minute.
  sources.items[0].amount = 1.5;
  assert.equal(sources.takeOne(0), true);
  assert.equal(sources.items[0].amount, 0);
  sources.regrow(30, 0.4);
  assert.equal(sources.items[0].amount, 0, "a dead pile never grows");
  sources.removeEmpty();
  assert.equal(sources.items.length, 1, "it lingers, bare, for a while");
  sources.regrow(31, 0.4);
  sources.removeEmpty();
  assert.equal(sources.items.length, 0);
});

test("food: eating off a pile shrinks it", () => {
  const sources = makeFoodSources();
  sources.items.push({ uid: 1, pos: { x: 10, y: 10 }, amount: 10, capacity: 10, infinite: false, kind: FoodKind.Seeds });
  sources.eat(0, 0.4);
  assert.ok(Math.abs(sources.items[0].amount - 9.6) < 1e-9);
  sources.eat(0, 9);
  assert.equal(sources.items[0].amount, 0, "eaten under one piece, it dies");
});

test("food: living piles seed new ones and wild food sprouts, never on rock, at a nest or on a pile", async () => {
  const { worldFromSetup } = await import("../../src/sim/setup_apply.js");
  const { quickStartSetup } = await import("../../src/sim/presets.js");
  const { stepWorld } = await import("../../src/sim/world.js");
  const { isSolidAt } = await import("../../src/sim/obstacles.js");
  const params = defaultParams();
  params.foodSpreadRate = 3;
  params.foodSproutRate = 3;
  const world = worldFromSetup(quickStartSetup(4), params, { spawnAnts: false });
  const before = world.food.items.length;
  for (let t = 0; t < 120 * params.simHz; t++) stepWorld(world);
  assert.ok(world.food.items.length > before, `${before} -> ${world.food.items.length} piles`);
  assert.ok(world.food.items.length <= params.foodPileCap);
  for (const pile of world.food.items) {
    assert.equal(isSolidAt(world.obstacles, pile.pos), false, "not on rock or water");
    for (const colony of world.colonies) {
      assert.ok(Math.hypot(pile.pos.x - colony.nest.x, pile.pos.y - colony.nest.y) >= nestRadius(colony, params) * 3 - 1);
    }
  }
});
