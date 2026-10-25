import { mix32 } from "../core/rng.js";
import { colonyHex } from "../sim/palette.js";
import { FoodKind } from "../sim/setup.js";
import { kAtlasHeight, kAtlasWidth, makeAtlasFrames, type AtlasFrame, type AtlasFrames } from "./atlas.js";

const kUnit = 4294967296;
const kTwoPi = Math.PI * 2;

const kAntBase = "#241a14";
const kAntOutline = "#0b0806";
const kAntLit = "#4a382b";
const kSeed = "#d9c48b";
const kSeedDark = "#8a7443";
const kBerry = "#c4475e";
const kBerryDark = "#6e2133";
const kLeaf = "#7fae5a";
const kLeafDark = "#4c6c36";

export interface SpriteAtlas {
  canvas: HTMLCanvasElement;
  frames: AtlasFrames;
}

export function paintSpriteAtlas(): SpriteAtlas {
  const canvas = document.createElement("canvas");
  canvas.width = kAtlasWidth;
  canvas.height = kAtlasHeight;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("2D canvas is not available");
  const frames = makeAtlasFrames();

  for (let colony = 0; colony < 8; colony++) {
    for (let variant = 0; variant < 2; variant++) {
      paintAnt(ctx, frames.antBody(colony, variant), colony, variant, false);
      paintAnt(ctx, frames.antSmall(colony, variant), colony, variant, true);
    }
    paintNest(ctx, frames.nest(colony), colony);
  }

  const kinds = [FoodKind.Seeds, FoodKind.Berries, FoodKind.Leaves];
  for (const kind of kinds) {
    for (let variant = 0; variant < 4; variant++) {
      paintFood(ctx, frames.food(kind, variant), kind, variant);
    }
  }

  return { canvas, frames };
}

function css(hex: number, alpha = 1): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, kTwoPi);
}

function paintAnt(
  ctx: CanvasRenderingContext2D,
  frame: AtlasFrame,
  colony: number,
  variant: number,
  small: boolean,
): void {
  const accentHex = colonyHex(colony);
  const accent = css(accentHex);
  const gasterWide = variant === 1 ? 1.04 : 1;
  const splay = variant === 1 ? 1.06 : 1;

  ctx.save();
  ctx.translate(frame.x, frame.y);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (small) paintBakedLegs(ctx, accent);
  else paintHipJoints(ctx, accent);

  ellipse(ctx, 38, 32, 26 * gasterWide, 15);
  ctx.fillStyle = kAntBase;
  ctx.fill();
  ctx.strokeStyle = kAntOutline;
  ctx.lineWidth = 3;
  ctx.stroke();

  ellipse(ctx, 66, 32, 7, 5);
  ctx.fillStyle = kAntBase;
  ctx.fill();
  ctx.strokeStyle = kAntOutline;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ellipse(ctx, 84, 32, 18, 10);
  ctx.fillStyle = kAntBase;
  ctx.fill();
  ctx.strokeStyle = kAntOutline;
  ctx.lineWidth = 3;
  ctx.stroke();

  ellipse(ctx, 105, 32, 12, 10);
  ctx.fillStyle = kAntBase;
  ctx.fill();
  ctx.strokeStyle = kAntOutline;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Lit carapace on the upper-left of each big segment.
  ellipse(ctx, 36, 27, 18 * gasterWide, 6);
  ctx.fillStyle = css(0x4a382b, 0.8);
  ctx.fill();
  ellipse(ctx, 83, 27, 11, 4);
  ctx.fillStyle = css(0x4a382b, 0.8);
  ctx.fill();
  ellipse(ctx, 104, 27, 7, 3.5);
  ctx.fillStyle = css(0x4a382b, 0.7);
  ctx.fill();

  // One accent band across the gaster, clipped to its silhouette.
  ctx.save();
  ellipse(ctx, 38, 32, 26 * gasterWide, 15);
  ctx.clip();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(31, 16);
  ctx.quadraticCurveTo(36, 32, 31, 48);
  ctx.stroke();
  ctx.restore();

  // Accent thorax sheen.
  ellipse(ctx, 84, 28, 10, 3.5);
  ctx.fillStyle = css(accentHex, 0.55);
  ctx.fill();

  // Mandibles.
  ctx.strokeStyle = kAntOutline;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(113, 27);
  ctx.lineTo(120, 22);
  ctx.moveTo(113, 37);
  ctx.lineTo(120, 42);
  ctx.stroke();

  // Elbowed antennae with accent tips.
  const baseTop = { x: 110, y: 26 };
  const baseBottom = { x: 110, y: 38 };
  const elbowTop = { x: 118, y: 17 };
  const elbowBottom = { x: 118, y: 47 };
  const tipTop = { x: baseTop.x + (124 - baseTop.x) * splay, y: baseTop.y - (baseTop.y - 13) * splay };
  const tipBottom = {
    x: baseBottom.x + (124 - baseBottom.x) * splay,
    y: baseBottom.y + (51 - baseBottom.y) * splay,
  };
  ctx.strokeStyle = kAntOutline;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(baseTop.x, baseTop.y);
  ctx.lineTo(elbowTop.x, elbowTop.y);
  ctx.moveTo(baseBottom.x, baseBottom.y);
  ctx.lineTo(elbowBottom.x, elbowBottom.y);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(elbowTop.x, elbowTop.y);
  ctx.lineTo(tipTop.x, tipTop.y);
  ctx.moveTo(elbowBottom.x, elbowBottom.y);
  ctx.lineTo(tipBottom.x, tipBottom.y);
  ctx.stroke();

  ctx.restore();
}

