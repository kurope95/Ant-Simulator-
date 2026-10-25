import type { Vec2 } from "../core/vec2.js";
import { stopwatch } from "../core/stopwatch.js";
import { Ants } from "./ants.js";
import type { Colony } from "./colony.js";
import type { ChunkEvents } from "./events.js";
import { makeFoodSources, type FoodSources } from "./food.js";
import { makeMarkerGrid, decayMarkers, type MarkerGrid } from "./marker_grid.js";
import { emptyPhaseTimings, Phase, type PhaseTimings } from "./phases.js";
import { markerDecayFactor, type SimParams } from "./params.js";
import {
  applyEvents,
  removeDead,
  resetChunkEvents,
  thinkChunk,
  updateStats,
} from "./tick.js";

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
  const total = stopwatch();
  world.tick += 1;

  const timed = (phase: Phase, run: () => void): void => {
    const watch = stopwatch();
    run();
    world.timings.ms[phase] = watch.elapsedMs();
  };

  timed(Phase.Think, () => {
    resetChunkEvents(world);
    const chunkSize = world.params.chunkSize;
    const lists = world.chunkEvents;
    for (let chunk = 0; chunk < lists.length; chunk++) {
      const begin = chunk * chunkSize;
      const end = Math.min(begin + chunkSize, world.ants.size());
      if (begin >= end) break;
      thinkChunk(world, begin, end, lists[chunk]);
    }
  });
  timed(Phase.Events, () => applyEvents(world, world.chunkEvents));
  timed(Phase.Removals, () => removeDead(world));
  timed(Phase.Decay, () =>
    decayMarkers(
      world.markers,
      markerDecayFactor(world.params, 1 / world.params.simHz),
      world.params.markerEps,
    ),
  );
  timed(Phase.Stats, () => updateStats(world));

  world.timings.totalMs = total.elapsedMs();
}
