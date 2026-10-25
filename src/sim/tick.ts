import { wrapAngle } from "../core/math.js";
import { randRange, randUnit } from "../core/rng.js";
import { fromAngle } from "../core/vec2.js";
import { slideHeadingAlongNormal } from "./collide.js";
import { nestRadius, type Colony } from "./colony.js";
import { ContactKind, makeChunkEvents, type ChunkEvents } from "./events.js";
import { degrade, deposit, emissionStrength, MarkerChannel } from "./marker_grid.js";
import { isSolidAt, speedFactorAt, freeDistance } from "./obstacles.js";
import {
  chooseFallback,
  directSightHeading,
  explorerPattern,
  followerPattern,
  senseMarkers,
} from "./sensing.js";
import { turnToward, updateWander } from "./steering.js";
import { evaluateStuck, inRestZone } from "./stuck.js";
import { AntRole, AntState, RandStream } from "./types.js";
import type { World } from "./world.js";

function senseChannel(state: number): MarkerChannel {
  return state === AntState.Foraging ? MarkerChannel.ToFood : MarkerChannel.ToHome;
}

function depositChannel(state: number): MarkerChannel | null {
  if (state === AntState.Foraging) return MarkerChannel.ToHome;
  if (state === AntState.ReturningFood) return MarkerChannel.ToFood;
  return null;
}

interface ChosenHeading {
  heading: number;
  bestFoodSignal: number;
  fromSight: boolean;
  fromMarkers: boolean;
}

function chooseHeading(world: World, ant: number): ChosenHeading {
  const ants = world.ants;
  const state = ants.state[ant];
  const sight = directSightHeading(world, ant);
  if (sight !== null) {
    return {
      heading: sight,
      bestFoodSignal: state === AntState.Foraging ? 1 : 0,
      fromSight: true,
      fromMarkers: false,
    };
  }
  const usesExplorerPattern =
    ants.role[ant] === AntRole.Explorer && state !== AntState.ReturningExhausted;
  const pattern = usesExplorerPattern ? explorerPattern(world.params) : followerPattern(world.params);
  const sensed = senseMarkers(world, ant, senseChannel(state), pattern);
  return {
    heading: sensed.found ? sensed.targetHeading : ants.heading[ant],
    bestFoodSignal: sensed.bestFoodSignal,
    fromSight: false,
    fromMarkers: sensed.found,
  };
}

// Returns a heading that has `lookAhead` units of free space, as close as possible to `desired`.
function steerAroundWalls(world: World, ant: number, desired: number): number {
  const p = { x: world.ants.posX[ant], y: world.ants.posY[ant] };
  const look = world.params.lookAhead;
  if (freeDistance(world.obstacles, p, desired, look) >= look) return desired;
  const side = world.ants.wanderOffset[ant] >= 0 ? 1 : -1;
  for (let k = 1; k <= 6; k++) {
    const off = (k * Math.PI) / 12;
    if (freeDistance(world.obstacles, p, desired + side * off, look) >= look) {
      return desired + side * off;
    }
    if (freeDistance(world.obstacles, p, desired - side * off, look) >= look) {
      return desired - side * off;
    }
  }
  return desired + Math.PI;
}