function paintHipJoints(ctx: CanvasRenderingContext2D, accent: string): void {
  ctx.fillStyle = accent;
  for (const hip of [
    { x: 78, y: 28 },
    { x: 66, y: 28 },
    { x: 54, y: 28 },
    { x: 78, y: 36 },
    { x: 66, y: 36 },
    { x: 54, y: 36 },
  ]) {
    ctx.beginPath();
    ctx.arc(hip.x, hip.y, 1.6, 0, kTwoPi);
    ctx.fill();
  }
}

function paintBakedLegs(ctx: CanvasRenderingContext2D, accent: string): void {
  const legs = [
    [78, 28, 88, 20, 92, 14],
    [66, 28, 70, 18, 66, 12],
    [54, 28, 48, 18, 40, 14],
    [78, 36, 88, 44, 92, 50],
    [66, 36, 70, 46, 66, 52],
    [54, 36, 48, 46, 40, 50],
  ];
  ctx.strokeStyle = kAntOutline;
  ctx.lineWidth = 1.6;
  for (const [x0, y0, x1, y1, x2, y2] of legs) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.fillStyle = accent;
  for (const [, , x1, y1] of legs) {
    ctx.beginPath();
    ctx.arc(x1, y1, 1.2, 0, kTwoPi);
    ctx.fill();
  }
}

function paintFood(
  ctx: CanvasRenderingContext2D,
  frame: AtlasFrame,
  kind: FoodKind,
  variant: number,
): void {
  const wobble = (variant % 3) - 1;
  const scale = 1 + wobble * 0.06;
  ctx.save();
  ctx.translate(frame.x, frame.y);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (kind === FoodKind.Seeds) {
    ctx.beginPath();
    ctx.moveTo(14, 42);
    ctx.bezierCurveTo(12, 22, 26, 14, 38, 18 + wobble * 1.5);
    ctx.bezierCurveTo(52, 22, 54, 40, 42, 46);
    ctx.bezierCurveTo(32, 50, 20, 48, 14, 42);
    ctx.closePath();
    ctx.fillStyle = kSeed;
    ctx.fill();
    ctx.strokeStyle = kSeedDark;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ellipse(ctx, 34, 31 + wobble, 3, 2);
    ctx.fillStyle = "#5c4a28";
    ctx.fill();
    const angle = (variant / 4) * kTwoPi;
    ellipse(ctx, 32 + Math.cos(angle) * 8, 32 + Math.sin(angle) * 6, 6, 3);
    ctx.fillStyle = "rgba(255,248,220,0.35)";
    ctx.fill();
  } else if (kind === FoodKind.Berries) {
    const radius = 15 + wobble * 1.5;
    ctx.beginPath();
    ctx.arc(32, 34, radius, 0, kTwoPi);
    ctx.fillStyle = kBerry;
    ctx.fill();
    ctx.strokeStyle = kBerryDark;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "#3f2a1c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 34 - radius);
    ctx.lineTo(35 + wobble, 12);
    ctx.stroke();
    const angle = (variant / 4) * kTwoPi + 0.6;
    ctx.save();
    ctx.translate(32 + Math.cos(angle) * 7, 34 + Math.sin(angle) * 7);
    ctx.rotate(angle);
    ellipse(ctx, 0, 0, 5, 3.5);
    ctx.fillStyle = "rgba(255,220,225,0.5)";
    ctx.fill();
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(32, 32);
    ctx.rotate((variant / 4) * Math.PI);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.bezierCurveTo(-8, -13, 8, -13, 18, 0);
    ctx.bezierCurveTo(8, 13, -8, 13, -18, 0);
    ctx.closePath();
    ctx.fillStyle = kLeaf;
    ctx.fill();
    ctx.strokeStyle = kLeafDark;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(16, 0);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function paintNest(ctx: CanvasRenderingContext2D, frame: AtlasFrame, colony: number): void {
  const cx = 128;
  const cy = 128;
  ctx.save();
  ctx.translate(frame.x, frame.y);

  const mound = ctx.createRadialGradient(cx, cy - 12, 8, cx, cy, 118);
  mound.addColorStop(0, "#2a2119");
  mound.addColorStop(1, "#18120d");
  ctx.beginPath();
  ctx.arc(cx, cy, 118, 0, kTwoPi);
  ctx.fillStyle = mound;
  ctx.fill();

  ctx.strokeStyle = "rgba(52,40,30,0.85)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, 108, 0, kTwoPi);
  ctx.stroke();

  ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const jitter = (mix32(colony * 16 + i) / kUnit - 0.5) * 0.3;
    const angle = (i / 8) * kTwoPi + jitter;
    const inner = 30 + (mix32(colony * 16 + i + 64) / kUnit) * 18;
    const outer = 94 + (mix32(colony * 16 + i + 128) / kUnit) * 10;
    ctx.strokeStyle = "rgba(11,8,6,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }

  for (let i = 0; i < 3; i++) {
    const jitter = (mix32(colony * 16 + i + 256) / kUnit - 0.5) * 0.6;
    const angle = 0.7 + i * 2.1 + jitter;
    const radius = 62 + i * 14;
    ctx.strokeStyle = "rgba(74,59,47,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius,
      4 + i,
      0.2,
      2.4,
    );
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.ellipse(cx, cy, 26, 20, 0, 0, kTwoPi);
  ctx.fillStyle = "#070504";
  ctx.fill();
  ctx.strokeStyle = css(colonyHex(colony));
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();
}
