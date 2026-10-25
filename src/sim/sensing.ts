import { angleDiff } from "../core/math.js";
import { angleOf, fromAngle } from "../core/vec2.js";
import { MarkerChannel } from "./marker_grid.js";
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
const kExplorerAngleFractions = [-1, 1];
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
  const colony = ants.colony[ant];
  let bestSignal = 0;
  let bestFoodSignal = 0;
  let bestBias = Infinity;
  let bestX = 0;
  let bestY = 0;

  for (const sample of pattern) {
    const direction = fromAngle(heading + sample.angleOffset);
    const x = posX + direction.x * sample.distance;
    const y = posY + direction.y * sample.distance;
    const cell = world.markers.cellIndex({ x, y });
    if (cell < 0 || world.markers.owner[cell] !== colony) continue;
    const home = world.markers.toHome[cell];
    const food = world.markers.toFood[cell];
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
        bestDistSq = distSq;
        targetX = item.pos.x;
        targetY = item.pos.y;
        hasTarget = true;
      }
    }
  } else {
    const colony = world.colonies[ants.colony[ant]];
    if (colony !== undefined) {
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
