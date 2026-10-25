import test from "node:test";
import assert from "node:assert/strict";

import { GaitTracker, legPose } from "../../src/render/legs.js";
import { defaultParams } from "../../src/sim/params.js";
import { makeWorld } from "../../src/sim/world.js";

test("legs: tripods alternate and never lift together", () => {
  for (let leg = 0; leg < 6; leg++) {
    const a = legPose(0.25, leg, 20);
    const b = legPose(0.75, leg, 20);
    const inTripodA = leg === 0 || leg === 2 || leg === 4;
    assert.ok(inTripodA ? a.lift > 0.99 : a.lift === 0, `leg ${leg} at 0.25`);
    assert.ok(inTripodA ? b.lift === 0 : b.lift > 0.99, `leg ${leg} at 0.75`);
  }
});

test("legs: left and right legs mirror at rest and swing in antiphase", () => {
  const left = legPose(0, 0, 20);
  const right = legPose(0, 3, 20);
  assert.ok(left.lift < 1e-12);
  assert.ok(right.lift < 1e-12);
  assert.ok(Math.abs(left.footX - right.footX) < 1e-6);
  assert.ok(Math.abs(left.footY + right.footY) < 1e-6);
  assert.ok(Math.abs(left.hipY + right.hipY) < 1e-6);
  for (const pose of [left, right]) {
    for (const value of Object.values(pose)) assert.ok(Number.isFinite(value));
  }
  const swinging = legPose(0.25, 0, 20);
  const planted = legPose(0.25, 3, 20);
  assert.ok(Math.abs(swinging.footX - planted.footX - 0.44 * 20) < 1e-6);
});

test("gait: phase advances with distance and wraps", () => {
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 300;
  const world = makeWorld(params, 1);
  world.ants.spawn({ pos: { x: 100, y: 100 } }, 0, params.antSpeed, params);
  const gait = new GaitTracker();
  gait.update(world);
  const start = gait.phaseAt(0);
  world.ants.posX[0] += 12;
  gait.update(world);
  assert.ok(Math.abs(((gait.phaseAt(0) - start + 1) % 1) - 0.5) < 1e-6);
  for (let i = 0; i < 100; i++) {
    world.ants.posX[0] += 12;
    gait.update(world);
  }
  assert.ok(gait.phaseAt(0) >= 0 && gait.phaseAt(0) < 1);
  assert.equal(gait.phaseAt(-1), 0);
  assert.equal(gait.phaseAt(99), 0);
});
