import { angleDiff } from "../core/math.js";
import { angleOf, fromAngle } from "../core/vec2.js";
import { MarkerChannel, type MarkerGrid } from "./marker_grid.js";
import { isSolidAt, freeDistance, freeDistanceDir, lineOfSight } from "./obstacles.js";
import type { SimParams } from "./params.js";
import { AntState } from "./types.js";
import type { World } from "./world.js";

export interface SensorSample {
  angleOffset: number;
  distance: number;
}

// Patterns are fractions of the live sensor params, so the sliders govern the
// marker sense itself; at the defaults they reproduce the original pinned grids.
const kFollowerAngleFractions = [-1, -0.5, 0, 0.5, 1];
const kFollowerDistanceFractions = [0.2, 0.4, 0.6, 0.8, 1];
const kExplorerAngleFractions = [-1, 0, 1];
const kExplorerDistanceFractions = [0.5, 1];

interface PatternKey {
  radius: number;
  halfFovDeg: number;
}

let cachedKey: PatternKey | null = null;
let cachedFollower: readonly SensorSample[] = [];
let cachedExplorer: readonly SensorSample[] = [];

function buildPattern(
  params: SimParams,
  distanceFractions: readonly number[],
  angleFractions: readonly number[],
): readonly SensorSample[] {
  const halfFov = (params.sensorHalfFovDeg * Math.PI) / 180;
  return Object.freeze(
    distanceFractions.flatMap((fraction) =>
      angleFractions.map((angleFraction) =>
        Object.freeze({
          angleOffset: halfFov * angleFraction,
          distance: params.sensorRadius * fraction,
        }),
      ),
    ),
  );
}

function patternsFor(params: SimParams): void {
  if (
    cachedKey !== null &&
    cachedKey.radius === params.sensorRadius &&
    cachedKey.halfFovDeg === params.sensorHalfFovDeg
  ) {
    return;
  }
  cachedKey = { radius: params.sensorRadius, halfFovDeg: params.sensorHalfFovDeg };
  cachedFollower = buildPattern(params, kFollowerDistanceFractions, kFollowerAngleFractions);
  cachedExplorer = buildPattern(params, kExplorerDistanceFractions, kExplorerAngleFractions);
}

export function followerPattern(params: SimParams): readonly SensorSample[] {
  patternsFor(params);
  return cachedFollower;
}

export function explorerPattern(params: SimParams): readonly SensorSample[] {
  patternsFor(params);
  return cachedExplorer;
}

export interface SenseResult {
  found: boolean;
  targetHeading: number;
  bestSignal: number;
  bestFoodSignal: number;
}

export function senseMarkers(
  world: World,
  ant: number,
  channel: MarkerChannel,
  pattern: readonly SensorSample[],
): SenseResult {
  const ants = world.ants;
  const posX = ants.posX[ant];
  const posY = ants.posY[ant];
  const heading = ants.heading[ant];
  const grid: MarkerGrid = world.markers;
  const colony = ants.colony[ant];
  // The grid holds one layer per colony, so this is homeAt/foodAt inlined into
  // the per-sample loop: 25 samples per ant per tick makes the calls show.
  if (colony < 0 || colony >= grid.colonies) {
    return { found: false, targetHeading: 0, bestSignal: 0, bestFoodSignal: 0 };
  }
  const layer = colony * grid.width * grid.height;
  let bestSignal = 0;
  let bestFoodSignal = 0;
  let bestBias = Infinity;
  let bestX = 0;
  let bestY = 0;

  for (const sample of pattern) {
    const direction = fromAngle(heading + sample.angleOffset);
    const x = posX + direction.x * sample.distance;
    const y = posY + direction.y * sample.distance;
    if (isSolidAt(world.obstacles, { x, y })) continue;
    // Cheap line of sight: a wall at the halfway point blocks the sample too.
    if (isSolidAt(world.obstacles, { x: (posX + x) * 0.5, y: (posY + y) * 0.5 })) continue;
    const cell = grid.cellIndex({ x, y });
    if (cell < 0) continue;
    const index = layer + cell;
    const home = grid.toHome[index];
    const food = grid.toFood[index];
    if (food > bestFoodSignal) bestFoodSignal = food;
    const signal = channel === MarkerChannel.ToHome ? home : food;
    const bias = Math.abs(sample.angleOffset);
    if (signal > 0 && (signal > bestSignal || (signal === bestSignal && bias < bestBias))) {
      bestSignal = signal;
      bestBias = bias;
      bestX = x;
      bestY = y;
    }
  }

  const found = bestSignal >= world.params.markerDetectMin;
  return {
    found,
    targetHeading: found ? angleOf({ x: bestX - posX, y: bestY - posY }) : 0,
    bestSignal,
    bestFoodSignal,
  };
}

