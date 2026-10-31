import { rgba } from "../core/color.js";
import { contains, expanded } from "../core/rect.js";
import { fromAngle, lerpVec } from "../core/vec2.js";
import { FoodKind } from "../sim/setup.js";
import { AntRole, AntState } from "../sim/types.js";
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
// Colony conflict (design §7): warriors are drawn larger; bodies are dark ants
// lying where they fell; a wounded ant shows a small health bar when zoomed in.
const kWarriorScale = 1.7;
const kCorpseTint = rgba(70, 62, 56, 230);
const kCarriedCorpseSize = 0.75;
const kHealthBarBack = rgba(0, 0, 0, 170);
const kHealthBarWidthPx = 2;

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
  warrior = false,
): AtlasFrame {
  const color = colorIndexFor(world, colonyId);
  if (warrior) return animated ? frames.antWarrior(color, variant) : frames.antWarriorSmall(color, variant);
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

  // Size multiplier per ant: warriors are larger.
  const sizeOf = (i: number): number => (ants.role[i] === AntRole.Warrior ? kWarriorScale : 1);

  // Bodies lie under the living, at their own spot (they do not move).
  for (const corpse of world.corpses.items) {
    if (corpse.taken || !contains(view, { x: corpse.x, y: corpse.y })) continue;
    const p = camera.worldToScreen({ x: corpse.x, y: corpse.y });
    const frame = bodyFrame(frames, world, corpse.colony, corpse.uid % 2, animated);
    sprites.addFrame(frame, p.x, p.y, widthPx, heightPx, corpse.heading, kCorpseTint);
  }

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
    const frame = bodyFrame(frames, world, ants.colony[i], ants.uid[i] % 2, animated, ants.role[i] === AntRole.Warrior);
    const size = sizeOf(i);
    shadows.addFrame(
      frame,
      p.x + params.shadowOffsetX * scale,
      p.y + params.shadowOffsetY * scale,
      widthPx * size,
      heightPx * size,
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
    const frame = bodyFrame(frames, world, ants.colony[i], variant, animated, ants.role[i] === AntRole.Warrior);
    const size = sizeOf(i);
    sprites.addFrame(frame, p.x, p.y, widthPx * size, heightPx * size, heading, kWhite);

    if (ants.load[i] > 1) {
      // A body being carried home, held at the jaws.
      sprites.addFrame(
        frame,
        p.x + dir.x * lengthPx * kCarriedFoodOffset,
        p.y + dir.y * lengthPx * kCarriedFoodOffset,
        widthPx * kCarriedCorpseSize,
        heightPx * kCarriedCorpseSize,
        heading + Math.PI / 2,
        kCorpseTint,
      );
    } else if (ants.mass[i] > params.mass) {
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
    if (ants.wounds[i] > 0) {
      const health = Math.max(0, Math.min(1, (ants.energy[i] - ants.wounds[i]) / params.energyMax));
      const half = 0.5 * lengthPx * size;
      const y = p.y - 0.75 * lengthPx * size;
      legs.addLine({ x: p.x - half, y }, { x: p.x + half, y }, kHealthBarWidthPx + 1, kHealthBarBack);
      const fill = rgba(Math.round(230 * (1 - health) + 60 * health), Math.round(70 + 150 * health), 60, 255);
      legs.addLine({ x: p.x - half, y }, { x: p.x - half + 2 * half * health, y }, kHealthBarWidthPx, fill);
    }
    const phase = gait.phaseAt(i);
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    for (let leg = 0; leg < 6; leg++) {
      const pose = legPose(phase, leg, lengthPx * size);
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
