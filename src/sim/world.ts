import type { Vec2 } from "../core/vec2.js";
import { stopwatch } from "../core/stopwatch.js";
import { Ants } from "./ants.js";
import { resolveObstacles } from "./collide.js";
import type { Colony } from "./colony.js";
import type { ChunkEvents } from "./events.js";
import { makeFoodSources, type FoodSources } from "./food.js";
import { makeMarkerGrid, decayMarkers, type MarkerGrid } from "./marker_grid.js";
import { makeObstacleGrid, rebuildBorder, type ObstacleGrid } from "./obstacles.js";
import { emptyPhaseTimings, Phase, type PhaseTimings } from "./phases.js";
import { markerDecayFactor, type SimParams } from "./params.js";
import { ObstacleKind, rectCellBounds, type SetupRect } from "./setup.js";
import { SpatialHash } from "./spatial_hash.js";
import {
  applyEvents,
  clampToWorld,
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
  obstacles: ObstacleGrid;
  colonies: Colony[];
  food: FoodSources;
  spatialHash: SpatialHash;
  chunkEvents: ChunkEvents[];
  nextUid: number;
}

// Opens the breach segments in a running world: the cells become empty ground
// and the collision border plus the near-solid map are rebuilt around them.
// Called between ticks, so the next think phase sees the new geometry.
export function applyBreach(world: World, rects: readonly SetupRect[]): void {
  const grid = world.obstacles;
  let changed = false;
  for (const rect of rects) {
    const { minCol, maxCol, minRow, maxRow } = rectCellBounds(grid, rect);
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const index = row * grid.width + col;
        if (grid.kind[index] === ObstacleKind.None) continue;
        grid.kind[index] = ObstacleKind.None;
        changed = true;
      }
    }
  }
  if (changed) rebuildBorder(grid);
}

export function makeWorld(params: SimParams, seed: number, size?: Vec2): World {
  const worldSize = size === undefined ? { x: params.worldW, y: params.worldH } : { x: size.x, y: size.y };
  const worldParams = { ...params, worldW: worldSize.x, worldH: worldSize.y };
  return {
    params: worldParams,
    seed,
    tick: 0,
    size: worldSize,
    timings: emptyPhaseTimings(),
    ants: new Ants(),
    markers: makeMarkerGrid(worldSize, worldParams.markerCell),
    obstacles: makeObstacleGrid(worldSize, worldParams.obstacleCell),
    colonies: [],
    food: makeFoodSources(),
    spatialHash: new SpatialHash(),
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

  timed(Phase.SpatialHash, () =>
    world.spatialHash.build(
      world.ants.posX,
      world.ants.posY,
      world.ants.size(),
      world.size,
      world.params.hashCell,
    ),
  );
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
  timed(Phase.Collisions, () => {
    clampToWorld(world);
    resolveObstacles(world);
    clampToWorld(world);
  });
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
