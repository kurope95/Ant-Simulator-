import type { Vec2 } from "../core/vec2.js";
import type { World } from "../sim/world.js";
import { buildAnts } from "./ant_layer.js";
import type { AtlasFrames } from "./atlas.js";
import { GeometryBatch } from "./batch.js";
import type { Camera } from "./camera.js";
import { buildFood } from "./food_layer.js";
import type { GlRenderer } from "./gl_renderer.js";
import { fillHeatmapRgba } from "./heatmap.js";
import { GaitTracker } from "./legs.js";
import { buildNests } from "./nest_layer.js";
import { paintSpriteAtlas } from "./sprite_atlas.js";
import { SpriteBatch } from "./sprite_batch.js";
import { paintTerrainTexture, terrainTextureSize, type TextureSize } from "./terrain_texture.js";
import type { Theme } from "./theme.js";
import { HeatmapMode, type ViewSettings } from "./view_settings.js";

const kGridStep = 120;
const kBorderWidthPx = 2;

interface AtlasResource {
  texture: WebGLTexture | null;
  frames: AtlasFrames;
}

const kAtlasByRenderer = new WeakMap<GlRenderer, AtlasResource>();

function uploadCanvas(renderer: GlRenderer, texture: WebGLTexture, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  renderer.updateTexture(texture, canvas.width, canvas.height, new Uint8Array(image.data.buffer));
}

function atlasFor(renderer: GlRenderer): AtlasResource {
  const existing = kAtlasByRenderer.get(renderer);
  if (existing !== undefined) return existing;
  const atlas = paintSpriteAtlas();
  const texture = renderer.createTexture();
  if (texture !== null) uploadCanvas(renderer, texture, atlas.canvas);
  const resource = { texture, frames: atlas.frames };
  kAtlasByRenderer.set(renderer, resource);
  return resource;
}

export interface WorldRenderCache {
  atlasTexture: WebGLTexture | null;
  terrainTexture: WebGLTexture | null;
  heatmapTexture: WebGLTexture | null;
  heatmapPixels: Uint8Array;
  atlasFrames: AtlasFrames;
  terrain: TextureSize;
  under: GeometryBatch;
  back: SpriteBatch;
  legs: GeometryBatch;
  actors: SpriteBatch;
  gait: GaitTracker;
}

export function createWorldRenderCache(
  renderer: GlRenderer,
  world: World,
  theme: Theme,
): WorldRenderCache {
  const atlas = atlasFor(renderer);
  const terrain = paintTerrainTexture(world, theme);
  const terrainTexture = renderer.createTexture();
  if (terrainTexture !== null) uploadCanvas(renderer, terrainTexture, terrain);
  return {
    atlasTexture: atlas.texture,
    terrainTexture,
    heatmapTexture: renderer.createTexture(),
    heatmapPixels: new Uint8Array(world.markers.width * world.markers.height * 4),
    atlasFrames: atlas.frames,
    terrain: terrainTextureSize(world.size),
    under: new GeometryBatch(),
    back: new SpriteBatch(),
    legs: new GeometryBatch(),
    actors: new SpriteBatch(),
    gait: new GaitTracker(),
  };
}

// The atlas texture is shared per renderer and outlives caches; only the two
// textures a cache creates for itself are deleted here.
export function disposeWorldRenderCache(
  renderer: Pick<GlRenderer, "deleteTexture">,
  cache: Pick<WorldRenderCache, "terrainTexture" | "heatmapTexture">,
): void {
  renderer.deleteTexture(cache.terrainTexture);
  renderer.deleteTexture(cache.heatmapTexture);
  cache.terrainTexture = null;
  cache.heatmapTexture = null;
}

export function refreshTerrain(
  renderer: GlRenderer,
  cache: WorldRenderCache,
  world: World,
  theme: Theme,
): void {
  const terrain = paintTerrainTexture(world, theme);
  cache.terrain = terrainTextureSize(world.size);
  if (cache.terrainTexture !== null) uploadCanvas(renderer, cache.terrainTexture, terrain);
}

function buildUnder(
  batch: GeometryBatch,
  camera: Camera,
  worldSize: Vec2,
  theme: Theme,
  settings: ViewSettings,
): void {
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

  const min = camera.worldToScreen({ x: 0, y: 0 });
  const max = camera.worldToScreen(worldSize);
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
  const worldRect = {
    min: camera.worldToScreen({ x: 0, y: 0 }),
    max: camera.worldToScreen(world.size),
  };

  if (cache.terrainTexture !== null) {
    renderer.drawTexture(cache.terrainTexture, worldRect);
  }

  if (settings.heatmap !== HeatmapMode.Off && cache.heatmapTexture !== null) {
    fillHeatmapRgba(world.markers, settings.heatmap, theme, cache.heatmapPixels);
    renderer.updateTexture(
      cache.heatmapTexture,
      world.markers.width,
      world.markers.height,
      cache.heatmapPixels,
    );
    renderer.drawTexture(cache.heatmapTexture, worldRect, { additive: true });
  }

  cache.under.clear();
  buildUnder(cache.under, camera, world.size, theme, settings);
  renderer.drawBatch(cache.under);

  cache.back.clear();
  buildNests(cache.back, world, camera, cache.atlasFrames);
  buildFood(cache.back, world, camera, cache.atlasFrames);
  if (cache.atlasTexture !== null) {
    renderer.drawSprites(cache.atlasTexture, cache.back);
  }

  if (settings.showAnts) {
    cache.legs.clear();
    cache.actors.clear();
    cache.gait.update(world);
    buildAnts(cache.actors, cache.legs, world, camera, alpha, cache.atlasFrames, cache.gait);
    renderer.drawBatch(cache.legs);
    if (cache.atlasTexture !== null) {
      renderer.drawSprites(cache.atlasTexture, cache.actors);
    }
  }
}
