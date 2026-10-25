import type { Vec2 } from "../core/vec2.js";
import type { Camera } from "../render/camera.js";

export type WheelIntent = "zoom" | "pinch" | "pan";
// "pan": the drag moves the view at once (right or middle button, or a pinch's second pointer).
// "pan-after-slop": the press pans once it has moved 4 px, so a click stays a click.
// "tool": a builder tool owns the press, and the camera ignores its moves.
export type PressMode = "pan" | "pan-after-slop" | "tool";

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  timeStamp: number;
}

export interface Touch2 {
  a: Vec2;
  b: Vec2;
}

export const kZoomKeyStep = 1.25;

const kPanHoldMs = 250;
const kNotchZoomStep = 1.15;
const kNotchSeconds = 0.12;
const kPinchRate = 0.01;
const kDragSlopCss = 4;
const kKeyPanCssPerSecond = 900;

// Chrome reports a touchpad pinch as ctrl+wheel; notched mice send whole multiples of 50 with no x;
// touchpad scroll sends small or fractional deltas. Stay "pan" for 250 ms once a pan gesture starts.
export function classifyWheel(e: WheelLike, lastPanMs: number): WheelIntent {
  if (e.ctrlKey) return "pinch";
  if (e.deltaMode !== 0) return "zoom";
  if (e.timeStamp - lastPanMs < kPanHoldMs) return "pan";
  if (e.deltaX !== 0) return "pan";
  const notch = Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50 && e.deltaY % 50 === 0;
  return notch ? "zoom" : "pan";
}

export function pinchStep(prev: Touch2, next: Touch2): { anchor: Vec2; factor: number; pan: Vec2 } {
  const mid = (t: Touch2) => ({ x: (t.a.x + t.b.x) / 2, y: (t.a.y + t.b.y) / 2 });
  const dist = (t: Touch2) => Math.hypot(t.a.x - t.b.x, t.a.y - t.b.y);
  const m0 = mid(prev);
  const m1 = mid(next);
  return {
    anchor: m1,
    factor: dist(next) / Math.max(dist(prev), 1),
    pan: { x: m1.x - m0.x, y: m1.y - m0.y },
  };
}

// Turns pointer, wheel and key input into camera moves. It takes plain values
// (device pixels, seconds), so the controller does the DOM work.
export class CameraInput {
  private readonly camera: Camera;
  private readonly pointers = new Map<number, Vec2>();
  private dragId = -1;
  private slopId = -1;
  private slopOrigin: Vec2 = { x: 0, y: 0 };
  private pixelRatio = 1;
  private lastPanMs = -Infinity;
  private notchTotal = 0;
  private notchApplied = 0;
  private notchElapsed = 0;
  private notchAnchor: Vec2 = { x: 0, y: 0 };
  private keyPan: Vec2 = { x: 0, y: 0 };

  constructor(camera: Camera) {
    this.camera = camera;
  }

  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
  }

  pointerCount(): number {
    return this.pointers.size;
  }

  pinching(): boolean {
    return this.pointers.size >= 2;
  }

  dragging(): boolean {
    return this.dragId >= 0;
  }

  pointerDown(id: number, point: Vec2, mode: PressMode): void {
    this.pointers.set(id, { x: point.x, y: point.y });
    if (this.pointers.size >= 2) {
      // A second pointer makes the press a pinch: no drag and no slop.
      this.dragId = -1;
      this.slopId = -1;
      return;
    }
    if (mode === "pan") {
      this.dragId = id;
    } else if (mode === "pan-after-slop") {
      this.slopId = id;
      this.slopOrigin = { x: point.x, y: point.y };
    }
  }

  pointerMove(id: number, point: Vec2): void {
    const previous = this.pointers.get(id);
    if (previous === undefined) return;
    const before = this.firstTwo();
    this.pointers.set(id, { x: point.x, y: point.y });
    if (before !== null) {
      const after = this.firstTwo();
      if (after !== null) this.applyPinch(before, after);
      return;
    }
    if (id === this.dragId) {
      this.camera.panByScreen({ x: point.x - previous.x, y: point.y - previous.y });
      return;
    }
    if (id === this.slopId) {
      const dx = point.x - this.slopOrigin.x;
      const dy = point.y - this.slopOrigin.y;
      if (Math.hypot(dx, dy) < kDragSlopCss * this.pixelRatio) return;
      this.slopId = -1;
      this.dragId = id;
      this.camera.panByScreen({ x: dx, y: dy });
    }
  }

  pointerUp(id: number): void {
    if (!this.pointers.has(id)) return;
    const wasPinching = this.pinching();
    this.pointers.delete(id);
    if (this.slopId === id) this.slopId = -1;
    if (this.dragId === id) this.dragId = -1;
    if (wasPinching && this.pointers.size === 1) {
      // The finger left on the glass carries on from where it is, so the view does not jump.
      const remaining = this.pointers.keys().next();
      if (!remaining.done) this.dragId = remaining.value;
    }
  }

  wheel(e: WheelLike, point: Vec2): void {
    const intent = classifyWheel(e, this.lastPanMs);
    if (intent === "pan") {
      this.lastPanMs = e.timeStamp;
      this.camera.panByScreen({ x: -e.deltaX * this.pixelRatio, y: -e.deltaY * this.pixelRatio });
    } else if (intent === "pinch") {
      this.camera.zoomAt(point, Math.exp(-e.deltaY * kPinchRate));
    } else {
      // A notch eases in over 120 ms; one that arrives mid-ease joins what is left of it.
      const notch = (-e.deltaY / 100) * Math.log(kNotchZoomStep);
      this.notchTotal = this.notchTotal - this.notchApplied + notch;
      this.notchApplied = 0;
      this.notchElapsed = 0;
      this.notchAnchor = { x: point.x, y: point.y };
    }
  }

  // Double-click zooms at its point; the + and - keys zoom about the view centre.
  zoomAt(point: Vec2, factor: number): void {
    this.camera.zoomAt(point, factor);
  }

  zoomCentre(factor: number): void {
    const view = this.camera.viewport();
    this.camera.zoomAt({ x: view.x / 2, y: view.y / 2 }, factor);
  }

  // The direction the view moves while a pan key is held: x and y are -1, 0 or 1.
  setKeyPan(x: number, y: number): void {
    this.keyPan = { x, y };
  }

  // Advances the held-key pan and the notch ease. Call once per frame.
  update(seconds: number): void {
    if (this.keyPan.x !== 0 || this.keyPan.y !== 0) {
      const step = kKeyPanCssPerSecond * seconds * this.pixelRatio;
      this.camera.panByScreen({ x: -this.keyPan.x * step, y: -this.keyPan.y * step });
    }
    if (this.notchTotal !== this.notchApplied) {
      this.notchElapsed += seconds;
      const t = Math.min(1, this.notchElapsed / kNotchSeconds);
      const applied = this.notchTotal * (1 - (1 - t) * (1 - t));
      const step = applied - this.notchApplied;
      this.notchApplied = applied;
      this.camera.zoomAt(this.notchAnchor, Math.exp(step));
      if (t === 1) {
        this.notchTotal = 0;
        this.notchApplied = 0;
      }
    }
  }

  private applyPinch(prev: Touch2, next: Touch2): void {
    const step = pinchStep(prev, next);
    this.camera.panByScreen(step.pan);
    if (step.factor > 0) this.camera.zoomAt(step.anchor, step.factor);
  }

  private firstTwo(): Touch2 | null {
    const iterator = this.pointers.values();
    const first = iterator.next();
    const second = iterator.next();
    if (first.done === true || second.done === true) return null;
    return { a: first.value, b: second.value };
  }
}
