import type { Vec2 } from "../core/vec2.js";
import { foodRadius } from "./food.js";
import { defaultParams } from "./params.js";
import { COLONY_PALETTE, firstFreeColor } from "./palette.js";
import { kMaxColonies } from "./types.js";

export enum FoodKind {
  Seeds = 0,
  Berries = 1,
  Leaves = 2,
}

export enum ObstacleKind {
  None = 0,
  Rock = 1,
  Water = 2,
  Sand = 3,
  Mud = 4,
}

export const kSetupObstacleCell = 4;
export const kMinStartingAnts = 10;
export const kMaxStartingAnts = 600;
export const kDefaultStartingAnts = 200;
export const kStartingAntsStep = 10;
export const kMinFoodAmount = 500;
export const kMaxFoodAmount = 20000;
export const kDefaultFoodAmount = 4000;
export const kFoodAmountStep = 500;
export const kMinBrushRadius = 8;
export const kMaxBrushRadius = 64;
export const kMinNestSpacing = 96;
export const kMinNestEdge = 24;

export interface ColonySetup {
  id: number;
  nest: Vec2;
  color: number;
  startingAnts: number;
}

export interface FoodSetup {
  uid: number;
  pos: Vec2;
  amount: number;
  kind: FoodKind;
}

export interface ObstacleCells {
  cell: number;
  width: number;
  height: number;
  kind: Uint8Array;
}

export interface WorldSetup {
  presetId: string;
  seed: number;
  size: Vec2;
  colonies: ColonySetup[];
  food: FoodSetup[];
  obstacles: ObstacleCells;
  nextFoodUid: number;
}

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, value));
}

function clampInt(value: number, lo: number, hi: number): number {
  return Math.trunc(clamp(value, lo, hi));
}

export function makeObstacleCells(size: Vec2, cell = kSetupObstacleCell): ObstacleCells {
  const cellSize = Number.isFinite(cell) && cell > 0 ? cell : kSetupObstacleCell;
  const w = Number.isFinite(size.x) && size.x > 0 ? size.x : 1;
  const h = Number.isFinite(size.y) && size.y > 0 ? size.y : 1;
  const width = Math.max(1, Math.ceil(w / cellSize));
  const height = Math.max(1, Math.ceil(h / cellSize));
  return { cell: cellSize, width, height, kind: new Uint8Array(width * height) };
}

export function makeSetup(size: Vec2, seed: number, presetId = "blank"): WorldSetup {
  const worldSize = {
    x: Number.isFinite(size.x) && size.x > 0 ? size.x : 1,
    y: Number.isFinite(size.y) && size.y > 0 ? size.y : 1,
  };
  return {
    presetId,
    seed: seed >>> 0,
    size: worldSize,
    colonies: [],
    food: [],
    obstacles: makeObstacleCells(worldSize),
    nextFoodUid: 1,
  };
}

export function cloneSetup(setup: WorldSetup): WorldSetup {
  return {
    presetId: setup.presetId,
    seed: setup.seed,
    size: { x: setup.size.x, y: setup.size.y },
    colonies: setup.colonies.map((colony) => ({
      id: colony.id,
      nest: { x: colony.nest.x, y: colony.nest.y },
      color: colony.color,
      startingAnts: colony.startingAnts,
    })),
    food: setup.food.map((source) => ({
      uid: source.uid,
      pos: { x: source.pos.x, y: source.pos.y },
      amount: source.amount,
      kind: source.kind,
    })),
    obstacles: {
      cell: setup.obstacles.cell,
      width: setup.obstacles.width,
      height: setup.obstacles.height,
      kind: new Uint8Array(setup.obstacles.kind),
    },
    nextFoodUid: setup.nextFoodUid,
  };
}

export function cellKindAt(setup: WorldSetup, p: Vec2): ObstacleKind {
  const grid = setup.obstacles;
  const col = Math.floor(p.x / grid.cell);
  const row = Math.floor(p.y / grid.cell);
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return ObstacleKind.None;
  const value = grid.kind[row * grid.width + col];
  return value >= ObstacleKind.None && value <= ObstacleKind.Mud ? value : ObstacleKind.None;
}

export function paintCells(setup: WorldSetup, kind: ObstacleKind, center: Vec2, radius: number): number {
  const r = clamp(radius, kMinBrushRadius, kMaxBrushRadius);
  const grid = setup.obstacles;
  const minCol = Math.max(0, Math.floor((center.x - r) / grid.cell));
  const maxCol = Math.min(grid.width - 1, Math.floor((center.x + r) / grid.cell));
  const minRow = Math.max(0, Math.floor((center.y - r) / grid.cell));
  const maxRow = Math.min(grid.height - 1, Math.floor((center.y + r) / grid.cell));
  let changed = 0;
  const rSq = r * r;
  for (let row = minRow; row <= maxRow; row++) {
    const cy = (row + 0.5) * grid.cell;
    for (let col = minCol; col <= maxCol; col++) {
      const cx = (col + 0.5) * grid.cell;
      const dx = cx - center.x;
      const dy = cy - center.y;
      if (dx * dx + dy * dy > rSq) continue;
      const index = row * grid.width + col;
      if (grid.kind[index] === kind) continue;
      grid.kind[index] = kind;
      changed++;
    }
  }
  return changed;
}

function colonyIndex(setup: WorldSetup, id: number): number {
  return Number.isInteger(id) && id >= 0 && id < setup.colonies.length && setup.colonies[id].id === id ? id : -1;
}

