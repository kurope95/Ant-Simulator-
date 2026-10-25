import test from "node:test";
import assert from "node:assert/strict";

import { defaultParams } from "../../src/sim/params.js";
import { makeWorld, stepWorld } from "../../src/sim/world.js";

test("world: makeWorld copies params and seed; stepWorld advances the tick", () => {
  const p = defaultParams();
  p.worldW = 800;
  p.worldH = 600;
  const w = makeWorld(p, 42);
  assert.equal(w.seed, 42);
  assert.equal(w.tick, 0);
  assert.deepEqual(w.size, { x: 800, y: 600 });
  stepWorld(w);
  stepWorld(w);
  stepWorld(w);
  assert.equal(w.tick, 3);
  assert.ok(w.timings.totalMs >= 0);
});
