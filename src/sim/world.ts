import type { Vec2 } from "../core/vec2.js";
import { stopwatch } from "../core/stopwatch.js";
import { Ants } from "./ants.js";
import { computeAvoidance, makeAvoidScratch, type AvoidScratch } from "./avoidance.js";
import {
  makeCollisionScratch,
  resolveAntOverlaps,
  resolveObstacles,
  type CollisionScratch,
} from "./collide.js";
import { nestRadius, type Colony } from "./colony.js";
import { computeLookAround, makeLookAround, type LookAround } from "./conflict.js";
import { Corpses } from "./corpses.js";
import type { ChunkEvents } from "./events.js";
import { makeFoodSources, type FoodSources } from "./food.js";
import { makeMarkerGrid, decayBattle, decayMarkers, type MarkerGrid } from "./marker_grid.js";
import { makeObstacleGrid, rebuildBorder, type ObstacleGrid } from "./obstacles.js";
import { emptyPhaseTimings, Phase, SubPhase, type PhaseTimings } from "./phases.js";
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
  collisionScratch: CollisionScratch;
  avoidScratch: AvoidScratch;
  chunkEvents: ChunkEvents[];
  nextUid: number;
  // Colony conflict: bodies lying on the map, and each ant's start-of-tick look around.
  corpses: Corpses;
  look: LookAround;
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
    collisionScratch: makeCollisionScratch(),
    avoidScratch: makeAvoidScratch(),
    chunkEvents: [],
    nextUid: 0,
    corpses: new Corpses(),
    look: makeLookAround(),
  };
}

// Spec §5.2 step 4. With antCollisions off this is the pre-M4 pass exactly: one
// clamp, one wall resolve, one clamp. With it on, the hash is rebuilt from the
// positions Think just wrote, and each PBD iteration resolves ants against
// each other and then against walls, so walls always win.
// A rival cannot enter another colony's nest: it is pushed back to the nest
// edge like a wall (conflict design §5). Own ants pass as before.
export function keepOutOfRivalNests(world: World): void {
  if (!world.params.conflict || world.colonies.length < 2) return;
  const ants = world.ants;
  for (const colony of world.colonies) {
    const r = nestRadius(colony, world.params) + world.params.antRadius;
    const r2 = r * r;
    for (let i = 0; i < ants.size(); i++) {
      if (ants.colony[i] === colony.id) continue;
      const dx = ants.posX[i] - colony.nest.x;
      const dy = ants.posY[i] - colony.nest.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      const d = Math.sqrt(d2);
      const nx = d > 1e-6 ? dx / d : 1;
      const ny = d > 1e-6 ? dy / d : 0;
      ants.posX[i] = colony.nest.x + nx * r;
      ants.posY[i] = colony.nest.y + ny * r;
    }
  }
}

function collisionPhase(world: World): void {
  const ants = world.ants;
  const params = world.params;
  const sub = world.timings.sub;
  let mark = performance.now();
  // Adds the time since the previous lap to one sub-phase.
  const lap = (which: SubPhase): void => {
    const now = performance.now();
    sub[which] += now - mark;
    mark = now;
  };
  if (!params.antCollisions) {
    keepOutOfRivalNests(world);
    clampToWorld(world);
    resolveObstacles(world);
    clampToWorld(world);
    lap(SubPhase.CollideWalls);
    return;
  }
  world.spatialHash.build(ants.posX, ants.posY, ants.size(), world.size, params.hashCell);
  lap(SubPhase.CollideHash);
  for (let it = 0; it < params.pbdIterations; it++) {
    resolveAntOverlaps(world, world.collisionScratch);
    keepOutOfRivalNests(world);
    lap(SubPhase.CollideAnts);
    clampToWorld(world);
    resolveObstacles(world);
    clampToWorld(world);
    lap(SubPhase.CollideWalls);
  }
  // Velocity is the movement that actually happened, pushes included.
  const simHz = params.simHz;
  for (let i = 0; i < ants.size(); i++) {
    ants.velX[i] = (ants.posX[i] - ants.prevX[i]) * simHz;
    ants.velY[i] = (ants.posY[i] - ants.prevY[i]) * simHz;
  }
  lap(SubPhase.CollideVelocity);
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
    // The avoidance pre-pass runs first, on start-of-tick state, so the think
    // loop below sees the same avoidance whatever order its chunks run in.
    const avoidStart = performance.now();
    if (world.params.antCollisions) computeAvoidance(world, world.avoidScratch);
    // Fight decisions read this pass, not live neighbours, so chunk order cannot matter.
    computeLookAround(world, world.look);
    const thinkStart = performance.now();
    world.timings.sub[SubPhase.Avoidance] = thinkStart - avoidStart;
    resetChunkEvents(world);
    const chunkSize = world.params.chunkSize;
    const lists = world.chunkEvents;
    for (let chunk = 0; chunk < lists.length; chunk++) {
      const begin = chunk * chunkSize;
      const end = Math.min(begin + chunkSize, world.ants.size());
      if (begin >= end) break;
      thinkChunk(world, begin, end, lists[chunk]);
    }
    world.timings.sub[SubPhase.ThinkAnts] = performance.now() - thinkStart;
  });
  timed(Phase.Events, () => applyEvents(world, world.chunkEvents));
  timed(Phase.Collisions, () => collisionPhase(world));
  timed(Phase.Removals, () => removeDead(world));
  timed(Phase.Decay, () => {
    decayMarkers(
      world.markers,
      markerDecayFactor(world.params, 1 / world.params.simHz),
      world.params.markerEps,
      world.params.flipMargin,
    );
    if (world.params.conflict) {
      decayBattle(
        world.markers,
        Math.pow(2, -1 / (world.params.simHz * world.params.battleHalfLife)),
        world.params.battleDetectMin, // smell too faint to follow is gone: about 35 s after the last bite
      );
    }
  });
  timed(Phase.Stats, () => updateStats(world));

  world.timings.totalMs = total.elapsedMs();
}
