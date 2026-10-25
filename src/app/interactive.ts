import { AppController } from "./controller.js";
import type { AppOptions } from "./options.js";

export function runInteractive(
  options: AppOptions,
  canvas: HTMLCanvasElement,
  uiRoot: HTMLElement,
  log: (line: string) => void = (line) => console.log(line),
): void {
  new AppController(options, canvas, uiRoot, log).start();
}
