import { defaultParams } from "../sim/params.js";
import { addColony, addFood, FoodKind, makeSetup, type WorldSetup } from "../sim/setup.js";
import { worldFromSetup } from "../sim/setup_apply.js";
import { stepWorld, type World } from "../sim/world.js";

// Foraging-range harness: one fixed colony forages from a fixed pile at an
// increasing distance, so a tuning change can be compared against the same
// table. It is a measurement tool, not a preset: the setup is built here.

export const kReachDistances = [500, 1000, 1500, 2000] as const;

const kWorldSize = { x: 2600, y: 1000 };
const kNest = { x: 200, y: 500 };
const kSeed = 7;
const kAnts = 200;
const kSeconds = 180;
const kFoodAmount = 20000;
// Contest: both colonies see the same pile from opposite sides.
const kContestFoodX = 950;
const kContestAX = 450;
const kContestBX = 2450;

export interface ReachRow {
  label: string;
  firstSeconds: number | null;
  minute1: number;
  minute2: number;
  minute3: number;
  alive: number;
  bMinute1: number | null;
  bMinute2: number | null;
  bMinute3: number | null;
}

export interface ReachReport {
  seed: number;
  ants: number;
  seconds: number;
  rows: ReachRow[];
  contest: ReachRow;
}

interface MeasuredColony {
  firstSeconds: number | null;
  minutes: [number, number, number];
  alive: number;
}

function cell(value: number | null, digits: number): string {
  return (value === null ? "-" : value.toFixed(digits)).padStart(8);
}

function formatRow(row: ReachRow): string {
  return (
    row.label.padEnd(10) +
    cell(row.firstSeconds, 1) +
    cell(row.minute1, 0) +
    cell(row.minute2, 0) +
    cell(row.minute3, 0) +
    cell(row.alive, 0) +
    cell(row.bMinute1, 0) +
    cell(row.bMinute2, 0) +
    cell(row.bMinute3, 0)
  );
}

export function formatReachReport(report: ReachReport): string {
  let text = `reach seed=${report.seed} ants=${report.ants} seconds=${report.seconds}\n`;
  const headings = ["first_s", "m1", "m2", "m3", "alive", "b_m1", "b_m2", "b_m3"];
  text += "D".padEnd(10) + headings.map((heading) => heading.padStart(8)).join("") + "\n";
  for (const row of report.rows) text += `${formatRow(row)}\n`;
  text += `${formatRow(report.contest)}\n`;
  return text;
}

function singleSetup(distance: number): WorldSetup {
  const setup = makeSetup(kWorldSize, kSeed, "reach");
  addColony(setup, kNest, 0, kAnts);
  addFood(setup, { x: kNest.x + distance, y: kNest.y }, kFoodAmount, FoodKind.Seeds);
  return setup;
}

function contestSetup(): WorldSetup {
  const setup = makeSetup(kWorldSize, kSeed, "reach");
  addColony(setup, { x: kContestAX, y: kNest.y }, 0, kAnts);
  addColony(setup, { x: kContestBX, y: kNest.y }, 1, kAnts);
  addFood(setup, { x: kContestFoodX, y: kNest.y }, kFoodAmount, FoodKind.Seeds);
  return setup;
}

// Steps the whole run and reads deliveries at the minute boundaries, so each
// minute column is that minute's deliveries rather than a cumulative total.
function measure(world: World): MeasuredColony[] {
  const count = world.colonies.length;
  const firstTicks: (number | null)[] = Array.from({ length: count }, () => null);
  const totals: [number, number, number][] = Array.from({ length: count }, () => [0, 0, 0]);
  const perMinute = 60 * world.params.simHz;
  const totalTicks = kSeconds * world.params.simHz;

  for (let tick = 1; tick <= totalTicks; tick++) {
    stepWorld(world);
    for (let c = 0; c < count; c++) {
      const delivered = world.colonies[c].deliveredTotal;
      if (firstTicks[c] === null && delivered > 0) firstTicks[c] = tick;
      if (tick === perMinute) {
        totals[c][0] = delivered;
      } else if (tick === 2 * perMinute) {
        totals[c][1] = delivered - totals[c][0];
      } else if (tick === 3 * perMinute) {
        totals[c][2] = delivered - totals[c][0] - totals[c][1];
      }
    }
  }

  return world.colonies.map((colony, c) => ({
    firstSeconds: firstTicks[c] === null ? null : (firstTicks[c] as number) / world.params.simHz,
    minutes: totals[c],
    alive: colony.population,
  }));
}

function rowFrom(label: string, a: MeasuredColony, b: MeasuredColony | null): ReachRow {
  return {
    label,
    firstSeconds: a.firstSeconds,
    minute1: a.minutes[0],
    minute2: a.minutes[1],
    minute3: a.minutes[2],
    alive: a.alive,
    bMinute1: b === null ? null : b.minutes[0],
    bMinute2: b === null ? null : b.minutes[1],
    bMinute3: b === null ? null : b.minutes[2],
  };
}

export function runReach(): number {
  const rows = kReachDistances.map((distance) => {
    const measured = measure(worldFromSetup(singleSetup(distance), defaultParams()));
    return rowFrom(String(distance), measured[0], null);
  });

  const contest = measure(worldFromSetup(contestSetup(), defaultParams()));
  const report: ReachReport = {
    seed: kSeed,
    ants: kAnts,
    seconds: kSeconds,
    rows,
    contest: rowFrom("contest", contest[0], contest[1] ?? null),
  };
  process.stdout.write(formatReachReport(report));
  return 0;
}
