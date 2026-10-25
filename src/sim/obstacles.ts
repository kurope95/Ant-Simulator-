import type { Vec2 } from "../core/vec2.js";
import { ObstacleKind, type ObstacleCells } from "./setup.js";

export const kSandSpeedFactor = 0.6;
export const kMudSpeedFactor = 0.45;

export interface ObstacleGrid {
  cell: number;
  width: number;
  height: number;
  size: Vec2;
  kind: Uint8Array;
  border: Uint8Array;
  nearSolid: Uint8Array;
}

function solidKind(kind: number): boolean {
  return kind === ObstacleKind.Rock || kind === ObstacleKind.Water;
}

function gridSize(width: number, height: number, cell: number): Vec2 {
  return { x: width * cell, y: height * cell };
}

export function makeObstacleGrid(size: Vec2, cell: number): ObstacleGrid {
  const scale = Number.isFinite(cell) && cell > 0 ? cell : 4;
  const worldW = Number.isFinite(size.x) && size.x > 0 ? size.x : 1;
  const worldH = Number.isFinite(size.y) && size.y > 0 ? size.y : 1;
  const width = Math.max(1, Math.ceil(worldW / scale));
  const height = Math.max(1, Math.ceil(worldH / scale));
  return {
    cell: scale,
    width,
    height,
    size: gridSize(width, height, scale),
    kind: new Uint8Array(width * height),
    border: new Uint8Array(width * height),
    nearSolid: new Uint8Array(width * height),
  };
}

export function obstacleGridFromCells(cells: ObstacleCells): ObstacleGrid {
  const width = Math.max(1, cells.width);
  const height = Math.max(1, cells.height);
  const grid: ObstacleGrid = {
    cell: cells.cell,
    width,
    height,
    size: gridSize(width, height, cells.cell),
    kind: new Uint8Array(cells.kind),
    border: new Uint8Array(width * height),
    nearSolid: new Uint8Array(width * height),
  };
  rebuildBorder(grid);
  return grid;
}

export function rebuildBorder(grid: ObstacleGrid): void {
  const { width, height, kind, border, nearSolid } = grid;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      let near = 0;
      for (let r = Math.max(0, row - 1); r <= Math.min(height - 1, row + 1) && near === 0; r++) {
        for (let c = Math.max(0, col - 1); c <= Math.min(width - 1, col + 1); c++) {
          if (solidKind(kind[r * width + c])) {
            near = 1;
            break;
          }
        }
      }
      nearSolid[index] = near;
      if (!solidKind(kind[index])) {
        border[index] = 0;
        continue;
      }
      const openLeft = col === 0 || !solidKind(kind[index - 1]);
      const openRight = col === width - 1 || !solidKind(kind[index + 1]);
      const openUp = row === 0 || !solidKind(kind[index - width]);
      const openDown = row === height - 1 || !solidKind(kind[index + width]);
      border[index] = openLeft || openRight || openUp || openDown ? 1 : 0;
    }
  }
}

export function isSolidCell(grid: ObstacleGrid, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return true;
  return solidKind(grid.kind[row * grid.width + col]);
}

export function isSolidAt(grid: ObstacleGrid, p: Vec2): boolean {
  return isSolidCell(grid, Math.floor(p.x / grid.cell), Math.floor(p.y / grid.cell));
}

function cellKindAtPoint(grid: ObstacleGrid, p: Vec2): ObstacleKind {
  const col = Math.floor(p.x / grid.cell);
  const row = Math.floor(p.y / grid.cell);
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return ObstacleKind.None;
  const kind = grid.kind[row * grid.width + col];
  return kind >= ObstacleKind.None && kind <= ObstacleKind.Mud ? kind : ObstacleKind.None;
}

export function speedFactorAt(grid: ObstacleGrid, p: Vec2): number {
  const kind = cellKindAtPoint(grid, p);
  if (kind === ObstacleKind.Rock || kind === ObstacleKind.Water) return 0;
  if (kind === ObstacleKind.Sand) return kSandSpeedFactor;
  if (kind === ObstacleKind.Mud) return kMudSpeedFactor;
  return 1;
}

export function freeDistance(
  grid: ObstacleGrid,
  origin: Vec2,
  angle: number,
  maxDist: number,
): number {
  return freeDistanceDir(grid, origin, Math.cos(angle), Math.sin(angle), maxDist);
}

