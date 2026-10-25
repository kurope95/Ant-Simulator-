import { mix32 } from "../core/rng.js";
import type { Vec2 } from "../core/vec2.js";

export const kFoodPerPiece = 100;
export const kMaxFoodPieces = 48;

const kGoldenAngle = 2.399963229728653;
const kTwoPi = Math.PI * 2;
const kUnit = 4294967296;

export interface FoodPiece {
  x: number;
  y: number;
  rotation: number;
  variant: number;
}

export function foodPieceCount(amount: number, infinite: boolean): number {
  if (infinite) return kMaxFoodPieces;
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(kMaxFoodPieces, Math.ceil(amount / kFoodPerPiece));
}

export function foodPieces(
  uid: number,
  pos: Vec2,
  radius: number,
  amount: number,
  infinite: boolean,
): FoodPiece[] {
  const count = foodPieceCount(amount, infinite);
  const pieces: FoodPiece[] = [];
  for (let i = 0; i < count; i++) {
    const key = (uid ^ Math.imul(i, 0x9e3779b9)) >>> 0;
    const jitter = (mix32(key) / kUnit) * 0.35;
    const angle = i * kGoldenAngle + jitter;
    const r = radius * 0.92 * Math.sqrt((i + 0.5) / kMaxFoodPieces);
    pieces.push({
      x: pos.x + Math.cos(angle) * r,
      y: pos.y + Math.sin(angle) * r,
      rotation: (mix32((key ^ 0x85ebca6b) >>> 0) / kUnit) * kTwoPi,
      variant: mix32((key ^ 0xc2b2ae35) >>> 0) & 3,
    });
  }
  return pieces;
}
