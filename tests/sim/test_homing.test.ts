import test from "node:test";
import assert from "node:assert/strict";

import { worldChecksum } from "../../src/sim/checksum.js";
import { makeColony } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { AntState } from "../../src/sim/types.js";
import { makeWorld, stepWorld, type World } from "../../src/sim/world.js";

const kNest = { x: 200, y: 500 };
const kCarrierUid = 999_999;

// A blank map with a single carrier 800 u east of the nest and no trail at
// all: the only way home is the ant's own path estimate.
function carrierWorld(homingEnabled: boolean, distance = 800, seed = 11): { world: World; index: number } {
  const params = defaultParams();
  params.homingEnabled = homingEnabled;
  const world = makeWorld(params, seed, { x: 2200, y: 1000 });
  const colony = makeColony(0, kNest);
  colony.population = 1;
  world.colonies.push(colony);
  const index = world.ants.spawn(
    {
      pos: { x: kNest.x + distance, y: kNest.y },
      heading: Math.PI,
      state: AntState.ReturningFood,
    },
    kCarrierUid,
    params.antSpeed,
    world.params,
  );
  world.ants.mass[index] = params.massCarrying;
  return { world, index };
}

function deliveredTick(world: World, ticks: number): number | null {
  for (let t = 0; t < ticks; t++) {
    stepWorld(world);
    if (world.colonies[0].deliveredTotal > 0) return world.tick;
  }
  return null;
}

test("homing: a carrier with no trail gets home", () => {
  const homing = carrierWorld(true);
  assert.notEqual(deliveredTick(homing.world, 1800), null, "homing on should deliver");

  const wandering = carrierWorld(false);
  assert.equal(
    deliveredTick(wandering.world, 1800),
    null,
    `homing off should not deliver (got ${wandering.world.colonies[0].deliveredTotal})`,
  );
});

test("homing: drift accumulates on wander picks and resets at the nest", () => {
  const { world, index } = carrierWorld(true);
  world.ants.wanderTimer[index] = 0;
  stepWorld(world);
  const drift = Math.hypot(world.ants.homeErrX[index], world.ants.homeErrY[index]);
  // One pick, so one drift step: the drawn interval is at most 1.5x nominal.
  const walked = world.params.antSpeed * world.params.wanderIntervalFollower * 1.5;
  assert.ok(drift > 0, "a pick should add drift");
  assert.ok(drift <= world.params.homingDrift * walked * Math.SQRT2 + 1e-6, `drift ${drift}`);

  // Arriving home clears the estimate; the next outbound trip starts clean.
  world.ants.homeErrX[index] = 5;
  world.ants.homeErrY[index] = -5;
  world.ants.posX[index] = kNest.x;
  world.ants.posY[index] = kNest.y;
  stepWorld(world);
  assert.equal(world.ants.homeErrX[index], 0);
  assert.equal(world.ants.homeErrY[index], 0);
});

test("homing: determinism", () => {
  const a = carrierWorld(true).world;
  const b = carrierWorld(true).world;
  for (let t = 0; t < 600; t++) {
    stepWorld(a);
    stepWorld(b);
  }
  assert.equal(worldChecksum(a), worldChecksum(b));
});
