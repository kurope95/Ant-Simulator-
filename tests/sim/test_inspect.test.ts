import test from "node:test";
import assert from "node:assert/strict";

import { defaultParams } from "../../src/sim/params.js";
import { angleDiff } from "../../src/core/math.js";
import { inspectAnt, sensorView } from "../../src/sim/inspect.js";
import { quickStartSetup } from "../../src/sim/presets.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import { stepWorld } from "../../src/sim/world.js";
import { antName } from "../../src/sim/names.js";
import { AntRole, AntState } from "../../src/sim/types.js";
import { makeWorld } from "../../src/sim/world.js";
import type { World } from "../../src/sim/world.js";

function worldWith(uids: number[]): World {
  const world = makeWorld(defaultParams(), 1, { x: 800, y: 800 });
  uids.forEach((uid, i) => {
    world.ants.spawn({ pos: { x: 10 + i, y: 20 + i }, colony: 0, role: AntRole.Explorer }, uid, 3, world.params);
  });
  return world;
}

test("inspect: returns the fields of a known ant", () => {
  const world = worldWith([5, 6]);
  world.ants.state[1] = AntState.ReturningFood;
  world.ants.energy[1] = 42;
  const snap = inspectAnt(world, 6);
  assert.ok(snap !== null);
  assert.equal(snap.uid, 6);
  assert.equal(snap.name, antName(6));
  assert.equal(snap.role, AntRole.Explorer);
  assert.equal(snap.state, AntState.ReturningFood);
  assert.equal(snap.carrying, true);
  assert.equal(snap.x, 11);
  assert.equal(snap.y, 21);
  assert.equal(snap.energy, 42);
  assert.equal(snap.speed, 3);
});

test("inspect: a foraging ant is not carrying", () => {
  const world = worldWith([5]);
  const snap = inspectAnt(world, 5);
  assert.equal(snap?.carrying, false);
});

test("inspect: null for a uid that is not alive", () => {
  const world = worldWith([5]);
  assert.equal(inspectAnt(world, 99), null);
});

test("inspect: a uid still resolves to its ant after another ant is removed", () => {
  const world = worldWith([10, 11, 12]);
  world.ants.removeSwap(0);
  assert.equal(inspectAnt(world, 10), null);
  const snap = inspectAnt(world, 12);
  assert.ok(snap !== null);
  assert.equal(snap.x, 12);
  assert.equal(snap.y, 22);
});

test("sensor view: a follower has 25 sample points and an explorer 6", () => {
  const world = makeWorld(defaultParams(), 1, { x: 800, y: 800 });
  world.ants.spawn({ pos: { x: 400, y: 400 }, colony: 0, role: AntRole.Follower, heading: 0 }, 1, 3, world.params);
  world.ants.spawn({ pos: { x: 400, y: 400 }, colony: 0, role: AntRole.Explorer, heading: 0 }, 2, 3, world.params);
  assert.equal(sensorView(world, 1)?.count, 25);
  assert.equal(sensorView(world, 2)?.count, 6);
  assert.equal(sensorView(world, 3), null);
});

test("sensor view: every sample lies inside the cone and the radius", () => {
  const world = makeWorld(defaultParams(), 1, { x: 800, y: 800 });
  world.ants.spawn({ pos: { x: 400, y: 400 }, colony: 0, role: AntRole.Follower, heading: 1.2 }, 1, 3, world.params);
  const view = sensorView(world, 1);
  assert.ok(view !== null);
  for (let k = 0; k < view.count; k++) {
    const dx = view.points[2 * k] - 400;
    const dy = view.points[2 * k + 1] - 400;
    assert.ok(Math.hypot(dx, dy) <= view.radius + 1e-3, `point ${k} outside the radius`);
    assert.ok(Math.abs(angleDiff(1.2, Math.atan2(dy, dx))) <= view.fovHalfRad + 1e-4, `point ${k} outside the cone`);
  }
  assert.ok(Math.abs(view.fovHalfRad - (defaultParams().sensorHalfFovDeg * Math.PI) / 180) < 1e-9);
});

test("sensor view: scores are zero with no markers and reuse the buffer", () => {
  const world = makeWorld(defaultParams(), 1, { x: 800, y: 800 });
  world.ants.spawn({ pos: { x: 400, y: 400 }, colony: 0, role: AntRole.Follower }, 1, 3, world.params);
  const first = sensorView(world, 1);
  assert.ok(first !== null);
  assert.ok(first.scores.every((score) => score === 0));
  const again = sensorView(world, 1, first);
  assert.equal(again, first);
});

// Acceptance for M5: one ant goes out, finds food, carries it home and drops
// it, and the inspector reads the same uid the whole time.
test("food trip: an inspected ant forages, carries food and drops it", () => {
  const params = defaultParams();
  for (const uid of [0, 1, 2, 3, 4]) {
    const world = worldFromSetup(quickStartSetup(7), params);
    let foraged = false;
    let carried = false;
    let droppedAfterCarry = false;
    let alive = true;
    for (let tick = 0; tick < 10_800 && alive; tick++) {
      stepWorld(world);
      const snap = inspectAnt(world, uid);
      if (snap === null) {
        alive = false;
        break;
      }
      assert.equal(snap.uid, uid);
      assert.ok(snap.energy >= 0 && snap.energy <= params.energyMax, `energy ${snap.energy} at tick ${tick}`);
      if (snap.state === AntState.Foraging) {
        if (carried) droppedAfterCarry = true;
        else foraged = true;
      }
      if (snap.carrying) {
        assert.equal(snap.state, AntState.ReturningFood);
        assert.equal(snap.mass, params.massCarrying);
        carried = true;
      }
      if (droppedAfterCarry) break;
    }
    if (foraged && carried && droppedAfterCarry) return;
  }
  assert.fail("no ant among uids 0..4 completed a food trip within 10 800 ticks");
});
