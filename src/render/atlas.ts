import { FoodKind } from "../sim/setup.js";

export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasFrames {
  antBody(colony: number, variant: number): AtlasFrame;
  antSmall(colony: number, variant: number): AtlasFrame;
  food(kind: FoodKind, variant: number): AtlasFrame;
  nest(colony: number): AtlasFrame;
}

export const kAtlasWidth = 2048;
export const kAtlasHeight = 1024;

function wrap(index: number, mod: number): number {
  const value = Number.isFinite(index) ? Math.trunc(index) : 0;
  return ((value % mod) + mod) % mod;
}

function frame(x: number, y: number, w: number, h: number): AtlasFrame {
  return { x, y, w, h };
}

export function makeAtlasFrames(): AtlasFrames {
  return {
    antBody(colony: number, variant: number): AtlasFrame {
      const slot = wrap(colony, 8) * 2 + wrap(variant, 2);
      return frame(slot * 128, 0, 128, 64);
    },
    antSmall(colony: number, variant: number): AtlasFrame {
      const slot = wrap(colony, 8) * 2 + wrap(variant, 2);
      return frame(slot * 128, 64, 128, 64);
    },
    food(kind: FoodKind, variant: number): AtlasFrame {
      const slot = wrap(kind, 3) * 4 + wrap(variant, 4);
      return frame(slot * 64, 128, 64, 64);
    },
    nest(colony: number): AtlasFrame {
      return frame(wrap(colony, 8) * 256, 192, 256, 256);
    },
  };
}
