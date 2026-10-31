import { wrapAngle } from "../core/math.js";
import { randRange, randUnit } from "../core/rng.js";
import { fromAngle } from "../core/vec2.js";
import { slideHeadingAlongNormal } from "./collide.js";
import { colonyReserve, guardRadius, nestRadius, type Colony } from "./colony.js";
import { answersCall, combatStep, kFightDeathWindow, type CombatSteer } from "./conflict.js";
import { ContactKind, makeChunkEvents, type ChunkEvents } from "./events.js";
import { battleAt, degrade, deposit, emissionStrength, foodAt, homeAt, MarkerChannel } from "./marker_grid.js";
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
import { AntRole, AntState, Combat, RandStream } from "./types.js";
import type { SimParams } from "./params.js";
import { FoodKind } from "./setup.js";
import type { World } from "./world.js";

export function senseChannel(state: number): MarkerChannel {
  return state === AntState.Foraging ? MarkerChannel.ToFood : MarkerChannel.ToHome;
}

function depositChannel(state: number, role: number): MarkerChannel | null {
  // Warriors guard trails but never lay them (conflict design §3).
  if (role === AntRole.Warrior) return null;
  if (state === AntState.Foraging) return MarkerChannel.ToHome;
  if (state === AntState.ReturningFood) return MarkerChannel.ToFood;
  return null;
}

interface ChosenHeading {
  heading: number;
  bestFoodSignal: number;
  fromSight: boolean;
  fromMarkers: boolean;
  fromHoming: boolean;
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
      fromHoming: false,
    };
  }
  const usesExplorerPattern =
    ants.role[ant] === AntRole.Explorer && state !== AntState.ReturningExhausted;
  const pattern = usesExplorerPattern ? explorerPattern(world.params) : followerPattern(world.params);
  const sensed = senseMarkers(world, ant, senseChannel(state), pattern);
  if (!sensed.found && world.params.homingEnabled && state !== AntState.Foraging) {
    // Nothing to see and no trail: a returning ant trusts its own path
    // estimate of where the nest is (spec §5.7).
    const colony = world.colonies[ants.colony[ant]];
    if (colony !== undefined) {
      return {
        heading: Math.atan2(
          colony.nest.y + ants.homeErrY[ant] - ants.posY[ant],
          colony.nest.x + ants.homeErrX[ant] - ants.posX[ant],
        ),
        bestFoodSignal: sensed.bestFoodSignal,
        fromSight: false,
        fromMarkers: false,
        fromHoming: true,
      };
    }
  }
  return {
    heading: sensed.found ? sensed.targetHeading : ants.heading[ant],
    bestFoodSignal: sensed.bestFoodSignal,
    fromSight: false,
    fromMarkers: sensed.found,
    fromHoming: false,
  };
}

// Returns a free heading for an ant whose `desired` heading is blocked. The ant
// turns one way only — its own, taken from its uid, so it never flips sides —
// and it searches from the heading it already holds, not from `desired`.
// Searching from the current heading is what makes it follow the wall: search
// from `desired` and the answer jumps back and forth as the target moves, which
// leaves the ant pressed against the wall instead of getting round it. With no
// free heading inside half a turn, it reverses.
function steerAroundWalls(world: World, ant: number, desired: number): number {
  const p = { x: world.ants.posX[ant], y: world.ants.posY[ant] };
  const look = world.params.lookAhead;
  if (freeDistance(world.obstacles, p, desired, look) >= look) return desired;
  const side = (world.ants.uid[ant] & 1) === 0 ? 1 : -1;
  const current = world.ants.heading[ant];
  for (let k = 0; k <= 12; k++) {
    const candidate = current + side * ((k * Math.PI) / 12);
    if (freeDistance(world.obstacles, p, candidate, look) >= look) return candidate;
  }
  return desired + Math.PI;
}

