import test from "node:test";
import assert from "node:assert/strict";

import { formatBenchReport, type BenchReport } from "../../src/app/bench.js";

function splitLines(text: string): string[] {
  return text.split("\n").slice(0, -1);
}

test("bench: report format is stable", () => {
  const r: BenchReport = {
    preset: "meadow", ticks: 600, threads: 8, ants: 0,
    phases: Array.from({ length: 7 }, () => ({ avg: 0, p95: 0 })),
    total: { avg: 0.125, p95: 0.25 },
    ticksPerSec: 8000, antUpdatesPerSec: 0,
  };
  const lines = splitLines(formatBenchReport(r));
  assert.equal(lines.length, 12);
  assert.equal(lines[0], "bench preset=meadow ticks=600 threads=8 ants=0");
  assert.equal(lines[1], "phase" + " ".repeat(15) + "avg_ms" + " ".repeat(4) + "p95_ms");
  assert.equal(lines[2], "spatial_hash" + " ".repeat(9) + "0.000" + " ".repeat(5) + "0.000");
  assert.equal(lines[8], "stats" + " ".repeat(16) + "0.000" + " ".repeat(5) + "0.000");
  assert.equal(lines[9], "total" + " ".repeat(16) + "0.125" + " ".repeat(5) + "0.250");
  assert.equal(lines[10], "ticks_per_sec" + " ".repeat(7) + "8000.0");
  assert.equal(lines[11], "ant_updates_per_sec" + " ".repeat(9) + "0");
});
