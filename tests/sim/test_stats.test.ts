import test from "node:test";
import assert from "node:assert/strict";

import { makeColony } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { quickStartSetup } from "../../src/sim/presets.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import { makeWorld, stepWorld } from "../../src/sim/world.js";

test("stats: population and food-pool history gets one sample a second", () => {
  const world = worldFromSetup(quickStartSetup(7), defaultParams());
  for (let i = 0; i < 600; i++) stepWorld(world);
  const colony = world.colonies[0];
  assert.equal(colony.populationPerSecond.size(), 10);
  assert.equal(colony.foodPoolPerSecond.size(), 10);
  assert.equal(colony.populationPerSecond.get(9), colony.population);
  assert.equal(colony.foodPoolPerSecond.get(9), colony.foodPool);
});

test("stats: an extinct colony keeps a flat zero population history", () => {
  const world = makeWorld(defaultParams(), 1, { x: 800, y: 800 });
  world.colonies.push(makeColony(0, { x: 400, y: 400 }));
  for (let i = 0; i < 120; i++) stepWorld(world);
  const colony = world.colonies[0];
  assert.equal(colony.populationPerSecond.size(), 2);
  for (let i = 0; i < 2; i++) assert.equal(colony.populationPerSecond.get(i), 0);
  assert.equal(colony.extinct, true);
});