export function thinkChunk(world: World, begin: number, end: number, out: ChunkEvents): void {
  const ants = world.ants;
  const params = world.params;
  const dt = 1 / params.simHz;

  for (let ant = begin; ant < end; ant++) {
    if (ants.state[ant] === AntState.Resting) {
      // A resting ant sits in the nest (spec §5.8): it ages, burns a little and
      // eats from the stores when it gets hungry; nothing else.
      ants.energy[ant] -= params.energyBurn * params.restBurnFactor * dt;
      ants.lifeLeft[ant] -= dt;
      ants.prevX[ant] = ants.posX[ant];
      ants.prevY[ant] = ants.posY[ant];
      ants.velX[ant] = 0;
      ants.velY[ant] = 0;
      if (ants.energy[ant] < 0.9 * params.energyMax) {
        out.contacts.push({ antIndex: ant, kind: ContactKind.Nest, target: ants.colony[ant] });
      }
      continue;
    }
    ants.energy[ant] -= params.energyBurn * dt;
    ants.lifeLeft[ant] -= dt;
    if (params.conflict) {
      ants.sinceHit[ant] += dt;
      if (ants.wounds[ant] > 0) ants.wounds[ant] = Math.max(0, ants.wounds[ant] - params.woundHeal * dt);
      if (ants.fear[ant] > 0) ants.fear[ant] = Math.max(0, ants.fear[ant] - params.fearDecay * dt);
      if (ants.energy[ant] < params.exhaustedAt) {
        ants.stress[ant] = Math.min(1, ants.stress[ant] + params.hungerStress * dt);
      }
    }
    ants.timeSinceAnchor[ant] += dt;
    ants.timeSinceLastMarker[ant] += dt;
    ants.degradeTimer[ant] = Math.max(0, ants.degradeTimer[ant] - dt);

    // The crowd count and zone scan only matter once the timer has expired;
    // doing them every tick for every ant is most of the hash query cost.
    if (ants.timeSinceLastMarker[ant] > params.stuckTimeout) {
      // Crowd counts read start-of-step positions (prevX/prevY, set for every
      // ant before Think), so the answer does not depend on which ants have
      // already moved this step: chunk order, and the worker count, cannot matter.
      const nearby = world.spatialHash.countWithin(
        ants.prevX[ant],
        ants.prevY[ant],
        params.crowdRadiusFactor * params.antRadius,
        ants.prevX,
        ants.prevY,
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
        // Warriors never lay trail, so they never erase it either.
        if (stuck.degrade && ants.role[ant] !== AntRole.Warrior) ants.degradeTimer[ant] = params.degradeTime;
      }
    }

    let chosen = chooseHeading(world, ant);
    let desired = chosen.heading;

    // A tired forager heads home unless it smells food close; a strong smell
    // keeps it going only until half its energy is gone, or a bare pile that
    // still smells of food would hold it until it starved (spec §5.6).
    if (
      ants.state[ant] === AntState.Foraging &&
      ants.energy[ant] < params.exhaustedAt &&
      (chosen.bestFoodSignal < params.pushOnSignal || ants.energy[ant] < 0.5 * params.exhaustedAt)
    ) {
      ants.state[ant] = AntState.ReturningExhausted;
      chosen = chooseHeading(world, ant);
      desired = chosen.heading;
    }

    // Colony conflict (design §4): a fight steers the ant directly; otherwise
    // warriors, and a few bold workers, follow their colony's battle smell.
    let fight: CombatSteer | null = null;
    if (params.conflict) {
      fight = combatStep(world, ant, world.look, dt, out);
      if (fight.heading !== null) {
        desired = fight.heading;
      } else if (world.look.active && answersCall(world, ant)) {
        const call = senseMarkers(world, ant, MarkerChannel.Battle, followerPattern(params));
        if (call.found) {
          desired = call.targetHeading;
          chosen = { ...chosen, heading: desired, fromSight: false, fromMarkers: true, fromHoming: false };
        }
      }
    }
    const fightSteers = fight !== null && fight.heading !== null;

    const pickedWander = updateWander(world, ant, dt);
    let clearAhead = false;
    if (!fightSteers && !chosen.fromSight && !chosen.fromHoming) {
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
    // Avoidance (§6.1) is a sideways nudge to the heading, blended in before the
    // wall check so that walls still win. It breaks the fallback's clear-ahead
    // proof, so the wall check runs again when it applies.
    if (params.antCollisions && (ants.avoidX[ant] !== 0 || ants.avoidY[ant] !== 0)) {
      const sp = ants.speed[ant];
      desired = Math.atan2(
        Math.sin(desired) + ants.avoidY[ant] / sp,
        Math.cos(desired) + ants.avoidX[ant] / sp,
      );
      clearAhead = false;
    }
    if (!clearAhead) desired = steerAroundWalls(world, ant, desired);

    ants.heading[ant] = turnToward(ants.heading[ant], desired, params.turnRate * dt);
    const direction = fromAngle(ants.heading[ant]);
    // An ant facing off or biting stands its ground.
    // Wounds slow an ant down (up to woundSlow of its speed), so a hurt runner is caught.
    const woundFactor = params.conflict ? 1 - params.woundSlow * Math.min(1, ants.wounds[ant] / params.energyMax) : 1;
    const moveSpeed = fight !== null && fight.hold ? 0 : ants.speed[ant] * woundFactor;
    ants.velX[ant] = moveSpeed * direction.x;
    ants.velY[ant] = moveSpeed * direction.y;
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
      const channel = depositChannel(ants.state[ant], ants.role[ant]);
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
        if (cell >= 0) {
          const channel = senseChannel(ants.state[ant]);
          const colony = ants.colony[ant];
          // Only cells that still hold this colony's trail need erasing; the
          // check keeps the event list from filling with no-ops.
          const own =
            channel === MarkerChannel.ToHome
              ? homeAt(world.markers, colony, cell)
              : foodAt(world.markers, colony, cell);
          if (own > 0) out.degrades.push({ cell, colony, channel });
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
    } else if (params.bareGoHome && ants.state[ant] === AntState.Foraging) {
      const bare = world.food.findBareTouching({ x: ants.posX[ant], y: ants.posY[ant] }, params.antRadius, params);
      if (bare >= 0) out.contacts.push({ antIndex: ant, kind: ContactKind.BarePile, target: bare });
    }
    // Patience (spec §5.4): a forager stuck in a crowd near a pile without
    // reaching it gives up and goes home, so a jam empties instead of growing.
    if (params.foodPatience > 0 && ants.state[ant] === AntState.Foraging && foodIndex < 0) {
      const near = world.food.findTouching(
        { x: ants.posX[ant], y: ants.posY[ant] },
        params.antRadius + params.zoneMargin,
        params,
      );
      const crowded =
        near >= 0 &&
        world.spatialHash.countWithin(
          ants.prevX[ant],
          ants.prevY[ant],
          params.crowdRadiusFactor * params.antRadius,
          ants.prevX,
          ants.prevY,
          ant,
        ) >= params.crowdLimit;
      ants.foodWait[ant] = crowded ? ants.foodWait[ant] + dt : 0;
      if (ants.foodWait[ant] > params.foodPatience) {
        ants.foodWait[ant] = 0;
        ants.state[ant] = AntState.ReturningExhausted;
      }
    }
    if (
      params.conflict &&
      ants.state[ant] === AntState.Foraging &&
      ants.role[ant] !== AntRole.Warrior &&
      (ants.combat[ant] === Combat.None || ants.combat[ant] === Combat.Cooldown)
    ) {
      const corpse = world.corpses.nearest(ants.posX[ant], ants.posY[ant], 2 * params.antRadius);
      if (corpse >= 0) out.contacts.push({ antIndex: ant, kind: ContactKind.Corpse, target: corpse });
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

// A point on the nest's rim in direction `angle`. Walks the ring in
// golden-angle steps: a boulder or pond overlapping the nest blocks some
// directions, and the samples that follow visit the rest of the ring evenly.
// If all 16 are solid, the nest centre.
function nestEdgePoint(world: World, colony: Colony, angle: number): { x: number; y: number } {
  const radius = nestRadius(colony, world.params);
  for (let k = 0; k < 16; k++) {
    const a = angle + k * 2.39996;
    const x = colony.nest.x + Math.cos(a) * radius;
    const y = colony.nest.y + Math.sin(a) * radius;
    if (!isSolidAt(world.obstacles, { x, y })) return { x, y };
  }
  return { x: colony.nest.x, y: colony.nest.y };
}

// An ant goes into the nest to rest (spec §5.8): to the nest centre, hidden.
export function startResting(world: World, colony: Colony, ant: number): void {
  const ants = world.ants;
  ants.state[ant] = AntState.Resting;
  ants.posX[ant] = colony.nest.x;
  ants.posY[ant] = colony.nest.y;
  ants.prevX[ant] = colony.nest.x;
  ants.prevY[ant] = colony.nest.y;
  ants.velX[ant] = 0;
  ants.velY[ant] = 0;
  ants.mass[ant] = world.params.mass;
  colony.resting += 1;
  colony.restQueue.push(ants.uid[ant]);
}

// A resting ant is called out: it leaves from the nest rim, heading outward.
function leaveNest(world: World, colony: Colony, ant: number): void {
  const ants = world.ants;
  const angle = randRange(world.seed, ants.uid[ant], world.tick, RandStream.LeaveNest, -Math.PI, Math.PI);
  const pos = nestEdgePoint(world, colony, angle);
  ants.state[ant] = AntState.Foraging;
  ants.posX[ant] = pos.x;
  ants.posY[ant] = pos.y;
  ants.prevX[ant] = pos.x;
  ants.prevY[ant] = pos.y;
  ants.heading[ant] = angle;
  ants.wanderHeading[ant] = angle;
  ants.timeSinceAnchor[ant] = 0;
  ants.dropX[ant] = pos.x;
  ants.dropY[ant] = pos.y;
  ants.timeSinceLastMarker[ant] = 0;
  ants.homeErrX[ant] = 0;
  ants.homeErrY[ant] = 0;
  colony.resting -= 1;
}

// Fighting near the nest calls resting ants out to defend it (conflict design §4):
// while the colony's battle smell lies at the nest or inside half its safety
// ring, defendCallRate ants a second are called.
function callDefenders(world: World, colony: Colony): void {
  const params = world.params;
  if (colony.resting <= 0) return;
  const grid = world.markers;
  const reach = guardRadius(colony, params) * 0.5;
  let alarm = battleAt(grid, colony.id, grid.cellIndex(colony.nest));
  for (let k = 0; k < 8 && alarm < params.battleDetectMin; k++) {
    const a = (k * Math.PI) / 4;
    const x = colony.nest.x + Math.cos(a) * reach;
    const y = colony.nest.y + Math.sin(a) * reach;
    alarm = Math.max(alarm, battleAt(grid, colony.id, grid.cellIndex({ x, y })));
  }
  if (alarm >= params.battleDetectMin) colony.callOut += params.defendCallRate / params.simHz;
}

// Deliveries and scouting call resting ants out, oldest rest first (spec §5.8).
// Calls never bank beyond the ants there are to answer them.
function callOutOfNest(world: World, colony: Colony): void {
  const params = world.params;
  colony.callOut += (params.scoutRate * colony.resting) / params.simHz;
  colony.callOut = Math.min(colony.callOut, colony.resting);
  while (colony.callOut >= 1 && colony.restQueue.length > 0) {
    const uid = colony.restQueue.shift()!;
    const ant = world.ants.indexOf(uid);
    if (ant === null || world.ants.state[ant] !== AntState.Resting) continue; // died or already out
    colony.callOut -= 1;
    leaveNest(world, colony, ant);
  }
}

// lifeShare < 1 spawns an ant part-way through its life: the starting ants get
// staggered ages so the first generation does not die of old age all at once.
export function spawnAtNest(world: World, colony: Colony, lifeShare = 1): number {
  const params = world.params;
  const uid = world.nextUid++;
  const lifeLeft = params.lifeCycle
    ? params.antLifespan *
      lifeShare *
      randRange(
        world.seed,
        uid,
        world.tick,
        RandStream.Lifespan,
        1 - params.lifespanJitter,
        1 + params.lifespanJitter,
      )
    : Infinity;
  const angle = randRange(world.seed, uid, world.tick, RandStream.SpawnHeading, -Math.PI, Math.PI);
  const warrior =
    params.conflict &&
    params.warriorRatio > 0 &&
    randUnit(world.seed, uid, world.tick, RandStream.Warrior) < params.warriorRatio;
  const role = warrior
    ? AntRole.Warrior
    : randUnit(world.seed, uid, world.tick, RandStream.SpawnRole) < params.explorerRatio
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
  const pos = nestEdgePoint(world, colony, angle);
  const index = world.ants.spawn(
    {
      pos,
      heading: angle,
      colony: colony.id,
      role,
      lifeLeft,
    },
    uid,
    speed,
    params,
  );
  colony.population += 1;
  colony.born += 1;
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
      events.attacks.length = 0;
    }
  }
  lists.length = needed;
}

export function applyEvents(world: World, events: readonly ChunkEvents[]): void {
  const ants = world.ants;
  const params = world.params;
  // Deliveries counted this tick, for the queen's income signal.
  const incomeMark = new Map<Colony, number>();
  for (const colony of world.colonies) incomeMark.set(colony, colony.deliveredTotal);

  for (const chunk of events) {
    for (const event of chunk.deposits) {
      deposit(world.markers, event.cell, event.colony, event.channel, event.strength, params);
    }
    for (const event of chunk.degrades) {
      degrade(world.markers, event.cell, event.colony, event.channel, params.degradeFactor);
    }
    for (const contact of chunk.contacts) {
      const ant = contact.antIndex;
      if (contact.kind === ContactKind.BarePile) {
        // Nothing left here: home, where with the colony balancing itself it rests.
        if (ants.state[ant] === AntState.Foraging) {
          ants.state[ant] = AntState.ReturningExhausted;
          ants.heading[ant] = wrapAngle(ants.heading[ant] + Math.PI);
          ants.wanderHeading[ant] = ants.heading[ant];
        }
        continue;
      }
      if (contact.kind === ContactKind.Food) {
        if (ants.role[ant] === AntRole.Warrior) {
          // A guard eats at the pile and turns back along the trail (conflict design §3).
          ants.energy[ant] = params.energyMax;
          if (ants.state[ant] === AntState.Foraging) {
            ants.state[ant] = AntState.ReturningExhausted;
            turnAround(world, ant);
          }
        } else if (ants.state[ant] === AntState.ReturningFood) {
          ants.energy[ant] = params.energyMax;
        } else if ((world.food.items[contact.target]?.amount ?? 0) >= 1) {
          // It eats its fill off the pile, then takes a piece home (if eating
          // did not finish the pile off).
          eatAtPile(world, ant, contact.target);
          const pile = world.food.items[contact.target];
          if (!world.food.takeOne(contact.target)) continue;
          // Only a piece from a rich pile reached without a jam calls others out.
          ants.richFind[ant] =
            (pile.infinite || pile.amount >= params.recruitMinPile) && ants.foodWait[ant] < 1 ? 1 : 0;
          ants.foodWait[ant] = 0;
          pickUp(world, ant, 1);
        }
      } else if (contact.kind === ContactKind.Corpse) {
        const corpse = world.corpses.items[contact.target];
        if (corpse === undefined || corpse.taken || ants.state[ant] !== AntState.Foraging) continue;
        corpse.taken = true;
        pickUp(world, ant, corpse.value);
      } else {
        const colony = world.colonies[contact.target];
        if (colony === undefined) continue;
        ants.homeErrX[ant] = 0;
        ants.homeErrY[ant] = 0;
        const state = ants.state[ant];
        const arriving = state === AntState.ReturningFood || state === AntState.ReturningExhausted;
        if (state === AntState.ReturningFood) {
          // A body is worth more than one food; plain food carries 1.
          colony.foodPool += Math.max(1, ants.load[ant]);
          colony.deliveredTotal += 1;
          colony.deliveredLastSample += 1;
          ants.mass[ant] = params.mass;
          ants.load[ant] = 0;
          ants.state[ant] = AntState.Foraging;
          if (params.conflict) ants.stress[ant] = Math.max(0, ants.stress[ant] - params.deliverCalm);
          // A forager back from a rich pile calls more ants out to it; crumbs
          // from a bare, regrowing pile call nobody (spec §5.8).
          if (params.restAtHome && ants.richFind[ant] === 1) colony.callOut += params.recruitPerDelivery;
          ants.richFind[ant] = 0;
        } else if (state === AntState.ReturningExhausted) {
          // Searched until tired and found nothing: with the colony balancing
          // itself, it stays in and rests until work calls it out.
          // Warriors never rest: coming home is the turn of their patrol.
          if (params.restAtHome && ants.role[ant] !== AntRole.Warrior) startResting(world, colony, ant);
          else ants.state[ant] = AntState.Foraging;
        }
        const hunger = params.energyMax - ants.energy[ant];
        const ate = eatAtNest(colony, ant, world);
        if (params.conflict) settleAtNest(world, colony, ant, arriving, hunger, ate);
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
    for (const hit of chunk.attacks) applyBite(world, hit.attacker, hit.victim, hit.damage);
  }

  world.food.regrow(1 / params.simHz, params.foodGrowthRate);
  if (world.tick % params.simHz === 0) sproutFood(world);
  world.food.removeEmpty();
  for (const colony of world.colonies) {
    updateIncome(colony, colony.deliveredTotal - (incomeMark.get(colony) ?? colony.deliveredTotal), params.simHz);
    if (params.restAtHome && params.conflict) callDefenders(world, colony);
    if (params.restAtHome) callOutOfNest(world, colony);
    if (!params.lifeCycle) {
      while (colony.foodPool >= params.spawnCost && ants.size() < params.maxAntsTotal) {
        colony.foodPool -= params.spawnCost;
        spawnAtNest(world, colony);
      }
      continue;
    }
    layEggs(world, colony);
  }
}

function turnAround(world: World, ant: number): void {
  const ants = world.ants;
  ants.heading[ant] = wrapAngle(ants.heading[ant] + Math.PI);
  ants.wanderHeading[ant] = ants.heading[ant];
  ants.timeSinceAnchor[ant] = 0;
  ants.dropX[ant] = ants.posX[ant];
  ants.dropY[ant] = ants.posY[ant];
  ants.timeSinceLastMarker[ant] = 0;
}

// Picks up food, or a body worth `load` food, and turns for home. Picking up
// does not feed the ant: it eats off a pile first (eatAtPile), and a body is
// carried home whole, where it becomes stored food.
function pickUp(world: World, ant: number, load: number): void {
  const ants = world.ants;
  ants.state[ant] = AntState.ReturningFood;
  ants.mass[ant] = world.params.massCarrying;
  ants.load[ant] = load;
  turnAround(world, ant);
}

// Colony conflict at the nest (design §1, §6): wounds heal fast, a short meal
// stresses the ant and a full one calms it, and an arriving ant blends its
// feelings with the nest's, which drift a little toward the ant's.
function settleAtNest(
  world: World,
  colony: Colony,
  ant: number,
  arriving: boolean,
  hunger: number,
  ate: number,
): void {
  const ants = world.ants;
  const params = world.params;
  const dt = 1 / params.simHz;
  if (ants.wounds[ant] > 0) ants.wounds[ant] = Math.max(0, ants.wounds[ant] - params.nestHeal * dt);
  if (!arriving) return;
  if (hunger >= 5) {
    const short = 1 - ate / hunger;
    ants.stress[ant] += (short - ants.stress[ant]) * params.mealStress;
  }
  ants.stress[ant] += (colony.nestStress - ants.stress[ant]) * params.nestMix;
  ants.fear[ant] += (colony.nestFear - ants.fear[ant]) * params.nestMix;
  colony.nestStress += (ants.stress[ant] - colony.nestStress) * params.nestAbsorb;
  colony.nestFear += (ants.fear[ant] - colony.nestFear) * params.nestAbsorb;
}

// A bite lands (design §4): armour softens it, it frightens the victim, and a
// victim that was not fighting turns on its attacker.
function applyBite(world: World, attacker: number, victim: number, damage: number): void {
  const ants = world.ants;
  const params = world.params;
  if (victim >= ants.size() || ants.energy[victim] - ants.wounds[victim] <= 0) return;
  const armor = ants.role[victim] === AntRole.Warrior ? params.warriorArmor : 1;
  const taken = damage / armor;
  ants.wounds[victim] += taken;
  ants.sinceHit[victim] = 0;
  ants.fear[victim] = Math.min(1, ants.fear[victim] + taken * params.fearPerDamage);
  // Bitten while not fighting, or cooling down after a chase: it turns on its attacker.
  if (ants.combat[victim] === Combat.None || ants.combat[victim] === Combat.Cooldown) {
    ants.combat[victim] = Combat.Fight;
    ants.combatTimer[victim] = params.chaseTime;
    ants.foe[victim] = ants.uid[attacker];
  }
}

// New food (spec §4.4), checked once a second: each living pile may seed a
// new one nearby, more often the fuller it is, and now and then a pile sprouts
// anywhere. New piles start small and grow like the rest; dead patches never
// come back. Never on rock or water, near a nest, or on top of another pile.
const kSproutMinDistance = 120;
const kSproutMaxDistance = 360;
const kSproutPileGap = 60;
const kSproutSeedShare = 0.1;
const kWildCapacity = 1500;
const kWildUid = 0x7fff0000;

function sproutFood(world: World): void {
  const params = world.params;
  if (!(params.foodSpreadRate > 0) && !(params.foodSproutRate > 0)) return;
  const items = world.food.items;
  const living = (): number => items.filter((pile) => pile.deadFor === undefined && pile.amount >= 1).length;
  const parents = items.filter(
    (pile) => !pile.infinite && pile.deadFor === undefined && (pile.capacity ?? 0) > 0 && pile.amount >= 1,
  );
  for (const parent of parents) {
    if (living() >= params.foodPileCap) return;
    const capacity = parent.capacity ?? 0;
    const chance = (params.foodSpreadRate / 60) * (parent.amount / capacity);
    if (randUnit(world.seed, parent.uid, world.tick, RandStream.FoodSprout) >= chance) continue;
    const angle = randRange(world.seed, parent.uid, world.tick, RandStream.FoodSproutPlace, -Math.PI, Math.PI);
    const reach = kSproutMinDistance + (kSproutMaxDistance - kSproutMinDistance) * randUnit(world.seed, parent.uid ^ 0x55aa, world.tick, RandStream.FoodSproutPlace);
    const pos = { x: parent.pos.x + Math.cos(angle) * reach, y: parent.pos.y + Math.sin(angle) * reach };
    plantPile(world, pos, Math.max(500, capacity * 0.5), parent.kind);
  }
  if (params.foodSproutRate > 0 && living() < params.foodPileCap) {
    const key = kWildUid;
    if (randUnit(world.seed, key, world.tick, RandStream.FoodSprout) < params.foodSproutRate / 60) {
      const pos = {
        x: randRange(world.seed, key, world.tick, RandStream.FoodSproutPlace, 30, world.size.x - 30),
        y: randRange(world.seed, key ^ 0x55aa, world.tick, RandStream.FoodSproutPlace, 30, world.size.y - 30),
      };
      const kind = Math.floor(randUnit(world.seed, key ^ 0x33cc, world.tick, RandStream.FoodSprout) * 3) as FoodKind;
      plantPile(world, pos, kWildCapacity, kind);
    }
  }
}

function plantPile(world: World, pos: { x: number; y: number }, capacity: number, kind: FoodKind): void {
  if (pos.x < 30 || pos.y < 30 || pos.x > world.size.x - 30 || pos.y > world.size.y - 30) return;
  if (isSolidAt(world.obstacles, pos)) return;
  for (const colony of world.colonies) {
    const keep = nestRadius(colony, world.params) * 3;
    if ((colony.nest.x - pos.x) ** 2 + (colony.nest.y - pos.y) ** 2 < keep * keep) return;
  }
  for (const pile of world.food.items) {
    if ((pile.pos.x - pos.x) ** 2 + (pile.pos.y - pos.y) ** 2 < kSproutPileGap * kSproutPileGap) return;
  }
  world.food.items.push({
    uid: world.food.nextUid++,
    pos,
    amount: Math.max(20, capacity * kSproutSeedShare),
    capacity,
    infinite: false,
    kind,
  });
}

// An ant eats its fill off a food pile, at the price of a meal at home (spec
// §5.6): the pile shrinks by what it eats. With the life cycle off, meals are free.
function eatAtPile(world: World, ant: number, pile: number): void {
  const params = world.params;
  const hunger = params.energyMax - world.ants.energy[ant];
  world.ants.energy[ant] = params.energyMax;
  if (params.lifeCycle && hunger > 0) world.food.eat(pile, hunger * params.foodPerEnergy);
}

// An ant at its own nest eats from the stores up to a full stomach. With the life
// cycle on the meal costs foodPerEnergy per unit of energy; when the stores run
// short it eats what is left, and an ant that cannot eat at all starves.
// Returns the energy eaten.
function eatAtNest(colony: Colony, ant: number, world: World): number {
  const ants = world.ants;
  const params = world.params;
  const hunger = params.energyMax - ants.energy[ant];
  if (!params.lifeCycle || params.foodPerEnergy <= 0) {
    ants.energy[ant] = params.energyMax;
    return Math.max(0, hunger);
  }
  if (hunger <= 0) return 0;
  const cost = hunger * params.foodPerEnergy;
  if (colony.foodPool >= cost) {
    colony.foodPool -= cost;
    ants.energy[ant] = params.energyMax;
    return hunger;
  }
  const eaten = colony.foodPool / params.foodPerEnergy;
  ants.energy[ant] += eaten;
  colony.foodPool = 0;
  return eaten;
}

// The queen lays at a steady rate that grows with the colony (more nurses), and
// only from food above the reserve, so a colony grows while food comes in faster
// than it is eaten and stops when it does not. The reserve is what lets a colony
// rebuild after losing ants.
function layEggs(world: World, colony: Colony): void {
  const params = world.params;
  // The queen sees how crowded the nest is: the more ants rest for lack of
  // work, the slower she lays (spec §5.8).
  const rate = (params.birthRateBase + params.birthRatePerAnt * colony.population) * layingFactor(colony, params);
  colony.birthCredit = Math.min(params.birthBurst, colony.birthCredit + rate / params.simHz);
  while (
    colony.birthCredit >= 1 &&
    colony.foodPool - params.spawnCost >= colonyReserve(colony, params) &&
    world.ants.size() < params.maxAntsTotal
  ) {
    colony.birthCredit -= 1;
    colony.foodPool -= params.spawnCost;
    const egg = spawnAtNest(world, colony);
    // A newborn starts in the nest and goes out when work calls it.
    // A newborn worker waits in the nest; a newborn warrior goes straight out on patrol.
    if (params.restAtHome && world.ants.role[egg] !== AntRole.Warrior) startResting(world, colony, egg);
  }
}

// The queen's laying multiplier (spec §5.8), the larger of two signals she
// senses in the nest:
// - food coming in per ant: 0 at or below layIncomeNone per ant per minute, 1
//   from layIncomeFull. When more ants no longer bring in more food, the share
//   per ant falls and so do births; the colony settles where its food supports it.
// - an empty nest: when nearly every ant has been called out to work (resting
//   share below layEmptyBelow, fading out by layEmptyUntil) there is more work
//   than workers. This is what grows a colony on far but rich food, where long
//   trips keep the food per ant low.
export function layingFactor(colony: Colony, params: SimParams): number {
  if (!params.restAtHome || colony.population <= 0) return 1;
  const perAnt = colony.incomePerMinute / colony.population;
  const incomeSpan = params.layIncomeFull - params.layIncomeNone;
  const income =
    incomeSpan > 0
      ? clamp01((perAnt - params.layIncomeNone) / incomeSpan)
      : perAnt >= params.layIncomeFull
        ? 1
        : 0;
  const share = colony.resting / colony.population;
  const emptySpan = params.layEmptyUntil - params.layEmptyBelow;
  const empty =
    emptySpan > 0 ? clamp01((params.layEmptyUntil - share) / emptySpan) : share < params.layEmptyBelow ? 1 : 0;
  return Math.max(income, empty);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// One tick of the smoothed income: an exponential average over kIncomeWindow s.
const kIncomeWindow = 60;
function updateIncome(colony: Colony, deliveredThisTick: number, simHz: number): void {
  const instant = deliveredThisTick * simHz * 60;
  colony.incomePerMinute += (instant - colony.incomePerMinute) / (kIncomeWindow * simHz);
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

export function removeDead(world: World): void {
  const ants = world.ants;
  const params = world.params;
  const fightDeaths: number[] = [];
  for (let index = ants.size() - 1; index >= 0; index--) {
    // Health is energy less wounds; without conflict there are no wounds.
    const starved = ants.energy[index] - ants.wounds[index] <= 0;
    const old = params.lifeCycle && ants.lifeLeft[index] <= 0;
    if (!starved && !old) continue;
    const killed = starved && params.conflict && ants.sinceHit[index] < kFightDeathWindow;
    const colony = world.colonies[ants.colony[index]];
    if (colony !== undefined) {
      colony.population -= 1;
      if (ants.state[index] === AntState.Resting) colony.resting -= 1;
      if (killed) colony.diedInFight += 1;
      else if (starved) colony.diedOfHunger += 1;
      else colony.diedOfAge += 1;
    }
    if (params.conflict) {
      // Every death leaves a body worth food, plus anything it was carrying (design §2).
      const carried = ants.state[index] === AntState.ReturningFood ? Math.max(1, ants.load[index]) : 0;
      world.corpses.add(
        ants.posX[index],
        ants.posY[index],
        ants.colony[index],
        ants.heading[index],
        params.corpseFood + carried,
        world.tick + Math.round(params.corpseLifetime * params.simHz),
      );
      if (killed) fightDeaths.push(ants.posX[index], ants.posY[index], ants.colony[index]);
    }
    ants.removeSwap(index);
  }
  if (!params.conflict) return;
  // Sisters who saw a nestmate killed nearby are frightened (design §6).
  const r2 = params.fearRadius * params.fearRadius;
  for (let d = 0; d < fightDeaths.length; d += 3) {
    for (let i = 0; i < ants.size(); i++) {
      if (ants.colony[i] !== fightDeaths[d + 2]) continue;
      const dx = ants.posX[i] - fightDeaths[d];
      const dy = ants.posY[i] - fightDeaths[d + 1];
      if (dx * dx + dy * dy <= r2) ants.fear[i] = Math.min(1, ants.fear[i] + params.sisterDeathFear);
    }
  }
  world.corpses.rebuild(world.size, world.tick);
}

export function updateStats(world: World): void {
  const sample = world.tick % world.params.simHz === 0;
  for (const colony of world.colonies) {
    if (sample) {
      colony.deliveredPerSecond.push(colony.deliveredLastSample);
      colony.deliveredLastSample = 0;
      colony.populationPerSecond.push(colony.population);
      colony.foodPoolPerSecond.push(colony.foodPool);
    }
    colony.extinct = colony.population === 0 && colony.foodPool < world.params.spawnCost;
  }
}
