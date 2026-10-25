import test from "node:test";
import assert from "node:assert/strict";

import {
  CameraInput,
  classifyWheel,
  kZoomKeyStep,
  pinchStep,
  type WheelLike,
} from "../../src/app/camera_input.js";
import { Camera } from "../../src/render/camera.js";

function near(actual: number, expected: number, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${expected}, got ${actual}`);
}

function wheel(fields: Partial<WheelLike>): WheelLike {
  return { deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, timeStamp: 0, ...fields };
}

// A 1000 x 500 viewport on a 2000 x 1000 world: scale 0.5, centred on (1000, 500).
function rig(pixelRatio = 1): { camera: Camera; input: CameraInput } {
  const camera = new Camera();
  camera.setViewport({ x: 1000, y: 500 });
  camera.fit({ x: 2000, y: 1000 });
  const input = new CameraInput(camera);
  input.setPixelRatio(pixelRatio);
  return { camera, input };
}

test("wheel: ctrl plus wheel is a touchpad pinch", () => {
  assert.equal(classifyWheel(wheel({ deltaY: -3.5, ctrlKey: true }), -Infinity), "pinch");
});

test("wheel: a whole 100-unit notch with no x is a mouse zoom", () => {
  assert.equal(classifyWheel(wheel({ deltaY: 100 }), -Infinity), "zoom");
  assert.equal(classifyWheel(wheel({ deltaY: -150, deltaMode: 1 }), -Infinity), "zoom");
});

test("wheel: fractional or sideways deltas are a touchpad pan", () => {
  assert.equal(classifyWheel(wheel({ deltaY: 3.5 }), -Infinity), "pan");
  assert.equal(classifyWheel(wheel({ deltaX: 2 }), -Infinity), "pan");
});

test("wheel: a pan gesture holds for 250 ms", () => {
  assert.equal(classifyWheel(wheel({ deltaY: 100, timeStamp: 1200 }), 1000), "pan");
  assert.equal(classifyWheel(wheel({ deltaY: 100, timeStamp: 1300 }), 1000), "zoom");
});

test("pinch: fingers going from 100 to 200 px apart double the zoom at their midpoint", () => {
  const step = pinchStep(
    { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
    { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } },
  );
  near(step.factor, 2);
  near(step.anchor.x, 100);
  near(step.anchor.y, 0);
  near(step.pan.x, 50);
});

test("drag: a 100 px drag moves the centre by minus 100 over the scale", () => {
  const { camera, input } = rig();
  input.pointerDown(1, { x: 400, y: 200 }, "pan");
  input.pointerMove(1, { x: 500, y: 200 });
  near(camera.center().x, 1000 - 100 / 0.5);
  near(camera.center().y, 500);
});

test("drag: a press that moves under 4 px is a click, and the drag then counts all of its movement", () => {
  const { camera, input } = rig();
  input.pointerDown(1, { x: 400, y: 200 }, "pan-after-slop");
  input.pointerMove(1, { x: 402, y: 200 });
  near(camera.center().x, 1000);
  input.pointerMove(1, { x: 500, y: 200 });
  near(camera.center().x, 1000 - 100 / 0.5);
});

test("drag: a tool press never pans", () => {
  const { camera, input } = rig();
  input.pointerDown(1, { x: 400, y: 200 }, "tool");
  input.pointerMove(1, { x: 600, y: 200 });
  near(camera.center().x, 1000);
  assert.equal(input.dragging(), false);
});

test("pinch: a second pointer turns a tool press into a pinch, so no drag runs", () => {
  const { input } = rig();
  input.pointerDown(1, { x: 400, y: 200 }, "tool");
  input.pointerDown(2, { x: 600, y: 200 }, "tool");
  assert.equal(input.pinching(), true);
  assert.equal(input.dragging(), false);
});

test("pinch: spreading two fingers doubles the zoom around their midpoint", () => {
  const { camera, input } = rig();
  input.pointerDown(1, { x: 100, y: 200 }, "pan");
  input.pointerDown(2, { x: 200, y: 200 }, "pan");
  input.pointerMove(2, { x: 300, y: 200 });
  near(camera.scale(), 1);
});

test("pinch: lifting one finger hands the view to the other without a jump", () => {
  const { camera, input } = rig();
  input.pointerDown(1, { x: 100, y: 200 }, "tool");
  input.pointerDown(2, { x: 300, y: 200 }, "tool");
  input.pointerUp(2);
  const before = camera.center();
  input.pointerMove(1, { x: 110, y: 200 });
  near(camera.center().x, before.x - 10 / 0.5);
  near(camera.center().y, before.y);
});

test("wheel: a mouse notch zooms out over 120 ms, not in one step", () => {
  const { camera, input } = rig();
  input.wheel(wheel({ deltaY: 100, timeStamp: 0 }), { x: 500, y: 250 });
  near(camera.scale(), 0.5);
  input.update(0.06);
  assert.ok(camera.scale() < 0.5 && camera.scale() > 0.5 / 1.15, `mid-way, got ${camera.scale()}`);
  input.update(0.06);
  near(camera.scale(), 0.5 / 1.15);
});

test("wheel: a touchpad pinch zooms at once around the cursor", () => {
  const { camera, input } = rig();
  input.wheel(wheel({ deltaY: -10, ctrlKey: true }), { x: 500, y: 250 });
  near(camera.scale(), 0.5 * Math.exp(0.1));
});

test("wheel: a touchpad scroll pans in device pixels", () => {
  const { camera, input } = rig(2);
  input.wheel(wheel({ deltaY: 3.5, timeStamp: 0 }), { x: 500, y: 250 });
  near(camera.center().y, 500 + 7 / 0.5);
});

test("keys: a held pan key moves the view at 900 CSS px per second", () => {
  const { camera, input } = rig();
  input.setKeyPan(1, 0);
  input.update(0.5);
  near(camera.center().x, 1000 + 450 / 0.5);
});

test("keys: the plus and minus keys step the scale about the view centre", () => {
  const { camera, input } = rig();
  input.zoomCentre(kZoomKeyStep);
  near(camera.scale(), 0.5 * 1.25);
  near(camera.center().x, 1000);
  near(camera.center().y, 500);
});

test("double-click: zooms by 2 and keeps the point under the cursor", () => {
  const { camera, input } = rig();
  const point = { x: 300, y: 100 };
  const before = camera.screenToWorld(point);
  input.zoomAt(point, 2);
  near(camera.scale(), 1);
  const after = camera.screenToWorld(point);
  near(after.x, before.x);
  near(after.y, before.y);
});
