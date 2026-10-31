import { randUnit } from "../core/rng.js";
import { guardRadius } from "./colony.js";
import type { ChunkEvents } from "./events.js";
import { MarkerChannel } from "./marker_grid.js";
import { AntRole, AntState, Combat, kNoFoe, kNoOwner, RandStream } from "./types.js";
import type { World } from "./world.js";

// Colony conflict, docs/superpowers/specs/2026-10-31-colony-conflict-design.md.
// The look-around pass reads start-of-tick state for every ant and writes only
// scratch slots, so the fight decisions in Think do not depend on ant order.

// A trail counts on a cell from this strength, for "own ground" and "contested".
const kGroundMin = 0.05;
// Seconds after a bite during which a death counts as killed in a fight.
export const kFightDeathWindow = 5;

export interface LookAround {
  active: boolean;
  sisters: Uint16Array;
  rivals: Uint16Array;
  // Nearest rival within oddsRadius, or -1.
  rival: Int32Array;
  rivalX: Float32Array;
  rivalY: Float32Array;
  // The ant's foe this tick, or -1 when it has none or the foe is dead.
  foe: Int32Array;
  foeX: Float32Array;
  foeY: Float32Array;
  counts: Int32Array;
}

export function makeLookAround(): LookAround {
  return {
    active: false,
    sisters: new Uint16Array(0),
    rivals: new Uint16Array(0),
    rival: new Int32Array(0),
    rivalX: new Float32Array(0),
    rivalY: new Float32Array(0),
    foe: new Int32Array(0),
    foeX: new Float32Array(0),
    foeY: new Float32Array(0),
    counts: new Int32Array(3),
  };
}

function ensure(look: LookAround, n: number): void {
  if (look.rival.length >= n) return;
  const size = Math.max(64, n * 2);
  look.sisters = new Uint16Array(size);
  look.rivals = new Uint16Array(size);
  look.rival = new Int32Array(size);
  look.rivalX = new Float32Array(size);
  look.rivalY = new Float32Array(size);
  look.foe = new Int32Array(size);
  look.foeX = new Float32Array(size);
  look.foeY = new Float32Array(size);
}

// Fighting needs at least two colonies; with one, the pass is skipped entirely.
export function computeLookAround(world: World, look: LookAround): void {
  const ants = world.ants;
  const params = world.params;
  const n = ants.size();
  look.active = params.conflict && world.colonies.length > 1;
  if (!look.active) return;
  ensure(look, n);
  const { posX, posY, colony } = ants;
  for (let i = 0; i < n; i++) {
    // A headcount and the nearest rival are all the fight rules need.
    world.spatialHash.countGroups(posX[i], posY[i], params.oddsRadius, posX, posY, i, colony, colony[i], look.counts);
    const rival = look.counts[2];
    look.sisters[i] = Math.min(look.counts[0], 0xffff);
    look.rivals[i] = Math.min(look.counts[1], 0xffff);
    look.rival[i] = rival;
    look.rivalX[i] = rival >= 0 ? posX[rival] : 0;
    look.rivalY[i] = rival >= 0 ? posY[rival] : 0;
    let foe = -1;
    if (ants.foe[i] !== kNoFoe) {
      const index = ants.indexOf(ants.foe[i]);
      if (index !== null) foe = index;
    }
    look.foe[i] = foe;
    look.foeX[i] = foe >= 0 ? posX[foe] : 0;
    look.foeY[i] = foe >= 0 ? posY[foe] : 0;
  }
}

// Hunger makes an ant bold, fear makes it careful (design §6); kept within 0..2.
// The aggression dial scales it for every ant: at 0 nobody starts a fight,
// answers battle smell or stands its ground when outnumbered (nests are still
// defended); at 3 everyone is three times as bold.
export function courage(world: World, ant: number): number {
  const params = world.params;
  const mood = 1 + params.boldStress * world.ants.stress[ant] - params.fearDamp * world.ants.fear[ant];
  const value = mood * params.aggression;
  return value < 0 ? 0 : value > 3 ? 3 : value;
}

// A fixed per-ant draw: low values answer calls and engage first.
export function boldness(world: World, ant: number): number {
  return randUnit(world.seed, world.ants.uid[ant], 0, RandStream.Boldness);
}

