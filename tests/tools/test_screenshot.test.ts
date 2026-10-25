import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("screenshot: Chrome headless writes a PNG of the requested size", { timeout: 120_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "antsim shot "));
  const out = join(dir, "shot ü 1.png");
  try {
    const code: number = await new Promise((resolve) => {
      const child = spawn(process.execPath,
        ["tools/screenshot.mjs", "--ticks", "5", "--size", "640x360", "--out", out],
        { stdio: "inherit" });
      child.on("exit", (c) => resolve(c ?? 1));
    });
    assert.equal(code, 0);
    const bytes = await readFile(out);
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert.equal(width, 640);
    assert.equal(height, 360);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
