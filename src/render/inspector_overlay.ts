import { rgba, type Rgba8 } from "../core/color.js";
import type { Vec2 } from "../core/vec2.js";
import type { SensorView } from "../sim/inspect.js";
import { GeometryBatch } from "./batch.js";

// Screen-space overlay for the selected ant: a ring round it and, when the
// sensors are on, the cone it looks through, its sample points and the point
// it can see directly. Everything goes into one GeometryBatch, one draw call.

const kRingSegments = 28;
const kRingWidthPx = 2;
const kArcSegments = 14;
const kEdgeWidthPx = 1.25;
const kPointMinPx = 1.5;
const kPointRangePx = 2.5;
const kPointSegments = 8;
const kTargetRadiusPx = 4;

const kRing = rgba(231, 179, 106, 235);
const kCone = rgba(231, 179, 106, 96);
const kPointDim = rgba(236, 239, 231, 70);
const kPointBright = rgba(255, 236, 190, 255);
const kTarget = rgba(103, 196, 178, 235);

export interface OverlayAnt {
  screen: Vec2; // where the ant is drawn, in screen pixels
  ringPx: number; // radius of the ring around it
  heading: number; // world heading, radians; the camera does not rotate, so it is also the screen heading
}

export interface OverlayOptions {
  ant: OverlayAnt;
  sensors: SensorView | null; // null when the sensors are off
  scale: number; // screen pixels per world unit
  toScreen: (world: Vec2) => Vec2;
}

// The two edges of the cone, from the ant out to its radius.
export function wedgeEdgePoints(ant: Vec2, heading: number, halfFov: number, radiusPx: number): [Vec2, Vec2] {
  return [
    { x: ant.x + Math.cos(heading - halfFov) * radiusPx, y: ant.y + Math.sin(heading - halfFov) * radiusPx },
    { x: ant.x + Math.cos(heading + halfFov) * radiusPx, y: ant.y + Math.sin(heading + halfFov) * radiusPx },
  ];
}

function mix(a: Rgba8, b: Rgba8, t: number): Rgba8 {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
    a: Math.round(a.a + (b.a - a.a) * t),
  };
}

export function buildInspectorOverlay(batch: GeometryBatch, options: OverlayOptions): void {
  const { ant, sensors, scale, toScreen } = options;
  const center = ant.screen;

  const onRing = (angle: number, radius: number): Vec2 => ({
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  });
  const inner = ant.ringPx - kRingWidthPx / 2;
  const outer = ant.ringPx + kRingWidthPx / 2;
  for (let i = 0; i < kRingSegments; i++) {
    const a0 = (i / kRingSegments) * Math.PI * 2;
    const a1 = ((i + 1) / kRingSegments) * Math.PI * 2;
    batch.addQuad(onRing(a0, inner), onRing(a0, outer), onRing(a1, outer), onRing(a1, inner), kRing);
  }

  if (sensors === null) return;

  const halfFov = sensors.fovHalfRad;
  const radiusPx = sensors.radius * scale;
  const [left, right] = wedgeEdgePoints(center, ant.heading, halfFov, radiusPx);
  batch.addLine(center, left, kEdgeWidthPx, kCone);
  batch.addLine(center, right, kEdgeWidthPx, kCone);
  let prev = left;
  for (let i = 1; i <= kArcSegments; i++) {
    const angle = ant.heading - halfFov + (2 * halfFov * i) / kArcSegments;
    const next = { x: center.x + Math.cos(angle) * radiusPx, y: center.y + Math.sin(angle) * radiusPx };
    batch.addLine(prev, next, kEdgeWidthPx, kCone);
    prev = next;
  }

  for (let k = 0; k < sensors.count; k++) {
    const p = toScreen({ x: sensors.points[2 * k], y: sensors.points[2 * k + 1] });
    const t = 1 - Math.exp(-sensors.scores[k]);
    batch.addCircle(p, kPointMinPx + kPointRangePx * t, mix(kPointDim, kPointBright, t), kPointSegments);
  }

  if (sensors.target !== null) {
    const target = toScreen(sensors.target);
    batch.addLine(center, target, kEdgeWidthPx * 1.5, kTarget);
    batch.addCircle(target, kTargetRadiusPx, kTarget, kPointSegments);
  }
}
