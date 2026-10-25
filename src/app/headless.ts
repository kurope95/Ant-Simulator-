import { GeometryBatch } from "../render/batch.js";
import { Camera } from "../render/camera.js";
import { GlRenderer } from "../render/gl_renderer.js";
import { buildTestPattern } from "../render/test_pattern.js";
import { sandTheme } from "../render/theme.js";
import { defaultParams } from "../sim/params.js";
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
  const camera = new Camera();
  camera.setViewport(renderer.sizePx());
  camera.fit(world.size);

  const ticks = effectiveTicks(options);
  for (let i = 0; i < ticks; i++) stepWorld(world);

  const theme = sandTheme();
  renderer.clear(theme.outside);
  const batch = new GeometryBatch();
  buildTestPattern(batch, camera, world.size, theme, world.tick / world.params.simHz);
  renderer.drawBatch(batch);
  renderer.present();

  const size = renderer.sizePx();
  log("renderer: webgl2");
  log(`screenshot: ${size.x}x${size.y}, tick ${world.tick}`);
  document.title = `headless ${size.x}x${size.y} tick ${world.tick}`;
  (window as unknown as { __antsimReady: boolean }).__antsimReady = true;
  return 0;
}