export function thinkChunk(world: World, begin: number, end: number, out: ChunkEvents): void {
  const ants = world.ants;
  const params = world.params;
  const dt = 1 / params.simHz;

  for (let ant = begin; ant < end; ant++) {
    ants.energy[ant] -= params.energyBurn * dt;
    ants.timeSinceAnchor[ant] += dt;
    ants.timeSinceLastMarker[ant] += dt;
    ants.degradeTimer[ant] = Math.max(0, ants.degradeTimer[ant] - dt);

    // The crowd count and zone scan only matter once the timer has expired;
    // doing them every tick for every ant is most of the hash query cost.
    if (ants.timeSinceLastMarker[ant] > params.stuckTimeout) {
      const nearby = world.spatialHash.countWithin(
        ants.posX[ant],
        ants.posY[ant],
        params.crowdRadiusFactor * params.antRadius,
        ants.posX,
        ants.posY,
        ant,
      );
      const stuck = evaluateStuck(
        ants.timeSinceLastMarker[ant],
        inRestZone(world, ant),
        nearby,
        params,
      );
      if (stuck.stuck) {
        ants.heading[ant] = wrapAngle(
          ants.heading[ant] +
            Math.PI +
            randRange(
              world.seed,
              ants.uid[ant],
              world.tick,
              RandStream.StuckTurn,
              -params.stuckTurnJitter,
              params.stuckTurnJitter,
            ),
        );
        ants.wanderHeading[ant] = ants.heading[ant];
        ants.timeSinceLastMarker[ant] = 0;
        ants.dropX[ant] = ants.posX[ant];
        ants.dropY[ant] = ants.posY[ant];
        if (stuck.degrade) ants.degradeTimer[ant] = params.degradeTime;
      }
    }

    let chosen = chooseHeading(world, ant);
    let desired = chosen.heading;

    if (
      ants.state[ant] === AntState.Foraging &&
      ants.energy[ant] < params.exhaustedAt &&
      chosen.bestFoodSignal < params.pushOnSignal
    ) {
      ants.state[ant] = AntState.ReturningExhausted;
      chosen = chooseHeading(world, ant);
      desired = chosen.heading;
    }

    const pickedWander = updateWander(world, ant, dt);
    let clearAhead = false;
    if (!chosen.fromSight) {
      if (chosen.fromMarkers) {
        // A redraw nudges a marker-following ant; between redraws the marker wins.
        if (pickedWander) desired += ants.wanderOffset[ant];
      } else {
        const fallback = chooseFallback(world, ant);
        desired = fallback.heading;
        // The fallback already proved the look-ahead is free, which is exactly
        // what steerAroundWalls would check, so it can skip the probe.
        clearAhead = fallback.clearAhead;
      }
    }
    if (!clearAhead) desired = steerAroundWalls(world, ant, desired);

    ants.heading[ant] = turnToward(ants.heading[ant], desired, params.turnRate * dt);
    const direction = fromAngle(ants.heading[ant]);
    ants.velX[ant] = ants.speed[ant] * direction.x;
    ants.velY[ant] = ants.speed[ant] * direction.y;
    ants.prevX[ant] = ants.posX[ant];
    ants.prevY[ant] = ants.posY[ant];
    // A centre inside a solid cell must still be able to move, or the ant
    // freezes there forever; collision resolution handles the walls.
    const factor = speedFactorAt(world.obstacles, { x: ants.posX[ant], y: ants.posY[ant] });
    const terrain = factor === 0 ? 1 : factor;
    ants.posX[ant] += ants.velX[ant] * dt * terrain;
    ants.posY[ant] += ants.velY[ant] * dt * terrain;

    const dropDx = ants.posX[ant] - ants.dropX[ant];
    const dropDy = ants.posY[ant] - ants.dropY[ant];
    if (dropDx * dropDx + dropDy * dropDy >= params.markerDropDist * params.markerDropDist) {
      const cell = world.markers.cellIndex({ x: ants.posX[ant], y: ants.posY[ant] });
      const channel = depositChannel(ants.state[ant]);
      const strength = emissionStrength(ants.timeSinceAnchor[ant], params);
      if (channel !== null && cell >= 0 && strength >= params.markerEps) {
        out.deposits.push({ cell, colony: ants.colony[ant], channel, strength });
      }
      ants.dropX[ant] = ants.posX[ant];
      ants.dropY[ant] = ants.posY[ant];
      ants.timeSinceLastMarker[ant] = 0;
    }

    if (ants.degradeTimer[ant] > 0) {
      const cell = world.markers.cellIndex({ x: ants.posX[ant], y: ants.posY[ant] });
      if (cell !== ants.lastMarkerCell[ant]) {
        ants.lastMarkerCell[ant] = cell;
        if (cell >= 0 && world.markers.owner[cell] === ants.colony[ant]) {
          out.degrades.push({
            cell,
            colony: ants.colony[ant],
            channel: senseChannel(ants.state[ant]),
          });
        }
      }
    }

    const foodIndex = world.food.findTouching(
      { x: ants.posX[ant], y: ants.posY[ant] },
      params.antRadius,
      params,
    );
    if (foodIndex >= 0) {
      out.contacts.push({ antIndex: ant, kind: ContactKind.Food, target: foodIndex });
    }

    const colony = world.colonies[ants.colony[ant]];
    if (colony !== undefined) {
      const dx = ants.posX[ant] - colony.nest.x;
      const dy = ants.posY[ant] - colony.nest.y;
      const reach = nestRadius(colony, params) + params.antRadius;
      if (dx * dx + dy * dy <= reach * reach) {
        out.contacts.push({ antIndex: ant, kind: ContactKind.Nest, target: colony.id });
      }
    }
  }
}

export function spawnAtNest(world: World, colony: Colony): number {
  const params = world.params;
  const uid = world.nextUid++;
  const angle = randRange(world.seed, uid, world.tick, RandStream.SpawnHeading, -Math.PI, Math.PI);
  const role =
    randUnit(world.seed, uid, world.tick, RandStream.SpawnRole) < params.explorerRatio
      ? AntRole.Explorer
      : AntRole.Follower;
  const speed =
    params.antSpeed *
    randRange(
      world.seed,
      uid,
      world.tick,
      RandStream.SpeedJitter,
      1 - params.speedJitter,
      1 + params.speedJitter,
    );
  const radius = nestRadius(colony, params);
  // Walk the spawn ring in golden-angle steps: a boulder or pond overlapping
  // the nest blocks some directions, and the samples that follow visit the
  // rest of the ring evenly. If all 16 are solid, use the nest centre.
  let pos = { x: colony.nest.x, y: colony.nest.y };
  for (let k = 0; k < 16; k++) {
    const a = angle + k * 2.39996;
    const x = colony.nest.x + Math.cos(a) * radius;
    const y = colony.nest.y + Math.sin(a) * radius;
    if (!isSolidAt(world.obstacles, { x, y })) {
      pos = { x, y };
      break;
    }
  }
  const index = world.ants.spawn(
    {
      pos,
      heading: angle,
      colony: colony.id,
      role,
    },
    uid,
    speed,
    params,
  );
  colony.population += 1;
  return index;
}

