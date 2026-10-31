import test from "node:test";
import assert from "node:assert/strict";

import { GeometryBatch } from "../../src/render/batch.js";
import { buildInspectorOverlay, wedgeEdgePoints } from "../../src/render/inspector_overlay.js";
import { defaultParams } from "../../src/sim/params.js";
import { sensorView } from "../../src/sim/inspect.js";
import { AntRole } from "../../src/sim/types.js";
import { makeWorld } from "../../src/sim/world.js";

const identity = (p: { x: number; y: number }) => p;

function overlay(role: number, sensors: boolean, heading = 0.5): GeometryBatch {
  const world = makeWorld(defaultParams(), 1, { x: 800, y: 800 });
  world.ants.spawn({ pos: { x: 400, y: 400 }, colony: 0, role, heading }, 1, 3, world.params);
  const batch = new GeometryBatch();
  buildInspectorOverlay(batch, {
    ant: { screen: { x: 300, y: 300 }, ringPx: 12, heading },
    sensors: sensors ? sensorView(world, 1) : null,
    scale: 2,
    toScreen: identity,
  });
  return batch;
}

test("overlay: the ring alone is 28 quads", () => {
  const batch = overlay(AntRole.Follower, false);
  assert.equal(batch.vertexCount(), 28 * 4);
});

test("overlay: a follower's sensors cost more vertices than an explorer's", () => {
  const follower = overlay(AntRole.Follower, true);
  const explorer = overlay(AntRole.Explorer, true);
  assert.ok(follower.vertexCount() > explorer.vertexCount());
});

test("overlay: every vertex is finite", () => {
  for (const batch of [overlay(AntRole.Follower, true), overlay(AntRole.Explorer, true)]) {
    const data = batch.vertexData();
    for (let i = 0; i < data.length; i++) assert.ok(Number.isFinite(data[i]), `vertex value ${i} is not finite`);
  }
});

test("overlay: the wedge edges sit at heading plus and minus the half cone", () => {
  const heading = 0.5;
  const halfFov = 0.9;
  const [left, right] = wedgeEdgePoints({ x: 10, y: 20 }, heading, halfFov, 50);
  assert.ok(Math.abs(Math.atan2(left.y - 20, left.x - 10) - (heading - halfFov)) < 1e-9);
  assert.ok(Math.abs(Math.atan2(right.y - 20, right.x - 10) - (heading + halfFov)) < 1e-9);
  assert.ok(Math.abs(Math.hypot(left.x - 10, left.y - 20) - 50) < 1e-9);
});
