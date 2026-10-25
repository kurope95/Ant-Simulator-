import test from "node:test";
import assert from "node:assert/strict";

import { summarize } from "../../src/core/stats.js";

test("stats: mean and nearest-rank p95", () => {
  const samples = Array.from({ length: 100 }, (_, i) => i + 1);
  const s = summarize(samples);
  assert.equal(s.avg, 50.5);
  assert.equal(s.p95, 95);
  assert.deepEqual(summarize([]), { avg: 0, p95: 0 });
  assert.equal(summarize([7]).p95, 7);
});