export function addColony(
  setup: WorldSetup,
  nest: Vec2,
  color?: number,
  startingAnts = kDefaultStartingAnts,
): ColonySetup | null {
  if (setup.colonies.length >= kMaxColonies) return null;
  const used = setup.colonies.map((colony) => colony.color);
  const colorIndex = color === undefined
    ? firstFreeColor(used)
    : clampInt(color, 0, COLONY_PALETTE.length - 1);
  const colony: ColonySetup = {
    id: setup.colonies.length,
    nest: {
      x: clamp(nest.x, 0, setup.size.x),
      y: clamp(nest.y, 0, setup.size.y),
    },
    color: colorIndex,
    startingAnts: clampInt(startingAnts, kMinStartingAnts, kMaxStartingAnts),
  };
  setup.colonies.push(colony);
  return colony;
}

export function removeColony(setup: WorldSetup, id: number): boolean {
  const index = colonyIndex(setup, id);
  if (index < 0) return false;
  setup.colonies.splice(index, 1);
  for (let i = 0; i < setup.colonies.length; i++) setup.colonies[i].id = i;
  return true;
}

export function moveColony(setup: WorldSetup, id: number, nest: Vec2): boolean {
  const index = colonyIndex(setup, id);
  if (index < 0) return false;
  setup.colonies[index].nest = {
    x: clamp(nest.x, 0, setup.size.x),
    y: clamp(nest.y, 0, setup.size.y),
  };
  return true;
}

export function setColonyColor(setup: WorldSetup, id: number, color: number): boolean {
  const index = colonyIndex(setup, id);
  if (index < 0) return false;
  setup.colonies[index].color = clampInt(color, 0, COLONY_PALETTE.length - 1);
  return true;
}

export function setColonyStartingAnts(setup: WorldSetup, id: number, count: number): boolean {
  const index = colonyIndex(setup, id);
  if (index < 0) return false;
  setup.colonies[index].startingAnts = clampInt(count, kMinStartingAnts, kMaxStartingAnts);
  return true;
}

function clampFoodAmount(amount: number): number {
  return clampInt(amount, kMinFoodAmount, kMaxFoodAmount);
}

function clampFoodKind(kind: FoodKind): FoodKind {
  return clampInt(kind, FoodKind.Seeds, FoodKind.Leaves) as FoodKind;
}

export function addFood(setup: WorldSetup, pos: Vec2, amount: number, kind: FoodKind): FoodSetup {
  const source: FoodSetup = {
    uid: setup.nextFoodUid++,
    pos: {
      x: clamp(pos.x, 0, setup.size.x),
      y: clamp(pos.y, 0, setup.size.y),
    },
    amount: clampFoodAmount(amount),
    kind: clampFoodKind(kind),
  };
  setup.food.push(source);
  return source;
}

function foodIndex(setup: WorldSetup, uid: number): number {
  return setup.food.findIndex((source) => source.uid === uid);
}

export function removeFood(setup: WorldSetup, uid: number): boolean {
  const index = foodIndex(setup, uid);
  if (index < 0) return false;
  setup.food.splice(index, 1);
  return true;
}

export function moveFood(setup: WorldSetup, uid: number, pos: Vec2): boolean {
  const index = foodIndex(setup, uid);
  if (index < 0) return false;
  setup.food[index].pos = {
    x: clamp(pos.x, 0, setup.size.x),
    y: clamp(pos.y, 0, setup.size.y),
  };
  return true;
}

export function setFoodKind(setup: WorldSetup, uid: number, kind: FoodKind): boolean {
  const index = foodIndex(setup, uid);
  if (index < 0) return false;
  setup.food[index].kind = clampFoodKind(kind);
  return true;
}

export function setFoodAmount(setup: WorldSetup, uid: number, amount: number): boolean {
  const index = foodIndex(setup, uid);
  if (index < 0) return false;
  setup.food[index].amount = clampFoodAmount(amount);
  return true;
}

function blockedAt(setup: WorldSetup, pos: Vec2, radius: number): boolean {
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const kind = cellKindAt(setup, {
      x: pos.x + Math.cos(angle) * radius,
      y: pos.y + Math.sin(angle) * radius,
    });
    if (kind === ObstacleKind.Rock || kind === ObstacleKind.Water) return true;
  }
  const centre = cellKindAt(setup, pos);
  return centre === ObstacleKind.Rock || centre === ObstacleKind.Water;
}

export function validateSetup(setup: WorldSetup): string | null {
  if (setup.colonies.length === 0) return "Add at least one colony.";
  if (setup.food.length === 0) return "Place at least one food source.";

  for (const colony of setup.colonies) {
    if (
      colony.nest.x < kMinNestEdge ||
      colony.nest.x > setup.size.x - kMinNestEdge ||
      colony.nest.y < kMinNestEdge ||
      colony.nest.y > setup.size.y - kMinNestEdge
    ) {
      return "Move a colony inside the world.";
    }
  }

  for (const colony of setup.colonies) {
    if (blockedAt(setup, colony.nest, kMinNestEdge)) return "Move a colony off rock or water.";
  }

  const params = defaultParams();
  for (const source of setup.food) {
    const radius = foodRadius({ pos: source.pos, amount: source.amount, infinite: false }, params);
    if (blockedAt(setup, source.pos, radius)) return "Move food off rock or water.";
  }

  const spacingSq = kMinNestSpacing * kMinNestSpacing;
  for (let i = 0; i < setup.colonies.length; i++) {
    for (let j = i + 1; j < setup.colonies.length; j++) {
      const a = setup.colonies[i].nest;
      const b = setup.colonies[j].nest;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy < spacingSq) return "Nests are too close together.";
    }
  }

  return null;
}
