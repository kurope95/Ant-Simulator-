import test from "node:test";
import assert from "node:assert/strict";
import { FoodKind, ObstacleKind, validateSetup } from "../../src/sim/setup.js";
import { loadPreset, presetNames, quickStartSetup } from "../../src/sim/presets.js";

test("presets: the six ids are stable", () => {
  assert.deepEqual(presetNames(), ["meadow", "dunes", "creek", "boulder", "maze", "blank"]);
});

test("presets: every preset is deterministic and every non-blank one is valid", () => {
  for (const id of presetNames()) {
    const a = loadPreset(id, 1)!;
    const b = loadPreset(id, 1)!;
    assert.deepEqual(a, b, id);
    if (id !== "blank") assert.equal(validateSetup(a), null, id);
  }
  assert.equal(loadPreset("arena", 1), null);
});

test("presets: meadow is the M1 sandbox plus a second food pile", () => {
  const setup = quickStartSetup(42);
  assert.equal(setup.presetId, "meadow");
  assert.equal(setup.seed, 42);
  assert.equal(setup.colonies.length, 1);
  assert.deepEqual(setup.colonies[0].nest, { x: 400, y: 540 });
  assert.equal(setup.colonies[0].startingAnts, 200);
  assert.equal(setup.food.length, 2);
  assert.equal(setup.food[0].amount, 6000);
});

test("presets: creek is wider and all food and obstacle kinds appear", () => {
  assert.deepEqual(loadPreset("creek", 1)!.size, { x: 2240, y: 1200 });
  const foodKinds = new Set<FoodKind>();
  const obstacleKinds = new Set<ObstacleKind>();
  for (const id of presetNames()) {
    const setup = loadPreset(id, 1)!;
    for (const food of setup.food) foodKinds.add(food.kind);
    for (const kind of setup.obstacles.kind) {
      if (kind !== ObstacleKind.None) obstacleKinds.add(kind as ObstacleKind);
    }
  }
  assert.deepEqual([...foodKinds].sort(), [FoodKind.Seeds, FoodKind.Berries, FoodKind.Leaves]);
  assert.deepEqual([...obstacleKinds].sort(), [ObstacleKind.Rock, ObstacleKind.Water, ObstacleKind.Sand, ObstacleKind.Mud]);
});

test("maze: the preset validates", () => {
  const setup = loadPreset("maze", 1);
  assert.ok(setup !== null);
  assert.equal(validateSetup(setup), null);
  assert.equal(setup.presetId, "maze");
  assert.deepEqual(setup.size, { x: 1920, y: 1080 });
  assert.deepEqual(setup.colonies.map((colony) => colony.nest), [{ x: 90, y: 960 }]);
  assert.equal(setup.colonies[0].startingAnts, 200);
  assert.deepEqual(
    setup.food.map((source) => [source.pos, source.amount]),
    [[{ x: 90, y: 120 }, 20000]],
  );
  assert.equal(setup.breach.length, 2);
  assert.equal(setup.paramOverrides.energyBurn, 0.2);
});
