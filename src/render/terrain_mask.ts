import { ObstacleKind } from "../sim/setup.js";

export interface TerrainMaskSource {
  width: number;
  height: number;
  cell: number;
  kind: Uint8Array;
}

export interface TerrainMask {
  width: number;
  height: number;
  cell: number;
  water: boolean; // any water cell: the water shimmer needs redrawing
  rgba: Uint8Array;
}

// The channel an obstacle kind paints: R rock, G water, B sand, A mud. -1 paints nothing.
function channelOf(kind: number): number {
  switch (kind) {
    case ObstacleKind.Rock:
      return 0;
    case ObstacleKind.Water:
      return 1;
    case ObstacleKind.Sand:
      return 2;
    case ObstacleKind.Mud:
      return 3;
    default:
      return -1;
  }
}

// One RGBA texel per obstacle cell: R rock, G water, B sand, A mud, each 0 or 255.
export function obstacleMaskRgba(kind: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(kind.length * 4);
  for (let cell = 0; cell < kind.length; cell++) {
    const channel = channelOf(kind[cell]);
    if (channel >= 0) rgba[cell * 4 + channel] = 255;
  }
  return rgba;
}

// The mask the GPU gets. A grid larger than the texture limit is halved instead, and each
// texel keeps the strongest value per channel of its 2 x 2 cells, so thin rock keeps its edge.
export function terrainMask(grid: TerrainMaskSource, maxTextureSize: number): TerrainMask {
  const full = obstacleMaskRgba(grid.kind);
  const water = grid.kind.includes(ObstacleKind.Water);
  if (Math.max(grid.width, grid.height) <= maxTextureSize) {
    return { width: grid.width, height: grid.height, cell: grid.cell, water, rgba: full };
  }
  const width = Math.ceil(grid.width / 2);
  const height = Math.ceil(grid.height / 2);
  const rgba = new Uint8Array(width * height * 4);
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const from = (row * grid.width + col) * 4;
      const to = ((row >> 1) * width + (col >> 1)) * 4;
      for (let channel = 0; channel < 4; channel++) {
        rgba[to + channel] = Math.max(rgba[to + channel], full[from + channel]);
      }
    }
  }
  return { width, height, cell: grid.cell * 2, water, rgba };
}
