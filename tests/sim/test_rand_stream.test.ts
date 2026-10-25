import test from "node:test";
import assert from "node:assert/strict";

import { RandStream } from "../../src/sim/types.js";

test("rand streams: values are pinned and unique", () => {
  const values = [
    RandStream.WanderOffset,
    RandStream.WanderInterval,
    RandStream.StuckTurn,
    RandStream.SpawnHeading,
    RandStream.SpawnRole,
    RandStream.SpeedJitter,
    RandStream.ContactTurn,
  ];
  assert.deepEqual(values, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(new Set(values).size, 7);
});
