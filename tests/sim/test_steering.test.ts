import test from "node:test";
import assert from "node:assert/strict";

import { wrapAngle } from "../../src/core/math.js";
import { makeColony } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { turnToward, updateWander } from "../../src/sim/steering.js";
import { AntRole } from "../../src/sim/types.js";
import { makeWorld } from "../../src/sim/world.js";

test("steering: turnToward turns at most maxTurn and takes the short way", () => {
  assert.equal(turnToward(0, Math.PI / 2, 0.1), 0.1);
  assert.ok(Math.abs(turnToward(0, -Math.PI / 2, 0.1) + 0.1) < 1e-12);
  const acrossPi = turnToward(3, -3, 0.5);
  assert.ok(Math.abs(wrapAngle(acrossPi) - wrapAngle(-3)) < 1e-9);
});

test("steering: wander stays inside each role's angle and resamples on a timer", () => {
  const params = defaultParams();
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 0, y: 0 }));
  const follower = world.ants.spawn({ pos: { x: 10, y: 10 } }, 1, 50, params);
  const explorer = world.ants.spawn(
    { pos: { x: 20, y: 20 }, role: AntRole.Explorer },
    2,
    50,
    params,
  );
  for (let t = 0; t < 200; t++) {
    world.tick = t;
    updateWander(world, follower, 1 / 60);
    updateWander(world, explorer, 1 / 60);
    assert.ok(Math.abs(world.ants.wanderOffset[follower]) <= params.wanderAngleFollower + 1e-6);
    assert.ok(Math.abs(world.ants.wanderOffset[explorer]) <= params.wanderAngleExplorer + 1e-6);
    assert.ok(world.ants.wanderTimer[follower] > 0);
    assert.ok(world.ants.wanderTimer[explorer] > 0);
  }
});
