import { contains, expanded } from "../core/rect.js";
import { fromAngle, lerpVec } from "../core/vec2.js";
import type { World } from "../sim/world.js";
import type { GeometryBatch } from "./batch.js";
import type { Camera } from "./camera.js";
import { colonyColor, type Theme } from "./theme.js";

const kCullMargin = 32;
const kWidthRatio = 0.45;
const kMinLengthPx = 1.5;
const kCarriedFoodOffset = 0.55;
const kCarriedFoodRadius = 0.28;

export function buildAnts(
  batch: GeometryBatch,
  world: World,
  camera: Camera,
  alpha: number,
  theme: Theme,
): void {
  const view = expanded(camera.visibleWorldRect(), kCullMargin);
  const ants = world.ants;
  const params = world.params;
  const lengthPx = Math.max(params.antLength * camera.scale(), kMinLengthPx);
  const halfLength = lengthPx / 2;
  const halfWidth = (lengthPx * kWidthRatio) / 2;

  for (let i = 0; i < ants.size(); i++) {
    const worldP = lerpVec(
      { x: ants.prevX[i], y: ants.prevY[i] },
      { x: ants.posX[i], y: ants.posY[i] },
      alpha,
    );
    if (!contains(view, worldP)) continue;

    const p = camera.worldToScreen(worldP);
    const dir = fromAngle(ants.heading[i]);
    const perpX = -dir.y;
    const perpY = dir.x;
    const color = colonyColor(ants.colony[i]);
    batch.addQuad(
      { x: p.x + dir.x * halfLength, y: p.y + dir.y * halfLength },
      { x: p.x - perpX * halfWidth, y: p.y - perpY * halfWidth },
      { x: p.x - dir.x * halfLength, y: p.y - dir.y * halfLength },
      { x: p.x + perpX * halfWidth, y: p.y + perpY * halfWidth },
      color,
    );

    if (ants.mass[i] > params.mass) {
      batch.addCircle(
        {
          x: p.x + dir.x * lengthPx * kCarriedFoodOffset,
          y: p.y + dir.y * lengthPx * kCarriedFoodOffset,
        },
        Math.max(1.2, lengthPx * kCarriedFoodRadius),
        theme.food,
        8,
      );
    }
  }
}
