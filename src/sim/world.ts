import type { Vec2 } from "../core/vec2.js";
import { stopwatch } from "../core/stopwatch.js";
import { emptyPhaseTimings, type PhaseTimings } from "./phases.js";
import type { SimParams } from "./params.js";

export interface World {
  params: SimParams;
  seed: number;
  tick: number;
  size: Vec2;
  timings: PhaseTimings;
}

export function makeWorld(params: SimParams, seed: number): World {
  return {
    params: { ...params },
    seed,
    tick: 0,
    size: { x: params.worldW, y: params.worldH },
    timings: emptyPhaseTimings(),
  };
}

export function stepWorld(world: World): void {
  world.timings = emptyPhaseTimings();
  const watch = stopwatch();
  world.tick += 1;
  world.timings.totalMs = watch.elapsedMs();
}
