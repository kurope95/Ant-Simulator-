import { angleDiff } from "../core/math.js";
import { angleOf, type Vec2 } from "../core/vec2.js";
import { MarkerChannel, type MarkerGrid } from "./marker_grid.js";
import { isSolidCell, freeDistance, freeDistanceDir, lineOfSight } from "./obstacles.js";
import type { SimParams } from "./params.js";
import { AntRole, AntState, Combat } from "./types.js";
import type { World } from "./world.js";

export interface SensorSample {
  angleOffset: number;
  distance: number;
  // Which of the pattern's directions this sample lies on; samples on one
  // direction share its cos/sin, so they are worked out once per ant.
  slot: number;
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
      angleFractions.map((angleFraction, slot) =>
        Object.freeze({
          angleOffset: halfFov * angleFraction,
          distance: params.sensorRadius * fraction,
          slot,
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

// The strongest scent any rival colony has on this cell, by its larger channel.
function rivalStrength(grid: MarkerGrid, colony: number, cell: number): number {
  const cells = grid.width * grid.height;
  let strongest = 0;
  for (let other = 0; other < grid.colonies; other++) {
    if (other === colony) continue;
    const index = other * cells + cell;
    const strength = Math.max(grid.toHome[index], grid.toFood[index]);
    if (strength > strongest) strongest = strength;
  }
  return strongest;
}

// cos/sin of (heading + offset) per pattern direction for the ant being sensed.
// Math.cos of the same sum as before, so results are bit-identical; there are
// just 5 directions instead of 25 samples to work out.
const kMaxSlots = 8;
// Candidate samples a guarding warrior chooses among (conflict design §3).
const kMaxCandidates = 32;
const candSignal = new Float64Array(kMaxCandidates);
const candX = new Float64Array(kMaxCandidates);
const candY = new Float64Array(kMaxCandidates);
const candOffset = new Float64Array(kMaxCandidates);
const slotCos = new Float64Array(kMaxSlots);
const slotSin = new Float64Array(kMaxSlots);
const slotDone = new Uint8Array(kMaxSlots);

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
  // Foreign scent repels: a rival's strength on a sampled cell comes off the ant's own signal there.
  const aversion = world.params.foreignAversion;
  const battleChannel = channel === MarkerChannel.Battle;
  const contested = !battleChannel && aversion > 0 && grid.colonies > 1;
  // Battle smell is danger to a worker: it lowers trail cells, less so when the
  // ant is stressed (conflict design §4). Warriors are drawn to it instead.
  const danger =
    !battleChannel && world.params.conflict && grid.colonies > 1 && ants.role[ant] !== AntRole.Warrior
      ? world.params.battleAversion * (1 - ants.stress[ant])
      : 0;
  let bestX = 0;
  let bestY = 0;
  const obstacles = world.obstacles;
  const obstacleCell = obstacles.cell;
  const markerCell = grid.cell;
  const gridW = grid.width;
  const gridH = grid.height;
  slotDone.fill(0);
  // A warrior on a trail heads for the column's edge, not its middle: it
  // collects the samples and picks one near guardEdge of the strongest.
  const guard =
    !battleChannel && world.params.conflict && world.params.guardEdge > 0 && ants.role[ant] === AntRole.Warrior;
  let candidates = 0;

  for (const sample of pattern) {
    const slot = sample.slot;
    if (slotDone[slot] === 0) {
      slotDone[slot] = 1;
      slotCos[slot] = Math.cos(heading + sample.angleOffset);
      slotSin[slot] = Math.sin(heading + sample.angleOffset);
    }
    const x = posX + slotCos[slot] * sample.distance;
    const y = posY + slotSin[slot] * sample.distance;
    // grid.cellIndex inlined: same bounds, no object per sample.
    if (x < 0 || y < 0 || x >= gridW * markerCell || y >= gridH * markerCell) continue;
    const cell = Math.floor(y / markerCell) * gridW + Math.floor(x / markerCell);
    const index = layer + cell;
    const home = grid.toHome[index];
    const food = grid.toFood[index];
    const own = battleChannel ? grid.battle[index] : channel === MarkerChannel.ToHome ? home : food;
    // A sample with none of the own scent and no better food reading cannot
    // change the answer (rival scent and battle danger only lower the signal),
    // so it skips the wall checks below. Most samples off the trails end here.
    if (own <= 0 && food <= bestFoodSignal) continue;
    if (isSolidCell(obstacles, Math.floor(x / obstacleCell), Math.floor(y / obstacleCell))) continue;
    // Cheap line of sight: a wall at the halfway point blocks the sample too.
    if (isSolidCell(obstacles, Math.floor(((posX + x) * 0.5) / obstacleCell), Math.floor(((posY + y) * 0.5) / obstacleCell))) {
      continue;
    }
    if (food > bestFoodSignal) bestFoodSignal = food;
    // The signal is the score: a cell only counts as found while the own scent beats the rival's.
    // Without own scent the signal cannot be positive, so the rival lookup is skipped.
    let signal = contested && own > 0 ? own - aversion * rivalStrength(grid, colony, cell) : own;
    if (danger > 0 && own > 0) signal -= danger * grid.battle[index];
    if (guard) {
      if (signal > 0 && candidates < kMaxCandidates) {
        candSignal[candidates] = signal;
        candX[candidates] = x;
        candY[candidates] = y;
        candOffset[candidates] = sample.angleOffset;
        candidates += 1;
      }
      continue;
    }
    const bias = Math.abs(sample.angleOffset);
    if (signal > 0 && (signal > bestSignal || (signal === bestSignal && bias < bestBias))) {
      bestSignal = signal;
      bestBias = bias;
      bestX = x;
      bestY = y;
    }
  }

  if (guard && candidates > 0) {
    let peak = 0;
    for (let c = 0; c < candidates; c++) if (candSignal[c] > peak) peak = candSignal[c];
    const target = peak * world.params.guardEdge;
    // Each warrior keeps to one flank, so both edges of a column are covered.
    const side = (ants.uid[ant] & 1) === 0 ? 1 : -1;
    let bestScore = -Infinity;
    for (let c = 0; c < candidates; c++) {
      const s = candSignal[c];
      let score = s <= target ? s : 2 * target - s;
      if (candOffset[c] * side > 0) score += 0.1 * peak;
      const bias = Math.abs(candOffset[c]);
      if (score > bestScore || (score === bestScore && bias < bestBias)) {
        bestScore = score;
        bestBias = bias;
        bestSignal = s;
        bestX = candX[c];
        bestY = candY[c];
      }
    }
  }

  const found = bestSignal >= (battleChannel ? world.params.battleDetectMin : world.params.markerDetectMin);
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

// The point an ant can see directly (its food while foraging, its nest while
// returning), if it is in range and inside its cone; null otherwise.
export function directSightTarget(world: World, ant: number): Vec2 | null {
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
      if (!item.infinite && item.amount < 1) continue;
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
    // Workers also see bodies lying in range (conflict design §2).
    if (params.conflict && ants.role[ant] !== AntRole.Warrior && ants.combat[ant] === Combat.None) {
      const corpse = world.corpses.nearest(posX, posY, params.sensorRadius);
      if (corpse >= 0) {
        const body = world.corpses.items[corpse];
        const dx = body.x - posX;
        const dy = body.y - posY;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq && lineOfSight(world.obstacles, { x: posX, y: posY }, { x: body.x, y: body.y })) {
          bestDistSq = distSq;
          targetX = body.x;
          targetY = body.y;
          hasTarget = true;
        }
      }
    }
  } else {
    const colony = world.colonies[ants.colony[ant]];
    // Range first: the line-of-sight march across the map is the costly part.
    if (
      colony !== undefined &&
      (colony.nest.x - posX) * (colony.nest.x - posX) + (colony.nest.y - posY) * (colony.nest.y - posY) <= rangeSq &&
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
  return { x: targetX, y: targetY };
}

export function directSightHeading(world: World, ant: number): number | null {
  const target = directSightTarget(world, ant);
  if (target === null) return null;
  return Math.atan2(target.y - world.ants.posY[ant], target.x - world.ants.posX[ant]);
}
