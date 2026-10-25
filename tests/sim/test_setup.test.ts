import test from "node:test";
import assert from "node:assert/strict";
import {
  FoodKind, ObstacleKind, addColony, addFood, cellKindAt, cloneSetup,
  makeSetup, paintCells, removeColony, removeFood, validateSetup,
} from "../../src/sim/setup.js";
import { COLONY_PALETTE, colonyHex, colonyName, firstFreeColor } from "../../src/sim/palette.js";

test("palette: eight named colours and the first unused index", () => {
  assert.equal(COLONY_PALETTE.length, 8);
  assert.equal(colonyName(2), "Azure");
  assert.equal(colonyHex(2), 0x4c8dde);
  assert.equal(firstFreeColor([0, 1, 2]), 3);
  assert.equal(firstFreeColor([0, 1, 2, 3, 4, 5, 6, 7]), 0);
});

test("setup: an empty map, and painting then erasing cells", () => {
  const setup = makeSetup({ x: 400, y: 300 }, 1, "blank");
  assert.equal(setup.obstacles.width, 100);
  assert.equal(setup.obstacles.height, 75);
  assert.ok(paintCells(setup, ObstacleKind.Rock, { x: 200, y: 150 }, 12) > 0);
  assert.equal(cellKindAt(setup, { x: 200, y: 150 }), ObstacleKind.Rock);
  paintCells(setup, ObstacleKind.None, { x: 200, y: 150 }, 12);
  assert.equal(cellKindAt(setup, { x: 200, y: 150 }), ObstacleKind.None);
});

test("setup: the brush radius is clamped to 8..64", () => {
  const setup = makeSetup({ x: 400, y: 300 }, 1);
  paintCells(setup, ObstacleKind.Sand, { x: 200, y: 150 }, 1000);
  assert.equal(cellKindAt(setup, { x: 300, y: 150 }), ObstacleKind.None); // 100 u away > 64
  assert.equal(cellKindAt(setup, { x: 230, y: 150 }), ObstacleKind.Sand);
});

test("setup: colonies and food get ids and uids that survive deletion", () => {
  const setup = makeSetup({ x: 400, y: 300 }, 9);
  const first = addColony(setup, { x: 80, y: 80 })!;
  const second = addColony(setup, { x: 300, y: 200 })!;
  assert.deepEqual([first.id, second.id, first.color, second.color], [0, 1, 0, 1]);
  assert.equal(removeColony(setup, 0), true);
  assert.equal(setup.colonies.length, 1);
  assert.equal(setup.colonies[0].id, 0);
  const a = addFood(setup, { x: 200, y: 150 }, 4000, FoodKind.Seeds);
  const b = addFood(setup, { x: 220, y: 150 }, 1000, FoodKind.Berries);
  assert.deepEqual([a.uid, b.uid], [1, 2]);
  removeFood(setup, 1);
  const c = addFood(setup, { x: 240, y: 150 }, 500, FoodKind.Leaves);
  assert.equal(c.uid, 3);
});

test("setup: colonies are capped at eight and starting ants are clamped", () => {
  const setup = makeSetup({ x: 400, y: 300 }, 1);
  for (let i = 0; i < 8; i++) assert.ok(addColony(setup, { x: 20 + i * 40, y: 40 }, i, 5000) !== null);
  assert.equal(addColony(setup, { x: 200, y: 200 }), null);
  assert.equal(setup.colonies[0].startingAnts, 600);
});

test("setup: validation returns the first problem in the fixed order", () => {
  const setup = makeSetup({ x: 400, y: 300 }, 1, "blank");
  assert.equal(validateSetup(setup), "Add at least one colony.");
  addColony(setup, { x: 100, y: 100 });
  assert.equal(validateSetup(setup), "Place at least one food source.");
  addFood(setup, { x: 300, y: 200 }, 4000, FoodKind.Seeds);
  assert.equal(validateSetup(setup), null);
  paintCells(setup, ObstacleKind.Rock, { x: 100, y: 100 }, 8);
  assert.equal(validateSetup(setup), "Move a colony off rock or water.");
});

test("setup: clone is deep and independent", () => {
  const setup = makeSetup({ x: 400, y: 300 }, 1);
  addColony(setup, { x: 100, y: 100 });
  addFood(setup, { x: 300, y: 200 }, 4000, FoodKind.Seeds);
  const copy = cloneSetup(setup);
  copy.colonies[0].nest.x = 5;
  copy.obstacles.kind[0] = ObstacleKind.Rock;
  copy.food[0].amount = 1;
  assert.equal(setup.colonies[0].nest.x, 100);
  assert.equal(setup.obstacles.kind[0], ObstacleKind.None);
  assert.equal(setup.food[0].amount, 4000);
});
