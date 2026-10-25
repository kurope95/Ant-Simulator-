#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { chromePath } from "./chrome.mjs";
import { startServer } from "./serve.mjs";

const kDefaultSize = "1920x1080";
const kMinSize = 16;
const kMaxSize = 8192;
const kMaxSeed = 0xffffffff;
const kMaxTicks = 10_000_000;
const kMinZoom = 0.1;
const kMaxZoom = 16;
const kPresets = ["meadow", "dunes", "creek", "boulder", "maze", "blank"];
const kScreens = ["home", "builder", "run"];

class UsageError extends Error {}

function parseArgs(argv) {
  const args = { ticks: 30, out: "", size: kDefaultSize, seed: 1, preset: "meadow", screen: "home", zoom: 1, interactive: false, breachTick: -1 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--ticks") args.ticks = Number(argv[++i]);
    else if (arg === "--out") args.out = argv[++i] ?? "";
    else if (arg === "--size") args.size = argv[++i] ?? "";
    else if (arg === "--seed") args.seed = Number(argv[++i]);
    else if (arg === "--preset") args.preset = argv[++i] ?? "";
    else if (arg === "--screen") args.screen = argv[++i] ?? "";
    else if (arg === "--zoom") args.zoom = Number(argv[++i]);
    else if (arg === "--breach-tick") args.breachTick = Number(argv[++i]);
    else if (arg === "--interactive") args.interactive = true;
    else throw new UsageError(`unknown option: ${arg}`);
  }
  if (args.out === "") throw new UsageError("--out is required");
  if (!kPresets.includes(args.preset)) {
    throw new UsageError(`unknown preset: ${args.preset} (expected ${kPresets.join(", ")})`);
  }
  if (!kScreens.includes(args.screen)) {
    throw new UsageError(`unknown screen: ${args.screen} (expected ${kScreens.join(", ")})`);
  }
  const sizeMatch = /^(\d+)x(\d+)$/.exec(args.size);
  if (sizeMatch === null) throw new UsageError(`invalid --size: ${args.size}`);
  const width = Number(sizeMatch[1]);
  const height = Number(sizeMatch[2]);
  if (width < kMinSize || height < kMinSize || width > kMaxSize || height > kMaxSize) {
    throw new UsageError(`--size must be ${kMinSize}..${kMaxSize} px per side, got ${args.size}`);
  }
  if (!Number.isInteger(args.ticks) || args.ticks < 0 || args.ticks > kMaxTicks) {
    throw new UsageError(`invalid --ticks: ${args.ticks} (0..${kMaxTicks})`);
  }
  if (!Number.isInteger(args.seed) || args.seed < 0 || args.seed > kMaxSeed) {
    throw new UsageError(`invalid --seed: ${args.seed} (0..${kMaxSeed})`);
  }
  if (!Number.isFinite(args.zoom) || args.zoom < kMinZoom || args.zoom > kMaxZoom) {
    throw new UsageError(`invalid --zoom: ${args.zoom} (${kMinZoom}..${kMaxZoom})`);
  }
  return args;
}

function runChrome(args, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(chromePath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Chrome timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stderr });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [width, height] = args.size.split("x").map(Number);
  const outPath = resolve(args.out);
  await mkdir(dirname(outPath), { recursive: true });

  const server = await startServer({ port: 0 });
  const profile = await mkdtemp(join(tmpdir(), "antsim-chrome-"));
  try {
    const page = await fetch(`${server.url}/`);
    if (!page.ok) throw new Error(`page returned ${page.status}; nothing to screenshot`);
    const script = await fetch(`${server.url}/dist/src/app/main.js`);
    if (!script.ok) {
      throw new Error(`dist/src/app/main.js returned ${script.status}; run npm run build`);
    }

    const query = new URLSearchParams();
    if (!args.interactive) query.set("headless", "");
    query.set("ticks", String(args.ticks));
    query.set("size", args.size);
    query.set("seed", String(args.seed));
    query.set("preset", args.preset);
    if (args.interactive) query.set("screen", args.screen);
    if (args.zoom !== 1) query.set("zoom", String(args.zoom));
    if (args.breachTick >= 0) query.set("breach", String(args.breachTick));
    const url = `${server.url}/?${query.toString()}`;

    const chromeArgs = [
      "--headless=new",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      "--force-device-scale-factor=1",
      "--virtual-time-budget=5000",
      "--enable-logging=stderr",
      `--screenshot=${outPath}`,
      url,
    ];
    const { code, stderr } = await runChrome(chromeArgs, 90_000);
    if (code !== 0) {
      throw new Error(`Chrome exited with ${code}: ${stderr.slice(0, 400).trim()}`);
    }
    // The page reports renderer failures to its log (console), which headless Chrome echoes to stderr.
    const pageFailure = stderr.split("\n").find((line) => /"(error: |headless render failed)/.test(line));
    if (pageFailure !== undefined) throw new Error(`the page reported a failure: ${pageFailure.trim()}`);

    const bytes = await readFile(outPath);
    if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a) {
      throw new Error(`not a PNG: ${outPath}`);
    }
    const pngWidth = bytes.readUInt32BE(16);
    const pngHeight = bytes.readUInt32BE(20);
    if (pngWidth !== width || pngHeight !== height) {
      throw new Error(`screenshot is ${pngWidth}x${pngHeight}, expected ${width}x${height}`);
    }
    console.log(`screenshot: ${args.out} (${pngWidth}x${pngHeight})`);
  } finally {
    await server.close();
    await rm(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  if (error instanceof UsageError) {
    console.error("usage: node tools/screenshot.mjs --out <file.png> [--preset <id>] [--screen home|builder|run] [--zoom <n>] [--ticks N] [--breach-tick N] [--size WxH] [--seed N] [--interactive]");
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
});
