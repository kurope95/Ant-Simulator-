import { Camera } from "../render/camera.js";
import { GlRenderer } from "../render/gl_renderer.js";
import { themeForPreset } from "../render/theme.js";
import { defaultViewSettings } from "../render/view_settings.js";
import { createWorldRenderCache, drawWorld } from "../render/world_view.js";
import { defaultParams } from "../sim/params.js";
import { loadPreset } from "../sim/presets.js";
import { worldFromSetup } from "../sim/setup_apply.js";
import { stepWorld, applyBreach } from "../sim/world.js";
import { effectiveTicks, type AppOptions } from "./options.js";

export function runHeadless(
  options: AppOptions,
  canvas: HTMLCanvasElement,
  log: (line: string) => void = (line) => console.log(line),
): number {
  const created = GlRenderer.create(canvas);
  if ("error" in created) {
    log(`error: ${created.error}`);
    return 1;
  }
  const renderer = created.renderer;
  renderer.setBackingSize(options.width, options.height);
  document.body.classList.add("headless");

  const setup = loadPreset(options.preset, options.seed);
  if (setup === null) {
    log(`error: unknown preset: ${options.preset}`);
    return 1;
  }
  const world = worldFromSetup(setup, defaultParams());

  const camera = new Camera();
  camera.setViewport(renderer.sizePx());
  camera.setPixelRatio(window.devicePixelRatio || 1);
  camera.fit(world.size);
  if (options.zoom !== 1) {
    const size = renderer.sizePx();
    camera.zoomAt({ x: size.x / 2, y: size.y / 2 }, options.zoom);
  }
  if (options.focus !== null) camera.centerOn(options.focus);

  const ticks = effectiveTicks(options);
  let breached = false;
  for (let i = 0; i < ticks; i++) {
    stepWorld(world);
    if (!breached && options.breachTick >= 0 && world.tick >= options.breachTick) {
      applyBreach(world, setup.breach);
      breached = setup.breach.length > 0;
    }
  }

  const settings = defaultViewSettings();
  const theme = themeForPreset(setup.presetId);
  const cache = createWorldRenderCache(renderer, world);
  drawWorld(renderer, cache, world, camera, settings, theme, 1);
  renderer.present();

  const size = renderer.sizePx();
  log("renderer: webgl2");
  log(`screenshot: ${size.x}x${size.y}, tick ${world.tick}`);
  document.title = `headless ${size.x}x${size.y} tick ${world.tick}`;
  (window as unknown as { __antsimReady: boolean }).__antsimReady = true;
  return 0;
}
