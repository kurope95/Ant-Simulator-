import { clamp } from "../core/math.js";
import type { Rect } from "../core/rect.js";
import type { Vec2 } from "../core/vec2.js";

export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const kNoInsets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

export class Camera {
  static readonly kMinScale = 0.05;
  static readonly kMaxScale = 16;
  // After a fit, zooming out stops at this share of the fit scale.
  static readonly kMinScaleOfFit = 0.6;

  private centerVec: Vec2 = { x: 0, y: 0 };
  private viewportSize: Vec2 = { x: 0, y: 0 };
  private camScale = 1;
  private minScale: number = Camera.kMinScale;
  private maxScale: number = Camera.kMaxScale;
  private ratio = 1; // device pixels per CSS pixel

  // Sprites keep minimum sizes in CSS pixels, so they stay readable on any display.
  setPixelRatio(ratio: number): void {
    this.ratio = ratio > 0 ? ratio : 1;
  }

  pixelRatio(): number {
    return this.ratio;
  }

  setViewport(size: Vec2): void {
    this.viewportSize = { x: size.x, y: size.y };
  }

  viewport(): Vec2 {
    return { x: this.viewportSize.x, y: this.viewportSize.y };
  }

  scale(): number {
    return this.camScale;
  }

  center(): Vec2 {
    return { x: this.centerVec.x, y: this.centerVec.y };
  }

  // Fits the world into the viewport less `inset` (in viewport pixels), so
  // panels along the edges do not cover the map, and centres it in that space.
  fit(worldSize: Vec2, inset: Insets = kNoInsets): void {
    const freeW = Math.max(1, this.viewportSize.x - inset.left - inset.right);
    const freeH = Math.max(1, this.viewportSize.y - inset.top - inset.bottom);
    this.camScale = clamp(Math.min(freeW / worldSize.x, freeH / worldSize.y), Camera.kMinScale, Camera.kMaxScale);
    this.setScaleLimits(this.camScale * Camera.kMinScaleOfFit, Camera.kMaxScale);
    this.centerVec = {
      x: worldSize.x / 2 - (inset.left - inset.right) / 2 / this.camScale,
      y: worldSize.y / 2 - (inset.top - inset.bottom) / 2 / this.camScale,
    };
  }

  setScaleLimits(min: number, max: number): void {
    this.minScale = min;
    this.maxScale = max;
    this.camScale = clamp(this.camScale, min, max);
  }

  // Keeps the centre on the world, so a pan can't carry the whole view off it.
  clampCenter(worldSize: Vec2): void {
    this.centerVec = {
      x: clamp(this.centerVec.x, 0, worldSize.x),
      y: clamp(this.centerVec.y, 0, worldSize.y),
    };
  }

  worldToScreen(world: Vec2): Vec2 {
    return {
      x: (world.x - this.centerVec.x) * this.camScale + this.viewportSize.x / 2,
      y: (world.y - this.centerVec.y) * this.camScale + this.viewportSize.y / 2,
    };
  }

  screenToWorld(screen: Vec2): Vec2 {
    return {
      x: (screen.x - this.viewportSize.x / 2) / this.camScale + this.centerVec.x,
      y: (screen.y - this.viewportSize.y / 2) / this.camScale + this.centerVec.y,
    };
  }

  zoomAt(screenPoint: Vec2, factor: number): void {
    const anchor = this.screenToWorld(screenPoint);
    this.camScale = clamp(this.camScale * factor, this.minScale, this.maxScale);
    this.centerVec = {
      x: anchor.x - (screenPoint.x - this.viewportSize.x / 2) / this.camScale,
      y: anchor.y - (screenPoint.y - this.viewportSize.y / 2) / this.camScale,
    };
  }

  panByScreen(delta: Vec2): void {
    this.centerVec = {
      x: this.centerVec.x - delta.x / this.camScale,
      y: this.centerVec.y - delta.y / this.camScale,
    };
  }

  centerOn(world: Vec2): void {
    this.centerVec = { x: world.x, y: world.y };
  }

  visibleWorldRect(): Rect {
    return {
      min: this.screenToWorld({ x: 0, y: 0 }),
      max: this.screenToWorld({ x: this.viewportSize.x, y: this.viewportSize.y }),
    };
  }
}
