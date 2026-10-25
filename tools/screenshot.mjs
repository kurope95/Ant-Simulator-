#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { startServer } from "./serve.mjs";

const kDefaultSize = "1920x1080";

function parseArgs(argv) {
  const args = { ticks: 30, out: "", size: kDefaultSize, seed: 1, interactive: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--ticks") args.ticks = Number(argv[++i]);
    else if (arg === "--out") args.out = argv[++i] ?? "";
    else if (arg === "--size") args.size = argv[++i] ?? "";
    else if (arg === "--seed") args.seed = Number(argv[++i]);
    else if (arg === "--interactive") args.interactive = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  if (args.out === "") throw new Error("--out is required");
  if (!/^\d+x\d+$/.test(args.size)) throw new Error(`invalid --size: ${args.size}`);
  if (!Number.isInteger(args.ticks) || args.ticks < 0) throw new Error(`invalid --ticks: ${args.ticks}`);
  if (!Number.isInteger(args.seed) || args.seed < 0) throw new Error(`invalid --seed: ${args.seed}`);
  return args;
}

function chromePath() {
  const candidates = [process.env.CHROME_PATH];
  if (process.platform === "win32") {
    candidates.push("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    if (process.env.LOCALAPPDATA) {
      candidates.push(join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
    }
  }
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error("Chrome not found; set CHROME_PATH");
  return found;
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
    const query = new URLSearchParams();
    if (!args.interactive) query.set("headless", "");
    query.set("ticks", String(args.ticks));
    query.set("size", args.size);
    query.set("seed", String(args.seed));
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
      `--screenshot=${outPath}`,
      url,
    ];
    const { code, stderr } = await runChrome(chromeArgs, 90_000);
    if (code !== 0) {
      throw new Error(`Chrome exited with ${code}: ${stderr.slice(0, 400).trim()}`);
    }

    const bytes = await readFile(outPath);
    if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a) {
      throw new Error(`not a PNG: ${outPath}`);
    }
    console.log(`screenshot: ${args.out} (${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)})`);
  } finally {
    await server.close();
    await rm(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
});
