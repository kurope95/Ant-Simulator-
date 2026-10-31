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

test("food: an emptied pile stays as bare ground and grows back to its size", () => {
  const sources = makeFoodSources();
  sources.items.push({ uid: 1, pos: { x: 10, y: 10 }, amount: 2, capacity: 600, infinite: false, kind: FoodKind.Seeds });
  assert.equal(sources.takeOne(0), true);
  assert.equal(sources.takeOne(0), true);
  assert.equal(sources.takeOne(0), false);
  sources.removeEmpty();
  assert.equal(sources.items.length, 1, "a regrowing pile is kept");
  // 600 per 600 s is one piece a second.
  sources.regrow(0.5, 600);
  assert.equal(sources.takeOne(0), false, "half a piece cannot be taken");
  sources.regrow(0.5, 600);
  assert.equal(sources.takeOne(0), true);
  for (let i = 0; i < 1000; i++) sources.regrow(1, 600);
  assert.equal(sources.items[0].amount, 600, "it stops at its starting size");
  sources.regrow(1, 0);
  const pile = sources.items[0];
  pile.amount = 5;
  sources.regrow(10, 0);
  assert.equal(pile.amount, 5, "regrow time 0 turns it off");
});
