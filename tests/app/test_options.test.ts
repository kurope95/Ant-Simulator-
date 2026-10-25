import test from "node:test";
import assert from "node:assert/strict";

import { Mode, parseOptions, optionsFromUrl, effectiveTicks, usageText } from "../../src/app/options.js";

function parse(...args: string[]) {
  return parseOptions(args);
}

test("options: defaults", () => {
  const r = parse();
  assert.equal(r.error, "");
  assert.equal(r.options.mode, Mode.Interactive);
  assert.equal(r.options.scenario, "sandbox");
  assert.equal(r.options.seed, 1);
  assert.equal(r.options.threads, 0);
  assert.equal(r.options.vsync, true);
  assert.equal(effectiveTicks(r.options), 0);
});

test("options: headless screenshot", () => {
  const r = parse("--headless", "--ticks", "120", "--screenshot", "captures/a b.png", "--size", "1280x720");
  assert.equal(r.error, "");
  assert.equal(r.options.mode, Mode.Headless);
  assert.equal(r.options.ticks, 120);
  assert.equal(r.options.screenshot, "captures/a b.png");
  assert.equal(r.options.width, 1280);
  assert.equal(r.options.height, 720);
});

test("options: bench", () => {
  const r = parse("--bench", "stress", "--threads", "4");
  assert.equal(r.error, "");
  assert.equal(r.options.mode, Mode.Bench);
  assert.equal(r.options.scenario, "stress");
  assert.equal(r.options.threads, 4);
  assert.equal(effectiveTicks(r.options), 1200);
});

test("options: help, version, seed, scenario and no-vsync", () => {
  assert.equal(parse("--help").options.mode, Mode.Help);
  assert.equal(parse("-h").options.mode, Mode.Help);
  assert.equal(parse("--version").options.mode, Mode.Version);
  const r = parse("--seed", "4294967295", "--scenario", "maze", "--no-vsync");
  assert.equal(r.error, "");
  assert.equal(r.options.seed, 4294967295);
  assert.equal(r.options.scenario, "maze");
  assert.equal(r.options.vsync, false);
  assert.ok(usageText().includes("--bench <scenario>"));
  assert.ok(usageText().includes("--headless"));
});

test("options: errors are specific", () => {
  assert.equal(parse("--foo").error, "unknown option: --foo");
  assert.equal(parse("--seed").error, "missing value for --seed");
  assert.equal(parse("--seed", "abc").error, "invalid value for --seed: abc");
  assert.equal(parse("--seed", "4294967296").error, "invalid value for --seed: 4294967296");
  assert.equal(parse("--ticks", "-5").error, "invalid value for --ticks: -5");
  assert.equal(parse("--threads", "0").error, "invalid value for --threads: 0 (expected 1-64)");
  assert.equal(parse("--threads", "65").error, "invalid value for --threads: 65 (expected 1-64)");
  assert.equal(parse("--size", "12x").error, "invalid value for --size: 12x (expected WxH, e.g. 1920x1080)");
  assert.equal(parse("--size", "8x8").error, "invalid value for --size: 8x8 (expected WxH, e.g. 1920x1080)");
  assert.equal(parse("--bench").error, "missing value for --bench");
  assert.equal(parse("--headless", "--bench", "x").error, "--headless and --bench cannot be combined");
});

test("options: URL query strings parse like flags", () => {
  const r = optionsFromUrl("?headless&ticks=30&size=1280x720&seed=7&scenario=maze&no-vsync");
  assert.equal(r.error, "");
  assert.equal(r.options.mode, Mode.Headless);
  assert.equal(r.options.ticks, 30);
  assert.equal(r.options.width, 1280);
  assert.equal(r.options.height, 720);
  assert.equal(r.options.seed, 7);
  assert.equal(r.options.scenario, "maze");
  assert.equal(r.options.vsync, false);
});