export interface FallbackChoice {
  heading: number;
  clearAhead: boolean;
}

interface RayFan {
  rayCount: number;
  halfFovDeg: number;
  offsets: Float64Array;
  cos: Float64Array;
  sin: Float64Array;
}

let cachedFan: RayFan | null = null;

function rayFan(params: SimParams): RayFan {
  const rayCount = Math.max(1, Math.round(params.fallbackRays));
  if (cachedFan !== null && cachedFan.rayCount === rayCount && cachedFan.halfFovDeg === params.sensorHalfFovDeg) {
    return cachedFan;
  }
  const halfFov = (params.sensorHalfFovDeg * Math.PI) / 180;
  const offsets = new Float64Array(rayCount);
  const cos = new Float64Array(rayCount);
  const sin = new Float64Array(rayCount);
  for (let ray = 0; ray < rayCount; ray++) {
    const fraction = rayCount === 1 ? 0 : (2 * ray) / (rayCount - 1) - 1;
    offsets[ray] = halfFov * fraction;
    cos[ray] = Math.cos(offsets[ray]);
    sin[ray] = Math.sin(offsets[ray]);
  }
  cachedFan = { rayCount, halfFovDeg: params.sensorHalfFovDeg, offsets, cos, sin };
  return cachedFan;
}

export function chooseFallback(world: World, ant: number): FallbackChoice {
  const ants = world.ants;
  const params = world.params;
  const pos = { x: ants.posX[ant], y: ants.posY[ant] };
  const heading = ants.heading[ant];
  const wander = ants.wanderHeading[ant];
  // Open space: head straight for the wander target. Casting rays here instead
  // would leave the ant chasing the nearest ray, which sits half a ray step off
  // the target and flips sides every tick, so it would turn at full rate forever.
  if (freeDistance(world.obstacles, pos, wander, params.lookAhead) >= params.lookAhead) {
    return { heading: wander, clearAhead: true };
  }

  const fan = rayFan(params);
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);
  let bestDistance = -Infinity;
  let bestAngle = heading;
  let bestBias = Infinity;
  for (let ray = 0; ray < fan.rayCount; ray++) {
    const cos = cosH * fan.cos[ray] - sinH * fan.sin[ray];
    const sin = sinH * fan.cos[ray] + cosH * fan.sin[ray];
    const distance = freeDistanceDir(world.obstacles, pos, cos, sin, params.fallbackRange);
    const angle = heading + fan.offsets[ray];
    const bias = Math.abs(angleDiff(wander, angle));
    if (
      distance > bestDistance + 0.5 ||
      (Math.abs(distance - bestDistance) <= 0.5 && bias < bestBias)
    ) {
      bestDistance = distance;
      bestAngle = angle;
      bestBias = bias;
    }
  }
  return { heading: bestAngle, clearAhead: bestDistance >= params.lookAhead };
}

export function fallbackHeading(world: World, ant: number): number {
  return chooseFallback(world, ant).heading;
}

export function directSightHeading(world: World, ant: number): number | null {
  const ants = world.ants;
  const posX = ants.posX[ant];
  const posY = ants.posY[ant];
  const heading = ants.heading[ant];
  const params = world.params;
  const rangeSq = params.sensorRadius * params.sensorRadius;

  let targetX = 0;
  let targetY = 0;
  let hasTarget = false;

  if (ants.state[ant] === AntState.Foraging) {
    let bestDistSq = Infinity;
    for (const item of world.food.items) {
      const dx = item.pos.x - posX;
      const dy = item.pos.y - posY;
      const distSq = dx * dx + dy * dy;
      if (distSq <= rangeSq && distSq < bestDistSq) {
        if (!lineOfSight(world.obstacles, { x: posX, y: posY }, item.pos)) continue;
        bestDistSq = distSq;
        targetX = item.pos.x;
        targetY = item.pos.y;
        hasTarget = true;
      }
    }
  } else {
    const colony = world.colonies[ants.colony[ant]];
    if (
      colony !== undefined &&
      lineOfSight(world.obstacles, { x: posX, y: posY }, colony.nest)
    ) {
      targetX = colony.nest.x;
      targetY = colony.nest.y;
      hasTarget = true;
    }
  }

  if (!hasTarget) return null;
  const dx = targetX - posX;
  const dy = targetY - posY;
  if (dx * dx + dy * dy > rangeSq) return null;
  const target = Math.atan2(dy, dx);
  const halfFov = (params.sensorHalfFovDeg * Math.PI) / 180;
  if (Math.abs(angleDiff(heading, target)) > halfFov) return null;
  return target;
}
