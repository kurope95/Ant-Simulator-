import test from "node:test";
import assert from "node:assert/strict";

import { makeAttractWorld, seedFromNow } from "../../src/app/attract.js";
import { defaultParams } from "../../src/sim/params.js";
import { worldChecksum } from "../../src/sim/checksum.js";

test("attract: a deterministic 900-tick meadow with live ants and trails", () => {
  const a = makeAttractWorld(defaultParams());
  const b = makeAttractWorld(defaultParams());
  assert.equal(a.tick, 900);
  assert.ok(a.ants.size() > 100, `ants=${a.ants.size()}`);
  let homeCells = 0;
  for (let i = 0; i < a.markers.owner.length; i++) if (a.markers.toHome[i] > 0.02) homeCells++;
  assert.ok(homeCells > 20, `home cells=${homeCells}`);
  assert.equal(worldChecksum(a), worldChecksum(b));
});

test("attract: seedFromNow is deterministic and stays in uint32", () => {
  assert.equal(seedFromNow(1_700_000_000_000), seedFromNow(1_700_000_000_000));
  assert.notEqual(seedFromNow(1_700_000_000_000), seedFromNow(1_700_000_000_001));
  for (const now of [0, 1, 2 ** 31, 2 ** 42]) {
    const seed = seedFromNow(now);
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
  }
});
