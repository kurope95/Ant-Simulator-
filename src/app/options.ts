import { kPresetIds } from "../sim/presets.js";

export enum Mode {
  Interactive,
  Headless,
  Bench,
  Help,
  Version,
}

export interface AppOptions {
  mode: Mode;
  preset: string;
  seed: number;
  ticks: number;
  screenshot: string;
  width: number;
  height: number;
  threads: number;
  vsync: boolean;
}

export interface ParseResult {
  options: AppOptions;
  error: string;
}

const kSeedMax = 4294967295;
const kSizeMin = 16;
const kSizeMax = 8192;
const kFlagsInUrl = new Set(["headless", "no-vsync"]);

function defaults(): AppOptions {
  return {
    mode: Mode.Interactive,
    preset: "meadow",
    seed: 1,
    ticks: -1,
    screenshot: "",
    width: 1920,
    height: 1080,
    threads: 0,
    vsync: true,
  };
}

function isDigits(text: string): boolean {
  return /^[0-9]+$/.test(text);
}

const kPresetList = kPresetIds.join(", ");

function presetValue(value: string): string | null {
  if (value === "sandbox") return "meadow";
  return (kPresetIds as readonly string[]).includes(value) ? value : null;
}

export function parseOptions(tokens: readonly string[]): ParseResult {
  const options = defaults();
  let error = "";
  let headless = false;
  let bench = false;

  const take = (index: number, name: string): { value: string; next: number } | null => {
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) {
      error = `missing value for ${name}`;
      return null;
    }
    return { value, next: index + 1 };
  };

  for (let i = 0; i < tokens.length && error === ""; i++) {
    const token = tokens[i];
    switch (token) {
      case "--help":
      case "-h":
        options.mode = Mode.Help;
        return { options, error };
      case "--version":
        options.mode = Mode.Version;
        return { options, error };
      case "--headless":
        headless = true;
        options.mode = Mode.Headless;
        break;
      case "--no-vsync":
        options.vsync = false;
        break;
      case "--preset":
      case "--scenario": {
        const taken = take(i, token);
        if (taken === null) break;
        const preset = presetValue(taken.value);
        if (preset === null) {
          error = `unknown preset: ${taken.value} (expected ${kPresetList})`;
          break;
        }
        options.preset = preset;
        i = taken.next;
        break;
      }
      case "--seed": {
        const taken = take(i, "--seed");
        if (taken === null) break;
        if (!isDigits(taken.value) || Number(taken.value) > kSeedMax) {
          error = `invalid value for --seed: ${taken.value}`;
          break;
        }
        options.seed = Number(taken.value);
        i = taken.next;
        break;
      }
      case "--ticks": {
        const taken = take(i, "--ticks");
        if (taken === null) break;
        if (!isDigits(taken.value)) {
          error = `invalid value for --ticks: ${taken.value}`;
          break;
        }
        options.ticks = Number(taken.value);
        i = taken.next;
        break;
      }
      case "--screenshot": {
        const taken = take(i, "--screenshot");
        if (taken === null) break;
        options.screenshot = taken.value;
        i = taken.next;
        break;
      }
      case "--size": {
        const taken = take(i, "--size");
        if (taken === null) break;
        const match = /^([0-9]+)x([0-9]+)$/.exec(taken.value);
        const width = match ? Number(match[1]) : 0;
        const height = match ? Number(match[2]) : 0;
        if (width < kSizeMin || width > kSizeMax || height < kSizeMin || height > kSizeMax) {
          error = `invalid value for --size: ${taken.value} (expected WxH, e.g. 1920x1080)`;
          break;
        }
        options.width = width;
        options.height = height;
        i = taken.next;
        break;
      }
      case "--bench": {
        const taken = take(i, "--bench");
        if (taken === null) break;
        const preset = presetValue(taken.value);
        if (preset === null) {
          error = `unknown preset: ${taken.value} (expected ${kPresetList})`;
          break;
        }
        bench = true;
        options.mode = Mode.Bench;
        options.preset = preset;
        i = taken.next;
        break;
      }
      case "--threads": {
        const taken = take(i, "--threads");
        if (taken === null) break;
        const threads = Number(taken.value);
        if (!isDigits(taken.value) || threads < 1 || threads > 64) {
          error = `invalid value for --threads: ${taken.value} (expected 1-64)`;
          break;
        }
        options.threads = threads;
        i = taken.next;
        break;
      }
      default:
        error = `unknown option: ${token}`;
        break;
    }
  }

  if (error === "" && headless && bench) {
    error = "--headless and --bench cannot be combined";
  }
  return { options, error };
}

export function optionsFromUrl(search: string): ParseResult {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const tokens: string[] = [];
  for (const [key, value] of new URLSearchParams(query)) {
    if (kFlagsInUrl.has(key)) {
      tokens.push(`--${key}`);
    } else if (value !== "") {
      tokens.push(`--${key}`, value);
    }
  }
  return parseOptions(tokens);
}

export function effectiveTicks(options: AppOptions): number {
  if (options.ticks >= 0) return options.ticks;
  return options.mode === Mode.Bench ? 1200 : 0;
}

export function usageText(): string {
  return [
    "Usage: AntSim [options]",
    "",
    "  --preset <id>         map preset: meadow, dunes, creek, boulder, blank (default meadow)",
    "  --seed <n>            random seed, 0..4294967295 (default 1)",
    "  --ticks <n>           ticks to run (default 1200 for the bench, 0 otherwise)",
    "  --headless            render once at an exact pixel size, no loop",
    "  --screenshot <file>   output PNG for tools/screenshot.mjs",
    "  --size <WxH>          pixel size for headless mode (default 1920x1080)",
    "  --bench <preset>      timing table (Node CLI)",
    "  --threads <n>         worker threads, 1-64 (default: all cores)",
    "  --no-vsync            uncapped frame rate (debug timing)",
    "  --help, -h            show this text",
    "  --version             show the version",
  ].join("\n");
}
