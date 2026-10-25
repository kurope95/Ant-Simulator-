import type { Vec2 } from "../core/vec2.js";
import { stopwatch } from "../core/stopwatch.js";
import { Ants } from "./ants.js";
import type { Colony } from "./colony.js";
import type { ChunkEvents } from "./events.js";
import { makeFoodSources, type FoodSources } from "./food.js";
import { makeMarkerGrid, type MarkerGrid } from "./marker_grid.js";
import { emptyPhaseTimings, type PhaseTimings } from "./phases.js";
import type { SimParams } from "./params.js";

export interface World {
  params: SimParams;
  seed: number;
  tick: number;
  size: Vec2;
  timings: PhaseTimings;
  ants: Ants;
  markers: MarkerGrid;
  colonies: Colony[];
  food: FoodSources;
  chunkEvents: ChunkEvents[];
  nextUid: number;
}

export function makeWorld(params: SimParams, seed: number): World {
  const size = { x: params.worldW, y: params.worldH };
  return {
    params: { ...params },
    seed,
    tick: 0,
    size,
    timings: emptyPhaseTimings(),
    ants: new Ants(),
    markers: makeMarkerGrid(size, params.markerCell),
    colonies: [],
    food: makeFoodSources(),
    chunkEvents: [],
    nextUid: 0,
  };
}

export function stepWorld(world: World): void {
  world.timings = emptyPhaseTimings();
  const watch = stopwatch();
  world.tick += 1;
  world.timings.totalMs = watch.elapsedMs();
}
