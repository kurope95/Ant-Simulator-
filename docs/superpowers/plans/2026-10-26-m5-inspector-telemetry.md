# M5: Ant Inspector and Telemetry (Implementation Plan)

> **For the implementing agent (Haiku, DeepSeek or any other):**
> - Read `CLAUDE.md`, then spec §5.1 (ant data), §5.3 (sensing), §9 (UI) and §15 (milestones), then the structure doc's `ui`, `app` and `render` sections.
> - Work through the tasks in order. Each task ends with `npm test` passing and a commit. Never weaken a test.
> - The code snippets in this plan are the design. Match their behaviour and adapt names to the surrounding code; where this plan names a file or function that does not exist, find the real one first.
> - Work on a branch cut from `main`. Don't merge into `main` and don't push; Marek reviews first.
> - First commit this plan file itself if it is not tracked: `docs: M5 plan`.

**Goal:** the user can click an ant on the Run screen and see who it is and what it is doing, follow it with the camera through a food trip, see what its sensors are looking at, and watch per-colony sparklines of deliveries and population. The live `degradeTime` slider comes back.

**Not in scope:** collisions (M4, on its own unmerged branch `claude/m4-collisions-fa026f`), workers (M4.5), tuning (M6), inter-colony combat. Do not edit M4 files beyond what a task names. Expect docs merge conflicts with M4 later; keep your docs edits small and sectioned so they merge easily.

## Global constraints
Everything in `CLAUDE.md`, in particular:
- `src/core` and `src/sim` never touch the DOM, WebGL or Chrome APIs.
- Ants are Structure-of-Arrays; refer to an ant across frames by `uid`, never by index (swap-and-pop moves indices).
- No `Math.random` in the simulation. M5 adds no simulation randomness at all.
- **M5 must not change simulation results.** The golden checksum for meadow seed 7 after 300 ticks must be identical before and after every task. Capture it in Task 0 and re-check it in every task that touches `src/sim`.
- Draw the world in batched calls: one vertex buffer and one draw call per layer. No per-ant draw calls for the inspector overlay.
- The UI is DOM, not canvas-drawn text.
- No per-tick allocation in `src/sim`. Inspector reads happen once per rendered frame, not per tick.
- Pin nothing new: no new npm dependencies.

## This PC (important)
- Node 26, npm 11, Edge installed, **Chrome is not**. `tools/chrome.mjs` honours `CHROME_PATH`. For screenshots and the two Chrome screenshot tests, point it at Edge (a trusted Chromium install):
  `$env:CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"` (PowerShell). Do not change the project's browser policy in code.
- If screenshots still cannot run, say so in the report. **Never claim a visual result from reading code.**

---

### Task 0: Baseline
- `npm install`, then `npm test`. Record the number of tests and any failures (the two screenshot tests are the known failures without Chrome; with `CHROME_PATH` set they should pass).
- Record the golden checksum: run meadow seed 7 for 300 ticks and note the checksum value in your report. (The M4 report gives the existing figure `2915110820` for 8b3137c; confirm it still matches `main`.)
- Create your branch.

### Task 1: Ant names
**Files:** `src/sim/names.ts` (new); test `tests/sim/test_names.test.ts`. Spec §16 item 16: uid-based female names.

```ts
// Pure, deterministic, no randomness state. Same uid -> same name, forever.
export function antName(uid: number): string;
```
- Use a fixed list of at least 64 female first names (plain ASCII, no duplicates). For uid `u`: base = `list[mix32(u) % list.length]` using the existing `mix32`/hash helper in `src/core/rng.ts`. When `u >= list.length`, append a stable suffix so names stay distinguishable, e.g. ` ${roman(Math.floor(u / list.length) + 1)}` or a number; keep it short.
- **Tests:** deterministic; non-empty ASCII; the first 1000 uids give at least 900 distinct strings; the list has no duplicates.

**Commit:** `feat(sim): uid-based ant names`

### Task 2: Picking and snapshots
**Files:** `src/sim/picking.ts` (new), `src/sim/inspect.ts` (new); tests `tests/sim/test_picking.test.ts`, `tests/sim/test_inspect.test.ts`.

```ts
// picking.ts
// The uid of the ant nearest to (x, y) within `radius`, or -1. Ties go to the lower uid.
// A plain scan is fine; it runs once per click, not per tick.
export function pickAnt(world: World, x: number, y: number, radius: number): number;

// inspect.ts
export interface AntSnapshot {
  uid: number; name: string; colony: number; role: 0 | 1; state: 0 | 1 | 2;
  x: number; y: number; heading: number; speed: number;
  energy: number; mass: number; carrying: boolean;
  timeSinceAnchor: number; degradeTimer: number;
}
// null when the uid is no longer alive (died, or the world was rebuilt).
export function inspectAnt(world: World, uid: number): AntSnapshot | null;
```
- `inspectAnt` uses the world's `uid -> index` map. It must not allocate more than the returned object, and it must not mutate the world.
- **Tests:** `pickAnt` returns the nearest ant, respects radius, returns -1 when none, breaks ties by lower uid; `inspectAnt` returns the right fields for a known ant; returns `null` for a removed uid; after a swap-and-pop removal of another ant, the same uid still resolves to the same ant (this guards the index-vs-uid rule).

