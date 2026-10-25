import test from "node:test";
import assert from "node:assert/strict";

import { GeometryBatch } from "../../src/render/batch.js";
import { Camera } from "../../src/render/camera.js";
import { nightTheme } from "../../src/render/theme.js";
import { defaultViewSettings } from "../../src/render/view_settings.js";
import { buildActors } from "../../src/render/world_view.js";
import { makeColony } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { makeWorld } from "../../src/sim/world.js";

test("world view: an empty world still draws its nests", () => {
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 300;
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 200, y: 150 }));
  const camera = new Camera();
  camera.setViewport({ x: 800, y: 600 });
  camera.fit(world.size);
  const batch = new GeometryBatch();
  buildActors(batch, world, camera, 0, defaultViewSettings(), nightTheme());
  assert.ok(batch.indexCount() >= 18);
  assert.ok(batch.vertexCount() > 0);
  for (const value of batch.vertexData()) assert.ok(Number.isFinite(value));
});
