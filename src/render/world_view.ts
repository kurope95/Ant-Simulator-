import type { Rgba8 } from "../core/color.js";
import type { Vec2 } from "../core/vec2.js";
import { nestRadius } from "../sim/colony.js";
import { foodRadius } from "../sim/food.js";
import type { World } from "../sim/world.js";
import { buildAnts } from "./ant_layer.js";
import { GeometryBatch } from "./batch.js";
import type { Camera } from "./camera.js";
import type { GlRenderer } from "./gl_renderer.js";
import { fillHeatmapRgba } from "./heatmap.js";
import { colonyColor, type Theme } from "./theme.js";
import { HeatmapMode, type ViewSettings } from "./view_settings.js";

const kGridStep = 120;
const kBorderWidthPx = 2;

export interface WorldRenderCache {
  heatmapTexture: WebGLTexture | null;
  heatmapPixels: Uint8Array;
  ground: GeometryBatch;
  actors: GeometryBatch;
}

export function createWorldRenderCache(renderer: GlRenderer, world: World): WorldRenderCache {
  return {
    heatmapTexture: renderer.createTexture(),
    heatmapPixels: new Uint8Array(world.markers.width * world.markers.height * 4),
    ground: new GeometryBatch(),
    actors: new GeometryBatch(),
  };
}

export function buildGround(
  batch: GeometryBatch,
  camera: Camera,
  worldSize: Vec2,
  theme: Theme,
  settings: ViewSettings,
): void {
  const min = camera.worldToScreen({ x: 0, y: 0 });
  const max = camera.worldToScreen(worldSize);
  batch.addRect(min, max, theme.ground);

  if (settings.showGrid) {
    for (let x = kGridStep; x < worldSize.x; x += kGridStep) {
      batch.addLine(
        camera.worldToScreen({ x, y: 0 }),
        camera.worldToScreen({ x, y: worldSize.y }),
        1,
        theme.grid,
      );
    }
    for (let y = kGridStep; y < worldSize.y; y += kGridStep) {
      batch.addLine(
        camera.worldToScreen({ x: 0, y }),
        camera.worldToScreen({ x: worldSize.x, y }),
        1,
        theme.grid,
      );
    }
  }

  const corners = [
    min,
    { x: max.x, y: min.y },
    max,
    { x: min.x, y: max.y },
  ];
  for (let i = 0; i < corners.length; i++) {
    batch.addLine(corners[i], corners[(i + 1) % corners.length], kBorderWidthPx, theme.border);
  }
}

export function buildActors(
  batch: GeometryBatch,
  world: World,
  camera: Camera,
  alpha: number,
  settings: ViewSettings,
  theme: Theme,
): void {
  const scale = camera.scale();

  for (const source of world.food.items) {
    const center = camera.worldToScreen(source.pos);
    const radius = Math.max(1, foodRadius(source, world.params) * scale);
    batch.addCircle(center, radius, theme.food);
    batch.addCircle(center, radius * 0.4, withAlpha(theme.food, 0.45));
  }

  for (const colony of world.colonies) {
    const center = camera.worldToScreen(colony.nest);
    const radius = Math.max(1, nestRadius(colony, world.params) + 2);
    const color = colonyColor(colony.id);
    batch.addCircle(center, radius * scale, color);
    batch.addCircle(center, Math.max(1, nestRadius(colony, world.params) * scale), theme.ground);
    batch.addCircle(
      center,
      Math.max(1, nestRadius(colony, world.params) * 0.55 * scale),
      withAlpha(color, 0.35),
    );
  }

  if (settings.showAnts) buildAnts(batch, world, camera, alpha, theme);
}

export function drawWorld(
  renderer: GlRenderer,
  cache: WorldRenderCache,
  world: World,
  camera: Camera,
  settings: ViewSettings,
  theme: Theme,
  alpha: number,
): void {
  renderer.clear(theme.outside);

  cache.ground.clear();
  buildGround(cache.ground, camera, world.size, theme, settings);
  renderer.drawBatch(cache.ground);

  if (settings.heatmap !== HeatmapMode.Off && cache.heatmapTexture !== null) {
    fillHeatmapRgba(world.markers, settings.heatmap, theme, cache.heatmapPixels);
    renderer.updateTexture(
      cache.heatmapTexture,
      world.markers.width,
      world.markers.height,
      cache.heatmapPixels,
    );
    renderer.drawTexture(cache.heatmapTexture, {
      min: camera.worldToScreen({ x: 0, y: 0 }),
      max: camera.worldToScreen(world.size),
    });
  }

  cache.actors.clear();
  buildActors(cache.actors, world, camera, alpha, settings, theme);
  renderer.drawBatch(cache.actors);
}

function withAlpha(color: Rgba8, factor: number): Rgba8 {
  return { r: color.r, g: color.g, b: color.b, a: Math.round(color.a * factor) };
}
