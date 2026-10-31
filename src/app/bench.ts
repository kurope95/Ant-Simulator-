import { stopwatch } from "../core/stopwatch.js";
import { summarize, type SampleSummary } from "../core/stats.js";
import { kPhaseCount, kSubPhaseCount, phaseName, subPhaseName } from "../sim/phases.js";
import { defaultParams } from "../sim/params.js";
import { loadPreset } from "../sim/presets.js";
import { worldFromSetup } from "../sim/setup_apply.js";
import { stepWorld, type World } from "../sim/world.js";
import { crowdWorld } from "./bench_scenarios.js";
import { effectiveTicks, type AppOptions } from "./options.js";

export interface BenchReport {
  preset: string;
  ticks: number;
  threads: number;
  ants: number;
  phases: SampleSummary[];
  // Pieces of Think and Collisions (SubPhase order); printed after the totals when present.
  subPhases?: SampleSummary[];
  total: SampleSummary;
  ticksPerSec: number;
  antUpdatesPerSec: number;
}

function row(name: string, avg: string, p95: string): string {
  return name.padEnd(16) + avg.padStart(10) + p95.padStart(10) + "\n";
}

export function formatBenchReport(report: BenchReport): string {
  let text = `bench preset=${report.preset} ticks=${report.ticks} threads=${report.threads} ants=${report.ants}\n`;
  text += "phase".padEnd(16) + "avg_ms".padStart(10) + "p95_ms".padStart(10) + "\n";
  for (let phase = 0; phase < kPhaseCount; phase++) {
    const sample = report.phases[phase];
    text += row(phaseName(phase), sample.avg.toFixed(3), sample.p95.toFixed(3));
  }
  text += row("total", report.total.avg.toFixed(3), report.total.p95.toFixed(3));
  text += "ticks_per_sec".padEnd(16) + report.ticksPerSec.toFixed(1).padStart(10) + "\n";
  text += "ant_updates_per_sec".padEnd(16) + report.antUpdatesPerSec.toFixed(0).padStart(10) + "\n";
  if (report.subPhases !== undefined) {
    text += "sub_phase".padEnd(16) + "avg_ms".padStart(10) + "p95_ms".padStart(10) + "\n";
    for (let sub = 0; sub < kSubPhaseCount; sub++) {
      const sample = report.subPhases[sub];
      text += row(subPhaseName(sub), sample.avg.toFixed(3), sample.p95.toFixed(3));
    }
  }
  return text;
}

export function runBench(options: AppOptions): number {
  let world: World;
  let label = options.preset;
  if (options.scenario === "crowd") {
    label = "crowd";
    world = crowdWorld(options.seed, options.ants);
  } else {
    const setup = loadPreset(options.preset, options.seed);
    if (setup === null) {
      process.stderr.write(`unknown preset: ${options.preset}\n`);
      return 1;
    }
    world = worldFromSetup(setup, defaultParams());
  }
  for (let i = 0; i < 60; i++) stepWorld(world);

  const ticks = effectiveTicks(options);
  const phaseSamples: number[][] = Array.from({ length: kPhaseCount }, () => []);
  const subSamples: number[][] = Array.from({ length: kSubPhaseCount }, () => []);
  const totalSamples: number[] = [];
  let antTicks = 0;
  const watch = stopwatch();
  for (let i = 0; i < ticks; i++) {
    stepWorld(world);
    antTicks += world.ants.size();
    for (let phase = 0; phase < kPhaseCount; phase++) phaseSamples[phase].push(world.timings.ms[phase]);
    for (let sub = 0; sub < kSubPhaseCount; sub++) subSamples[sub].push(world.timings.sub[sub]);
    totalSamples.push(world.timings.totalMs);
  }
  const seconds = watch.elapsedSeconds();

  const report: BenchReport = {
    preset: label,
    ticks,
    // M0 is single-threaded; the worker pool arrives in M4.
    threads: 1,
    ants: world.ants.size(),
    phases: phaseSamples.map(summarize),
    subPhases: subSamples.map(summarize),
    total: summarize(totalSamples),
    ticksPerSec: seconds > 0 ? ticks / seconds : 0,
    antUpdatesPerSec: seconds > 0 ? antTicks / seconds : 0,
  };
  process.stdout.write(formatBenchReport(report));
  return 0;
}
