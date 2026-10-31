# Ant Simulator (browser)

A real-time 2D ant colony / stigmergy simulator inspired by Pezzza's Work "Ant Simulator 2". TypeScript 5.9, WebGL2, runs in Chrome. There are no native executables: Smart App Control on this laptop blocks unsigned Windows programs, and nothing here needs one.

**Design spec:** [docs/superpowers/specs/2026-10-25-ant-simulator-design.md](docs/superpowers/specs/2026-10-25-ant-simulator-design.md). Read it before changing simulation behaviour. Keep it in sync when a decision changes.

**Structure and names:** [docs/superpowers/specs/2026-10-25-ant-simulator-structure.md](docs/superpowers/specs/2026-10-25-ant-simulator-structure.md). Every file, script and public name is listed there. Update it in the same commit when one changes.

**Plans:** one per milestone, in `docs/superpowers/plans/`. Carry them out task by task, and don't run ahead into the next milestone.

## Status
- Current milestone: **M1.7 (colony identity) and M5 (inspector and telemetry) built and merged into main** (2026-10-31), each waiting on Marek's check before it counts as done. **M4 (ant collisions and avoidance) is merged too, but its acceptance targets are not met** (lanes 0.47 vs 0.70, overlap 3.6% vs 1%, 2000-ant step 8.6 ms vs 6 ms, reach at 1500 u 51 vs 63 in minute 3; see `docs/superpowers/reports/2026-10-25-m4-report.md`); the M4 tuning plan is in progress on main. M1.6 (camera and looks) still waits on Marek's laptop camera checklist. Reach contest colony B: 122 deliveries in minute 3 (guard 63). M1.7 bench runs were on battery, so none is quoted: rerun plugged in. Last plugged-in bench (M1.6, meadow, 1200 ticks, 200 ants): 0.464 ms average, 0.607 ms p95, against a 0.385 ms baseline — inside the +25% budget of 0.481 ms. Terrain pass: 3.9 ms on a mixed map on camera-move and shimmer frames, accepted over the 3 ms bar for now; idle frames copy the cached terrain in 0.8 ms. M2 (navigation and foraging) is complete; its numbers are in its report. birth tuning is unscheduled. Update this line as each milestone lands; the milestone list is in spec §15.

## This machine
- **Windows 11 ARM64.** Snapdragon X Plus, 8 equal cores, 16 GB shared RAM, Adreno X1-45 GPU.
- **Smart App Control is ON and stays on** (the user declined to disable it). It blocks unsigned executables. Consequences:
  - never add a tool that runs a native binary — that rules out esbuild, Vite, Rollup's native builds, and TypeScript 7's Go compiler;
  - build tools must be JavaScript run by Node, or absent;
  - Node and Chrome themselves are trusted and run fine.
- **Node v24.13.0 and Chrome 155** are installed. Nothing else is required.
- **Two dev dependencies only:** TypeScript `5.9.3` (the last pure-JS compiler line, never 7.x) and `@types/node`, installed by npm. Pin exact versions. No runtime npm dependencies.
- **Rendering is WebGL2** through Chrome's ANGLE → Direct3D 11 path. Do not assume native OpenGL.
- **Screen:** 2880×1620 at 120 Hz with 200% scaling. Size canvas backing stores by `devicePixelRatio`; the DOM UI scales itself.
- **Laptop:** performance numbers only count from `npm run bench` runs while plugged in.
- **Verified 2026-10-25:** Node 24.13 builds and runs ES modules and `node:test`; Chrome 155 is at `C:\Program Files\Google\Chrome\Application\chrome.exe`; npm can install typescript 5.9.3.

## Build and run
Double-click **`Play Ant Simulator.bat`** (or the **Ant Simulator** Desktop shortcut) to install if needed, build, serve and open the game as a Chrome app window; the server stops when the window closes.

```powershell
npm install            # once: typescript + @types/node, no native binaries
npm run build          # tsc -> dist/
npm test               # builds, then node --test "dist/tests/**/*.test.js"
npm run serve          # http://127.0.0.1:8080/ - open in Chrome
npm run bench -- --preset meadow --ticks 1200
npm run reach          # acceptance harness: deliveries per minute at four distances, contest, maze
npm run screenshot -- --preset creek --ticks 1800 --zoom 2 --out captures\run.png
npm run screenshot -- --interactive --screen home --ticks 0 --out captures\home.png
npm run screenshot -- --preset meadow --ticks 300 --zoom 6 --focus 400,540 --out captures\fp1-nest.png
```

- `npm run serve` is a tiny Node static server (`tools/serve.mjs`), no packages.
- `npm run screenshot` runs Chrome headless against the served page and writes a PNG; `--interactive` uses the real screen flow, `--screen home|builder|run` picks the starting screen, and `--zoom` sets the camera scale.
- `npm run reach` prints the reach table (no flags): deliveries per minute at four distances, the two-colony contest, and the maze before/after its breach. Each maze line ends `pass` or `fail` against its target.
- The served page accepts `?screen=`, `?preset=`, `?seed=`, `?ticks=`, `?zoom=`, `?size=` and `?breach=<tick>` for reproducible screenshots and links.
- Everything the browser loads is compiled JavaScript under `dist/`; `index.html` and `styles.css` sit at the repo root.

## Architecture rules
- **Ant data is Structure-of-Arrays.** Use typed arrays (`Float32Array`, `Uint32Array`, ...); every array has the same length. Refer to an ant across frames by `uid`, never by array index; indices change on swap-and-pop removal.
- **Fixed 60 Hz simulation step.** Rates are per second, never per tick. Rendering interpolates between steps.
- **Tick phases** (spec §5.2):
  - parallel phases write only their own ant slots and their own chunk's event list;
  - grid writes, food pickups, spawns and removals happen in serial phases, in chunk order.
- **All simulation randomness** comes from the counter-based `randU32(seed, uid, tick, stream)` in `src/core/rng.ts`. Never `Math.random`.
- **Determinism:** the same seed and inputs must give identical results with 1 or any number of workers. A test guards this. Workers arrive in M4; until then every phase runs on the main thread.
- **Ants only use local information:** their sensing cone and their own memory. No pathfinding, no global knowledge.
- **`src/core` and `src/sim` must not touch the DOM, WebGL, or Chrome APIs.** They run unchanged under Node for tests and the bench CLI.
- **Draw the world in batched draw calls.** One vertex buffer and one `drawElements` per layer. Never one draw call per ant or per leg.
- **The UI is DOM** (HTML/CSS overlay), not canvas-drawn text. It stays crisp at any display scale for free.

## Verification
- Run the unit tests after any simulation change.
- Check behaviour by rendering a headless screenshot and looking at it. Don't infer it from the code.
- Back performance claims with a `npm run bench` run, and state whether the laptop was plugged in.

## Scope
- **Inter-colony hostilities/combat is an open topic.** Don't implement it until the user asks. In v1 the cross-colony interactions are the territory (foreign-marker erasure) rule and foreign-scent aversion (M1.7, sensing only).