**Commit:** `feat(sim): pick an ant by position and snapshot its state`

### Task 3: Sensor geometry (shared with the steering code)
**Files:** `src/sim/sensing.ts` (export, do not change behaviour), `src/sim/inspect.ts`; test `tests/sim/test_inspect.test.ts`.

The inspector must draw exactly what the ant senses. Find where the Follower's 25-point polar pattern (5 angles × 5 distances, spec §5.3) and the Explorer's 6-point pattern are generated in `sensing.ts`. If that generation is inline, extract it into an exported pure function, e.g. `samplePoints(role, heading, x, y, params, out: Float32Array): number`, and call it from the existing code. **The checksum must be unchanged after the refactor.**

```ts
export interface SensorView {
  fovHalfRad: number; radius: number;          // the cone
  points: Float32Array; count: number;         // x,y pairs of the sample points
  scores: Float32Array;                        // marker score at each point, same order, 0 if skipped
  target: { x: number; y: number } | null;     // direct-sight target if it has one
}
export function sensorView(world: World, uid: number, out?: SensorView): SensorView | null;
```
- Points inside walls or behind solid halfway cells are reported with score 0, mirroring the steering rules; reuse the same helper functions rather than copying them.
- **Tests:** `sensorView` point count is 25 for a Follower and 6 for an Explorer; points lie inside the cone and radius; the golden checksum is unchanged.

**Commit:** `refactor(sim): share the sensor sample pattern; add sensorView`

### Task 4: Telemetry history
**Files:** `src/sim/stats.ts` or wherever per-colony stats live (the structure doc says `ColonyStats` has `deliveredPerSecond: RingBuffer<number>`), `src/sim/world.ts`; test `tests/sim/test_stats.test.ts`.

- Add per colony, sampled once per simulated second (every `simHz` ticks): `populationPerSecond: RingBuffer<number>` and `foodPoolPerSecond: RingBuffer<number>`. Capacity: 120 samples (two minutes), same as the existing buffer.
- These are **observation only**: not in the checksum, they never feed back into the simulation.
- **Tests:** after 600 ticks (10 s) each buffer holds 10 samples; the newest population sample equals the live population; an extinct colony keeps a flat zero history; the golden checksum is unchanged.

**Commit:** `feat(sim): per-colony population and food-pool history`

### Task 5: Sparkline and inspector view-models
**Files:** `src/ui/sparkline.ts` (new), `src/ui/view_models.ts`; test `tests/ui/test_sparkline.test.ts`.

```ts
// Pure geometry so it can be tested without a DOM.
// Returns an SVG path "M x y L x y ..." scaled into width x height with `pad` px of padding.
// An empty series gives ""; a flat series draws a mid-height line; min/max are taken from the data.
export function sparklinePath(values: ArrayLike<number>, width: number, height: number, pad?: number): string;

export function stateLabel(state: number): string;       // "Foraging", "Carrying food", "Heading home, tired"
export function roleLabel(role: number): string;         // "Follower", "Explorer"
export function energyFraction(energy: number): number;  // clamp 0..1 against the 100 energy cap
export function headingLabel(rad: number): string;       // "NE 45°" style
```
- **Tests:** sparkline path for 1, 2 and 100 points; flat series; all-zero series; values map inside the box; labels for every state.

**Commit:** `feat(ui): sparkline geometry and inspector labels`

### Task 6: Inspector panel and telemetry in the colony panel
**Files:** `src/ui/inspector_panel.ts` (new), `src/ui/colony_panel.ts`, `styles.css`; test `tests/ui/test_inspector_panel.test.ts` (use the same DOM approach the existing UI tests use; if none exist for DOM classes, test only the view-model helpers).

```ts
interface InspectorHooks { onFollow(on: boolean): void; onClose(): void; onSensors(on: boolean): void }
class InspectorPanel {
  readonly root: HTMLElement;
  constructor(root: HTMLElement, hooks: InspectorHooks);
  show(snapshot: AntSnapshot, colonyName: string, colonyHex: number, following: boolean, sensors: boolean): void;
  showGone(name: string): void;     // "<name> is no longer alive" with only a Close button
  hide(): void;
}
```
- Glass panel on the right edge, matching the existing panels in `styles.css` (reuse their tokens; no new colours except what a swatch needs).
- Shows: ant name (large), colony swatch and name, role, state label, an energy bar, carrying yes/no, speed, heading, seconds since anchor. Buttons: Follow (toggle), Sensors (toggle), Close.
- Colony panel gains, per colony, two small sparklines (delivered per second, population) built from the new ring buffers, redrawn at most 2×/s.
- No text drawn on the canvas.

**Commit:** `feat(ui): inspector panel and colony sparklines`

### Task 7: Selection overlay in the renderer
**Files:** `src/render/inspector_overlay.ts` (new), `src/render/world_view.ts` (hook it in); test `tests/render/test_inspector_overlay.test.ts` for the geometry only.

