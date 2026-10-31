import test from "node:test";
import assert from "node:assert/strict";

import { formatReachReport, type ReachReport } from "../../src/app/reach.js";
import { defaultParams } from "../../src/sim/params.js";
import { addColony, addFood, FoodKind, makeSetup } from "../../src/sim/setup.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import { stepWorld } from "../../src/sim/world.js";

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
    maze: {
      firstSeconds: 123.4,
      before: 12,
      after: 48,
      ratio: 4,
      alive: 180,
    },
    crowd: {
      ants: 2000,
      seconds: 60,
      lanes: 0.812,
      overlap: 0.004,
    },
  };
  const lines = splitLines(formatReachReport(report));
  assert.equal(lines.length, 8);
  assert.equal(lines[0], "reach seed=7 ants=200 seconds=180");
  assert.equal(lines[1], "D          first_s      m1      m2      m3   alive    b_m1    b_m2    b_m3");
  assert.equal(lines[2], "500           12.4      41      63      72     198       -       -       -");
  assert.equal(lines[3], "1000             -       0       0       0     200       -       -       -");
  assert.equal(lines[4], "contest       18.2      22      35      47     190       3       8      12");
  assert.equal(lines[5], "maze breach at 10:00, windows 7:00-10:00 and 12:00-15:00");
  assert.equal(lines[6], "first_s=123.4 m7-9=12 m12-14=48 ratio=4.0 alive=180 target>=3 pass");
  assert.equal(
    lines[7],
    "crowd ants=2000 seconds=60 lanes=0.812 target>=0.70 pass overlap=0.0040 target<=0.01 pass",
  );
});

test("reach: 1000 u delivers", { timeout: 120_000 }, () => {
  // Measured with the tuned defaults (emissionDecay 0.11, markerHalfLife 15,
  // energyBurn 0.5, exhaustedAt 60): 113 deliveries in 120 s from 150 ants.
  const setup = makeSetup({ x: 2600, y: 1000 }, 7, "reach-test");
  addColony(setup, { x: 200, y: 500 }, 0, 150);
  addFood(setup, { x: 1200, y: 500 }, 20000, FoodKind.Seeds);
  // Foraging reach only: the pile cannot run low in two minutes, and regrowth
  // would only nudge its size (this two-minute count swings with tiny changes).
  const params = defaultParams();
  params.foodGrowthRate = 0;
  params.foodSproutRate = 0;
  params.foodSpreadRate = 0;
  const world = worldFromSetup(setup, params);
  for (let tick = 1; tick <= 7200; tick++) stepWorld(world);
  const delivered = world.colonies[0].deliveredTotal;
  assert.ok(delivered >= 81, `delivered ${delivered}, expected at least 81`);
});
