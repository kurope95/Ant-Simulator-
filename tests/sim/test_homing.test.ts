import test from "node:test";
import assert from "node:assert/strict";

import { worldChecksum } from "../../src/sim/checksum.js";
import { makeColony } from "../../src/sim/colony.js";
import { rebuildBorder } from "../../src/sim/obstacles.js";
import { defaultParams } from "../../src/sim/params.js";
import { ObstacleKind } from "../../src/sim/setup.js";
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

// A carrier 200 u above a 24 u rock wall that runs from x=200 to x=2000, so it
// can go round either end; the nest sits below the middle at (1100, 800).
function walledWorld(uid: number): World {
  const params = defaultParams();
  const world = makeWorld(params, 5, { x: 2200, y: 1000 });
  const colony = makeColony(0, { x: 1100, y: 800 });
  colony.population = 1;
  world.colonies.push(colony);
  const grid = world.obstacles;
  for (let row = Math.floor(400 / grid.cell); row < Math.floor(424 / grid.cell); row++) {
    for (let col = Math.floor(200 / grid.cell); col < Math.floor(2000 / grid.cell); col++) {
      grid.kind[row * grid.width + col] = ObstacleKind.Rock;
    }
  }
  rebuildBorder(grid);
  const index = world.ants.spawn(
    { pos: { x: 1100, y: 200 }, heading: Math.PI / 2, state: AntState.ReturningFood },
    uid,
    params.antSpeed,
    world.params,
  );
  world.ants.mass[index] = params.massCarrying;
  return world;
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

test("homing: a carrier keeps to one side of a wall and gets round it", () => {
  // A wall across the map with a gap at either end, the carrier directly above
  // it: whichever end it chooses, the way home is open. Turning back at every
  // wander pick would leave it pressed against the wall. One even and one odd
  // uid, because the side an ant keeps comes from its own identity.
  for (const uid of [kCarrierUid - 1, kCarrierUid]) {
    const world = walledWorld(uid);
    assert.notEqual(
      deliveredTick(world, 5400),
      null,
      `carrier ${uid} should get round the wall (ended at ${world.ants.posX[0].toFixed(0)},${world.ants.posY[0].toFixed(0)}, delivered ${world.colonies[0].deliveredTotal})`,
    );
  }
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
