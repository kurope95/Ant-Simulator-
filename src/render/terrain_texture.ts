import { rgba, type Rgba8 } from "../core/color.js";
import { mix32 } from "../core/rng.js";
import type { Vec2 } from "../core/vec2.js";
import { ObstacleKind } from "../sim/setup.js";
import type { World } from "../sim/world.js";
import type { Theme } from "./theme.js";

const kMaxTextureSide = 2048;
const kMaxScale = 0.5;
const kSpeckleCount = 4000;
const kTuftCount = 120;
const kDriftCount = 40;
const kUnit = 4294967296;
const kTwoPi = Math.PI * 2;

export interface TextureSize {
  width: number;
  height: number;
  scale: number;
}

export function terrainTextureSize(worldSize: Vec2): TextureSize {
  const longest = Math.max(worldSize.x, worldSize.y);
  const scale = longest > 0 ? Math.min(kMaxScale, kMaxTextureSide / longest) : kMaxScale;
  return {
    width: Math.max(1, Math.round(worldSize.x * scale)),
    height: Math.max(1, Math.round(worldSize.y * scale)),
    scale,
  };
}

function css(color: Rgba8, alpha = color.a / 255): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function darken(color: Rgba8, factor: number): Rgba8 {
  return rgba(
    Math.round(color.r * factor),
    Math.round(color.g * factor),
    Math.round(color.b * factor),
    255,
  );
}

function lighten(color: Rgba8, amount: number): Rgba8 {
  return rgba(
    Math.round(color.r + (255 - color.r) * amount),
    Math.round(color.g + (255 - color.g) * amount),
    Math.round(color.b + (255 - color.b) * amount),
    color.a,
  );
}

function hashPair(i: number): { x: number; y: number } {
  const hx = mix32((Math.imul(i, 0x9e3779b9) ^ 0x85ebca6b) >>> 0);
  const hy = mix32((hx ^ 0xc2b2ae35) >>> 0);
  return { x: hx / kUnit, y: hy / kUnit };
}

function paintSpeckles(ctx: CanvasRenderingContext2D, width: number, height: number, theme: Theme): void {
  for (let i = 0; i < kSpeckleCount; i++) {
    const p = hashPair(i * 2 + 0);
    const x = Math.floor(p.x * width);
    const y = Math.floor(p.y * height);
    const shade = mix32((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) / kUnit;
    const size = 1 + (mix32((i * 7 + 1) >>> 0) & 1);
    ctx.globalAlpha = 0.08 + shade * 0.12;
    ctx.fillStyle = css(theme.speckle, 1);
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

function paintTufts(ctx: CanvasRenderingContext2D, width: number, height: number, theme: Theme): void {
  ctx.strokeStyle = css(darken(theme.ground, 0.94));
  ctx.lineWidth = 1;
  for (let i = 0; i < kTuftCount; i++) {
    const p = hashPair(i * 3 + 1);
    const x = Math.floor(p.x * width);
    const y = Math.floor(p.y * height);
    const strokes = 2 + (mix32((i * 11 + 5) >>> 0) & 1);
    ctx.beginPath();
    for (let s = 0; s < strokes; s++) {
      const angle = (mix32((i * 13 + s * 17 + 3) >>> 0) / kUnit) * kTwoPi;
      const length = 3 + (mix32((i * 19 + s * 23 + 7) >>> 0) / kUnit) * 3;
      const ox = s * 1.5 - 1.5;
      ctx.moveTo(x + ox, y);
      ctx.lineTo(x + ox + Math.cos(angle) * length, y + Math.sin(angle) * length);
    }
    ctx.stroke();
  }
}

function paintDrift(ctx: CanvasRenderingContext2D, width: number, height: number, theme: Theme): void {
  for (let i = 0; i < kDriftCount; i++) {
    const p = hashPair(i * 5 + 2);
    const cx = p.x * width;
    const cy = p.y * height;
    const rx = 40 + (mix32((i * 29 + 11) >>> 0) / kUnit) * 110;
    const ry = rx * (0.45 + (mix32((i * 31 + 13) >>> 0) / kUnit) * 0.55);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, css(theme.speckle, 0.05));
    gradient.addColorStop(1, css(theme.speckle, 0));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, kTwoPi);
    ctx.fill();
    ctx.restore();
  }
}

function obstacleColor(kind: number, theme: Theme): Rgba8 | null {
  switch (kind) {
    case ObstacleKind.Rock:
      return theme.rock;
    case ObstacleKind.Water:
      return theme.water;
    case ObstacleKind.Sand:
      return theme.sand;
    case ObstacleKind.Mud:
      return theme.mud;
    default:
      return null;
  }
}

function paintObstacles(ctx: CanvasRenderingContext2D, world: World, theme: Theme, scale: number): void {
  const grid = world.obstacles;
  const radius = grid.cell * scale * 1.1;
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const kind = grid.kind[row * grid.width + col];
      const color = obstacleColor(kind, theme);
      if (color === null) continue;
      const x = (col + 0.5) * grid.cell * scale;
      const y = (row + 0.5) * grid.cell * scale;
      const a = kind === ObstacleKind.Sand || kind === ObstacleKind.Mud ? 0.35 : 1;
      ctx.globalAlpha = a;
      ctx.fillStyle = css(color, 1);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, kTwoPi);
      ctx.fill();
      // A wide, faint highlight: narrower discs leave the base colour showing
      // as a grid-like seam through large obstacle areas (e.g. the creek).
      ctx.globalAlpha = a * 0.12;
      ctx.fillStyle = css(lighten(color, 0.22), 1);
      ctx.beginPath();
      ctx.arc(x - radius * 0.25, y - radius * 0.25, radius, 0, kTwoPi);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function paintTerrainTexture(world: World, theme: Theme): HTMLCanvasElement {
  const size = terrainTextureSize(world.size);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return canvas;
  ctx.fillStyle = css(theme.ground);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  paintDrift(ctx, canvas.width, canvas.height, theme);
  paintSpeckles(ctx, canvas.width, canvas.height, theme);
  paintTufts(ctx, canvas.width, canvas.height, theme);
  paintObstacles(ctx, world, theme, size.scale);
  return canvas;
}
