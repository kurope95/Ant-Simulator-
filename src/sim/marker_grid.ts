import type { Vec2 } from "../core/vec2.js";
import type { SimParams } from "./params.js";
import { kNoOwner } from "./types.js";

export enum MarkerChannel {
  ToHome,
  ToFood,
  // Left by fighting ants; fades fast, never owns ground (conflict design §4).
  Battle,
}

// One layer per colony: layer `c` starts at c * (width * height), so every
// colony's trail survives its rivals' trails on the same cell.
export interface MarkerGrid {
  width: number;
  height: number;
  cell: number;
  colonies: number;
  owner: Int8Array; // derived by decayMarkers: the dominant colony, for drawing only
  toHome: Float32Array;
  toFood: Float32Array;
  battle: Float32Array;
  // Tick of the last deposit on each colony's cell, and the current tick, set by
  // the world each step: a cell nobody of its colony has walked for long dies.
  visited: Uint32Array;
  now: number;
  resize(worldSize: Vec2, cellSize: number, colonies?: number): void;
  cellIndex(pos: Vec2): number;
}

export function makeMarkerGrid(worldSize: Vec2, cellSize: number, colonies = 1): MarkerGrid {
  const grid: MarkerGrid = {
    width: 0,
    height: 0,
    cell: cellSize,
    colonies: 1,
    owner: new Int8Array(0),
    toHome: new Float32Array(0),
    toFood: new Float32Array(0),
    battle: new Float32Array(0),
    visited: new Uint32Array(0),
    now: 0,
    resize(size: Vec2, cell: number, layers = 1): void {
      this.cell = cell;
      this.width = Math.ceil(size.x / cell);
      this.height = Math.ceil(size.y / cell);
      this.colonies = Math.max(1, Math.floor(layers));
      const cells = this.width * this.height;
      this.owner = new Int8Array(cells);
      this.owner.fill(kNoOwner);
      this.toHome = new Float32Array(cells * this.colonies);
      this.toFood = new Float32Array(cells * this.colonies);
      this.battle = new Float32Array(cells * this.colonies);
      this.visited = new Uint32Array(cells * this.colonies);
    },
    cellIndex(pos: Vec2): number {
      if (pos.x < 0 || pos.y < 0 || pos.x >= this.width * this.cell || pos.y >= this.height * this.cell) {
        return -1;
      }
      const col = Math.floor(pos.x / this.cell);
      const row = Math.floor(pos.y / this.cell);
      return row * this.width + col;
    },
  };
  grid.resize(worldSize, cellSize, colonies);
  return grid;
}

export function homeAt(grid: MarkerGrid, colony: number, cell: number): number {
  if (cell < 0 || colony < 0 || colony >= grid.colonies) return 0;
  return grid.toHome[colony * grid.width * grid.height + cell];
}

export function foodAt(grid: MarkerGrid, colony: number, cell: number): number {
  if (cell < 0 || colony < 0 || colony >= grid.colonies) return 0;
  return grid.toFood[colony * grid.width * grid.height + cell];
}

export function battleAt(grid: MarkerGrid, colony: number, cell: number): number {
  if (cell < 0 || colony < 0 || colony >= grid.colonies) return 0;
  return grid.battle[colony * grid.width * grid.height + cell];
}

export function emissionStrength(timeSinceAnchor: number, params: SimParams): number {
  return Math.exp(-timeSinceAnchor * params.emissionDecay);
}

export function deposit(
  grid: MarkerGrid,
  cell: number,
  colony: number,
  channel: MarkerChannel,
  strength: number,
  params: SimParams,
): void {
  if (colony < 0 || colony >= grid.colonies) return;
  const cells = grid.width * grid.height;
  if (channel === MarkerChannel.Battle) {
    const index = colony * cells + cell;
    grid.battle[index] = Math.max(grid.battle[index], strength);
    return;
  }
  if (params.territoryRule) {
    // Territory wears rival layers down at the deposit cell, but a rival's
    // trail never stops the depositor from laying its own.
    const keep = 1 - strength * params.foreignErasureFactor;
    for (let other = 0; other < grid.colonies; other++) {
      if (other === colony) continue;
      const index = other * cells + cell;
      grid.toHome[index] *= keep;
      grid.toFood[index] *= keep;
    }
  }
  const values = channel === MarkerChannel.ToHome ? grid.toHome : grid.toFood;
  const index = colony * cells + cell;
  grid.visited[index] = grid.now;
  if (params.trailRefresh < 1) {
    // Each ant moves the cell part of the way toward its own strength (spec
    // §4.2): one ant slows the fading by its share, a busy column stays near
    // full, and no ant makes a trail stronger than its own scent.
    const value = values[index];
    if (strength > value) values[index] = value + params.trailRefresh * (strength - value);
  } else {
    values[index] = Math.max(values[index], strength);
  }
}

