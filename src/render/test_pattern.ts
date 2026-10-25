import type { Vec2 } from "../core/vec2.js";
import type { GeometryBatch } from "./batch.js";
import type { Camera } from "./camera.js";
import { colonyColor, type Theme } from "./theme.js";

const kGridSpacing = 120;
const kCenterRingRadius = 40;
const kCornerSquare = 60;
const kCornerInset = 16;
const kDotRadius = 10;
const kOrbitRadius = 200;

export function testPatternDot(worldSize: Vec2, simSeconds: number): Vec2 {
  const angle = Math.PI * 0.5 * simSeconds;
  return {
    x: worldSize.x / 2 + Math.cos(angle) * kOrbitRadius,
    y: worldSize.y / 2 + Math.sin(angle) * kOrbitRadius,
  };
}

export function buildTestPattern(
  batch: GeometryBatch,
  camera: Camera,
  worldSize: Vec2,
  theme: Theme,
  simSeconds: number,
): void {
  const scale = camera.scale();
  const toScreen = (p: Vec2): Vec2 => camera.worldToScreen(p);

  batch.addRect(toScreen({ x: 0, y: 0 }), toScreen(worldSize), theme.ground);

  for (let x = 0; x <= worldSize.x; x += kGridSpacing) {
    batch.addLine(toScreen({ x, y: 0 }), toScreen({ x, y: worldSize.y }), 1, theme.grid);
  }
  for (let y = 0; y <= worldSize.y; y += kGridSpacing) {
    batch.addLine(toScreen({ x: 0, y }), toScreen({ x: worldSize.x, y }), 1, theme.grid);
  }

  batch.addLine(toScreen({ x: 0, y: 0 }), toScreen({ x: worldSize.x, y: 0 }), 2, theme.border);
  batch.addLine(toScreen({ x: worldSize.x, y: 0 }), toScreen(worldSize), 2, theme.border);
  batch.addLine(toScreen(worldSize), toScreen({ x: 0, y: worldSize.y }), 2, theme.border);
  batch.addLine(toScreen({ x: 0, y: worldSize.y }), toScreen({ x: 0, y: 0 }), 2, theme.border);

  const center = toScreen({ x: worldSize.x / 2, y: worldSize.y / 2 });
  batch.addCircle(center, kCenterRingRadius * scale, theme.border, 48);
  batch.addCircle(center, kCenterRingRadius * 0.7 * scale, theme.ground, 48);

  const s = kCornerSquare;
  const inset = kCornerInset;
  batch.addRect(toScreen({ x: inset, y: inset }), toScreen({ x: inset + s, y: inset + s }), colonyColor(0));
  batch.addRect(
    toScreen({ x: worldSize.x - inset - s, y: inset }),
    toScreen({ x: worldSize.x - inset, y: inset + s }),
    colonyColor(1),
  );
  batch.addRect(
    toScreen({ x: inset, y: worldSize.y - inset - s }),
    toScreen({ x: inset + s, y: worldSize.y - inset }),
    colonyColor(2),
  );
  batch.addRect(
    toScreen({ x: worldSize.x - inset - s, y: worldSize.y - inset - s }),
    toScreen({ x: worldSize.x - inset, y: worldSize.y - inset }),
    colonyColor(3),
  );

  batch.addCircle(toScreen(testPatternDot(worldSize, simSeconds)), kDotRadius * scale, colonyColor(0));
}
