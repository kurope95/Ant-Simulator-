import { Camera } from "../render/camera.js";
import { GlRenderer } from "../render/gl_renderer.js";
import { nightTheme } from "../render/theme.js";
import { defaultViewSettings } from "../render/view_settings.js";
import { createWorldRenderCache, drawWorld } from "../render/world_view.js";
import { defaultParams } from "../sim/params.js";
import { loadScenario } from "../sim/scenarios.js";
import { makeWorld, stepWorld } from "../sim/world.js";
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

  const world = makeWorld(defaultParams(), options.seed);
  const scenarioError = loadScenario(world, options.scenario);
  if (scenarioError !== null) {
    log(`error: ${scenarioError}`);
    return 1;
  }

  const camera = new Camera();
  camera.setViewport(renderer.sizePx());
  camera.fit(world.size);

  const ticks = effectiveTicks(options);
  for (let i = 0; i < ticks; i++) stepWorld(world);

  const settings = defaultViewSettings();
  const cache = createWorldRenderCache(renderer, world);
  drawWorld(renderer, cache, world, camera, settings, nightTheme(), 1);
  renderer.present();

  const size = renderer.sizePx();
  log("renderer: webgl2");
  log(`screenshot: ${size.x}x${size.y}, tick ${world.tick}`);
  document.title = `headless ${size.x}x${size.y} tick ${world.tick}`;
  (window as unknown as { __antsimReady: boolean }).__antsimReady = true;
  return 0;
}
