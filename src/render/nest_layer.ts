import { rgba } from "../core/color.js";
import { contains, expanded } from "../core/rect.js";
import { nestRadius } from "../sim/colony.js";
import type { World } from "../sim/world.js";
import type { AtlasFrames } from "./atlas.js";
import type { Camera } from "./camera.js";
import type { SpriteBatch } from "./sprite_batch.js";

const kSizeFactor = 2.6;
const kCullMargin = 64;
const kWhite = rgba(255, 255, 255, 255);
const kExtinct = rgba(150, 145, 140, 255);

export function buildNests(
  sprites: SpriteBatch,
  world: World,
  camera: Camera,
  frames: AtlasFrames,
): void {
  const view = expanded(camera.visibleWorldRect(), kCullMargin);
  const scale = camera.scale();
  for (const colony of world.colonies) {
    if (!contains(view, colony.nest)) continue;
    const p = camera.worldToScreen(colony.nest);
    const size = Math.max(1, kSizeFactor * nestRadius(colony, world.params) * scale);
    sprites.addFrame(
      frames.nest(colony.color),
      p.x,
      p.y,
      size,
      size,
      colony.id * 0.7,
      colony.extinct ? kExtinct : kWhite,
    );
  }
}
