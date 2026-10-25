#!/usr/bin/env node
// Double-click launcher: serve the built page, open it as a Chrome app window,
// and stop the server when that window closes. No native binaries are involved.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromePath } from "./chrome.mjs";
import { startServer } from "./serve.mjs";

const kRoot = resolve(import.meta.dirname, "..");
const kDefaultPort = 8080;
const kMainScript = "dist/src/app/main.js";

class UsageError extends Error {}

function parseArgs(argv) {
  const args = { check: false };
  for (const arg of argv) {
    if (arg === "--check") args.check = true;
    else throw new UsageError(`unknown option: ${arg}`);
  }
  return args;
}

function profileDir() {
  const base = process.env.LOCALAPPDATA ?? tmpdir();
  return join(base, "AntSimulator", "ChromeProfile");
}

function appArgs(url, profile, extra = []) {
  return [
    `--app=${url}/`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--start-maximized",
    ...extra,
  ];
}

function waitForExit(chrome) {
  return new Promise((resolvePromise, reject) => {
    chrome.once("error", reject);
    chrome.once("exit", (code) => resolvePromise(code));
  });
}

async function isSimulatorPage(url) {
  try {
    const page = await fetch(`${url}/`);
    if (!page.ok) return false;
    const html = await page.text();
    return html.includes(`/${kMainScript}`);
  } catch {
    return false;
  }
}

function requireBuild() {
  if (existsSync(join(kRoot, kMainScript))) return;
  throw new Error(`${kMainScript} is missing; run npm run build, or start via "Play Ant Simulator.bat"`);
}

async function launch() {
  requireBuild();
  let server;
  try {
    server = await startServer({ root: kRoot, port: kDefaultPort });
  } catch (error) {
    if (error.code !== "EADDRINUSE") throw error;
    const url = `http://127.0.0.1:${kDefaultPort}`;
    if (!(await isSimulatorPage(url))) {
      throw new Error(`port ${kDefaultPort} is in use by another program; close it and try again`);
    }
    const extra = spawn(chromePath(), appArgs(url, profileDir()), { detached: true, stdio: "ignore" });
    extra.unref();
    console.log("Ant Simulator is already running; opened another window.");
    return;
  }

  const url = server.url;
  console.log(`serving the simulator at ${url}/`);
  console.log("close the game window to stop the server");
  let chrome;
  try {
    chrome = spawn(chromePath(), appArgs(url, profileDir()), { stdio: "ignore" });
  } catch (error) {
    await server.close();
    throw error;
  }

  const onSigint = () => {
    chrome.kill();
    server.close().finally(() => process.exit(130));
  };
  process.once("SIGINT", onSigint);
  try {
    await waitForExit(chrome);
  } finally {
    process.removeListener("SIGINT", onSigint);
    await server.close();
  }
  console.log("game window closed; server stopped");
}

// Headless end-to-end check of the launch path: serve, render with the same
// Chrome install, confirm the page and its script load, and stop cleanly.
async function check() {
  requireBuild();
  const dir = await mkdtemp(join(tmpdir(), "antsim-launch-"));
  const png = join(dir, "check.png");
  const server = await startServer({ root: kRoot, port: 0 });
  try {
    const script = await fetch(`${server.url}/${kMainScript}`);
    if (!script.ok) throw new Error(`${kMainScript} returned ${script.status}`);
    const chrome = spawn(
      chromePath(),
      [
        "--headless=new",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--force-device-scale-factor=1",
        `--user-data-dir=${join(dir, "profile")}`,
        "--virtual-time-budget=5000",
        `--screenshot=${png}`,
        `${server.url}/`,
      ],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    const code = await waitForExit(chrome);
    if (code !== 0) throw new Error(`Chrome exited with ${code}`);
    const bytes = await readFile(png);
    if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a) {
      throw new Error("Chrome did not render a PNG");
    }
    console.log(`launcher check: ok (${server.url}/ served, ${kMainScript} loaded, frame rendered ${bytes.length} bytes)`);
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.check) await check();
  else await launch();
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  if (error instanceof UsageError) {
    console.error("usage: node tools/launch.mjs [--check]");
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
});
