import test from "node:test";
import assert from "node:assert/strict";

import { formatReachReport, type ReachReport } from "../../src/app/reach.js";

function splitLines(text: string): string[] {
  return text.split("\n").slice(0, -1);
}

test("reach: report format is stable", () => {
  const report: ReachReport = {
    seed: 7,
    ants: 200,
    seconds: 180,
    rows: [
      {
        label: "500",
        firstSeconds: 12.4,
        minute1: 41,
        minute2: 63,
        minute3: 72,
        alive: 198,
        bMinute1: null,
        bMinute2: null,
        bMinute3: null,
      },
      {
        label: "1000",
        firstSeconds: null,
        minute1: 0,
        minute2: 0,
        minute3: 0,
        alive: 200,
        bMinute1: null,
        bMinute2: null,
        bMinute3: null,
      },
    ],
    contest: {
      label: "contest",
      firstSeconds: 18.2,
      minute1: 22,
      minute2: 35,
      minute3: 47,
      alive: 190,
      bMinute1: 3,
      bMinute2: 8,
      bMinute3: 12,
    },
  };
  const lines = splitLines(formatReachReport(report));
  assert.equal(lines.length, 5);
  assert.equal(lines[0], "reach seed=7 ants=200 seconds=180");
  assert.equal(lines[1], "D          first_s      m1      m2      m3   alive    b_m1    b_m2    b_m3");
  assert.equal(lines[2], "500           12.4      41      63      72     198       -       -       -");
  assert.equal(lines[3], "1000             -       0       0       0     200       -       -       -");
  assert.equal(lines[4], "contest       18.2      22      35      47     190       3       8      12");
});
