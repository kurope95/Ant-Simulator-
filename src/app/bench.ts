import { stopwatch } from "../core/stopwatch.js";
import { summarize, type SampleSummary } from "../core/stats.js";
import { kPhaseCount, phaseName } from "../sim/phases.js";
import { defaultParams } from "../sim/params.js";
import { makeWorld, stepWorld } from "../sim/world.js";
import { effectiveTicks, type AppOptions } from "./options.js";

export interface BenchReport {
  scenario: string;
  ticks: number;
  threads: number;
  ants: number;
  phases: SampleSummary[];
  total: SampleSummary;
  ticksPerSec: number;
  antUpdatesPerSec: number;
}

function row(name: string, avg: string, p95: string): string {
  return name.padEnd(16) + avg.padStart(10) + p95.padStart(10) + "\n";
}

export function formatBenchReport(report: BenchReport): string {
  let text = `bench scenario=${report.scenario} ticks=${report.ticks} threads=${report.threads} ants=${report.ants}\n`;
  text += "phase".padEnd(16) + "avg_ms".padStart(10) + "p95_ms".padStart(10) + "\n";
  for (let phase = 0; phase < kPhaseCount; phase++) {
    const sample = report.phases[phase];
    text += row(phaseName(phase), sample.avg.toFixed(3), sample.p95.toFixed(3));
  }
  text += row("total", report.total.avg.toFixed(3), report.total.p95.toFixed(3));
  text += "ticks_per_sec".padEnd(16) + report.ticksPerSec.toFixed(1).padStart(10) + "\n";
  text += "ant_updates_per_sec".padEnd(16) + report.antUpdatesPerSec.toFixed(0).padStart(10) + "\n";
  return text;
}

export function runBench(options: AppOptions): number {
  const world = makeWorld(defaultParams(), options.seed);
  for (let i = 0; i < 60; i++) stepWorld(world);

  const ticks = effectiveTicks(options);
  const phaseSamples: number[][] = Array.from({ length: kPhaseCount }, () => []);
  const totalSamples: number[] = [];
  const watch = stopwatch();
  for (let i = 0; i < ticks; i++) {
    stepWorld(world);
    for (let phase = 0; phase < kPhaseCount; phase++) phaseSamples[phase].push(world.timings.ms[phase]);
    totalSamples.push(world.timings.totalMs);
  }
  const seconds = watch.elapsedSeconds();

  const report: BenchReport = {
    scenario: options.scenario,
    ticks,
    // M0 is single-threaded; the worker pool arrives in M4.
    threads: 1,
    ants: 0,
    phases: phaseSamples.map(summarize),
    total: summarize(totalSamples),
    ticksPerSec: seconds > 0 ? ticks / seconds : 0,
    antUpdatesPerSec: 0,
  };
  process.stdout.write(formatBenchReport(report));
  return 0;
}
