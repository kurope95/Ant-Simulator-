import type { Vec2 } from "../core/vec2.js";
import type { SimParams } from "./params.js";
import { kNoOwner } from "./types.js";

export enum MarkerChannel {
  ToHome,
  ToFood,
}

export interface MarkerGrid {
  width: number;
  height: number;
  cell: number;
  owner: Int8Array;
  toHome: Float32Array;
  toFood: Float32Array;
  resize(worldSize: Vec2, cellSize: number): void;
  cellIndex(pos: Vec2): number;
}

export function makeMarkerGrid(worldSize: Vec2, cellSize: number): MarkerGrid {
  const grid: MarkerGrid = {
    width: 0,
    height: 0,
    cell: cellSize,
    owner: new Int8Array(0),
    toHome: new Float32Array(0),
    toFood: new Float32Array(0),
    resize(size: Vec2, cell: number): void {
      this.cell = cell;
      this.width = Math.ceil(size.x / cell);
      this.height = Math.ceil(size.y / cell);
      const cells = this.width * this.height;
      this.owner = new Int8Array(cells);
      this.owner.fill(kNoOwner);
      this.toHome = new Float32Array(cells);
      this.toFood = new Float32Array(cells);
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
  grid.resize(worldSize, cellSize);
  return grid;
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
  _params: SimParams,
): void {
  if (grid.owner[cell] !== colony && grid.owner[cell] !== kNoOwner) return;
  grid.owner[cell] = colony;
  const values = channel === MarkerChannel.ToHome ? grid.toHome : grid.toFood;
  values[cell] = Math.max(values[cell], strength);
}

export function degrade(
  grid: MarkerGrid,
  cell: number,
  colony: number,
  channel: MarkerChannel,
  factor: number,
): void {
  if (grid.owner[cell] !== colony) return;
  const values = channel === MarkerChannel.ToHome ? grid.toHome : grid.toFood;
  values[cell] *= factor;
}

export function decayMarkers(grid: MarkerGrid, factor: number, eps: number): void {
  for (let i = 0; i < grid.owner.length; i++) {
    let home = grid.toHome[i] * factor;
    let food = grid.toFood[i] * factor;
    if (home < eps) home = 0;
    if (food < eps) food = 0;
    grid.toHome[i] = home;
    grid.toFood[i] = food;
    if (home === 0 && food === 0) grid.owner[i] = kNoOwner;
  }
}
