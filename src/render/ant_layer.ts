import { rgba } from "../core/color.js";
import { contains, expanded } from "../core/rect.js";
import { fromAngle, lerpVec } from "../core/vec2.js";
import { FoodKind } from "../sim/setup.js";
import { AntState } from "../sim/types.js";
import type { World } from "../sim/world.js";
import type { AtlasFrame, AtlasFrames } from "./atlas.js";
import type { GeometryBatch } from "./batch.js";
import type { Camera } from "./camera.js";
import { legPose, type GaitTracker } from "./legs.js";
import type { SpriteBatch } from "./sprite_batch.js";

const kCullMargin = 32;
// Ants are never drawn shorter than this many CSS pixels, so crowds read as coloured streams.
const kMinAntCssPx = 4;
const kCarriedFoodOffset = 0.55;
const kCarriedFoodSize = 0.45;
const kLegWidthPx = 1.5;
const kShadowTint = rgba(0, 0, 0, 89); // 35% black
const kWhite = rgba(255, 255, 255, 255);
const kLegColor = rgba(36, 27, 20, 255);

function colorIndexFor(world: World, colonyId: number): number {
  for (const colony of world.colonies) {
    if (colony.id === colonyId) return colony.color;
  }
  return 0;
}

function bodyFrame(
  frames: AtlasFrames,
  world: World,
  colonyId: number,
  variant: number,
  animated: boolean,
): AtlasFrame {
  const color = colorIndexFor(world, colonyId);
  return animated ? frames.antBody(color, variant) : frames.antSmall(color, variant);
}

export function buildAnts(
  sprites: SpriteBatch,
  legs: GeometryBatch,
  shadows: SpriteBatch,
  world: World,
  camera: Camera,
  alpha: number,
  frames: AtlasFrames,
  gait: GaitTracker,
): void {
  const view = expanded(camera.visibleWorldRect(), kCullMargin);
  const ants = world.ants;
  const params = world.params;
  const scale = camera.scale();
  const lengthPx = Math.max(params.antLength * scale, kMinAntCssPx * camera.pixelRatio());
  const widthPx = Math.max(1.25 * lengthPx, 1);
  const heightPx = Math.max(0.6 * lengthPx, 1);
  const animated = lengthPx >= params.legsMinPx;

  // Shadows go to their own batch, drawn underneath: the world offset, times the zoom.
  for (let i = 0; i < ants.size(); i++) {
    if (ants.state[i] === AntState.Resting) continue; // resting inside the nest
    const worldP = lerpVec(
      { x: ants.prevX[i], y: ants.prevY[i] },
      { x: ants.posX[i], y: ants.posY[i] },
      alpha,
    );
    if (!contains(view, worldP)) continue;
    const p = camera.worldToScreen(worldP);
    const frame = bodyFrame(frames, world, ants.colony[i], ants.uid[i] % 2, animated);
    shadows.addFrame(
      frame,
      p.x + params.shadowOffsetX * scale,
      p.y + params.shadowOffsetY * scale,
      widthPx,
      heightPx,
      ants.heading[i],
      kShadowTint,
    );
  }

  for (let i = 0; i < ants.size(); i++) {
    if (ants.state[i] === AntState.Resting) continue; // resting inside the nest
    const worldP = lerpVec(
      { x: ants.prevX[i], y: ants.prevY[i] },
      { x: ants.posX[i], y: ants.posY[i] },
      alpha,
    );
    if (!contains(view, worldP)) continue;
    const p = camera.worldToScreen(worldP);
    const heading = ants.heading[i];
    const dir = fromAngle(heading);
    const variant = ants.uid[i] % 2;
    const frame = bodyFrame(frames, world, ants.colony[i], variant, animated);
    sprites.addFrame(frame, p.x, p.y, widthPx, heightPx, heading, kWhite);

    if (ants.mass[i] > params.mass) {
      sprites.addFrame(
        frames.food(FoodKind.Seeds, ants.uid[i] % 4),
        p.x + dir.x * lengthPx * kCarriedFoodOffset,
        p.y + dir.y * lengthPx * kCarriedFoodOffset,
        Math.max(1, lengthPx * kCarriedFoodSize),
        Math.max(1, lengthPx * kCarriedFoodSize),
        heading,
        kWhite,
      );
    }

    if (!animated) continue;
    const phase = gait.phaseAt(i);
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    for (let leg = 0; leg < 6; leg++) {
      const pose = legPose(phase, leg, lengthPx);
      const hip = {
        x: p.x + pose.hipX * cos - pose.hipY * sin,
        y: p.y + pose.hipX * sin + pose.hipY * cos,
      };
      const knee = {
        x: p.x + pose.kneeX * cos - pose.kneeY * sin,
        y: p.y + pose.kneeX * sin + pose.kneeY * cos,
      };
      const foot = {
        x: p.x + pose.footX * cos - pose.footY * sin,
        y: p.y + pose.footX * sin + pose.footY * cos,
      };
      legs.addLine(hip, knee, kLegWidthPx, kLegColor);
      legs.addLine(knee, foot, kLegWidthPx, kLegColor);
    }
  }
}
