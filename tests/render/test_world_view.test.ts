import test from "node:test";
import assert from "node:assert/strict";

import { GeometryBatch } from "../../src/render/batch.js";
import { Camera } from "../../src/render/camera.js";
import { meadowTheme } from "../../src/render/theme.js";
import { defaultViewSettings } from "../../src/render/view_settings.js";
import { buildStaticActors } from "../../src/render/world_view.js";
import { makeColony } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { makeWorld } from "../../src/sim/world.js";

test("world view: static actors draw nests and never the ants", () => {
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 300;
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 200, y: 150 }));
  const camera = new Camera();
  camera.setViewport({ x: 800, y: 600 });
  camera.fit(world.size);
  const batch = new GeometryBatch();
  buildStaticActors(batch, world, camera, 0, defaultViewSettings(), meadowTheme());
  const nestOnly = batch.indexCount();
  assert.ok(nestOnly >= 18);

  world.ants.spawn({ pos: { x: 200, y: 150 } }, 0, params.antSpeed, params);
  batch.clear();
  buildStaticActors(batch, world, camera, 0, defaultViewSettings(), meadowTheme());
  assert.equal(batch.indexCount(), nestOnly);
  for (const value of batch.vertexData()) assert.ok(Number.isFinite(value));
});
