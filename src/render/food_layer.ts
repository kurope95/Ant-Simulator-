import { rgba } from "../core/color.js";
import { clamp } from "../core/math.js";
import { contains, expanded } from "../core/rect.js";
import { foodRadius } from "../sim/food.js";
import type { World } from "../sim/world.js";
import type { AtlasFrames } from "./atlas.js";
import type { Camera } from "./camera.js";
import { foodPieces } from "./food_layout.js";
import type { SpriteBatch } from "./sprite_batch.js";

const kPieceFactor = 0.22;
const kMinPiece = 4;
const kMaxPiece = 12;
const kCullMargin = 64;
const kShadow = rgba(0, 0, 0, 89); // 35% black, as the ants' shadows
const kWhite = rgba(255, 255, 255, 255);

export function buildFood(
  sprites: SpriteBatch,
  shadows: SpriteBatch,
  world: World,
  camera: Camera,
  frames: AtlasFrames,
): void {
  const view = expanded(camera.visibleWorldRect(), kCullMargin);
  const scale = camera.scale();
  const offsetX = world.params.shadowOffsetX * scale;
  const offsetY = world.params.shadowOffsetY * scale;
  for (const source of world.food.items) {
    const radius = foodRadius(source, world.params);
    const pieces = foodPieces(source.uid, source.pos, radius, source.amount, source.infinite);
    const size = Math.max(1, clamp(radius * kPieceFactor, kMinPiece, kMaxPiece) * scale);
    for (const piece of pieces) {
      if (!contains(view, piece)) continue;
      const p = camera.worldToScreen(piece);
      const frame = frames.food(source.kind, piece.variant);
      shadows.addFrame(frame, p.x + offsetX, p.y + offsetY, size, size, piece.rotation, kShadow);
      sprites.addFrame(frame, p.x, p.y, size, size, piece.rotation, kWhite);
    }
  }
}
