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
  assert.equal(r.options.preset, "meadow");
  assert.equal(r.options.seed, 1);
  assert.equal(r.options.threads, 0);
  assert.equal(r.options.vsync, true);
  assert.equal(r.options.zoom, 1);
  assert.equal(r.options.screen, "home");
  assert.equal(effectiveTicks(r.options), 0);
});

test("options: --screen picks the start screen", () => {
  assert.equal(parse().options.screen, "home");
  assert.equal(parse("--screen", "builder").options.screen, "builder");
  assert.equal(parse("--screen", "run").options.screen, "run");
  assert.equal(parseOptions([]).options.screen, "home");
  assert.equal(
    parse("--screen", "nowhere").error,
    "invalid value for --screen: nowhere (expected home, builder, run)",
  );
  assert.equal(optionsFromUrl("?screen=builder").options.screen, "builder");
  assert.ok(usageText().includes("--screen"));
});

test("options: --zoom selects the run close-up", () => {
  assert.equal(parse("--zoom", "3").options.zoom, 3);
  assert.equal(parse("--zoom", "0.5").options.zoom, 0.5);
  assert.equal(parseOptions([]).options.zoom, 1);
  assert.equal(parse("--zoom", "0").error, "invalid value for --zoom: 0 (expected 0.1-16)");
  assert.equal(parse("--zoom", "20").error, "invalid value for --zoom: 20 (expected 0.1-16)");
  assert.equal(parse("--zoom", "abc").error, "invalid value for --zoom: abc (expected 0.1-16)");
  assert.equal(optionsFromUrl("?zoom=2.5").options.zoom, 2.5);
  assert.ok(usageText().includes("--zoom"));
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
  const r = parse("--bench", "boulder", "--threads", "4");
  assert.equal(r.error, "");
  assert.equal(r.options.mode, Mode.Bench);
  assert.equal(r.options.preset, "boulder");
  assert.equal(r.options.threads, 4);
  assert.equal(effectiveTicks(r.options), 1200);
});

test("options: help, version, seed, preset and no-vsync", () => {
  assert.equal(parse("--help").options.mode, Mode.Help);
  assert.equal(parse("-h").options.mode, Mode.Help);
  assert.equal(parse("--version").options.mode, Mode.Version);
  const r = parse("--seed", "4294967295", "--scenario", "creek", "--no-vsync");
  assert.equal(r.error, "");
  assert.equal(r.options.seed, 4294967295);
  assert.equal(r.options.preset, "creek");
  assert.equal(r.options.vsync, false);
  assert.ok(usageText().includes("--bench <preset>"));
  assert.ok(usageText().includes("--headless"));
});

test("options: --preset and the --scenario sandbox alias", () => {
  assert.equal(parseOptions(["--preset", "dunes"]).options.preset, "dunes");
  assert.equal(parseOptions(["--preset", "maze"]).options.preset, "maze");
  assert.equal(parseOptions(["--scenario", "sandbox"]).options.preset, "meadow");
  assert.match(parseOptions(["--preset", "arena"]).error, /meadow, dunes, creek, boulder, maze, blank/);
});

test("options: --breach-tick and ?breach= schedule the maze breach", () => {
  assert.equal(parse().options.breachTick, -1);
  assert.equal(parse("--breach-tick", "36000").options.breachTick, 36000);
  assert.equal(parse("--breach-tick", "abc").error, "invalid value for --breach-tick: abc");
  assert.equal(parse("--breach-tick", "-1").error, "invalid value for --breach-tick: -1");
  assert.equal(optionsFromUrl("?breach=600").options.breachTick, 600);
  assert.ok(usageText().includes("--breach-tick"));
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
  assert.equal(parse("--headless", "--bench", "boulder").error, "--headless and --bench cannot be combined");
});

test("options: screen and zoom validate their ranges", () => {
  assert.equal(parseOptions(["--screen", "home"]).options.screen, "home");
  assert.equal(parseOptions(["--screen", "builder"]).options.screen, "builder");
  assert.match(parseOptions(["--screen", "nowhere"]).error, /home, builder, run/);
  assert.equal(parseOptions(["--zoom", "3.5"]).options.zoom, 3.5);
  assert.match(parseOptions(["--zoom", "0"]).error, /0\.1.*16/);
  assert.match(parseOptions(["--zoom", "17"]).error, /0\.1.*16/);
});

test("options: URL forwards screen, preset and zoom together", () => {
  const r = optionsFromUrl("?screen=builder&preset=dunes&zoom=2");
  assert.equal(r.error, "");
  assert.equal(r.options.screen, "builder");
  assert.equal(r.options.preset, "dunes");
  assert.equal(r.options.zoom, 2);
});

test("options: URL query strings parse like flags", () => {
  const r = optionsFromUrl("?headless&ticks=30&size=1280x720&seed=7&scenario=creek&no-vsync");
  assert.equal(r.error, "");
  assert.equal(r.options.mode, Mode.Headless);
  assert.equal(r.options.ticks, 30);
  assert.equal(r.options.width, 1280);
  assert.equal(r.options.height, 720);
  assert.equal(r.options.seed, 7);
  assert.equal(r.options.preset, "creek");
  assert.equal(r.options.vsync, false);
});
