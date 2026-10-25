import { buildInfo } from "../core/build_info.js";
import { runHeadless } from "./headless.js";
import { runInteractive } from "./interactive.js";
import { Mode, optionsFromUrl, usageText } from "./options.js";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`missing element #${id}`);
  return found as T;
}

const canvas = element<HTMLCanvasElement>("view");
const logElement = element<HTMLDivElement>("log");
const uiRoot = element<HTMLDivElement>("ui");
const lines: string[] = [];

function say(line: string): void {
  lines.push(line);
  logElement.textContent = lines.join("\n");
  console.log(line);
}

const parsed = optionsFromUrl(location.search);

if (parsed.error !== "") {
  say(`error: ${parsed.error}`);
  say("");
  say(usageText());
} else {
  const options = parsed.options;
  say(buildInfo());
  switch (options.mode) {
    case Mode.Headless: {
      const code = runHeadless(options, canvas, say);
      if (code !== 0) say("headless render failed");
      break;
    }
    case Mode.Help:
      say(usageText());
      break;
    case Mode.Version:
      say(`version ${buildInfo()}`);
      break;
    case Mode.Bench:
      say("run the bench in Node: npm run bench -- --scenario sandbox --ticks 1200");
      break;
    case Mode.Interactive:
      runInteractive(options, canvas, uiRoot, say);
      break;
  }
}
