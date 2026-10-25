import { FixedStepClock } from "../core/fixed_step.js";
import type { Vec2 } from "../core/vec2.js";
import { Camera } from "../render/camera.js";
import { GlRenderer } from "../render/gl_renderer.js";
import { nightTheme } from "../render/theme.js";
import { cycleHeatmap, defaultViewSettings } from "../render/view_settings.js";
import { createWorldRenderCache, drawWorld } from "../render/world_view.js";
import { defaultParams } from "../sim/params.js";
import { loadPreset, quickStartSetup } from "../sim/presets.js";
import { worldFromSetup } from "../sim/setup_apply.js";
import { stepWorld } from "../sim/world.js";
import { AppShell, type ShellFrame, type ShellHooks, type SpeedSetting } from "../ui/shell.js";
import type { AppOptions } from "./options.js";

const kMaxFrameSeconds = 0.25;
const kZoomStep = 1.15;

export function runInteractive(
  options: AppOptions,
  canvas: HTMLCanvasElement,
  uiRoot: HTMLElement,
  log: (line: string) => void = (line) => console.log(line),
): void {
  const created = GlRenderer.create(canvas);
  if ("error" in created) {
    log(`error: ${created.error}`);
    return;
  }
  const renderer = created.renderer;
  renderer.resizeToDisplaySize();

  let setup = loadPreset(options.preset, options.seed);
  if (setup === null) {
    log(`error: unknown preset: ${options.preset}`);
    log("falling back to meadow");
    setup = quickStartSetup(options.seed);
  }
  const world = worldFromSetup(setup, defaultParams());

  const theme = nightTheme();
  const settings = defaultViewSettings();
  const cache = createWorldRenderCache(renderer, world);
  const camera = new Camera();
  const clock = new FixedStepClock(1 / world.params.simHz, 16);

  let paused = false;
  let zen = false;
  let speed: SpeedSetting = 1;
  let stepRequests = 0;
  let dragging = false;
  let frameMs = 1000 / 60;
  let lastTime = performance.now();
  let stepsThisFrame = 0;
  let viewportW = 0;
  let viewportH = 0;
  let fitted = false;
  let rafId = 0;

  const dpr = (): number => window.devicePixelRatio || 1;
  const speedSteps = (setting: SpeedSetting): number => (setting === "max" ? 1000 : setting);

  const hooks: ShellHooks = {
    onPause: () => {
      paused = !paused;
    },
    onStep: () => {
      stepRequests += 1;
    },
    onSpeed: (value) => {
      speed = value;
    },
    onHeatmap: () => {
      settings.heatmap = cycleHeatmap(settings.heatmap);
    },
    onAnts: () => {
      settings.showAnts = !settings.showAnts;
    },
    onGrid: () => {
      settings.showGrid = !settings.showGrid;
    },
    onResetParams: () => {
      Object.assign(world.params, defaultParams());
    },
    onResetCamera: () => {
      camera.fit(world.size);
    },
    onParam: (key, value) => {
      world.params[key] = value;
    },
  };

  const shell = new AppShell(uiRoot, world.params, hooks);

  log("renderer: webgl2");
  log(`display scale: ${dpr().toFixed(2)}`);

  const frame = (now: number): void => {
    rafId = requestAnimationFrame(frame);
    const frameSeconds = Math.min(Math.max((now - lastTime) / 1000, 0), kMaxFrameSeconds);
    lastTime = now;
    frameMs = frameMs * 0.9 + frameSeconds * 1000 * 0.1;

    renderer.resizeToDisplaySize();
    const size = renderer.sizePx();
    if (size.x === 0 || size.y === 0) return;
    if (size.x !== viewportW || size.y !== viewportH) {
      viewportW = size.x;
      viewportH = size.y;
      camera.setViewport(size);
    }
    if (!fitted) {
      camera.fit(world.size);
      fitted = true;
    }

    stepsThisFrame = clock.advance(frameSeconds, paused ? 0 : speedSteps(speed));
    if (stepRequests > 0) {
      stepsThisFrame += stepRequests;
      stepRequests = 0;
    }
    for (let i = 0; i < stepsThisFrame; i++) stepWorld(world);

    drawWorld(renderer, cache, world, camera, settings, theme, paused ? 1 : clock.alpha());
    renderer.present();

    let delivered = 0;
    for (const colony of world.colonies) delivered += colony.deliveredTotal;
    const shellFrame: ShellFrame = {
      fps: 1000 / Math.max(frameMs, 0.001),
      frameMs,
      tick: world.tick,
      ants: world.ants.size(),
      delivered,
      paused,
      speed,
      heatmap: settings.heatmap,
      showAnts: settings.showAnts,
      showGrid: settings.showGrid,
      stepsThisFrame,
    };
    shell.update(shellFrame);
  };

  const screenPoint = (event: MouseEvent): Vec2 => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * dpr(), y: (event.clientY - rect.top) * dpr() };
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    camera.zoomAt(screenPoint(event), Math.pow(kZoomStep, -event.deltaY / 100));
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 1 && event.button !== 2) return;
    event.preventDefault();
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 1 && event.button !== 2) return;
    dragging = false;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging) return;
    camera.panByScreen({ x: event.movementX * dpr(), y: event.movementY * dpr() });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    switch (event.code) {
      case "KeyP":
        paused = !paused;
        break;
      case "Space":
        if (paused) stepRequests += 1;
        event.preventDefault();
        break;
      case "KeyH":
        zen = !zen;
        shell.setVisible(!zen);
        break;
      case "KeyM":
        settings.heatmap = cycleHeatmap(settings.heatmap);
        break;
      case "KeyA":
        settings.showAnts = !settings.showAnts;
        break;
      case "KeyG":
        settings.showGrid = !settings.showGrid;
        break;
      case "KeyS":
        speed = "max";
        break;
      case "Home":
        camera.fit(world.size);
        break;
      default:
        break;
    }
  };

  const onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  const onPageHide = (): void => {
    cancelAnimationFrame(rafId);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("pagehide", onPageHide);
  };

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("pagehide", onPageHide);

  rafId = requestAnimationFrame(frame);
}