export function health(world: World, ant: number): number {
  return world.ants.energy[ant] - world.ants.wounds[ant];
}

// Whether this ant follows its colony's battle smell right now (design §4).
export function answersCall(world: World, ant: number): boolean {
  const ants = world.ants;
  const params = world.params;
  if (ants.combat[ant] !== Combat.None) return false;
  const share =
    ants.role[ant] === AntRole.Warrior
      ? params.warriorCall
      : ants.state[ant] === AntState.Foraging
        ? params.workerCall
        : 0;
  return share > 0 && boldness(world, ant) < share * courage(world, ant);
}

interface Ground {
  own: boolean;
  contested: boolean;
}

function groundAt(world: World, ant: number): Ground {
  const grid = world.markers;
  const cell = grid.cellIndex({ x: world.ants.posX[ant], y: world.ants.posY[ant] });
  if (cell < 0) return { own: false, contested: false };
  const colony = world.ants.colony[ant];
  const cells = grid.width * grid.height;
  let ownStrength = 0;
  let rivalStrength = 0;
  for (let c = 0; c < grid.colonies; c++) {
    const index = c * cells + cell;
    const strength = Math.max(grid.toHome[index], grid.toFood[index]);
    if (c === colony) ownStrength = strength;
    else if (strength > rivalStrength) rivalStrength = strength;
  }
  const owner = grid.owner[cell];
  return {
    own: owner === colony && ownStrength >= kGroundMin,
    contested: owner !== kNoOwner && ownStrength >= kGroundMin && rivalStrength >= kGroundMin,
  };
}

function insideOwnRing(world: World, ant: number, x: number, y: number): boolean {
  const colony = world.colonies[world.ants.colony[ant]];
  if (colony === undefined) return false;
  const r = guardRadius(colony, world.params);
  const dx = x - colony.nest.x;
  const dy = y - colony.nest.y;
  return dx * dx + dy * dy <= r * r;
}

function startRetreat(world: World, ant: number): void {
  const ants = world.ants;
  ants.combat[ant] = Combat.Retreat;
  ants.combatTimer[ant] = world.params.retreatTime;
  ants.foe[ant] = kNoFoe;
  // A worker that was not carrying heads home to eat and heal; a carrier keeps its load.
  if (ants.state[ant] === AntState.Foraging) ants.state[ant] = AntState.ReturningExhausted;
}

// A fight ends (foe gone, out of reach, or never caught): the ant goes back to
// its job and cools down, so it does not at once pick the same runner up again
// and a crowd does not chase one ant across the map.
function stopFighting(world: World, ant: number): void {
  world.ants.combat[ant] = Combat.Cooldown;
  world.ants.combatTimer[ant] = world.params.fightCooldown;
  world.ants.foe[ant] = kNoFoe;
}

export interface CombatSteer {
  // The heading the fight wants, or null to steer normally.
  heading: number | null;
  // True while the ant stands its ground (facing off or biting).
  hold: boolean;
}

const kFree: CombatSteer = { heading: null, hold: false };

