import type { Rect } from "../core/rect.js";
import type { Vec2 } from "../core/vec2.js";
import type { World } from "../sim/world.js";
import { buildAnts } from "./ant_layer.js";
import type { AtlasFrames } from "./atlas.js";
import { GeometryBatch } from "./batch.js";
import type { Camera } from "./camera.js";
import { buildFood } from "./food_layer.js";
import type { GlRenderer, RenderTarget } from "./gl_renderer.js";
import { fillHeatmapRgba } from "./heatmap.js";
import { GaitTracker } from "./legs.js";
import { buildNests } from "./nest_layer.js";
import { paintSpriteAtlas } from "./sprite_atlas.js";
import { SpriteBatch } from "./sprite_batch.js";
import { terrainMask } from "./terrain_mask.js";
import { terrainLook } from "./terrain_shader.js";
import type { Theme } from "./theme.js";
import { HeatmapMode, type ViewSettings } from "./view_settings.js";

const kGridStep = 120;
const kBorderWidthPx = 2;
// The water shimmer is redrawn this often. It moves slowly, so 10 Hz looks smooth.
const kShimmerMs = 100;

interface AtlasResource {
  texture: WebGLTexture | null;
  frames: AtlasFrames;
}

const kAtlasByRenderer = new WeakMap<GlRenderer, AtlasResource>();

// What the screen-size terrain copy was drawn from. A frame redraws the terrain only when this changes.
interface TerrainStamp {
  terrain: number;
  scale: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  theme: string;
  shimmer: number;
}

interface TerrainCopy {
  target: RenderTarget;
  stamp: TerrainStamp | null;
}

const kTerrainCopyByRenderer = new WeakMap<GlRenderer, TerrainCopy>();
let nextTerrainId = 1;

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
  terrainTexture: WebGLTexture | null; // the obstacle mask the terrain shader reads
  terrainId: number; // changes whenever the mask is rebuilt
  terrainCell: number; // world units per mask texel
  terrainWater: boolean; // the mask has water, so the terrain shimmers
  heatmapTexture: WebGLTexture | null;
  heatmapPixels: Uint8Array;
  atlasFrames: AtlasFrames;
  under: GeometryBatch;
  back: SpriteBatch;
  shadows: SpriteBatch;
  legs: GeometryBatch;
  actors: SpriteBatch;
  gait: GaitTracker;
}

export function createWorldRenderCache(renderer: GlRenderer, world: World): WorldRenderCache {
  const atlas = atlasFor(renderer);
  const cache: WorldRenderCache = {
    atlasTexture: atlas.texture,
    terrainTexture: renderer.createTexture(),
    terrainId: 0,
    terrainCell: world.obstacles.cell,
    terrainWater: false,
    heatmapTexture: renderer.createTexture(),
    heatmapPixels: new Uint8Array(world.markers.width * world.markers.height * 4),
    atlasFrames: atlas.frames,
    under: new GeometryBatch(),
    back: new SpriteBatch(),
    shadows: new SpriteBatch(),
    legs: new GeometryBatch(),
    actors: new SpriteBatch(),
    gait: new GaitTracker(),
  };
  refreshTerrain(renderer, cache, world);
  return cache;
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

// The terrain is a mask the shader samples, so a builder edit only re-uploads that mask.
export function refreshTerrain(renderer: GlRenderer, cache: WorldRenderCache, world: World): void {
  if (cache.terrainTexture === null) return;
  const mask = terrainMask(world.obstacles, renderer.maxTextureSize());
  renderer.updateMask(cache.terrainTexture, mask.width, mask.height, mask.rgba);
  cache.terrainCell = mask.cell;
  cache.terrainWater = mask.water;
  cache.terrainId = nextTerrainId++;
}

function sameStamp(a: TerrainStamp | null, b: TerrainStamp): boolean {
  return (
    a !== null &&
    a.terrain === b.terrain &&
    a.scale === b.scale &&
    a.centerX === b.centerX &&
    a.centerY === b.centerY &&
    a.width === b.width &&
    a.height === b.height &&
    a.theme === b.theme &&
    a.shimmer === b.shimmer
  );
}

// The shader costs about 3.9 ms at 2880 x 1620 on the laptop GPU, so the terrain is drawn into a
// screen-size copy and only redrawn when the view, the mask, the theme or the shimmer changes.
function drawTerrainCopy(
  renderer: GlRenderer,
  cache: WorldRenderCache,
  world: World,
  camera: Camera,
  theme: Theme,
  worldRect: Rect,
): void {
  const mask = cache.terrainTexture;
  if (mask === null) return;
  const size = renderer.sizePx();
  const shimmer = cache.terrainWater ? Math.floor(performance.now() / kShimmerMs) : 0;
  const center = camera.center();
  const stamp: TerrainStamp = {
    terrain: cache.terrainId,
    scale: camera.scale(),
    centerX: center.x,
    centerY: center.y,
    width: size.x,
    height: size.y,
    theme: theme.name,
    shimmer,
  };
  const look = terrainLook(theme, world.size, cache.terrainCell, (shimmer * kShimmerMs) / 1000);

  let copy = kTerrainCopyByRenderer.get(renderer);
  if (copy === undefined || copy.target.width !== size.x || copy.target.height !== size.y) {
    if (copy !== undefined) renderer.deleteTarget(copy.target);
    const target = renderer.createTarget(size.x, size.y);
    if (target === null) {
      renderer.drawTerrain(mask, worldRect, look);
      return;
    }
    copy = { target, stamp: null };
    kTerrainCopyByRenderer.set(renderer, copy);
  }
  if (!sameStamp(copy.stamp, stamp)) {
    renderer.bindTarget(copy.target);
    renderer.clear(theme.outside);
    renderer.drawTerrain(mask, worldRect, look);
    renderer.bindTarget(null);
    copy.stamp = stamp;
  }
  renderer.drawTargetToScreen(copy.target);
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

// Each colony's palette index, by colony id. Trail colours come from these, never from the id.
function paletteByColony(world: World): number[] {
  const palette: number[] = [];
  for (const colony of world.colonies) palette[colony.id] = colony.color;
  return palette;
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
    drawTerrainCopy(renderer, cache, world, camera, theme, worldRect);
  }

  if (settings.heatmap !== HeatmapMode.Off && cache.heatmapTexture !== null) {
    fillHeatmapRgba(world.markers, settings.heatmap, theme, paletteByColony(world), cache.heatmapPixels);
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

  // Ant and food shadows share one batch, drawn beneath the nests, food and ants.
  cache.shadows.clear();
  cache.back.clear();
  buildNests(cache.back, world, camera, cache.atlasFrames);
  buildFood(cache.back, cache.shadows, world, camera, cache.atlasFrames);
  if (settings.showAnts) {
    cache.legs.clear();
    cache.actors.clear();
    cache.gait.update(world);
    buildAnts(cache.actors, cache.legs, cache.shadows, world, camera, alpha, cache.atlasFrames, cache.gait);
  }
  if (cache.atlasTexture !== null) {
    renderer.drawSprites(cache.atlasTexture, cache.shadows);
    renderer.drawSprites(cache.atlasTexture, cache.back);
  }

  if (settings.showAnts) {
    renderer.drawBatch(cache.legs);
    if (cache.atlasTexture !== null) {
      renderer.drawSprites(cache.atlasTexture, cache.actors);
    }
  }
}
