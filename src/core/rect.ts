import type { Vec2 } from "./vec2.js";

export interface Rect {
  min: Vec2;
  max: Vec2;
}

export function contains(rect: Rect, p: Vec2): boolean {
  return p.x >= rect.min.x && p.x <= rect.max.x && p.y >= rect.min.y && p.y <= rect.max.y;
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.y <= b.max.y && a.max.y >= b.min.y;
}

export function expanded(rect: Rect, amount: number): Rect {
  return {
    min: { x: rect.min.x - amount, y: rect.min.y - amount },
    max: { x: rect.max.x + amount, y: rect.max.y + amount },
  };
}