export function resetChunkEvents(world: World): void {
  const needed = Math.ceil(world.ants.size() / world.params.chunkSize);
  const lists = world.chunkEvents;
  for (let i = 0; i < needed; i++) {
    const events = lists[i];
    if (events === undefined) {
      lists.push(makeChunkEvents());
    } else {
      events.deposits.length = 0;
      events.degrades.length = 0;
      events.contacts.length = 0;
    }
  }
  lists.length = needed;
}

export function applyEvents(world: World, events: readonly ChunkEvents[]): void {
  const ants = world.ants;
  const params = world.params;

  for (const chunk of events) {
    for (const event of chunk.deposits) {
      deposit(world.markers, event.cell, event.colony, event.channel, event.strength, params);
    }
    for (const event of chunk.degrades) {
      degrade(world.markers, event.cell, event.colony, event.channel, params.degradeFactor);
    }
    for (const contact of chunk.contacts) {
      const ant = contact.antIndex;
      if (contact.kind === ContactKind.Food) {
        if (ants.state[ant] === AntState.ReturningFood) {
          ants.energy[ant] = params.energyMax;
        } else if (world.food.takeOne(contact.target)) {
          ants.state[ant] = AntState.ReturningFood;
          ants.mass[ant] = params.massCarrying;
          ants.energy[ant] = params.energyMax;
          ants.heading[ant] = wrapAngle(ants.heading[ant] + Math.PI);
          ants.wanderHeading[ant] = ants.heading[ant];
          ants.timeSinceAnchor[ant] = 0;
          ants.dropX[ant] = ants.posX[ant];
          ants.dropY[ant] = ants.posY[ant];
          ants.timeSinceLastMarker[ant] = 0;
        }
      } else {
        const colony = world.colonies[contact.target];
        if (colony === undefined) continue;
        const state = ants.state[ant];
        if (state === AntState.ReturningFood) {
          colony.foodPool += 1;
          colony.deliveredTotal += 1;
          colony.deliveredLastSample += 1;
          ants.mass[ant] = params.mass;
          ants.state[ant] = AntState.Foraging;
        } else if (state === AntState.ReturningExhausted) {
          ants.state[ant] = AntState.Foraging;
        }
        ants.energy[ant] = params.energyMax;
        ants.timeSinceAnchor[ant] = 0;
        if (state === AntState.ReturningFood || state === AntState.ReturningExhausted) {
          ants.heading[ant] = wrapAngle(ants.heading[ant] + Math.PI);
          ants.wanderHeading[ant] = ants.heading[ant];
          ants.dropX[ant] = ants.posX[ant];
          ants.dropY[ant] = ants.posY[ant];
          ants.timeSinceLastMarker[ant] = 0;
        }
      }
    }
  }

  world.food.removeEmpty();
  for (const colony of world.colonies) {
    while (colony.foodPool >= params.spawnCost && ants.size() < params.maxAntsTotal) {
      colony.foodPool -= params.spawnCost;
      spawnAtNest(world, colony);
    }
  }
}

export function clampToWorld(world: World): void {
  const ants = world.ants;
  const radius = world.params.antRadius;
  const maxX = world.size.x - radius;
  const maxY = world.size.y - radius;
  for (let index = 0; index < ants.size(); index++) {
    if (ants.posX[index] < radius) {
      ants.posX[index] = radius;
      slideHeadingAlongNormal(ants, index, 1, 0);
    } else if (ants.posX[index] > maxX) {
      ants.posX[index] = maxX;
      slideHeadingAlongNormal(ants, index, -1, 0);
    }
    if (ants.posY[index] < radius) {
      ants.posY[index] = radius;
      slideHeadingAlongNormal(ants, index, 0, 1);
    } else if (ants.posY[index] > maxY) {
      ants.posY[index] = maxY;
      slideHeadingAlongNormal(ants, index, 0, -1);
    }
  }
}

export function removeDead(world: World): void {  const ants = world.ants;
  for (let index = ants.size() - 1; index >= 0; index--) {
    if (ants.energy[index] > 0) continue;
    const colony = world.colonies[ants.colony[index]];
    if (colony !== undefined) colony.population -= 1;
    ants.removeSwap(index);
  }
}

export function updateStats(world: World): void {
  const sample = world.tick % world.params.simHz === 0;
  for (const colony of world.colonies) {
    if (sample) {
      colony.deliveredPerSecond.push(colony.deliveredLastSample);
      colony.deliveredLastSample = 0;
    }
    colony.extinct = colony.population === 0 && colony.foodPool < world.params.spawnCost;
  }
}