- Draws, in one batch: a ring around the selected ant; and, when Sensors is on, the FOV wedge outline, the sample points (dot size by score, brighter when the score is high), and a line to the direct-sight target if there is one.
- Geometry lives in a pure function (`overlayGeometry(view: SensorView, ant: AntSnapshot, out: Float32Array): number`) so it can be tested without WebGL. The WebGL part is a thin upload+draw using the existing batch helpers.
- Use the interpolated position the renderer already uses for the ant, so the ring does not jitter between ticks.
- **Tests:** vertex count for a Follower vs an Explorer; all vertices finite; wedge angles equal `heading ± fovHalfRad`.

**Commit:** `feat(render): selection ring and sensor overlay`

### Task 8: Controller wiring: click, follow, keys
**Files:** `src/app/controller.ts`, `src/app/camera_input.ts`, `src/app/session.ts` only if needed; tests in `tests/app/` (pure helpers only).

- **Pick:** on the Run screen, a left press released without moving more than the existing 4 px pan threshold calls `pickAnt` with a radius of about `12 / cameraScale` world units (at least `antRadius`), selects the uid, opens the inspector. A click on empty ground clears the selection. Dragging still pans.
- **Follow:** `F` toggles follow for the selected ant. While following, each rendered frame centres the camera on the ant's interpolated position, keeping the zoom. Any user pan (drag, arrows, WASD) cancels follow. Following uses the ant's uid every frame; if `inspectAnt` returns `null`, stop following and show "no longer alive".
- **Sensors:** `V` toggles the sensor overlay.
- **Esc:** deselect (extend the existing Esc handling; do not break Esc in the builder).
- **Selection lifetime:** survives pause and speed changes; cleared on Reset, Edit, Finish and Back (the world is rebuilt, so uids are meaningless).
- Update the keys table in the spec §9 and the help text (`usageText` only if it lists keys).
- **Never** read ant arrays by a stored index.

**Commit:** `feat(app): click to inspect, follow and sensor overlay`

### Task 9: Live `degradeTime` control
**Files:** `src/ui/param_specs.ts`, `src/ui/settings_drawer.ts`; test `tests/ui/test_param_specs.test.ts`.
- `degradeTime` is already typed in `ParamKey` but not shown. Add its row to the "trails" group using the range and default from spec §12 (read the real values there; do not invent them). Update the "ten live rows" count in tests and the structure doc to eleven.
- **Test:** the row exists, round-trips `specValue`/`applySpecValue`, and moving it changes `params.degradeTime`.

**Commit:** `feat(ui): live degradeTime slider`

### Task 10: Reproducible screenshots and the food-trip test
**Files:** `src/app/options.ts`, `src/app/interactive.ts`, `tools/screenshot.mjs`, `tests/sim/test_inspect.test.ts`, `tests/app/test_options.test.ts`.

- Add `--inspect <n>` / `?inspect=<n>` (select the n-th ant by uid; default off), `--follow` / `?follow`, `--sensors` / `?sensors`. They apply once after the pre-run, like `--focus`.
- **Sim test (the milestone's acceptance, without WebGL):** on meadow seed 7, pick one ant, call `inspectAnt` every tick for up to 10 800 ticks and assert: the uid never changes; its state goes FORAGING → RETURNING_FOOD (with `carrying` true and `mass` 3) → FORAGING at least once; energy stays within 0..100. If the chosen ant dies first, pick another uid and retry up to 5 ants; fail only if none completes a trip.
- **Screenshots** (with `CHROME_PATH` set, see "This PC"): a close-up of the inspector at zoom 6 with sensors on; the same ant while carrying food; the colony panel with sparklines after 3600 ticks; the settings drawer showing Degrade after. Save to `captures/` (gitignored). **Look at every PNG** before claiming it works. If a shot is clipped, overlaps another panel or shows nothing, fix it and re-shoot.

**Commit:** `feat(app): inspect/follow/sensors options and the food-trip test`

### Task 11: Docs and report
- Spec §9 (keys, inspector, telemetry), §15 (M5 status), structure doc (new files and the eleven param rows), `CLAUDE.md` Status line (M5 built, waiting on Marek's check).
- Write `docs/superpowers/reports/2026-10-26-m5-report.md`: commits, test counts, golden checksum before and after, what the screenshots showed (or that they could not be run), deviations from this plan, open questions. Be exact about what was **not** verified.
- Re-run the full suite and the golden checksum one last time.

**Commit:** `docs: M5 status, spec, structure and report`

---

## Acceptance (spec §15 M5)
1. Zoomed-in inspector screenshots look right (inspector panel, ring, sensor wedge, sparklines).
2. The inspector follows one ant through a food trip (Task 10 sim test passes; screenshots of before and after pickup).
3. `npm test` green; golden checksum identical to `main`.
4. `degradeTime` slider live in the settings drawer.

## Stop and ask Marek if
- a task needs a change to simulation behaviour (it should not);
- the sensor pattern cannot be shared without altering the checksum;
- any acceptance item cannot be met or verified on this PC.