// Same walk for callers that already hold the unit direction, so ray fans
// compute their trigonometry once instead of once per probe.
export function freeDistanceDir(
  grid: ObstacleGrid,
  origin: Vec2,
  unitX: number,
  unitY: number,
  maxDist: number,
): number {
  if (!(maxDist > 0)) return 0;
  const col0 = Math.floor(origin.x / grid.cell);
  const row0 = Math.floor(origin.y / grid.cell);
  if (isSolidCell(grid, col0, row0)) return 0;

  const dirX = unitX * maxDist;
  const dirY = unitY * maxDist;
  let col = col0;
  let row = row0;
  const stepX = dirX > 0 ? 1 : dirX < 0 ? -1 : 0;
  const stepY = dirY > 0 ? 1 : dirY < 0 ? -1 : 0;
  const tDeltaX = stepX === 0 ? Infinity : grid.cell / Math.abs(dirX);
  const tDeltaY = stepY === 0 ? Infinity : grid.cell / Math.abs(dirY);
  let tMaxX = stepX === 0
    ? Infinity
    : ((stepX > 0 ? (col + 1) * grid.cell - origin.x : origin.x - col * grid.cell) /
        Math.abs(dirX));
  let tMaxY = stepY === 0
    ? Infinity
    : ((stepY > 0 ? (row + 1) * grid.cell - origin.y : origin.y - row * grid.cell) /
        Math.abs(dirY));

  while (true) {
    let t: number;
    if (tMaxX < tMaxY) {
      col += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
    } else {
      row += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
    }
    if (t >= 1) return maxDist;
    if (isSolidCell(grid, col, row)) return t * maxDist;
  }
}

// Nearest cell centre that is not rock or water, searched breadth-first from
// the cell holding `pos`. Returns null once `maxCells` solid cells have been
// expanded without reaching open ground, so callers can decide what an ant
// buried deeper than the search deserves.
export function nearestFreePoint(grid: ObstacleGrid, pos: Vec2, maxCells: number): Vec2 | null {
  const col0 = Math.floor(pos.x / grid.cell);
  const row0 = Math.floor(pos.y / grid.cell);
  if (col0 < 0 || row0 < 0 || col0 >= grid.width || row0 >= grid.height) return null;
  if (!isSolidCell(grid, col0, row0)) return { x: pos.x, y: pos.y };

  const visited = new Uint8Array(grid.width * grid.height);
  const start = row0 * grid.width + col0;
  visited[start] = 1;
  const queue = [start];
  let head = 0;
  let expanded = 0;
  while (head < queue.length && expanded < maxCells) {
    const cellIndex = queue[head];
    head += 1;
    expanded += 1;
    const col = cellIndex % grid.width;
    const row = (cellIndex - col) / grid.width;
    for (let dir = 0; dir < 4; dir++) {
      const nextCol = col + (dir === 0 ? 1 : dir === 2 ? -1 : 0);
      const nextRow = row + (dir === 1 ? 1 : dir === 3 ? -1 : 0);
      if (nextCol < 0 || nextRow < 0 || nextCol >= grid.width || nextRow >= grid.height) continue;
      const next = nextRow * grid.width + nextCol;
      if (visited[next] !== 0) continue;
      visited[next] = 1;
      if (!solidKind(grid.kind[next])) {
        return { x: (nextCol + 0.5) * grid.cell, y: (nextRow + 0.5) * grid.cell };
      }
      queue.push(next);
    }
  }
  return null;
}

export function lineOfSight(grid: ObstacleGrid, a: Vec2, b: Vec2): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return true;

  let col = Math.floor(a.x / grid.cell);
  let row = Math.floor(a.y / grid.cell);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = stepX === 0 ? Infinity : grid.cell / Math.abs(dx);
  const tDeltaY = stepY === 0 ? Infinity : grid.cell / Math.abs(dy);
  let tMaxX = stepX === 0
    ? Infinity
    : ((stepX > 0 ? (col + 1) * grid.cell - a.x : a.x - col * grid.cell) / Math.abs(dx));
  let tMaxY = stepY === 0
    ? Infinity
    : ((stepY > 0 ? (row + 1) * grid.cell - a.y : a.y - row * grid.cell) / Math.abs(dy));

  while (true) {
    let t: number;
    if (tMaxX < tMaxY) {
      col += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
    } else {
      row += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
    }
    if (t >= 1) return true;
    if (isSolidCell(grid, col, row)) return false;
  }
}