export function degrade(
  grid: MarkerGrid,
  cell: number,
  colony: number,
  channel: MarkerChannel,
  factor: number,
): void {
  if (colony < 0 || colony >= grid.colonies) return;
  if (channel === MarkerChannel.Battle) return;
  const values = channel === MarkerChannel.ToHome ? grid.toHome : grid.toFood;
  const index = colony * grid.width * grid.height + cell;
  values[index] *= factor;
}

// Battle smell fades on its own, faster clock. Skipped while it is all zero.
export function decayBattle(grid: MarkerGrid, factor: number, eps: number): void {
  const battle = grid.battle;
  for (let i = 0; i < battle.length; i++) {
    const value = battle[i];
    if (value === 0) continue;
    const next = value * factor;
    battle[i] = next < eps ? 0 : next;
  }
}

// Each colony's strength on the cell being recomputed by decayMarkers: the larger of its two channels.
let strengthScratch = new Float64Array(0);

// maxAgeTicks > 0: a cell no ant of its colony has deposited on for longer is
// wiped, however strong it still was (spec §4.2). 0 keeps fading only.
export function decayMarkers(
  grid: MarkerGrid,
  factor: number,
  eps: number,
  flipMargin: number,
  maxAgeTicks = 0,
): void {
  const cells = grid.width * grid.height;
  const { colonies, owner, toHome, toFood, visited, now } = grid;
  const aged = maxAgeTicks > 0 && now > maxAgeTicks;
  if (colonies === 1) {
    // The overwhelmingly common case: one layer, so the argmax is trivial and
    // the loop stays one pass over the cells.
    for (let cell = 0; cell < cells; cell++) {
      let home = toHome[cell] * factor;
      let food = toFood[cell] * factor;
      if (home < eps) home = 0;
      if (food < eps) food = 0;
      if (aged && now - visited[cell] > maxAgeTicks) {
        home = 0;
        food = 0;
      }
      toHome[cell] = home;
      toFood[cell] = food;
      owner[cell] = home === 0 && food === 0 ? kNoOwner : 0;
    }
    return;
  }
  if (strengthScratch.length < colonies) strengthScratch = new Float64Array(colonies);
  const strength = strengthScratch;
  for (let cell = 0; cell < cells; cell++) {
    // Most of the map holds no scent at all: such a cell stays empty and unowned.
    let any = false;
    for (let index = cell; index < cells * colonies; index += cells) {
      if (toHome[index] !== 0 || toFood[index] !== 0) {
        any = true;
        break;
      }
    }
    if (!any) {
      owner[cell] = kNoOwner;
      continue;
    }
    let strongest = 0;
    let strongestColony = kNoOwner;
    for (let colony = 0; colony < colonies; colony++) {
      const index = colony * cells + cell;
      let home = toHome[index] * factor;
      let food = toFood[index] * factor;
      if (home < eps) home = 0;
      if (food < eps) food = 0;
      if (aged && now - visited[index] > maxAgeTicks) {
        home = 0;
        food = 0;
      }
      toHome[index] = home;
      toFood[index] = food;
      const value = home > food ? home : food;
      strength[colony] = value;
      if (value > strongest) {
        strongest = value;
        strongestColony = colony;
      }
    }
    // Ownership has hysteresis: the owner keeps the cell until a rival is at least
    // flipMargin times its strength. An unowned cell, or one whose owner has faded
    // to nothing, goes to the strongest colony.
    let next = strongestColony;
    const current = owner[cell];
    if (current !== kNoOwner && current < colonies && strength[current] > 0) {
      let rival = 0;
      let rivalColony = kNoOwner;
      for (let colony = 0; colony < colonies; colony++) {
        if (colony !== current && strength[colony] > rival) {
          rival = strength[colony];
          rivalColony = colony;
        }
      }
      next = rivalColony !== kNoOwner && rival >= flipMargin * strength[current] ? rivalColony : current;
    }
    owner[cell] = next;
  }
}
