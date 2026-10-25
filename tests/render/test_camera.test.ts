import test from "node:test";
import assert from "node:assert/strict";

import { Camera } from "../../src/render/camera.js";

function near(actual: number, expected: number, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${expected}, got ${actual}`);
}

test("camera: fit centres the world and scales it to the viewport", () => {
  const cam = new Camera();
  cam.setViewport({ x: 1000, y: 500 });
  cam.fit({ x: 2000, y: 1000 });
  near(cam.scale(), 0.5);
  const mid = cam.worldToScreen({ x: 1000, y: 500 });
  near(mid.x, 500);
  near(mid.y, 250);
  const origin = cam.worldToScreen({ x: 0, y: 0 });
  near(origin.x, 0);
  near(origin.y, 0);
  const v = cam.visibleWorldRect();
  near(v.min.x, 0);
  near(v.min.y, 0);
  near(v.max.x, 2000);
  near(v.max.y, 1000);
});

test("camera: screenToWorld inverts worldToScreen", () => {
  const cam = new Camera();
  cam.setViewport({ x: 2880, y: 1620 });
  cam.fit({ x: 1920, y: 1080 });
  cam.zoomAt({ x: 100, y: 200 }, 3);
  cam.panByScreen({ x: 37, y: -12 });
  const w = { x: 123, y: 456 };
  const back = cam.screenToWorld(cam.worldToScreen(w));
  near(back.x, w.x);
  near(back.y, w.y);
});

test("camera: zoom keeps the point under the cursor fixed", () => {
  const cam = new Camera();
  cam.setViewport({ x: 1000, y: 500 });
  cam.fit({ x: 2000, y: 1000 });
  const cursor = { x: 300, y: 200 };
  const before = cam.screenToWorld(cursor);
  cam.zoomAt(cursor, 2);
  near(cam.scale(), 1);
  const after = cam.screenToWorld(cursor);
  near(after.x, before.x);
  near(after.y, before.y);
});

test("camera: pan moves content with the mouse", () => {
  const cam = new Camera();
  cam.setViewport({ x: 1000, y: 500 });
  cam.fit({ x: 2000, y: 1000 });
  const w = cam.screenToWorld({ x: 400, y: 100 });
  cam.panByScreen({ x: 50, y: -20 });
  const moved = cam.worldToScreen(w);
  near(moved.x, 450);
  near(moved.y, 80);
});

test("camera: zoom is clamped", () => {
  const cam = new Camera();
  cam.setViewport({ x: 1000, y: 500 });
  cam.fit({ x: 2000, y: 1000 });
  for (let i = 0; i < 100; i++) cam.zoomAt({ x: 500, y: 250 }, 10);
  assert.equal(cam.scale(), Camera.kMaxScale);
  for (let i = 0; i < 100; i++) cam.zoomAt({ x: 500, y: 250 }, 0.01);
  near(cam.scale(), 0.6 * 0.5); // the floor is 0.6 of the fit scale (0.5), not an absolute 0.05
});

test("camera: a zero-size viewport never produces NaN", () => {
  const cam = new Camera();
  cam.setViewport({ x: 0, y: 0 });
  cam.fit({ x: 1920, y: 1080 });
  assert.equal(cam.scale(), Camera.kMinScale);
  const s = cam.worldToScreen({ x: 10, y: 10 });
  const w = cam.screenToWorld({ x: 0, y: 0 });
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y));
  assert.ok(Number.isFinite(w.x) && Number.isFinite(w.y));
});

test("camera: resizing the viewport keeps centre and scale", () => {
  const cam = new Camera();
  cam.setViewport({ x: 1000, y: 500 });
  cam.fit({ x: 2000, y: 1000 });
  cam.setViewport({ x: 1600, y: 900 });
  near(cam.scale(), 0.5);
  near(cam.center().x, 1000);
  near(cam.center().y, 500);
});

test("camera: setScaleLimits sets the zoom range", () => {
  const cam = new Camera();
  cam.setViewport({ x: 1000, y: 500 });
  cam.fit({ x: 2000, y: 1000 });
  cam.setScaleLimits(0.25, 4);
  for (let i = 0; i < 100; i++) cam.zoomAt({ x: 500, y: 250 }, 10);
  assert.equal(cam.scale(), 4);
  for (let i = 0; i < 100; i++) cam.zoomAt({ x: 500, y: 250 }, 0.01);
  assert.equal(cam.scale(), 0.25);
});

test("camera: clampCenter keeps the centre inside the world", () => {
  const cam = new Camera();
  cam.setViewport({ x: 1000, y: 500 });
  cam.fit({ x: 2000, y: 1000 });
  cam.centerOn({ x: -300, y: 1400 });
  cam.clampCenter({ x: 2000, y: 1000 });
  near(cam.center().x, 0);
  near(cam.center().y, 1000);
  cam.centerOn({ x: 1500, y: 250 });
  cam.clampCenter({ x: 2000, y: 1000 });
  near(cam.center().x, 1500);
  near(cam.center().y, 250);
});