// One ant's fight step for this tick (design §4). Writes only the ant's own
// slots and its chunk's event list.
export function combatStep(world: World, ant: number, look: LookAround, dt: number, out: ChunkEvents): CombatSteer {
  if (!look.active) return kFree;
  const ants = world.ants;
  const params = world.params;
  const x = ants.posX[ant];
  const y = ants.posY[ant];
  const brave = courage(world, ant);
  const sisters = look.sisters[ant];
  const rivals = look.rivals[ant];
  const weak =
    health(world, ant) < params.retreatHealth * params.energyMax || ants.energy[ant] < 0.25 * params.energyMax;
  const outnumbered = rivals > (sisters + 1) * params.retreatOdds * brave;
  const defending = insideOwnRing(world, ant, x, y);
  ants.combatTimer[ant] -= dt;

  const state = ants.combat[ant];
  if (state === Combat.Cooldown) {
    if (ants.combatTimer[ant] <= 0) ants.combat[ant] = Combat.None;
    return kFree;
  }
  if (state === Combat.Retreat) {
    if (ants.combatTimer[ant] <= 0) {
      ants.combat[ant] = Combat.None;
      return kFree;
    }
    const r = look.rival[ant];
    if (r < 0) return kFree;
    return { heading: Math.atan2(y - look.rivalY[ant], x - look.rivalX[ant]), hold: false };
  }

  if (state === Combat.Standoff || state === Combat.Fight) {
    const foe = look.foe[ant];
    if (foe < 0) {
      stopFighting(world, ant);
      return kFree;
    }
    const dx = look.foeX[ant] - x;
    const dy = look.foeY[ant] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > params.loseRadius * params.loseRadius) {
      stopFighting(world, ant);
      return kFree;
    }
    // Before blows an outnumbered ant backs off; once biting has started it
    // fights it out and breaks off only when badly hurt (Marek, 2026-10-31:
    // runners dragged crowds of chasers across the map).
    if (weak || (state === Combat.Standoff && outnumbered && !defending)) {
      startRetreat(world, ant);
      return { heading: Math.atan2(-dy, -dx), hold: false };
    }
    const heading = Math.atan2(dy, dx);
    const touch = 2 * params.antRadius + params.biteReach;
    if (state === Combat.Standoff) {
      if (ants.combatTimer[ant] <= 0) {
        ants.combat[ant] = Combat.Fight;
        ants.combatTimer[ant] = params.chaseTime;
      }
      return { heading, hold: d2 <= (touch + 4) * (touch + 4) };
    }
    if (d2 <= touch * touch) {
      ants.combatTimer[ant] = params.chaseTime;
      const damage = params.biteDps * dt * (ants.role[ant] === AntRole.Warrior ? params.warriorDamage : 1);
      out.attacks.push({ attacker: ant, victim: foe, damage });
      const cell = world.markers.cellIndex({ x, y });
      if (cell >= 0) {
        out.deposits.push({ cell, colony: ants.colony[ant], channel: MarkerChannel.Battle, strength: 1 });
      }
      return { heading, hold: true };
    }
    // A foe that keeps out of reach is let go after chaseTime.
    if (ants.combatTimer[ant] <= 0) {
      stopFighting(world, ant);
      return kFree;
    }
    return { heading, hold: false };
  }

  // Not fighting: does anything set a fight off?
  const r = look.rival[ant];
  if (r < 0 || weak || ants.state[ant] === AntState.ReturningFood) return kFree;
  const dx = look.rivalX[ant] - x;
  const dy = look.rivalY[ant] - y;
  const d2 = dx * dx + dy * dy;
  if (d2 > params.engageRadius * params.engageRadius) return kFree;
  const bold = boldness(world, ant);
  const raider = insideOwnRing(world, ant, look.rivalX[ant], look.rivalY[ant]);
  const warrior = ants.role[ant] === AntRole.Warrior;
  let engage = false;
  if (raider) {
    // Raid on the nest: warriors and workers alike, no numbers needed.
    engage = bold < 0.9 * Math.max(brave, 0.5);
  } else if (warrior) {
    const ground = groundAt(world, ant);
    const trigger = ants.role[r] === AntRole.Warrior || ground.own || ground.contested;
    engage = trigger && bold < 0.9 * brave;
  } else if (ants.state[ant] === AntState.Foraging) {
    // A worker heading out fights only a rival in its way, with backup.
    const block = 4 * params.antRadius + params.biteReach;
    const ahead = dx * Math.cos(ants.heading[ant]) + dy * Math.sin(ants.heading[ant]);
    if (d2 <= block * block && ahead > 0.7 * Math.sqrt(d2)) {
      const ground = groundAt(world, ant);
      engage =
        (ground.own || ground.contested) &&
        sisters + 1 >= rivals * params.workerOdds / Math.max(brave, 0.1) &&
        bold < params.workerEngage * brave;
    }
  }
  if (!engage) return kFree;
  ants.foe[ant] = ants.uid[r];
  ants.combat[ant] = raider ? Combat.Fight : Combat.Standoff;
  ants.combatTimer[ant] = raider ? params.chaseTime : params.standoffTime;
  return { heading: Math.atan2(dy, dx), hold: false };
}
