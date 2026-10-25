import type { Rgba8 } from "../core/color.js";
import { kTwoPi } from "../core/math.js";
import type { Rect } from "../core/rect.js";
import type { Vec2 } from "../core/vec2.js";

export class GeometryBatch {
  private readonly positions: number[] = [];
  private readonly vertexIndices: number[] = [];

  clear(): void {
    this.positions.length = 0;
    this.vertexIndices.length = 0;
  }

  vertexCount(): number {
    return this.positions.length / 6;
  }

  indexCount(): number {
    return this.vertexIndices.length;
  }

  vertexData(): Float32Array {
    return Float32Array.from(this.positions);
  }

  indices(): Uint32Array {
    return Uint32Array.from(this.vertexIndices);
  }

  addTriangle(a: Vec2, b: Vec2, c: Vec2, color: Rgba8): void {
    const base = this.vertexCount();
    this.pushVertex(a, color);
    this.pushVertex(b, color);
    this.pushVertex(c, color);
    this.vertexIndices.push(base, base + 1, base + 2);
  }

  addQuad(a: Vec2, b: Vec2, c: Vec2, d: Vec2, color: Rgba8): void {
    const base = this.vertexCount();
    this.pushVertex(a, color);
    this.pushVertex(b, color);
    this.pushVertex(c, color);
    this.pushVertex(d, color);
    this.vertexIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  addRect(min: Vec2, max: Vec2, color: Rgba8): void {
    this.addQuad(
      min,
      { x: max.x, y: min.y },
      max,
      { x: min.x, y: max.y },
      color,
    );
  }

  addLine(a: Vec2, b: Vec2, width: number, color: Rgba8): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len <= 0) return;
    const nx = (-dy / len) * (width / 2);
    const ny = (dx / len) * (width / 2);
    this.addQuad(
      { x: a.x - nx, y: a.y - ny },
      { x: b.x - nx, y: b.y - ny },
      { x: b.x + nx, y: b.y + ny },
      { x: a.x + nx, y: a.y + ny },
      color,
    );
  }

  addCircle(center: Vec2, radius: number, color: Rgba8, segments = 24): void {
    const hub = this.pushVertex(center, color);
    const first = this.vertexCount();
    for (let i = 0; i < segments; i++) {
      const angle = (kTwoPi * i) / segments;
      this.pushVertex(
        { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius },
        color,
      );
    }
    for (let i = 0; i < segments; i++) {
      const current = first + i;
      const next = first + ((i + 1) % segments);
      this.vertexIndices.push(hub, current, next);
    }
  }

  private pushVertex(p: Vec2, color: Rgba8): number {
    const index = this.vertexCount();
    this.positions.push(p.x, p.y, color.r / 255, color.g / 255, color.b / 255, color.a / 255);
    return index;
  }
}
