import test from "node:test";
import assert from "node:assert/strict";

import { crowdMetrics, crowdWorld, laneScore, type LaneSample } from "../../src/app/bench_scenarios.js";
import { randU32 } from "../../src/core/rng.js";
import { loadPreset } from "../../src/sim/presets.js";
import { validateSetup } from "../../src/sim/setup.js";
import { AntState } from "../../src/sim/types.js";
import { stepWorld } from "../../src/sim/world.js";

test("highway: the preset validates and has a corridor of two walls", () => {
  const setup = loadPreset("highway", 1);
  assert.ok(setup !== null);
  assert.equal(validateSetup(setup), null);
  assert.equal(setup.colonies.length, 1);
  assert.deepEqual(setup.colonies[0].nest, { x: 200, y: 450 });
  assert.equal(setup.colonies[0].startingAnts, 600);
  assert.equal(setup.food.length, 1);
  assert.equal(setup.food[0].amount, 20000);
  assert.equal(setup.breach.length, 0);
  assert.deepEqual(setup.paramOverrides, { energyBurn: 0.3 });
});

test("crowd: builds exactly N ants with alternating states and masses", () => {
  const world = crowdWorld(3, 500);
  assert.equal(world.ants.size(), 500);
  let foraging = 0;
  let returning = 0;
  for (let i = 0; i < world.ants.size(); i++) {
    const uid = world.ants.uid[i];
    if (uid % 2 === 0) {
      assert.equal(world.ants.state[i], AntState.Foraging);
      assert.equal(world.ants.mass[i], 1);
      foraging += 1;
    } else {
      assert.equal(world.ants.state[i], AntState.ReturningFood);
      assert.equal(world.ants.mass[i], 3);
      returning += 1;
    }
  }
  assert.equal(foraging, 250);
  assert.equal(returning, 250);
  assert.equal(world.params.energyBurn, 0);
  assert.equal(world.params.spawnCost, 1e9);
});

test("crowd: the population holds steady for a second of ticks", () => {
  const world = crowdWorld(3, 200);
  for (let tick = 0; tick < 60; tick++) stepWorld(world);
  // Only births and deaths would change the count; the scenario has neither.
  assert.equal(world.ants.size(), 200);
});

function fraction(seed: number, uid: number, tick: number, stream: number): number {
  return randU32(seed, uid, tick, stream) / 2 ** 32;
}

test("lanes: a perfectly laned set scores 1.0", () => {
  const samples: LaneSample[] = [];
  for (let i = 0; i < 100; i++) {
    samples.push({ x: 1000 + i, y: 470, direction: 1 });
    samples.push({ x: 1000 + i, y: 430, direction: -1 });
  }
  assert.equal(laneScore(samples, 450), 1);
});

test("lanes: random mixing scores about 0.5", () => {
  const samples: LaneSample[] = [];
  for (let i = 0; i < 4000; i++) {
    const y = 380 + fraction(5, i, 1, 1) * 140;
    const direction = fraction(6, i, 1, 2) < 0.5 ? 1 : -1;
    samples.push({ x: 1000, y, direction });
  }
  const score = laneScore(samples, 450);
  assert.ok(Math.abs(score - 0.5) < 0.03, `score ${score.toFixed(3)}`);
});

test("crowd metrics: a fresh crowd reports finite lane and overlap values", () => {
  const metrics = crowdMetrics(crowdWorld(3, 300));
  assert.ok(Number.isFinite(metrics.lanes));
  assert.ok(metrics.lanes >= 0 && metrics.lanes <= 1);
  assert.ok(metrics.overlap >= 0 && metrics.overlap <= 1);
  assert.ok(metrics.inCorridor > 0);
});
