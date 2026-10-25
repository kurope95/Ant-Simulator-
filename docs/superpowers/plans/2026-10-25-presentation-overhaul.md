# Presentation Overhaul & World Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the working M1 simulation into a finished-looking sandbox: a home screen, a world builder with presets, colonies, colours, food and four obstacle types, a controllable run HUD, and a rendered ant colony with real ant sprites, a built anthill, depleting food clusters, terrain and a coherent trail palette.

**Architecture:** A new sim-side `WorldSetup` data model is edited by the builder and copied into a fresh `World` on Start or Reset, so a running simulation is never mutated mid-run. Rendering moves from flat geometry ants to a procedural sprite atlas plus a batched sprite pipeline, with a baked terrain texture. The DOM UI becomes three screens (Home, Builder, Run) driven by a pure session state machine, with the existing parameter sliders and overlays restyled behind a new design system.

**Tech Stack:** TypeScript 5.9.3 (strict, ES2022 modules), WebGL2 through Chrome, DOM + CSS UI, Node 24.13 `node:test` with `node:assert/strict`. No runtime dependencies.

**Spec:** [docs/superpowers/specs/2026-10-25-presentation-overhaul-design.md](../specs/2026-10-25-presentation-overhaul-design.md), read together with the main design spec it amends: [docs/superpowers/specs/2026-10-25-ant-simulator-design.md](../specs/2026-10-25-ant-simulator-design.md).

## Global Constraints

- **Windows 11 ARM64; Smart App Control stays ON.** Never add, install or run a native executable. That rules out esbuild, Vite, Rollup native builds and TypeScript 7's Go compiler. Build tools are JavaScript run by Node, or absent.
- Node v24.13.0 and Chrome 155 are the only installed tools. Two exact dev dependencies: `typescript@5.9.3` and `@types/node`. No runtime npm dependencies.
- `src/core` and `src/sim` must not import or touch the DOM, WebGL, `window`, `document`, `performance` or Chrome APIs. They run unchanged under Node for tests and the bench.
- Ant data is Structure-of-Arrays with a stable `uid` for cross-frame identity; removal is swap-and-pop.
- The simulation is fixed at 60 Hz. Rates are per second, never per tick. Rendering interpolates.
- All simulation randomness comes from `randU32/randUnit/randRange(seed, uid, tick, stream)` in `src/core/rng.ts`. Never `Math.random`. Rendering-only hashes use `mix32` with visual inputs.
- Determinism: same seed and inputs give identical results. The checksum tests must stay green.
- Ants use only their sensing cone and their own memory. No pathfinding, no global knowledge.
- Rendering is batched: one vertex buffer and one `drawElements` (or one `drawSprites`) per layer. Never one draw call per ant, leg or food piece.
- The UI is DOM + CSS, not canvas text. Canvas backing stores are sized by `devicePixelRatio`; the DOM scales itself.
- Run the unit tests after any simulation change. Check visuals with a headless screenshot and look at the PNG. Performance claims only from `npm run bench` while plugged in.
- Update `docs/superpowers/specs/2026-10-25-ant-simulator-structure.md` in the same commit whenever a file or public name changes, and the main design spec whenever a decision changes. Every task below adds, removes or renames files; its commit includes the matching structure-doc edit, and Task 17 verifies the whole document against `git ls-files`.
- End every commit message with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

## Review Focus

These are the failure modes no single task's happy-path test exercises, most likely first. The named tests pin each one:

1. **Start with an invalid map.** Empty colony list, nest painted into rock/water, nest within 24 u of an edge, nests closer than 96 u, no food, or food painted into rock/water must disable Start and name the first problem — never build a broken world. Tests: `test_setup.test.ts` validation cases; `test_session.test.ts` "start refuses an invalid map".
2. **Deleting the selected colony or food pile.** The inspector must close, the selection must not point at a stale id, and the next edit must not target the wrong entity. Test: `test_builder_model.test.ts` "deleting the selection clears it".
3. **Finish, restart and edit while paused.** Finish returns Home with a summary and a frozen backdrop; Restart starts the same setup from tick 0 unpaused; Edit opens Builder with the same map and no stale paused overlay. Tests: `test_session.test.ts` "paused run transitions".
4. **Extreme zoom, a zero-size viewport, and DPR.** Sprite and leg sizes stay finite and positive; no NaN vertices; the world still covers the screen; ants remain legible from fit zoom to maximum zoom. Tests: `test_ant_layer.test.ts` "finite at extreme scales"; screenshots at 0.5× and 4× in Task 16.
5. **A food source consumed to zero while it is on screen.** The piece list empties gracefully, the source is removed by the sim, and the renderer draws nothing without NaN or a crash. Tests: `test_food_layout.test.ts` "zero amount"; `test_layers.test.ts` "an empty food source draws nothing".

---

## File Structure

**Simulation (`src/sim/`, no DOM):**
- `palette.ts` — the eight colony colours; names, hex, `firstFreeColor`.
- `setup.ts` — `WorldSetup`, colony/food/obstacle setup types, brush painting, add/remove/move, validation, cloning.
- `obstacles.ts` — the obstacle grid, border flags, solidity, terrain speed factors, line of sight.
- `setup_apply.ts` — `worldFromSetup`, starting-ant spawning.
- `presets.ts` — the five map presets and quick start.
- `collide.ts` — circle-vs-border-cell resolution.
- Modified: `world.ts` (size, obstacles), `colony.ts` (colour), `food.ts` (`uid`, `kind`), `marker_grid.ts` (territory rule), `sensing.ts` (sight/scent blocking), `tick.ts` (terrain speed), `checksum.ts`.
- Deleted: `scenarios.ts`.

**Rendering (`src/render/`, browser only except pure helpers):**
- `atlas.ts` — pure frame layout (`AtlasFrame`, `AtlasFrames`, `makeAtlasFrames`).
- `sprite_batch.ts` — pure 8-float sprite quads, 4 vertices / 6 indices each.
- `sprite_atlas.ts` — procedural Canvas2D painting of the 2048×1024 atlas.
- `legs.ts` — pure tripod gait poses and the `GaitTracker` distance accumulator.
- `food_layout.ts` — pure deterministic, inner-first food piece layout.
- `terrain_texture.ts` — pure texture sizing plus Canvas2D terrain bake.
- `food_layer.ts`, `nest_layer.ts` — sprite layer builders.
- Modified: `theme.ts` (five themes), `heatmap.ts` (teal/amber, alpha), `gl_renderer.ts` (sprite program), `ant_layer.ts` (sprite ants, shadows, legs), `world_view.ts` (six-layer cache and draw), `view_settings.ts` (grid default off).
- Deleted: `test_pattern.ts`.

**UI and app:**
- `src/ui/dom.ts` — element/button/icon helpers.
- `src/ui/view_models.ts` — formatting, strings, colony rows, `SpeedSetting`.
- `src/ui/run_hud.ts` — top bar, bottom dock, chips, legend.
- `src/ui/builder_screen.ts` — builder top bar, tool rail, inspector, confirm strip, validation.
- `src/ui/home_screen.ts` — home overlay and Last run card.
- `src/ui/pause_menu.ts`, `src/ui/finish_dialog.ts`, `src/ui/colony_panel.ts`, `src/ui/settings_drawer.ts`.
- `src/ui/builder_model.ts` — pure builder state and edits.
- `src/app/session.ts` — pure screen/pause/speed/last-run state machine.
- `src/app/attract.ts` — attract world and seed-from-clock.
- `src/app/controller.ts` — owns renderer, camera, worlds, screens, input and the frame loop.
- Modified: `interactive.ts` (thin entry), `options.ts`, `headless.ts`, `bench.ts`, `bench_cli.ts`.
- Deleted: `src/ui/shell.ts`.

**Tests and tools:**
- New sim tests: `test_setup`, `test_obstacles`, `test_setup_apply`, `test_presets`, `test_obstacles_physics`.
- New render tests: `test_food_layout`, `test_atlas`, `test_sprite_batch`, `test_legs`, `test_theme`, `test_layers`.
- New UI/app tests: `test_view_models`, `test_builder_model`, `test_session`, `test_attract`.
- Replaced tests: `test_scenarios_checksum` → `test_presets_checksum`; `test_night_theme` → `test_theme`; `test_ant_layer` and `test_world_view` rewritten; `test_theme_and_pattern` removed.
- `tools/screenshot.mjs` gains `--preset`, `--zoom`, `--screen`.

---

### Task 1: Align the specs and start M1.5

**Files:**
- Modify: `docs/superpowers/specs/2026-10-25-ant-simulator-design.md` (§3, §4.2–4.5, §5.2, §7–§10, §12, §15, §16)
- Modify: `docs/superpowers/specs/2026-10-25-ant-simulator-structure.md` (milestone context only; full name sweep in Task 17)
- Modify: `docs/superpowers/specs/2026-10-25-presentation-overhaul-design.md` (status line)
- Modify: `CLAUDE.md` (Status line)
- Test: none (documentation)

**Interfaces:**
- Consumes: the approved design doc.
- Produces: a spec that names M1.5, the staged builder, sprite/atlas rendering, five presets, four obstacle kinds and the new screens, so later tasks argue from an up-to-date authority.

- [ ] **Step 1: Amend the main design spec**

In §3 change the rendering row from "one shader" to "colour, texture and sprite shaders". In §4.2 cite the territory deposit rule in `marker_grid.ts` as now applied. Replace §4.3 with 4 u obstacle cells of kinds Rock/Water/Sand/Mud, border-cell collision, Rock/Water solid, Sand ×0.60 speed, Mud ×0.45, sight and scent blocked by Rock/Water. In §4.4 add `uid` and `kind` to food sources and the 48-piece render mapping. In §4.5 say colonies carry a palette colour. In §5.2 replace legs state with visual screen-space gait driven by distance. Replace §7 rendering with the atlas/sprite/terrain design; §8 with the visual tripod gait (phase from distance, two tripods A={0,2,4}, B={1,3,5}); §9 with Home/Builder/Run, the HUD and the builder tools; §10 with the five presets. Add §15 row **M1.5 — Presentation & world builder**, mark it in progress, and note what M2/M3/M5 no longer contain. Add §16 decisions 21–24: M1.5 inserted before M2; staged setup rebuilt on Start; procedural atlas with no image assets; terrain and obstacle blocking with visual-only legs.

- [ ] **Step 2: Update the status lines**

In the presentation design doc change `**Status:** proposed, awaiting approval` to `**Status:** approved, in implementation · 2026-10-25`. In `CLAUDE.md` change the Status line to: `Current milestone: **M1.5 (presentation overhaul), in progress.** M1 complete 2026-10-25.` Keep the rest of the Status paragraph (test count, bench and screenshots) until Task 17 replaces it.

- [ ] **Step 3: Sanity-read the result**

Run:
```powershell
Select-String -Path docs\superpowers\specs\2026-10-25-ant-simulator-design.md -Pattern "M1.5","sprite","Rock","Mud","Home"
Select-String -Path docs\superpowers\specs\2026-10-25-ant-simulator-structure.md -Pattern "M1.5"
```
Expected: each pattern matches at least once; no remaining sentence says M1.5 is not started.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-25-ant-simulator-design.md docs/superpowers/specs/2026-10-25-ant-simulator-structure.md docs/superpowers/specs/2026-10-25-presentation-overhaul-design.md CLAUDE.md
git commit -m "docs: approve the presentation overhaul and open M1.5" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Colony palette and the editable world setup

**Files:**
- Create: `src/sim/palette.ts`
- Create: `src/sim/setup.ts`
- Test: `tests/sim/test_setup.test.ts`

**Interfaces:**
- Consumes: `Vec2` from `src/core/vec2.js`; `kMaxColonies` from `src/sim/types.js`.
- Produces:
```ts
export interface ColonyPaletteEntry { readonly name: string; readonly hex: number; }
export const COLONY_PALETTE: readonly ColonyPaletteEntry[]; // length 8
export function colonyHex(index: number): number;
export function colonyName(index: number): string;
export function firstFreeColor(used: readonly number[]): number;

export enum FoodKind { Seeds = 0, Berries = 1, Leaves = 2 }
export enum ObstacleKind { None = 0, Rock = 1, Water = 2, Sand = 3, Mud = 4 }

export const kSetupObstacleCell = 4;
export const kMinStartingAnts = 10;
export const kMaxStartingAnts = 600;
export const kDefaultStartingAnts = 200;
export const kStartingAntsStep = 10;
export const kMinFoodAmount = 500;
export const kMaxFoodAmount = 20000;
export const kDefaultFoodAmount = 4000;
export const kFoodAmountStep = 500;
export const kMinBrushRadius = 8;
export const kMaxBrushRadius = 64;
export const kMinNestSpacing = 96;
export const kMinNestEdge = 24;

export interface ColonySetup { id: number; nest: Vec2; color: number; startingAnts: number; }
export interface FoodSetup { uid: number; pos: Vec2; amount: number; kind: FoodKind; }
export interface ObstacleCells { cell: number; width: number; height: number; kind: Uint8Array; }
export interface WorldSetup {
  presetId: string; seed: number; size: Vec2;
  colonies: ColonySetup[]; food: FoodSetup[];
  obstacles: ObstacleCells; nextFoodUid: number;
}
export function makeObstacleCells(size: Vec2, cell?: number): ObstacleCells;
export function makeSetup(size: Vec2, seed: number, presetId?: string): WorldSetup;
export function cloneSetup(setup: WorldSetup): WorldSetup;
export function cellKindAt(setup: WorldSetup, p: Vec2): ObstacleKind;
export function paintCells(setup: WorldSetup, kind: ObstacleKind, center: Vec2, radius: number): number;
export function addColony(setup: WorldSetup, nest: Vec2, color?: number, startingAnts?: number): ColonySetup | null;
export function removeColony(setup: WorldSetup, id: number): boolean;
export function moveColony(setup: WorldSetup, id: number, nest: Vec2): boolean;
export function setColonyColor(setup: WorldSetup, id: number, color: number): boolean;
export function setColonyStartingAnts(setup: WorldSetup, id: number, count: number): boolean;
export function addFood(setup: WorldSetup, pos: Vec2, amount: number, kind: FoodKind): FoodSetup;
export function removeFood(setup: WorldSetup, uid: number): boolean;
export function moveFood(setup: WorldSetup, uid: number, pos: Vec2): boolean;
export function setFoodKind(setup: WorldSetup, uid: number, kind: FoodKind): boolean;
export function setFoodAmount(setup: WorldSetup, uid: number, amount: number): boolean;
export function validateSetup(setup: WorldSetup): string | null;
```
Colony ids are always array indices: `addColony` pushes with `id = colonies.length`; `removeColony` splices and renumbers every remaining colony. `nextFoodUid` starts at 1 and never reuses a uid.

- [ ] **Step 1: Write the failing tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  FoodKind, ObstacleKind, addColony, addFood, cellKindAt, cloneSetup, firstFreeColor,
  makeSetup, paintCells, removeColony, removeFood, validateSetup,
} from "../../src/sim/setup.js";
import { COLONY_PALETTE, colonyHex, colonyName } from "../../src/sim/palette.js";

test("palette: eight named colours and the first unused index", () => {
  assert.equal(COLONY_PALETTE.length, 8);
  assert.equal(colonyName(2), "Azure");
  assert.equal(colonyHex(2), 0x4c8dde);
  assert.equal(firstFreeColor([0, 1, 2]), 3);
  assert.equal(firstFreeColor([0, 1, 2, 3, 4, 5, 6, 7]), 0);
});

test("setup: an empty map, and painting then erasing cells", () => {
  const setup = makeSetup({ x: 400, y: 300 }, 1, "blank");
  assert.equal(setup.obstacles.width, 100);
  assert.equal(setup.obstacles.height, 75);
  assert.ok(paintCells(setup, ObstacleKind.Rock, { x: 200, y: 150 }, 12) > 0);
  assert.equal(cellKindAt(setup, { x: 200, y: 150 }), ObstacleKind.Rock);
  paintCells(setup, ObstacleKind.None, { x: 200, y: 150 }, 12);
  assert.equal(cellKindAt(setup, { x: 200, y: 150 }), ObstacleKind.None);
});

test("setup: the brush radius is clamped to 8..64", () => {
  const setup = makeSetup({ x: 400, y: 300 }, 1);
  paintCells(setup, ObstacleKind.Sand, { x: 200, y: 150 }, 1000);
  assert.equal(cellKindAt(setup, { x: 300, y: 150 }), ObstacleKind.None); // 100 u away > 64
  assert.equal(cellKindAt(setup, { x: 230, y: 150 }), ObstacleKind.Sand);
});

test("setup: colonies and food get ids and uids that survive deletion", () => {
  const setup = makeSetup({ x: 400, y: 300 }, 9);
  const first = addColony(setup, { x: 80, y: 80 })!;
  const second = addColony(setup, { x: 300, y: 200 })!;
  assert.deepEqual([first.id, second.id, first.color, second.color], [0, 1, 0, 1]);
  assert.equal(removeColony(setup, 0), true);
  assert.equal(setup.colonies.length, 1);
  assert.equal(setup.colonies[0].id, 0);
  const a = addFood(setup, { x: 200, y: 150 }, 4000, FoodKind.Seeds);
  const b = addFood(setup, { x: 220, y: 150 }, 1000, FoodKind.Berries);
  assert.deepEqual([a.uid, b.uid], [1, 2]);
  removeFood(setup, 1);
  const c = addFood(setup, { x: 240, y: 150 }, 500, FoodKind.Leaves);
  assert.equal(c.uid, 3);
});

test("setup: colonies are capped at eight and starting ants are clamped", () => {
  const setup = makeSetup({ x: 400, y: 300 }, 1);
  for (let i = 0; i < 8; i++) assert.ok(addColony(setup, { x: 20 + i * 40, y: 40 }, i, 5000) !== null);
  assert.equal(addColony(setup, { x: 200, y: 200 }), null);
  assert.equal(setup.colonies[0].startingAnts, 600);
});

test("setup: validation returns the first problem in the fixed order", () => {
  const setup = makeSetup({ x: 400, y: 300 }, 1, "blank");
  assert.equal(validateSetup(setup), "Add at least one colony.");
  addColony(setup, { x: 100, y: 100 });
  assert.equal(validateSetup(setup), "Place at least one food source.");
  addFood(setup, { x: 300, y: 200 }, 4000, FoodKind.Seeds);
  assert.equal(validateSetup(setup), null);
  paintCells(setup, ObstacleKind.Rock, { x: 100, y: 100 }, 8);
  assert.equal(validateSetup(setup), "Move a colony off rock or water.");
});

test("setup: clone is deep and independent", () => {
  const setup = makeSetup({ x: 400, y: 300 }, 1);
  addColony(setup, { x: 100, y: 100 });
  addFood(setup, { x: 300, y: 200 }, 4000, FoodKind.Seeds);
  const copy = cloneSetup(setup);
  copy.colonies[0].nest.x = 5;
  copy.obstacles.kind[0] = ObstacleKind.Rock;
  copy.food[0].amount = 1;
  assert.equal(setup.colonies[0].nest.x, 100);
  assert.equal(setup.obstacles.kind[0], ObstacleKind.None);
  assert.equal(setup.food[0].amount, 4000);
});
```

- [ ] **Step 2: Run to verify RED**

```powershell
npm run build
```
Expected: FAIL with `TS2307: Cannot find module '../../src/sim/setup.js'`.

- [ ] **Step 3: Implement the palette and setup modules**

Palette values, in order: Ember `0xE2603F`, Gold `0xD9A441`, Azure `0x4C8DDE`, Fern `0x5FAE6B`, Orchid `0xA26BD8`, Rose `0xDF7590`, Lagoon `0x34B3A0`, Chalk `0xCFC6B4`. `colonyHex` and `colonyName` clamp/wrap by `index % 8`, and treat negative indices as 0. `firstFreeColor` returns the first index not present in `used`, else 0.

`paintCells` clamps radius to `kMinBrushRadius..kMaxBrushRadius`, computes the cell bounding box around the circle, and sets every cell whose centre lies inside the radius to `kind`. It returns the number of cells changed. `cellKindAt` returns `None` outside the world. `addColony` clamps the nest to `[0, size]`, clamps colour to 0–7, clamps starting ants to 10–600, defaults the colour to `firstFreeColor`, and returns `null` at 8 colonies. `addFood` clamps position, amount (500–20,000) and assigns `nextFoodUid++`. Setters clamp. `validateSetup` checks, in order: any colony, any food, each nest at least 24 u from every edge, nest not on Rock/Water (centre or the 8 points on a 24 u ring), food not on Rock/Water (centre or 8 points on its `foodRadius` ring — use `foodRadius` with `defaultParams()`), nests pairwise ≥96 u. Messages exactly:
`Add at least one colony.`, `Place at least one food source.`, `Move a colony inside the world.`, `Move a colony off rock or water.`, `Move food off rock or water.`, `Nests are too close together.`

- [ ] **Step 4: Run to verify GREEN**

```powershell
npm run build
node --test "dist/tests/sim/test_setup.test.js"
```
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the whole suite**

```powershell
npm test
```
Expected: all tests pass; no new warnings.

- [ ] **Step 6: Commit**

```bash
git add src/sim/palette.ts src/sim/setup.ts tests/sim/test_setup.test.ts
git commit -m "feat(sim): add the colony palette and editable world setup" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Obstacle grid, border flags and line of sight

**Files:**
- Create: `src/sim/obstacles.ts`
- Test: `tests/sim/test_obstacles.test.ts`

**Interfaces:**
- Consumes: `WorldSetup`, `ObstacleCells`, `ObstacleKind` from `setup.ts`.
- Produces:
```ts
export const kSandSpeedFactor = 0.6;
export const kMudSpeedFactor = 0.45;
export interface ObstacleGrid {
  cell: number; width: number; height: number; size: Vec2;
  kind: Uint8Array; border: Uint8Array;
}
export function makeObstacleGrid(size: Vec2, cell: number): ObstacleGrid;
export function obstacleGridFromCells(cells: ObstacleCells): ObstacleGrid;
export function rebuildBorder(grid: ObstacleGrid): void;
export function isSolidCell(grid: ObstacleGrid, col: number, row: number): boolean;
export function isSolidAt(grid: ObstacleGrid, p: Vec2): boolean; // outside is solid
export function speedFactorAt(grid: ObstacleGrid, p: Vec2): number; // 0 | .6 | .45 | 1
export function lineOfSight(grid: ObstacleGrid, a: Vec2, b: Vec2): boolean;
```

- [ ] **Step 1: Write the failing tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  isSolidAt, lineOfSight, makeObstacleGrid, rebuildBorder, speedFactorAt,
} from "../../src/sim/obstacles.js";
import { ObstacleKind } from "../../src/sim/setup.js";

function gridWithWall() {
  const grid = makeObstacleGrid({ x: 40, y: 40 }, 4); // 10 x 10 cells
  for (let row = 3; row <= 5; row++) {
    for (let col = 3; col <= 5; col++) grid.kind[row * 10 + col] = ObstacleKind.Rock;
  }
  rebuildBorder(grid);
  return grid;
}

test("obstacles: only edge cells of a solid block are borders", () => {
  const grid = gridWithWall();
  assert.equal(grid.width, 10);
  assert.equal(grid.border[3 * 10 + 3], 1);
  assert.equal(grid.border[4 * 10 + 4], 0);
  assert.equal(isSolidAt(grid, { x: 18, y: 18 }), true);
  assert.equal(isSolidAt(grid, { x: 2, y: 18 }), false);
  assert.equal(isSolidAt(grid, { x: -1, y: 5 }), true);
});

test("obstacles: terrain speed factors", () => {
  const grid = gridWithWall();
  assert.equal(speedFactorAt(grid, { x: 26, y: 26 }), 1);
  grid.kind[6 * 10 + 6] = ObstacleKind.Sand;
  assert.equal(speedFactorAt(grid, { x: 26, y: 26 }), 0.6);
  grid.kind[6 * 10 + 6] = ObstacleKind.Mud;
  assert.equal(speedFactorAt(grid, { x: 26, y: 26 }), 0.45);
  assert.equal(speedFactorAt(grid, { x: 18, y: 18 }), 0);
});

test("obstacles: line of sight is blocked by rock and clear across sand", () => {
  const grid = gridWithWall();
  assert.equal(lineOfSight(grid, { x: 2, y: 18 }, { x: 30, y: 18 }), false);
  assert.equal(lineOfSight(grid, { x: 2, y: 6 }, { x: 30, y: 6 }), true);
  grid.kind[6 * 10 + 6] = ObstacleKind.Sand;
  assert.equal(lineOfSight(grid, { x: 2, y: 26 }, { x: 30, y: 26 }), true);
});
```

- [ ] **Step 2: Run to verify RED**

```powershell
npm run build
```
Expected: FAIL with `TS2307: Cannot find module '../../src/sim/obstacles.js'`.

- [ ] **Step 3: Implement the obstacle grid**

`makeObstacleGrid` allocates `kind` and `border` arrays of `width × height`, where `width = ceil(size.x/cell)`. `obstacleGridFromCells` copies the setup's `kind` and size, sets `size = { x: cells.width*cells.cell, y: cells.height*cells.cell }`, and calls `rebuildBorder`. `rebuildBorder` sets a cell to 1 iff it is Rock/Water and at least one of its four direct neighbours is out of bounds or not Rock/Water. `speedFactorAt` returns 0 for Rock/Water, 0.6 for Sand, 0.45 for Mud, 1 otherwise or outside. `lineOfSight` marches a 2D DDA cell by cell from `a` to `b`, ignoring the starting cell and checking every entered cell for solidity; return false on the first solid cell. Use the same solid test for both. `isSolidAt` outside the grid returns true.

- [ ] **Step 4: Run to verify GREEN**

```powershell
npm run build
node --test "dist/tests/sim/test_obstacles.test.js"
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the whole suite**

```powershell
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/sim/obstacles.ts tests/sim/test_obstacles.test.ts
git commit -m "feat(sim): add obstacle kinds, border flags and line of sight" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Build a world from setup, multiple colonies, food identity and territory

**Files:**
- Create: `src/sim/setup_apply.ts`
- Modify: `src/sim/world.ts`, `src/sim/colony.ts`, `src/sim/food.ts`, `src/sim/marker_grid.ts`, `src/sim/checksum.ts`
- Test: `tests/sim/test_setup_apply.test.ts`, `tests/sim/test_marker_grid.test.ts`, `tests/sim/test_food_colony.test.ts`
- Mechanical literal updates: `tests/sim/test_pipeline.test.ts`, `tests/sim/test_think.test.ts`, `tests/sim/test_sensing.test.ts`

**Interfaces:**
- Consumes: Task 2 setup types/functions; Task 3 `obstacleGridFromCells`.
- Produces:
```ts
export interface WorldFromSetupOptions { spawnAnts?: boolean; }
export function worldFromSetup(setup: WorldSetup, params: SimParams, options?: WorldFromSetupOptions): World;
export function spawnStartingAnts(world: World, setup: WorldSetup): void;
```
`makeWorld(params: SimParams, seed: number, size?: Vec2): World` gains the optional size, copies `worldW/worldH` from it, and **always initializes `obstacles` to an empty `makeObstacleGrid(size, params.obstacleCell)`** so worlds built directly in tests still step safely. `World` gains `obstacles: ObstacleGrid`. `Colony` gains `color: number`; `makeColony(id, nest, color = 0, historyCapacity = 120)` (no existing call site passes a third argument, so this is safe). `FoodSource` becomes `{ uid: number; pos; amount; infinite; kind: FoodKind }`, extending a new `FoodAmount { pos; amount; infinite }` that remains the parameter type of `foodRadius` — so the existing `foodRadius`-only fixtures still compile. `FoodSources` gains `nextUid: number`; `addFoodSource(sources, pos, amount, infinite = false, kind = FoodKind.Seeds)` keeps its existing argument order and assigns `uid = nextUid++`.

- [ ] **Step 1: Write the failing tests**

`tests/sim/test_setup_apply.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { worldChecksum } from "../../src/sim/checksum.js";
import { addColony, addFood, FoodKind, makeSetup, type WorldSetup } from "../../src/sim/setup.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import { defaultParams } from "../../src/sim/params.js";
import { AntState } from "../../src/sim/types.js";
import { stepWorld } from "../../src/sim/world.js";

function twoColonySetup(): WorldSetup {
  const setup = makeSetup({ x: 400, y: 300 }, 7, "test");
  addColony(setup, { x: 60, y: 60 }, 0, 20);
  addColony(setup, { x: 340, y: 240 }, 2, 30);
  addFood(setup, { x: 200, y: 150 }, 1000, FoodKind.Berries);
  return setup;
}

test("setup apply: builds colonies, food, ants and the matching size", () => {
  const setup = twoColonySetup();
  const world = worldFromSetup(setup, defaultParams());
  assert.deepEqual(world.size, { x: 400, y: 300 });
  assert.equal(world.params.worldW, 400);
  assert.equal(world.obstacles.width, 100);
  assert.equal(world.colonies.length, 2);
  assert.deepEqual(world.colonies.map((c) => [c.id, c.color, c.population]), [[0, 0, 20], [1, 2, 30]]);
  assert.equal(world.ants.size(), 50);
  assert.equal(world.food.items[0].uid, 1);
  assert.equal(world.food.items[0].kind, FoodKind.Berries);
});

test("setup apply: a preview world has colonies but no ants", () => {
  const world = worldFromSetup(twoColonySetup(), defaultParams(), { spawnAnts: false });
  assert.equal(world.ants.size(), 0);
  assert.equal(world.colonies[0].population, 0);
  assert.equal(world.colonies.length, 2);
});

test("setup apply: colonies deliver only to their own nest", () => {
  const world = worldFromSetup(twoColonySetup(), defaultParams());
  let index = -1;
  for (let i = 0; i < world.ants.size(); i++) if (world.ants.colony[i] === 1) { index = i; break; }
  const nest = world.colonies[1].nest;
  world.ants.posX[index] = nest.x;
  world.ants.posY[index] = nest.y;
  world.ants.state[index] = AntState.ReturningFood;
  stepWorld(world);
  assert.equal(world.colonies[1].foodPool, 1);
  assert.equal(world.colonies[1].deliveredTotal, 1);
  assert.equal(world.colonies[0].foodPool, 0);
});

test("setup apply: same setup and seed are deterministic after 600 ticks", () => {
  const a = worldFromSetup(twoColonySetup(), defaultParams());
  const b = worldFromSetup(twoColonySetup(), defaultParams());
  for (let i = 0; i < 600; i++) { stepWorld(a); stepWorld(b); }
  assert.equal(worldChecksum(a), worldChecksum(b));
  b.colonies[0].color = 3;
  assert.notEqual(worldChecksum(a), worldChecksum(b));
});
```

Add to `tests/sim/test_marker_grid.test.ts`:
```ts
test("territory: a foreign deposit erodes both channels, then flips on zero", () => {
  const params = defaultParams();
  params.territoryRule = true;
  params.foreignErasureFactor = 0.5;
  const grid = makeMarkerGrid({ x: 48, y: 48 }, 8);
  const cell = grid.cellIndex({ x: 4, y: 4 });
  grid.owner[cell] = 0;
  grid.toHome[cell] = 0.4;
  grid.toFood[cell] = 0.4;
  deposit(grid, cell, 1, MarkerChannel.ToHome, 0.2, params);
  assert.equal(grid.owner[cell], 0);
  assert.ok(Math.abs(grid.toHome[cell] - 0.3) < 1e-6);
  assert.ok(Math.abs(grid.toFood[cell] - 0.3) < 1e-6);
  deposit(grid, cell, 1, MarkerChannel.ToHome, 0.8, params);
  assert.equal(grid.owner[cell], 1);
  assert.equal(grid.toHome[cell], 0.8);
  assert.equal(grid.toFood[cell], 0);
});

test("territory: with the rule off a foreign deposit changes nothing", () => {
  const params = defaultParams();
  params.territoryRule = false;
  const grid = makeMarkerGrid({ x: 48, y: 48 }, 8);
  const cell = grid.cellIndex({ x: 4, y: 4 });
  grid.owner[cell] = 0;
  grid.toHome[cell] = 0.4;
  deposit(grid, cell, 1, MarkerChannel.ToHome, 0.8, params);
  assert.equal(grid.owner[cell], 0);
  assert.equal(grid.toHome[cell], 0.4);
});
```

Add to `tests/sim/test_food_colony.test.ts`:
```ts
test("food: addFoodSource assigns monotonic uids and keeps the kind", () => {
  const sources = makeFoodSources();
  addFoodSource(sources, { x: 0, y: 0 }, 100, false, FoodKind.Leaves);
  addFoodSource(sources, { x: 10, y: 0 }, 200, false);
  assert.deepEqual(sources.items.map((s) => [s.uid, s.kind]), [[1, FoodKind.Leaves], [2, FoodKind.Seeds]]);
  sources.items.shift();
  addFoodSource(sources, { x: 20, y: 0 }, 300);
  assert.equal(sources.items.at(-1)!.uid, 3);
});
```

- [ ] **Step 2: Run to verify RED**

```powershell
npm run build
```
Expected: FAIL with `TS2307: Cannot find module '../../src/sim/setup_apply.js'`, then after the module exists, `TS2339` for the missing `color`/`uid`/`kind`.

- [ ] **Step 3: Implement world construction and the territory rule**

`worldFromSetup` copies params with `worldW/worldH = setup.size`, calls `makeWorld(copy, setup.seed, setup.size)`, assigns `world.obstacles = obstacleGridFromCells(setup.obstacles)`, then, in colony array order, pushes `makeColony(index, nest, color)` and pushes each food as `{ uid, pos, amount, infinite:false, kind }` (keep `world.food.nextUid` above the largest setup uid). When `spawnAnts` is not false, call `spawnAtNest(world, colony)` exactly `startingAnts` times per colony; it already increments `population`. `spawnStartingAnts` is the exported loop, reusable.

Implement the spec's deposit rule exactly in `marker_grid.ts`, replacing `_params`:
1. owner is this colony or `kNoOwner` → set owner, set only the deposited channel to `max(value, strength)`.
2. owner is foreign and `params.territoryRule` → subtract `strength * params.foreignErasureFactor` from both channels, clamp at 0; if both are 0, set owner and apply rule 1.
3. otherwise do nothing.
Add to the checksum: each obstacle cell's `kind`, each colony's `nest.x/y` (floats) and `color`, and each food item's `uid`, `pos` (floats), `amount` (int) and `kind`.

Update every object pushed directly into `world.food.items` in `test_pipeline` (three), `test_think` (two) and `test_sensing` (two) to include a distinct `uid` and a `kind`; the `foodRadius`-only literals in `test_food_colony` need no change because `foodRadius` keeps the `FoodAmount` parameter type.

- [ ] **Step 4: Run to verify GREEN**

```powershell
npm run build
node --test "dist/tests/sim/test_setup_apply.test.js" "dist/tests/sim/test_marker_grid.test.js" "dist/tests/sim/test_food_colony.test.js"
```
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

```powershell
npm test
```
Expected: all tests pass. Fix any remaining food literal or `makeColony` call site mechanically.

- [ ] **Step 6: Commit**

```bash
git add src/sim/setup_apply.ts src/sim/world.ts src/sim/colony.ts src/sim/food.ts src/sim/marker_grid.ts src/sim/checksum.ts tests/sim
git commit -m "feat(sim): build worlds from setup with colours, food identity and territory" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: The five map presets

**Files:**
- Create: `src/sim/presets.ts`
- Modify: `src/app/options.ts`, `src/app/bench.ts`, `src/app/headless.ts`, `src/app/interactive.ts`, `src/app/main.ts`, `tests/ui/test_param_specs.test.ts`
- Replace: `tests/sim/test_scenarios_checksum.test.ts` → `tests/sim/test_presets_checksum.test.ts`
- Delete: `src/sim/scenarios.ts`
- Test: `tests/sim/test_presets.test.ts`, `tests/app/test_options.test.ts`, `tests/app/test_bench.test.ts`
- Modify tool: `tools/screenshot.mjs`

**Interfaces:**
- Consumes: setup/palette/obstacles/worldFromSetup.
- Produces:
```ts
export interface PresetInfo { id: string; name: string; }
export const kPresetIds = ["meadow", "dunes", "creek", "boulder", "blank"] as const;
export function presetNames(): readonly string[];
export function presetInfo(id: string): PresetInfo | null;
export function loadPreset(id: string, seed: number): WorldSetup | null;
export function quickStartSetup(seed: number): WorldSetup; // meadow
```
`AppOptions` replaces `scenario: string` with `preset: string` (default `"meadow"`). `--preset <id>` is the new flag; `--scenario sandbox` remains an alias for `meadow`, every other valid preset id is accepted, and anything else is an error naming the valid ids. `--bench <preset>` uses the same parsing. `BenchReport.scenario` becomes `preset`, and its header line becomes `bench preset=<id>`.

- [ ] **Step 1: Write the failing tests**

`tests/sim/test_presets.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { FoodKind, ObstacleKind, validateSetup } from "../../src/sim/setup.js";
import { loadPreset, presetNames, quickStartSetup } from "../../src/sim/presets.js";

test("presets: the five ids are stable", () => {
  assert.deepEqual(presetNames(), ["meadow", "dunes", "creek", "boulder", "blank"]);
});

test("presets: every preset is deterministic and every non-blank one is valid", () => {
  for (const id of presetNames()) {
    const a = loadPreset(id, 1)!;
    const b = loadPreset(id, 1)!;
    assert.deepEqual(a, b, id);
    if (id !== "blank") assert.equal(validateSetup(a), null, id);
  }
  assert.equal(loadPreset("maze", 1), null);
});

test("presets: meadow is the M1 sandbox plus a second food pile", () => {
  const setup = quickStartSetup(42);
  assert.equal(setup.presetId, "meadow");
  assert.equal(setup.seed, 42);
  assert.equal(setup.colonies.length, 1);
  assert.deepEqual(setup.colonies[0].nest, { x: 400, y: 540 });
  assert.equal(setup.colonies[0].startingAnts, 200);
  assert.equal(setup.food.length, 2);
  assert.equal(setup.food[0].amount, 6000);
});

test("presets: creek is wider and all food and obstacle kinds appear", () => {
  assert.deepEqual(loadPreset("creek", 1)!.size, { x: 2240, y: 1200 });
  const foodKinds = new Set<FoodKind>();
  const obstacleKinds = new Set<ObstacleKind>();
  for (const id of presetNames()) {
    const setup = loadPreset(id, 1)!;
    for (const food of setup.food) foodKinds.add(food.kind);
    for (const kind of setup.obstacles.kind) {
      if (kind !== ObstacleKind.None) obstacleKinds.add(kind as ObstacleKind);
    }
  }
  assert.deepEqual([...foodKinds].sort(), [FoodKind.Seeds, FoodKind.Berries, FoodKind.Leaves]);
  assert.deepEqual([...obstacleKinds].sort(), [ObstacleKind.Rock, ObstacleKind.Water, ObstacleKind.Sand, ObstacleKind.Mud]);
});
```

`tests/app/test_options.test.ts` additions:
```ts
test("options: --preset and the --scenario sandbox alias", () => {
  assert.equal(parseOptions(["--preset", "dunes"]).options.preset, "dunes");
  assert.equal(parseOptions(["--scenario", "sandbox"]).options.preset, "meadow");
  assert.match(parseOptions(["--preset", "maze"]).error, /meadow, dunes, creek, boulder, blank/);
});
```
Rewrite the existing options expectations: the defaults test expects `preset === "meadow"`; the bench test uses `--bench boulder` and expects `preset === "boulder"`; the help/version/URL tests use `--scenario creek` and expect `preset === "creek"`; `usageText()` is asserted to include `--bench <preset>`. Rewrite `test_bench`'s fixture field to `preset: "meadow"` and its header assertion to `bench preset=meadow ticks=600 threads=8 ants=0`.

- [ ] **Step 2: Run to verify RED**

```powershell
npm run build
```
Expected: FAIL with `TS2307: Cannot find module '../../src/sim/presets.js'` and `TS2339` for `options.preset`.

- [ ] **Step 3: Implement the presets and migrate the entry points**

Preset contents (colonies listed as nest/colour/starting ants; all seeds pass through):

| Preset | Size | Colonies | Food | Terrain |
|---|---|---|---|---|
| meadow | 1920×1080 | (400,540)/Ember/200 | Seeds 6000 (1000,720); Berries 3000 (1480,400) | rock clusters at (650,250,40), (1250,250,55), (1650,800,45), (900,880,35), (300,880,30); sand drift around (1500,200,64)×3 stepping x; mud (700,760,60) |
| dunes | 1920×1080 | (420,540)/Ember/180; (1500,540)/Azure/180 | Leaves 8000 (960,540) | rocks (960,200,50), (500,850,60), (1400,850,50); mud oasis (960,900,90) painted as 3 overlapping brushes; sand broad |
| creek | 2240×1200 | (320,600)/Fern/200; (1920,600)/Rose/200 | Seeds 5000 (640,600); Berries 5000 (1600,600) | water band centred x=1120, radius 60 every 40 u down y, **omitting** y 280–360 and 840–920; sand banks at (1000,600,60) and (1240,600,60); rock clusters (1160,320,40) and (1160,880,40) |
| boulder | 1920×1080 | (300,540)/Gold/220 | Seeds 7000 (1400,400); Berries 4000 (1400,760) | rock clusters (700,250,60), (760,800,60), (1100,200,45), (1100,880,55), (1750,200,50), (1750,760,55); mud (500,850,50) |
| blank | 1920×1080 | none | none | empty neutral |

Keep the meadow nest→food corridor around y 540–720 at x 400–1000 free of Rock/Water so the long-run tests can still forage. Food kinds use `FoodKind`, terrain uses `paintCells`; every paint call is deterministic (no RNG).

Update `options.ts`: replace the `scenario` field with `preset`, parse both `--preset` and `--scenario` (mapping only the legacy name `sandbox` to `meadow`, and otherwise accepting any of the five ids), and reject an unknown value with an error naming `meadow, dunes, creek, boulder, blank`. `--bench <id>` goes through the same validation. Keep the URL parser working through the same flag names. Update `bench.ts` to build via `worldFromSetup(loadPreset(options.preset, options.seed)!, defaultParams())`, keep the 60 warm-up ticks, rename `BenchReport.scenario` to `preset`, and print `bench preset=<id>`. Update `headless.ts` and `interactive.ts` to load the preset, keep the setup in scope, and build with `worldFromSetup`; keep the old `nightTheme()` until Task 9. Update the Bench help line in `main.ts` to `npm run bench -- --preset meadow --ticks 1200`. Update `tests/ui/test_param_specs.test.ts` to build its extreme-parameter world with `worldFromSetup(quickStartSetup(1), defaultParams())` instead of `makeWorld` + `loadScenario`. Delete `scenarios.ts` and replace `test_scenarios_checksum` with `test_presets_checksum`: keep the 7,200 and 10,800 tick acceptance thresholds against meadow seed 1 (same 200 ants, same nest, and the second food pile only helps), asserting delivered ≥5, ants ≥40/≥100, both trail channels ≥20 cells, and finite ant state; add the determinism and checksum tests against two `worldFromSetup(quickStartSetup(7), defaultParams())` worlds. Update `tools/screenshot.mjs` with `--preset` (default `meadow`, validate against the five ids) and pass `preset` in the query.

- [ ] **Step 4: Run to verify GREEN**

```powershell
npm run build
node --test "dist/tests/sim/test_presets.test.js" "dist/tests/sim/test_presets_checksum.test.js" "dist/tests/app/test_options.test.js" "dist/tests/app/test_bench.test.js"
```
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

```powershell
npm test
```
Expected: all tests pass. If the 7,200/10,800 meadow thresholds fail, first verify the corridor is actually clear, then adjust only the preset geometry — do not weaken the delivery/trail assertions.

- [ ] **Step 6: Commit**

```bash
git add src/sim/presets.ts src/sim/scenarios.ts src/app tests tests/ui/test_param_specs.test.ts tools/screenshot.mjs
git commit -m "feat: add five map presets and migrate the apps to setups" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: Terrain speed, wall collision and blocked senses

**Files:**
- Create: `src/sim/collide.ts`
- Modify: `src/sim/world.ts`, `src/sim/tick.ts`, `src/sim/sensing.ts`
- Test: `tests/sim/test_obstacles_physics.test.ts`

**Interfaces:**
- Consumes: Task 3 obstacle grid; Task 4 `World.obstacles` and worldFromSetup.
- Produces:
```ts
export function resolveObstacles(world: World): void;
```
`stepWorld`'s Collisions phase runs `clampToWorld(world)`, then `resolveObstacles(world)`, then `clampToWorld(world)`. Movement multiplies the step distance by `speedFactorAt(world.obstacles, pos)`. Sensor samples inside solid cells are skipped; direct sight requires `lineOfSight`.

- [ ] **Step 1: Write the failing tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { isSolidAt } from "../../src/sim/obstacles.js";
import { defaultParams, type SimParams } from "../../src/sim/params.js";
import { followerPattern, senseMarkers, directSightHeading } from "../../src/sim/sensing.js";
import { addColony, addFood, FoodKind, makeSetup, ObstacleKind, paintCells } from "../../src/sim/setup.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import { MarkerChannel } from "../../src/sim/marker_grid.js";
import { stepWorld, type World } from "../../src/sim/world.js";

function groundWorld(edit?: (setup: ReturnType<typeof makeSetup>) => void): { world: World; params: SimParams } {
  const params = defaultParams();
  params.worldW = 400; params.worldH = 300;
  params.wanderAngleFollower = 0; params.wanderAngleExplorer = 0;
  const setup = makeSetup({ x: 400, y: 300 }, 3, "test");
  addColony(setup, { x: 20, y: 20 }, 0, 0);
  addFood(setup, { x: 360, y: 260 }, 500, FoodKind.Seeds);
  edit?.(setup);
  const world = worldFromSetup(setup, params);
  return { world, params };
}

function spawn(world: World, x: number, y: number): number {
  return world.ants.spawn({ pos: { x, y }, heading: 0 }, world.nextUid++, world.params.antSpeed, world.params);
}

test("terrain: sand moves an ant at 60% speed", () => {
  const { world } = groundWorld((s) => paintCells(s, ObstacleKind.Sand, { x: 120, y: 50 }, 64));
  const index = spawn(world, 100, 50);
  for (let i = 0; i < 60; i++) stepWorld(world);
  assert.ok(Math.abs(world.ants.posX[index] - 130) < 0.6, `x=${world.ants.posX[index]}`);
});

test("terrain: mud moves an ant at 45% speed", () => {
  const { world } = groundWorld((s) => paintCells(s, ObstacleKind.Mud, { x: 120, y: 50 }, 64));
  const index = spawn(world, 100, 50);
  for (let i = 0; i < 60; i++) stepWorld(world);
  assert.ok(Math.abs(world.ants.posX[index] - 122.5) < 0.6, `x=${world.ants.posX[index]}`);
});

test("collision: an ant stops outside a rock wall and is never left inside it", () => {
  const { world, params } = groundWorld((s) => paintCells(s, ObstacleKind.Rock, { x: 160, y: 50 }, 16));
  const index = spawn(world, 100, 50);
  for (let i = 0; i < 120; i++) stepWorld(world);
  let wallX = Infinity;
  for (let cell = 0; cell < world.obstacles.kind.length; cell++) {
    if (world.obstacles.kind[cell] !== ObstacleKind.Rock) continue;
    const row = Math.floor(cell / world.obstacles.width);
    const col = cell % world.obstacles.width;
    if (50 >= row * 4 && 50 < (row + 1) * 4) wallX = Math.min(wallX, col * 4);
  }
  assert.ok(Number.isFinite(wallX));
  assert.ok(world.ants.posX[index] + params.antRadius <= wallX + 0.01, `x=${world.ants.posX[index]}`);
  assert.equal(isSolidAt(world.obstacles, { x: world.ants.posX[index], y: 50 }), false);
});

test("sight: rock blocks direct sight, open ground does not", () => {
  function sight(withRock: boolean): number | null {
    const { world } = groundWorld((s) => {
      addFood(s, { x: 160, y: 50 }, 500, FoodKind.Seeds);
      if (withRock) paintCells(s, ObstacleKind.Rock, { x: 120, y: 50 }, 12);
    });
    world.params.sensorRadius = 80;
    const index = spawn(world, 100, 50);
    return directSightHeading(world, index);
  }
  assert.equal(sight(true), null);
  assert.ok(Math.abs(sight(false)!) < 1e-6);
});

test("scent: a marker sample inside rock is ignored", () => {
  function sensed(withRock: boolean): boolean {
    const { world } = groundWorld((s) => {
      if (withRock) paintCells(s, ObstacleKind.Rock, { x: 132, y: 100 }, 6);
    });
    const index = spawn(world, 100, 100);
    const cell = world.markers.cellIndex({ x: 132, y: 100 });
    world.markers.owner[cell] = 0;
    world.markers.toHome[cell] = 1;
    world.markers.toFood[cell] = 1;
    return senseMarkers(world, index, MarkerChannel.ToHome, followerPattern(world.params)).found;
  }
  assert.equal(sensed(true), false);
  assert.equal(sensed(false), true);
});

test("collision: obstacle worlds stay deterministic", () => {
  const a = groundWorld((s) => paintCells(s, ObstacleKind.Rock, { x: 200, y: 150 }, 40)).world;
  const b = groundWorld((s) => paintCells(s, ObstacleKind.Rock, { x: 200, y: 150 }, 40)).world;
  for (let i = 0; i < 600; i++) { stepWorld(a); stepWorld(b); }
  assert.equal(a.ants.size(), b.ants.size());
});
```

- [ ] **Step 2: Run to verify RED**

```powershell
npm run build
node --test "dist/tests/sim/test_obstacles_physics.test.js"
```
Expected: FAIL — sand/mud tests travel the full clear-ground distance, the wall test crosses the wall, and sight/scent tests return targets. (`resolveObstacles` does not exist yet; create the file in Step 3.)

- [ ] **Step 3: Implement collision and sensing blocks**

In `thinkChunk`, before applying the velocity to `posX/posY`, multiply the displacement by `speedFactorAt(world.obstacles, { x: posX, y: posY })`. In `sensing.ts`, after computing each sample point, skip it when `isSolidAt(world.obstacles, samplePoint)`; in `directSightHeading`, before accepting a food source or the own nest, require `lineOfSight(world.obstacles, antPos, targetPos)`.

`resolveObstacles` loops all ants twice. For each pass, scan the 3×3 cells around the ant (clamped to the grid); for a cell with `border[cell] === 1` and Rock/Water, clamp the ant centre to the cell box to get the nearest point, compute the delta and distance; if distance < `params.antRadius`, push the centre out to exactly the radius along the delta. If the centre is exactly inside the box, push through the nearest face plus the radius. Run both passes before the final world clamp. Do not use random values.

- [ ] **Step 4: Run to verify GREEN**

```powershell
npm run build
node --test "dist/tests/sim/test_obstacles_physics.test.js"
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the whole suite**

```powershell
npm test
```
Expected: all tests pass. A pre-existing long-run test may slow slightly from collision checks but must still meet its thresholds.

- [ ] **Step 6: Commit**

```bash
git add src/sim/collide.ts src/sim/world.ts src/sim/tick.ts src/sim/sensing.ts tests/sim/test_obstacles_physics.test.ts
git commit -m "feat(sim): add terrain speed, wall collision and blocked senses" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: Food piece layout

**Files:**
- Create: `src/render/food_layout.ts`
- Test: `tests/render/test_food_layout.test.ts`

**Interfaces:**
- Consumes: `Vec2`, `mix32`.
- Produces:
```ts
export const kFoodPerPiece = 100;
export const kMaxFoodPieces = 48;
export interface FoodPiece { x: number; y: number; rotation: number; variant: number; }
export function foodPieceCount(amount: number, infinite: boolean): number;
export function foodPieces(uid: number, pos: Vec2, radius: number, amount: number, infinite: boolean): FoodPiece[];
```
Pure rendering state; no simulation writes, no `Math.random`.

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { foodPieceCount, foodPieces, kMaxFoodPieces } from "../../src/render/food_layout.js";

test("food pieces: one per 100 units, capped at 48, infinite always full", () => {
  assert.equal(foodPieceCount(0, false), 0);
  assert.equal(foodPieceCount(1, false), 1);
  assert.equal(foodPieceCount(100, false), 1);
  assert.equal(foodPieceCount(101, false), 2);
  assert.equal(foodPieceCount(100000, false), kMaxFoodPieces);
  assert.equal(foodPieceCount(0, true), kMaxFoodPieces);
});

test("food pieces: shrinking a pile removes only the outermost pieces", () => {
  const all = foodPieces(42, { x: 100, y: 100 }, 40, 4800, false);
  const less = foodPieces(42, { x: 100, y: 100 }, 40, 800, false);
  assert.equal(all.length, 48);
  assert.equal(less.length, 8);
  assert.deepEqual(less, all.slice(0, 8));
});

test("food pieces: zero draws nothing and every piece is inside the radius", () => {
  assert.deepEqual(foodPieces(7, { x: 0, y: 0 }, 20, 0, false), []);
  const pieces = foodPieces(7, { x: 100, y: 100 }, 40, 4800, false);
  for (const piece of pieces) {
    assert.ok(Math.hypot(piece.x - 100, piece.y - 100) <= 40);
    assert.ok(piece.rotation >= 0 && piece.rotation < Math.PI * 2);
    assert.ok(Number.isInteger(piece.variant) && piece.variant >= 0 && piece.variant < 4);
    assert.ok(Number.isFinite(piece.x) && Number.isFinite(piece.y));
  }
});

test("food pieces: layout is deterministic per uid", () => {
  assert.deepEqual(foodPieces(9, { x: 1, y: 2 }, 30, 2000, false), foodPieces(9, { x: 1, y: 2 }, 30, 2000, false));
  assert.notDeepEqual(foodPieces(9, { x: 1, y: 2 }, 30, 2000, false), foodPieces(10, { x: 1, y: 2 }, 30, 2000, false));
});
```

- [ ] **Step 2: Run to verify RED**

```powershell
npm run build
```
Expected: FAIL with `TS2307: Cannot find module '../../src/render/food_layout.js'`.

- [ ] **Step 3: Implement the layout**

`foodPieceCount` = `infinite ? 48 : clamp(ceil(amount/100), 0, 48)`. For piece `i`:
`angle = i * 2.399963229728653 + (mix32((uid ^ (i * 0x9e3779b9)) >>> 0) / 2**32) * 0.35`,
`r = radius * 0.92 * Math.sqrt((i + 0.5) / 48)`,
`x/y = pos + (cos/sin) * r`. This is inner-first and independent of the current piece count, so early pieces stay put as the pile shrinks. `rotation` and `variant` come from two different `mix32` hashes of `uid` and `i` (`variant = hash & 3`, `rotation = hash / 2**32 * TAU`). Use only unsigned arithmetic.

- [ ] **Step 4: Run to verify GREEN**

```powershell
npm run build
node --test "dist/tests/render/test_food_layout.test.js"
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the whole suite**

```powershell
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/render/food_layout.ts tests/render/test_food_layout.test.ts
git commit -m "feat(render): lay out food as stable, depleting pieces" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: Sprite atlas layout, SpriteBatch and the sprite shader

**Files:**
- Create: `src/render/atlas.ts`, `src/render/sprite_batch.ts`
- Modify: `src/render/gl_renderer.ts`
- Test: `tests/render/test_atlas.test.ts`, `tests/render/test_sprite_batch.test.ts`

**Interfaces:**
- Consumes: `FoodKind`; `Rgba8`; `GeometryBatch` patterns.
- Produces:
```ts
export interface AtlasFrame { x: number; y: number; w: number; h: number; }
export interface AtlasFrames {
  antBody(colony: number, variant: number): AtlasFrame;
  antSmall(colony: number, variant: number): AtlasFrame;
  food(kind: FoodKind, variant: number): AtlasFrame;
  nest(colony: number): AtlasFrame;
}
export const kAtlasWidth = 2048;
export const kAtlasHeight = 1024;
export function makeAtlasFrames(): AtlasFrames;

export class SpriteBatch {
  clear(): void;
  addFrame(frame: AtlasFrame, cx: number, cy: number, w: number, h: number, rotation: number, tint: Rgba8): void;
  addQuad(x: number, y: number, w: number, h: number, u0: number, v0: number, u1: number, v1: number, rotation: number, tint: Rgba8): void;
  quadCount(): number;
  vertexCount(): number;
  indexCount(): number;
  vertexData(): Float32Array;
  indices(): Uint32Array;
}
```
`GlRenderer` gains `drawSprites(texture: WebGLTexture, batch: SpriteBatch): void`. Vertex format is 8 floats `[x, y, u, v, r, g, b, a]`; 4 vertices and 6 indices per quad.

Atlas rects: body frames `{ x: (colony*2+variant)*128, y: 0, w: 128, h: 64 }`; small frames `{ x: (colony*2+variant)*128, y: 64, w: 128, h: 64 }` (the same 2:1 aspect, so the layer can draw them at the same width/height without stretching); food `{ x: (kind*4+variant)*64, y: 128, w: 64, h: 64 }`; nest `{ x: colony*256, y: 192, w: 256, h: 256 }`. Colony indices wrap mod 8; variants mod 2 (body/small) or mod 4 (food).

- [ ] **Step 1: Write the failing tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { kAtlasHeight, kAtlasWidth, makeAtlasFrames, type AtlasFrame } from "../../src/render/atlas.js";
import { FoodKind } from "../../src/sim/setup.js";

test("atlas: all frames fit inside the page and never overlap", () => {
  const frames = makeAtlasFrames();
  const list: AtlasFrame[] = [];
  for (let c = 0; c < 8; c++) for (let v = 0; v < 2; v++) list.push(frames.antBody(c, v), frames.antSmall(c, v));
  for (let k = 0; k < 3; k++) for (let v = 0; v < 4; v++) list.push(frames.food(k as FoodKind, v));
  for (let c = 0; c < 8; c++) list.push(frames.nest(c));
  for (const f of list) {
    assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= kAtlasWidth && f.y + f.h <= kAtlasHeight);
  }
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.equal(overlaps, false, `frames ${i} and ${j} overlap`);
  }
});

test("atlas: colony and variant select different body frames", () => {
  const f = makeAtlasFrames();
  assert.notDeepEqual(f.antBody(0, 0), f.antBody(2, 0));
  assert.notDeepEqual(f.antBody(0, 0), f.antBody(0, 1));
  assert.deepEqual(f.antBody(8, 2), f.antBody(0, 0));
});
```

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { makeAtlasFrames } from "../../src/render/atlas.js";
import { SpriteBatch } from "../../src/render/sprite_batch.js";
import { FoodKind } from "../../src/sim/setup.js";
import { rgba } from "../../src/core/color.js";

const white = rgba(255, 255, 255, 255);

test("sprite batch: one frame writes four vertices and six indices with its UVs", () => {
  const batch = new SpriteBatch();
  batch.addFrame(makeAtlasFrames().food(FoodKind.Seeds, 0), 256, 256, 64, 64, 0, white);
  assert.equal(batch.quadCount(), 1);
  assert.equal(batch.vertexCount(), 4);
  assert.equal(batch.indexCount(), 6);
  assert.deepEqual([...batch.indices()], [0, 1, 2, 0, 2, 3]);
  const data = batch.vertexData();
  assert.equal(data.length, 32);
  assert.deepEqual([...data.slice(0, 2)], [224, 224]);
  assert.deepEqual([...data.slice(8, 10)], [288, 224]);
  assert.ok(Math.abs(data[2] - 0) < 1e-6);
  assert.ok(Math.abs(data[3] - 128 / 1024) < 1e-6);
  assert.ok(Math.abs(data[10] - 64 / 2048) < 1e-6);
});

test("sprite batch: rotation keeps the centre and stays finite", () => {
  const batch = new SpriteBatch();
  batch.addFrame(makeAtlasFrames().nest(0), 100, 100, 40, 40, Math.PI / 2, white);
  const data = batch.vertexData();
  for (const value of data) assert.ok(Number.isFinite(value));
  let sumX = 0, sumY = 0;
  for (let v = 0; v < 4; v++) { sumX += data[v * 8]; sumY += data[v * 8 + 1]; }
  assert.ok(Math.abs(sumX / 4 - 100) < 1e-6);
  assert.ok(Math.abs(sumY / 4 - 100) < 1e-6);
});

test("sprite batch: clear resets the counts and tints are copied", () => {
  const batch = new SpriteBatch();
  batch.addFrame(makeAtlasFrames().food(FoodKind.Berries, 1), 0, 0, 10, 10, 0, rgba(10, 20, 30, 40));
  batch.clear();
  assert.equal(batch.quadCount(), 0);
  assert.equal(batch.vertexData().length, 0);
  batch.addFrame(makeAtlasFrames().food(FoodKind.Berries, 1), 0, 0, 10, 10, 0, rgba(10, 20, 30, 40));
  const data = batch.vertexData();
  assert.ok(Math.abs(data[4] - 10 / 255) < 1e-6);
  assert.ok(Math.abs(data[7] - 40 / 255) < 1e-6);
});
```

- [ ] **Step 2: Run to verify RED**

```powershell
npm run build
```
Expected: FAIL with `TS2307` for `atlas.js` and `sprite_batch.js`.

- [ ] **Step 3: Implement atlas frames, SpriteBatch and the shader**

`makeAtlasFrames` is a pure object of closures using the rect table above. `SpriteBatch` keeps growable `Float32Array`/`Uint32Array` builders (start at 1024 quads), writes TL, TR, BR, BL in that order with rotation around `(cx, cy)`:
`x' = cx + dx*cos - dy*sin`, `y' = cy + dx*sin + dy*cos`, where `dx/dy` start at `(-w/2,-h/2)` for TL and proceed clockwise. UVs are `(u0,v0),(u1,v0),(u1,v1),(u0,v1)`. Tint channels are converted to 0..1 once per quad. `vertexData`/`indices` return exact-length copies or subarray views; tests only read lengths and values.

In `GlRenderer.create`, add a sprite program with `a_pos vec2, a_uv vec2, a_color vec4`, uniforms `u_resolution`, `u_texture`; fragment `texture(u_texture, v_uv) * v_color`. Create a VAO and buffer with stride 32 bytes (pos 0, uv 8, colour 16). `drawSprites` binds the VAO, uses the program, sets resolution, uploads vertex and index data, binds the texture to unit 0, and calls `drawElements(TRIANGLES, indexCount, UNSIGNED_INT, 0)`.

- [ ] **Step 4: Run to verify GREEN**

```powershell
npm run build
node --test "dist/tests/render/test_atlas.test.js" "dist/tests/render/test_sprite_batch.test.js"
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the whole suite**

```powershell
npm test
```
Expected: all tests pass. No rendering path uses the sprite pipeline yet, so no screenshot changes.

- [ ] **Step 6: Commit**

```bash
git add src/render/atlas.ts src/render/sprite_batch.ts src/render/gl_renderer.ts tests/render/test_atlas.test.ts tests/render/test_sprite_batch.test.ts
git commit -m "feat(render): add the sprite atlas layout and batched sprite pipeline" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: The five themes and the teal/amber heatmap

**Files:**
- Modify: `src/render/theme.ts`, `src/render/heatmap.ts`
- Modify: `src/app/interactive.ts`, `src/app/headless.ts`
- Delete: `src/render/test_pattern.ts`, `tests/render/test_theme_and_pattern.test.ts`, `tests/render/test_night_theme.test.ts`
- Create: `tests/render/test_theme.test.ts`
- Modify: `tests/render/test_heatmap.test.ts`, `tests/render/test_world_view.test.ts`
- Mechanical rename: every `nightTheme()`/`sandTheme()` → `meadowTheme()`; every `colonyColor(i)` → `rgba(colonyHex(i))` (in `world_view.ts` until Task 11 rewrites it)

**Interfaces:**
- Consumes: Task 2 palette.
- Produces:
```ts
export interface Theme {
  name: string; outside: Rgba8; ground: Rgba8; grid: Rgba8; border: Rgba8; food: Rgba8;
  heatHome: Rgba8; heatFood: Rgba8; heatAlpha: number;
  rock: Rgba8; water: Rgba8; sand: Rgba8; mud: Rgba8; speckle: Rgba8;
}
export function meadowTheme(): Theme;
export function dunesTheme(): Theme;
export function creekTheme(): Theme;
export function boulderTheme(): Theme;
export function blankTheme(): Theme;
export function themeForPreset(presetId: string): Theme; // unknown -> meadow
```
`fillHeatmapRgba` keeps its signature and modes.

- [ ] **Step 1: Write the failing theme and heatmap tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { rgba } from "../../src/core/color.js";
import { blankTheme, boulderTheme, creekTheme, dunesTheme, meadowTheme, themeForPreset } from "../../src/render/theme.js";

test("themes: the five presets have the designed ground and heat colours", () => {
  assert.equal(meadowTheme().ground.r, 0x0b);
  assert.equal(dunesTheme().ground.r, 0x2a);
  assert.equal(creekTheme().ground.r, 0x0d);
  assert.equal(boulderTheme().ground.r, 0x14);
  assert.equal(blankTheme().ground.r, 0x0b);
  const t = meadowTheme();
  assert.deepEqual(t.heatHome, rgba(0x4f, 0xc3, 0xb0, 255));
  assert.deepEqual(t.heatFood, rgba(0xf0, 0xb4, 0x5e, 255));
  assert.equal(t.heatAlpha, 0.62);
  assert.deepEqual(t.rock, rgba(0x2c, 0x30, 0x34, 255));
  assert.deepEqual(t.water, rgba(0x0f, 0x2f, 0x3c, 255));
  assert.equal(themeForPreset("creek").name, "Creek");
  assert.equal(themeForPreset("nope").name, "Meadow");
});
```

In `test_heatmap.test.ts`, replace the old expectations with:
```ts
test("heatmap: trails are teal home, amber food, at 62% alpha", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 1;
  grid.toFood[0] = 0;
  const out = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.DualChannel, meadowTheme(), out);
  assert.deepEqual([...out], [0x4f, 0xc3, 0xb0, 158]);
});

test("heatmap: off writes transparent pixels", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  const out = new Uint8Array([9, 9, 9, 9]);
  fillHeatmapRgba(grid, HeatmapMode.Off, meadowTheme(), out);
  assert.deepEqual([...out], [0, 0, 0, 0]);
});

test("heatmap: colonies mode uses the palette colour and the stronger channel", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  grid.owner[0] = 2;
  grid.toFood[0] = 0.5;
  grid.toHome[0] = 0;
  const out = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.ColonyColor, meadowTheme(), out);
  assert.deepEqual([...out], [0x4c, 0x8d, 0xde, 79]);
});
```

- [ ] **Step 2: Run to verify RED**

```powershell
npm run build
```
Expected: FAIL with `TS2305: Module 'theme.js' has no exported member 'meadowTheme'`.

- [ ] **Step 3: Implement the themes**

All themes share `outside` `#05070a`, heat colours, heat alpha 0.62 and the obstacle palette from the design (`rock #2C3034`, `water #0F2F3C`, `sand #3A3122`, `mud #251F17`). Grounds: meadow `#0B100D`, dunes `#2A2117`, creek `#0D1412`, boulder `#14171A`, blank `#0B0E0F`. Grid is the theme ground lightened until it reads at 6% alpha; border `rgba(235,241,229,46)`. Give each theme its own `speckle` and `food` tint from the design's character notes. `themeForPreset` maps the five ids, default meadow.

Heatmap:
- `DualChannel`: per cell, `home = toHome`, `food = toFood`; channel sums per RGB, clamped 255; `alpha = round(255 * min(home + food, 1) * theme.heatAlpha)`.
- `ColonyColor`: `strength = max(home, food)`; RGB = `colonyHex(owner)` channels; `alpha = round(255 * strength * theme.heatAlpha)`; owner `-1` uses black/transparent.
- `Off`: fill the output with 0.

Update both apps to `themeForPreset(setup.presetId)` using the setup kept from Task 5. Delete `test_pattern.ts` and the old theme tests. In `world_view.ts`, replace the `colonyColor` import with `colonyHex` + `rgba` and keep the rest until Task 11.

- [ ] **Step 4: Run to verify GREEN**

```powershell
npm run build
node --test "dist/tests/render/test_theme.test.js" "dist/tests/render/test_heatmap.test.js"
```
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

```powershell
npm test
```
Expected: all tests pass; no import of `nightTheme`, `sandTheme` or `colonyColor` remains.

- [ ] **Step 6: Commit**

```bash
git add src/render/theme.ts src/render/heatmap.ts src/render/world_view.ts src/render/test_pattern.ts src/app tests/render
git commit -m "feat(render): add five map themes and the teal-amber trail palette" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: Ant art, tripod gait and the sprite ant layer

**Files:**
- Create: `src/render/sprite_atlas.ts`, `src/render/legs.ts`
- Modify: `src/render/ant_layer.ts`, `src/render/world_view.ts`, `src/sim/params.ts`
- Create: `tests/render/test_legs.test.ts`
- Rewrite: `tests/render/test_ant_layer.test.ts`
- Modify: `tests/sim/test_params.test.ts`, `tests/render/test_world_view.test.ts`

**Interfaces:**
- Consumes: Task 8 atlas/sprite batch/GL; Task 9 themes.
- Produces:
```ts
export interface SpriteAtlas { canvas: HTMLCanvasElement; frames: AtlasFrames; }
export function paintSpriteAtlas(): SpriteAtlas;

export const kGaitStride = 24;
export class GaitTracker {
  update(world: World): void;
  phaseAt(index: number): number;
}
export interface LegPose {
  hipX: number; hipY: number; footX: number; footY: number;
  kneeX: number; kneeY: number; lift: number;
}
export function legPose(phase: number, leg: number, lengthPx: number): LegPose;

export function buildAnts(
  sprites: SpriteBatch,
  legs: GeometryBatch,
  world: World,
  camera: Camera,
  alpha: number,
  frames: AtlasFrames,
  gait: GaitTracker,
): void;
```
`params.antLength` becomes 10 and `params.legsMinPx` becomes 18. In `tests/sim/test_params.test.ts`, change the `legsMinPx` assertion from 20 to 18 and add `assert.equal(p.antLength, 10)`.

- [ ] **Step 1: Write the failing tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { GaitTracker, legPose } from "../../src/render/legs.js";
import { defaultParams } from "../../src/sim/params.js";
import { makeWorld } from "../../src/sim/world.js";

test("legs: tripods alternate and never lift together", () => {
  for (let leg = 0; leg < 6; leg++) {
    const a = legPose(0.25, leg, 20);
    const b = legPose(0.75, leg, 20);
    const inTripodA = leg === 0 || leg === 2 || leg === 4;
    assert.ok(inTripodA ? a.lift > 0.99 : a.lift === 0, `leg ${leg} at 0.25`);
    assert.ok(inTripodA ? b.lift === 0 : b.lift > 0.99, `leg ${leg} at 0.75`);
  }
});

test("legs: left and right front legs mirror while in antiphase", () => {
  const left = legPose(0.25, 0, 20);
  const right = legPose(0.25, 3, 20);
  assert.ok(Math.abs((left.footX - left.hipX) + (right.footX - right.hipX)) < 1e-6);
  assert.ok(Math.abs(left.footY + right.footY) < 1e-6);
  for (const pose of [left, right]) for (const v of Object.values(pose)) assert.ok(Number.isFinite(v));
});

test("gait: phase advances with distance and wraps", () => {
  const params = defaultParams();
  params.worldW = 400; params.worldH = 300;
  const world = makeWorld(params, 1);
  world.ants.spawn({ pos: { x: 100, y: 100 } }, 0, params.antSpeed, params);
  const gait = new GaitTracker();
  gait.update(world);
  const start = gait.phaseAt(0);
  world.ants.posX[0] += 12;
  gait.update(world);
  assert.ok(Math.abs(((gait.phaseAt(0) - start + 1) % 1) - 0.5) < 1e-6);
  for (let i = 0; i < 100; i++) {
    world.ants.posX[0] += 12;
    gait.update(world);
  }
  assert.ok(gait.phaseAt(0) >= 0 && gait.phaseAt(0) < 1);
});
```

`test_ant_layer.test.ts` (replacing the old file):
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { makeAtlasFrames } from "../../src/render/atlas.js";
import { Camera } from "../../src/render/camera.js";
import { buildAnts } from "../../src/render/ant_layer.js";
import { GeometryBatch } from "../../src/render/batch.js";
import { GaitTracker } from "../../src/render/legs.js";
import { SpriteBatch } from "../../src/render/sprite_batch.js";
import { makeColony } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { makeWorld, type World } from "../../src/sim/world.js";

function layerWorld() {
  const params = defaultParams();
  params.worldW = 400; params.worldH = 300;
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 60, y: 60 }));
  world.ants.spawn({ pos: { x: 200, y: 150 } }, 0, params.antSpeed, params);
  const camera = new Camera();
  camera.setViewport({ x: 800, y: 600 });
  camera.fit(world.size);
  return { world, camera, params };
}

test("ants: a shadow and a body sprite plus animated legs at fit zoom", () => {
  const { world, camera } = layerWorld();
  const sprites = new SpriteBatch();
  const legs = new GeometryBatch();
  const gait = new GaitTracker();
  gait.update(world);
  buildAnts(sprites, legs, world, camera, 0, makeAtlasFrames(), gait);
  assert.equal(sprites.quadCount(), 2);
  assert.equal(legs.vertexCount(), 48);
});

test("ants: a small frame with baked legs below the threshold", () => {
  const { world, camera } = layerWorld();
  world.params.legsMinPx = 1000;
  const sprites = new SpriteBatch();
  const legs = new GeometryBatch();
  const gait = new GaitTracker();
  gait.update(world);
  buildAnts(sprites, legs, world, camera, 0, makeAtlasFrames(), gait);
  assert.equal(sprites.quadCount(), 2);
  assert.equal(legs.vertexCount(), 0);
});

test("ants: off-screen ants are culled and extreme scales stay finite", () => {
  const { world, camera } = layerWorld();
  world.ants.posX[0] = 2000;
  world.ants.posY[0] = 2000;
  world.ants.prevX[0] = 2000;
  world.ants.prevY[0] = 2000;
  const sprites = new SpriteBatch();
  const legs = new GeometryBatch();
  const gait = new GaitTracker();
  gait.update(world);
  buildAnts(sprites, legs, world, camera, 0.5, makeAtlasFrames(), gait);
  assert.equal(sprites.quadCount(), 0);
  world.ants.posX[0] = 200; world.ants.posY[0] = 150;
  world.ants.prevX[0] = 200; world.ants.prevY[0] = 150;
  camera.setViewport({ x: 0, y: 0 });
  camera.fit(world.size);
  buildAnts(sprites, legs, world, camera, 0.5, makeAtlasFrames(), gait);
  for (const v of sprites.vertexData()) assert.ok(Number.isFinite(v));
  for (const v of legs.vertexData()) assert.ok(Number.isFinite(v));
});

test("ants: body interpolation uses the alpha between prev and pos", () => {
  const { world, camera } = layerWorld();
  world.ants.prevX[0] = 100;
  world.ants.posX[0] = 110;
  world.ants.prevY[0] = 100;
  world.ants.posY[0] = 100;
  world.ants.heading[0] = 0;
  const sprites = new SpriteBatch();
  const gait = new GaitTracker();
  gait.update(world);
  buildAnts(sprites, new GeometryBatch(), world, camera, 0.5, makeAtlasFrames(), gait);
  const data = sprites.vertexData();
  const expectedX = camera.worldToScreen({ x: 105, y: 100 }).x;
  let sumX = 0;
  for (let v = 0; v < 4; v++) sumX += data[32 + v * 8]; // second quad = body
  assert.ok(Math.abs(sumX / 4 - expectedX) < 1e-6);
});
```

- [ ] **Step 2: Run to verify RED**

```powershell
npm run build
```
Expected: FAIL with `TS2307` for `sprite_atlas.js`/`legs.js`, and `buildAnts` arity/type errors.

- [ ] **Step 3: Implement the art, gait and layer**

**Atlas painter.** `paintSpriteAtlas` creates a 2048×1024 canvas and paints every frame from `makeAtlasFrames()`:
- **Ant body (128×64, faces +x, no animated legs):** dark umber `#241A14` base, outline `#0B0806` 3 px, lit carapace `#4A382B`. Gaster ellipse centred (38,32) rx26 ry15 with four band strokes; petiole ellipse (66,32) rx7 ry5; thorax ellipse (84,32) rx18 ry10; head ellipse (105,32) rx12 ry10; two mandible strokes to (121,22)/(121,42); two elbowed antennae from (110,27)→(118,18)→(126,14) and mirrored. Accent from `colonyHex(c)`: one gaster band, thorax sheen, antenna tips, leg joints. Variant 1 widens the gaster 4% and splays antennae 6%.
- **Ant small (128×64):** the same silhouette plus six baked, tucked legs, no separate gait.
- **Food (64×64):** Seeds — pale `#D9C48B` teardrop with a dark hilum; Berries — `#C4475E` circle with a highlight; Leaves — `#7FAE5A` leaf with a central vein. Four variants rotate the highlight and change the size ±3 px.
- **Nest (256×256):** radial mound gradient `#2A2119`→`#18120D`, eight ridge strokes, three pebble arcs, a lighter spoil ring `#34281E`, a crater `#070504` at the centre with a 3 px accent rim. Deterministic details; no `Math.random` (use `mix32`).
Draw all art procedural, no external files, keep every frame inside its rect, and leave at least 2 px of transparent padding on every frame edge so LINEAR sampling never bleeds a neighbour.

**Gait.** `GaitTracker` stores parallel `Uint32Array` uids, `Float32Array` lastX/lastY/phase sized to the ant count. On update, for each index: if the stored uid differs, reset last position and `phase = mix32(uid)/2**32`; otherwise add `hypot(dx,dy)/24` and take `% 1`. `phaseAt(i)` returns 0 if out of range.

`legPose(phase, leg, L)`:
`side = leg < 3 ? -1 : 1`; `which = leg % 3`; rest X `[0.34, 0.02, -0.28][which] * L`; hip X `[0.16, 0.02, -0.14][which] * L`; hip Y `side*0.10*L`; rest Y `side*0.36*L`; `wave = sin(TAU*phase + (tripodA ? 0 : PI))`; `footX = restX + 0.22*L*wave`; `footY = restY + side*0.06*L*max(0,wave)`; `lift = max(0,wave)`; knee at `((hipX+footX)/2 - 0.04*L, (hipY+footY)/2 + side*0.12*L)`. Tripod A = legs {0,2,4}.

**Ant layer.** Cull with `camera.visibleWorldRect()` expanded 32. Interpolate `prev → pos`. `lengthPx = params.antLength * camera.scale()`; draw width `1.25*lengthPx`, height `0.60*lengthPx`, both clamped positive. Frame `antBody` when `lengthPx >= params.legsMinPx`, else `antSmall`; variant `uid % 2`. Two passes: first add all shadows (`body frame`, offset `params.shadowOffsetX/Y` px, tint `rgba(0,0,0,71)`), then all bodies (white tint) and carried food (`frames.food(Seeds, uid % 4)`, size `0.45*lengthPx`, centred `0.55*lengthPx` ahead) when `mass > params.mass`. When the body frame is the animated one, add 6 legs × 2 segments (femur hip→knee, tibia knee→foot) into the `GeometryBatch` using `addLine` with 1.5 px width and `rgba(36,27,20,255)`, rotating the body-local leg pose by the ant heading around the screen point. Walk phase from `gait.phaseAt(i)`.

**Integration into the old world view.** Extend `WorldRenderCache` with `atlasTexture`, `atlasFrames`, `sprites: SpriteBatch`, `legs: GeometryBatch`, `gait: GaitTracker`. In `createWorldRenderCache`, paint the atlas once per renderer (WeakMap keyed by renderer), upload its pixels with `renderer.createTexture()` + `renderer.updateTexture()` using `new Uint8Array(ctx.getImageData(...).data.buffer)` (`Uint8ClampedArray` is not a `Uint8Array`), and store the frames. In `drawWorld`, keep the old ground/heatmap/actors draws, but rename the old `buildActors` to `buildStaticActors` and remove its ant loop; then clear and build sprites/legs, draw static actors, then legs, then `renderer.drawSprites(cache.atlasTexture, cache.sprites)`. Update `test_world_view` to assert static food/nest quads only. This keeps the app working until Task 11 replaces the terrain and food/nest rendering.

- [ ] **Step 4: Run to verify GREEN**

```powershell
npm run build
node --test "dist/tests/render/test_legs.test.js" "dist/tests/render/test_ant_layer.test.js" "dist/tests/render/test_world_view.test.js"
```
Expected: PASS.

- [ ] **Step 5: Look at the ants**

```powershell
npm run screenshot -- --interactive --ticks 900 --zoom 3 --out captures\m1-5-ants.png
```
Open the PNG. Expected: brown-black ants with visible head/thorax/gaster, antennae, alternating leg tripods, soft shadows, food at the mandibles; colony accent visible; no red rectangles, no smeared legs. If the sprites are upside down, fix the UV order (v=0 must map to the frame's top row) rather than flipping the texture.

- [ ] **Step 6: Run the whole suite**

```powershell
npm test
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/render/sprite_atlas.ts src/render/legs.ts src/render/ant_layer.ts src/render/world_view.ts src/sim/params.ts tests/render tests/sim/test_params.test.ts
git commit -m "feat(render): paint real ant sprites with a tripod gait" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 11: Baked terrain, food and anthill layers

**Files:**
- Create: `src/render/terrain_texture.ts`, `src/render/food_layer.ts`, `src/render/nest_layer.ts`
- Modify: `src/render/world_view.ts`, `src/render/view_settings.ts`
- Test: `tests/render/test_layers.test.ts`
- Replace: `tests/render/test_world_view.test.ts`

**Interfaces:**
- Consumes: Task 7 food pieces; Task 8 atlas/sprite batch; Task 9 themes; Task 10 atlas painter.
- Produces:
```ts
export interface TextureSize { width: number; height: number; scale: number; }
export function terrainTextureSize(worldSize: Vec2): TextureSize;
export function paintTerrainTexture(world: World, theme: Theme): HTMLCanvasElement;

export function buildFood(sprites: SpriteBatch, world: World, camera: Camera, frames: AtlasFrames): void;
export function buildNests(sprites: SpriteBatch, world: World, camera: Camera, frames: AtlasFrames): void;

export interface WorldRenderCache { /* atlasTexture, terrainTexture, heatmapTexture, heatmapPixels,
  atlasFrames, terrain, under, back, legs, actors, gait */ }
export function createWorldRenderCache(renderer: GlRenderer, world: World, theme: Theme): WorldRenderCache;
export function refreshTerrain(renderer: GlRenderer, cache: WorldRenderCache, world: World, theme: Theme): void;
```
`defaultViewSettings().showGrid` becomes `false` (the builder turns it on).

- [ ] **Step 1: Write the failing layer tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { makeAtlasFrames } from "../../src/render/atlas.js";
import { Camera } from "../../src/render/camera.js";
import { buildFood } from "../../src/render/food_layer.js";
import { buildNests } from "../../src/render/nest_layer.js";
import { SpriteBatch } from "../../src/render/sprite_batch.js";
import { terrainTextureSize } from "../../src/render/terrain_texture.js";
import { makeColony } from "../../src/sim/colony.js";
import { addFoodSource } from "../../src/sim/food.js";
import { defaultParams } from "../../src/sim/params.js";
import { FoodKind } from "../../src/sim/setup.js";
import { makeWorld } from "../../src/sim/world.js";

function layerWorld() {
  const params = defaultParams();
  params.worldW = 400; params.worldH = 300;
  const world = makeWorld(params, 1);
  const camera = new Camera();
  camera.setViewport({ x: 800, y: 600 });
  camera.fit(world.size);
  return { world, camera };
}

test("terrain: the texture is baked at half scale", () => {
  assert.deepEqual(terrainTextureSize({ x: 1920, y: 1080 }), { width: 960, height: 540, scale: 0.5 });
  assert.deepEqual(terrainTextureSize({ x: 2240, y: 1200 }), { width: 1120, height: 600, scale: 0.5 });
  const big = terrainTextureSize({ x: 8192, y: 4096 });
  assert.equal(Math.max(big.width, big.height), 2048);
});

test("food: every piece gets a shadow and a piece sprite", () => {
  const { world, camera } = layerWorld();
  addFoodSource(world.food, { x: 200, y: 150 }, 1000, false, FoodKind.Berries);
  const sprites = new SpriteBatch();
  buildFood(sprites, world, camera, makeAtlasFrames());
  assert.equal(sprites.quadCount(), 20); // 10 pieces x (shadow + piece)
});

test("food: an empty source draws nothing", () => {
  const { world, camera } = layerWorld();
  world.food.items.push({ uid: 1, pos: { x: 200, y: 150 }, amount: 0, infinite: false, kind: FoodKind.Seeds });
  const sprites = new SpriteBatch();
  buildFood(sprites, world, camera, makeAtlasFrames());
  assert.equal(sprites.quadCount(), 0);
});

test("nests: one sprite per colony, larger with population, extinct tinted", () => {
  const { world, camera } = layerWorld();
  world.colonies.push(makeColony(0, { x: 100, y: 100 }, 0));
  world.colonies.push(makeColony(1, { x: 300, y: 200 }, 2));
  world.colonies[0].population = 400;
  world.colonies[1].population = 10;
  world.colonies[1].extinct = true;
  const sprites = new SpriteBatch();
  buildNests(sprites, world, camera, makeAtlasFrames());
  assert.equal(sprites.quadCount(), 2);
});
```

- [ ] **Step 2: Run to verify RED**

```powershell
npm run build
```
Expected: FAIL with `TS2307` for `terrain_texture.js`, `food_layer.js`, `nest_layer.js`.

- [ ] **Step 3: Implement the layers and rewrite the world view**

`terrainTextureSize`: `scale = min(0.5, 2048 / max(worldSize.x, worldSize.y))`; width/height `max(1, round(worldSize * scale))`.

`paintTerrainTexture`: create a canvas at that size, fill `theme.ground`, draw ~4,000 deterministic speckles (`mix32(x*73856093 ^ y*19349663)`) in `theme.speckle` at 8–20% alpha, ~120 tufts (2–3 short strokes in a 6%-darker ground tone) and ~40 broad soft ellipses at 5% alpha for tonal drift, then draw obstacle cells at `scale`: for each non-empty cell, a circle of radius `cell*scale*1.1` filled with `theme.rock/water/sand/mud`, plus a highlight offset `-radius*0.25`; Sand/Mud at 35% alpha, Rock/Water opaque. Overlapping circles merge clusters into blobs. No per-frame allocation.

`buildFood`: for each source, compute `radius = foodRadius(source, world.params)`, pieces via `foodPieces`, piece size `clamp(radius*0.22, 4, 12)` world units → screen px via `camera.scale()`. Cull per piece. Add shadow at +2/+3 px rotated with the piece (`rgba(0,0,0,64)`) then the piece frame (`source.kind`, piece.variant) white tint.

`buildNests`: for each colony, `size = 3.2 * nestRadius(colony, params)` world → screen; cull by centre within the expanded view; frame `nest(colony.color)`, rotation `colony.id * 0.7`, tint white or, when extinct, `rgba(150,145,140,255)`.

`WorldRenderCache` now holds: atlas texture/frames, terrain texture, heatmap texture/pixels, `under: GeometryBatch`, `back: SpriteBatch`, `legs: GeometryBatch`, `actors: SpriteBatch`, `gait`. `createWorldRenderCache` paints the atlas (WeakMap per renderer), uploads it, bakes terrain and uploads it, creates the heatmap texture at marker-grid size. `refreshTerrain` re-bakes and updates the same texture; use `ctx.getImageData` and `renderer.updateTexture` with `new Uint8Array(imageData.data.buffer)`.

`drawWorld` order and draw count:
1. `renderer.clear(theme.outside)`
2. terrain texture over the whole world rect
3. heatmap texture when mode ≠ Off (update pixels each frame), same rect
4. `under` — faint 120 u grid when `showGrid`, world border always
5. `back` — `buildNests` then `buildFood`
6. `legs` — ant leg geometry
7. `actors` — ant shadows, bodies, carried food
Call `renderer.present()` from the app, not here. Clear and rebuild the three batches each frame. Delete `buildGround`, `buildStaticActors` and their tests; keep no more than six draw calls.

- [ ] **Step 4: Run to verify GREEN**

```powershell
npm run build
node --test "dist/tests/render/test_layers.test.js"
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Look at the world**

```powershell
npm run screenshot -- --ticks 900 --preset meadow --out captures\m1-5-world.png
npm run screenshot -- --interactive --ticks 900 --preset dunes --out captures\m1-5-dunes.png
```
Expected: textured ground, distinct rock/water/sand/mud, a built anthill with a crater and accent rim, clustered food pieces, teal/amber trails under sprite ants. Check that the terrain is not a visible tile grid and food pieces are distinct. If a layer is inverted or misaligned, fix that layer before continuing.

- [ ] **Step 6: Run the whole suite**

```powershell
npm test
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/render/terrain_texture.ts src/render/food_layer.ts src/render/nest_layer.ts src/render/world_view.ts src/render/view_settings.ts tests/render
git commit -m "feat(render): bake terrain and draw food and anthills from the atlas" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 12: Design system, view models and the run HUD

**Files:**
- Create: `src/ui/view_models.ts`, `src/ui/dom.ts`, `src/ui/run_hud.ts`
- Rewrite: `styles.css`
- Modify: `src/app/interactive.ts`, `index.html` (no structural change expected)
- Delete: `src/ui/shell.ts`
- Test: `tests/ui/test_view_models.test.ts`

**Interfaces:**
- Consumes: `World`, `HeatmapMode`, `ParamKey`/`paramSpecs`, `colonyHex/colonyName`.
- Produces:
```ts
export type SpeedSetting = 1 | 2 | 4 | "max";
export interface ColonyRow {
  id: number; name: string; colorIndex: number; hex: number;
  population: number; delivered: number; foodPool: number; extinct: boolean;
}
export function formatInteger(value: number): string;      // 1,234,567
export function formatClock(ticks: number, simHz: number): string; // 00:00
export function speedLabel(speed: SpeedSetting): string;   // 4× / Max
export function trailModeLabel(mode: HeatmapMode): string; // Off / Trails / Colonies
export function colonyRows(world: World): ColonyRow[];

export type IconName = "play" | "pause" | "step" | "reset" | "edit" | "finish" |
  "menu" | "close" | "plus" | "trash" | "dice" | "chevron" | "palette" | "colonies" | "settings";
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K];
export function icon(name: IconName): SVGElement;
export function button(options: {
  label: string; icon?: IconName; variant?: "primary" | "secondary" | "ghost" | "danger" | "icon";
  title?: string; onClick?: () => void;
}): HTMLButtonElement;
export function clearChildren(node: HTMLElement): void;

export interface HudState {
  presetName: string; seed: number; paused: boolean; speed: SpeedSetting;
  heatmap: HeatmapMode; showAnts: boolean; showGrid: boolean;
  zen: boolean; coloniesOpen: boolean; settingsOpen: boolean;
}
export interface RunHudHooks {
  onPause(): void; onStep(): void; onSpeed(speed: SpeedSetting): void;
  onReset(): void; onEdit(): void; onFinish(): void;
  onColonies(): void; onSettings(): void; onFit(): void;
}
export class RunHud {
  readonly root: HTMLElement;
  readonly colonyPanelHost: HTMLElement;
  readonly settingsHost: HTMLElement;
  constructor(root: HTMLElement, params: SimParams, hooks: RunHudHooks);
  update(world: World, fps: number, state: HudState): void;
  setZen(on: boolean): void;
}
```
`RunHud` draws the top bar (wordmark, preset + seed, ants/delivered/clock/FPS chips, Colonies and Settings icon buttons) and the bottom dock (Pause/Play, Step, 1×/2×/4×/Max, Reset, Edit, Finish), plus a trail legend naming Home/Food. It only updates text nodes in `update`; it does not rebuild the DOM except when the colony panel is rebuilt in Task 15.

- [ ] **Step 1: Write the failing view-model tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { HeatmapMode } from "../../src/render/view_settings.js";
import { makeColony } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { makeWorld } from "../../src/sim/world.js";
import { colonyRows, formatClock, formatInteger, speedLabel, trailModeLabel } from "../../src/ui/view_models.js";

test("format: integers group, clocks are mm:ss, labels are human", () => {
  assert.equal(formatInteger(0), "0");
  assert.equal(formatInteger(1234567), "1,234,567");
  assert.equal(formatClock(0, 60), "00:00");
  assert.equal(formatClock(3661, 60), "01:01");
  assert.equal(formatClock(6000, 60), "01:40");
  assert.equal(speedLabel(4), "4×");
  assert.equal(speedLabel("max"), "Max");
  assert.equal(trailModeLabel(HeatmapMode.Off), "Off");
  assert.equal(trailModeLabel(HeatmapMode.DualChannel), "Trails");
  assert.equal(trailModeLabel(HeatmapMode.ColonyColor), "Colonies");
});

test("colonies: rows carry palette names, hex and stats in id order", () => {
  const world = makeWorld(defaultParams(), 1);
  const second = makeColony(1, { x: 20, y: 20 }, 2);
  second.population = 7; second.deliveredTotal = 11; second.foodPool = 3;
  world.colonies.push(makeColony(0, { x: 10, y: 10 }, 0), second);
  const rows = colonyRows(world);
  assert.equal(rows[1].name, "Azure");
  assert.equal(rows[1].hex, 0x4c8dde);
  assert.deepEqual([rows[1].population, rows[1].delivered, rows[1].foodPool], [7, 11, 3]);
});
```

- [ ] **Step 2: Run to verify RED**

```powershell
npm run build
```
Expected: FAIL with `TS2307: Cannot find module '../../src/ui/view_models.js'`.

- [ ] **Step 3: Implement the tokens, components and HUD**

Replace `styles.css` with the design system from the design doc: all tokens on `:root` (`--bg-0` … `--slow`), reset, `#view` fixed full-screen, `#ui` overlay with `pointer-events: none` and interactive children re-enabled, `.screen` stacked absolute with `.screen--active` opacity/transform transitions, `.glass`, `.button` variants, `.icon-button`, `.field`, custom `.slider`/`.switch`/`.segmented`, `.chip`, `.screen__vignette`, `body.headless #ui, body.headless #log { display: none }`, and the HUD classes. Use the exact tokens in the design doc; add `.hud--zen { display: none }`. Keep `#log` visually hidden except in headless/debug. Every control has `:focus-visible` with a 2 px amber ring and 2 px offset. Add the `prefers-reduced-motion` block.

Build `dom.ts` with `el`, inline SVG `icon`, `button` (sets `type="button"`, class `button button--variant`, optional `aria-label` from `title`, appends icon + `<span>` label), and `clearChildren`. Build `view_models.ts` with `Intl.NumberFormat("en-US")` for integers, `mm:ss` clock from `floor(ticks/simHz)`, palette names/hex, and the label helpers.

Build `run_hud.ts` with the exact top bar and dock. Use `aria-pressed` on speed pills, `aria-label` on icon buttons, and update only text nodes in `update`. `setZen` toggles `.hud--zen` and is mirrored by the controller later.

Refactor `interactive.ts` to construct `RunHud` instead of `AppShell`, keep the same hooks, and add reset by rebuilding the world from the setup (rebuild the render cache and refit the camera). Wire Colonies/Settings/Edit/Finish to log a line for now; Task 14/15 replace them. Add pre-run: before the first frame, if `options.ticks > 0`, step the world that many ticks (interactive screenshots need trails). Delete `shell.ts`.

- [ ] **Step 4: Run to verify GREEN**

```powershell
npm run build
node --test "dist/tests/ui/test_view_models.test.js"
```
Expected: PASS, 2 tests.

- [ ] **Step 5: Look at the HUD**

```powershell
npm run screenshot -- --interactive --ticks 900 --preset meadow --size 1920x1080 --out captures\m1-5-hud.png
```
Expected: crisp dark glass HUD, amber primary controls, top chips legible, bottom dock with pause/step/speeds/reset/edit/finish, trail legend naming Home/Food. No browser-default buttons or sliders.

- [ ] **Step 6: Run the whole suite**

```powershell
npm test
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add styles.css src/ui/view_models.ts src/ui/dom.ts src/ui/run_hud.ts src/ui/shell.ts src/app/interactive.ts tests/ui/test_view_models.test.ts
git commit -m "feat(ui): add the design system, view models and run HUD" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 13: Session state machine, builder model and builder screen

**Files:**
- Create: `src/app/session.ts`, `src/ui/builder_model.ts`, `src/ui/builder_screen.ts`
- Test: `tests/app/test_session.test.ts`, `tests/ui/test_builder_model.test.ts`

**Interfaces:**
- Consumes: Task 2 setup functions/validation; palette; `RunSummary`.
- Produces:
```ts
export enum Screen { Home = "home", Builder = "builder", Run = "run" }
export interface RunSummary {
  presetName: string; seed: number; seconds: number;
  ants: number; delivered: number; colonies: number;
}
export interface SessionState {
  screen: Screen; paused: boolean; speed: SpeedSetting;
  zen: boolean; lastRun: RunSummary | null;
}
export function newSession(screen?: Screen): SessionState;
export function startRun(state: SessionState, setup: WorldSetup): { state: SessionState; error: string | null };
export function pauseRun(state: SessionState): SessionState;
export function resumeRun(state: SessionState): SessionState;
export function togglePause(state: SessionState): SessionState;
export function editRun(state: SessionState): SessionState;
export function restartRun(state: SessionState): SessionState;
export function finishRun(state: SessionState, summary: RunSummary): SessionState;
export function backHome(state: SessionState): SessionState;
export function summarizeRun(world: World, setup: WorldSetup): RunSummary;

export enum BuilderTool { Select, Colony, Food, Rock, Water, Sand, Mud, Erase }
export interface BuilderSelection { kind: "colony" | "food"; id: number; }
export class BuilderModel {
  readonly setup: WorldSetup;
  readonly tool: BuilderTool;
  readonly brushRadius: number;
  readonly selection: BuilderSelection | null;
  readonly dirty: boolean;
  constructor(setup: WorldSetup);
  setTool(tool: BuilderTool): void;
  setBrushRadius(radius: number): void;
  setFoodKind(kind: FoodKind): void;
  setFoodAmount(amount: number): void;
  setStartingAnts(count: number): void;
  setSeed(seed: number): boolean;
  selectAt(p: Vec2, hitRadius?: number): BuilderSelection | null;
  applyAt(p: Vec2): boolean;
  paintAt(p: Vec2): boolean;
  moveSelection(p: Vec2): boolean;
  deleteSelection(): boolean;
  setSelectionColor(color: number): boolean;
  setSelectionStartingAnts(count: number): boolean;
  setSelectionFoodKind(kind: FoodKind): boolean;
  setSelectionFoodAmount(amount: number): boolean;
  requestPreset(id: string): "loaded" | "confirm" | "unknown";
  confirmPreset(): boolean;
  cancelPreset(): void;
  pendingPreset(): string | null;
}

export interface BuilderHooks {
  onBack(): void; onStart(): void; onChanged(): void;
  onRollSeed(): void; onFit(): void;
}
export class BuilderScreen {
  readonly root: HTMLElement;
  constructor(root: HTMLElement, model: BuilderModel, hooks: BuilderHooks);
  update(): void;
}
```
`BuilderModel.replaceSetup` is internal. `BuilderScreen` owns changes made through its DOM controls; it calls `update()` and then `hooks.onChanged()` after any successful model change. The controller calls `builderScreen.update()` after canvas edits.

- [ ] **Step 1: Write the failing session and builder-model tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { Screen, startRun, pauseRun, finishRun, editRun, restartRun, newSession, summarizeRun } from "../../src/app/session.js";
import { addColony, addFood, FoodKind, makeSetup } from "../../src/sim/setup.js";
import { worldFromSetup } from "../../src/sim/setup_apply.js";
import { defaultParams } from "../../src/sim/params.js";
import { stepWorld } from "../../src/sim/world.js";

function validSetup() {
  const setup = makeSetup({ x: 400, y: 300 }, 5, "meadow");
  addColony(setup, { x: 100, y: 100 });
  addFood(setup, { x: 300, y: 200 }, 4000, FoodKind.Seeds);
  return setup;
}

test("session: start refuses an invalid map and names the reason", () => {
  const empty = makeSetup({ x: 400, y: 300 }, 1);
  const denied = startRun(newSession(Screen.Builder), empty);
  assert.equal(denied.error, "Add at least one colony.");
  assert.equal(denied.state.screen, Screen.Builder);
  const okay = startRun(newSession(Screen.Builder), validSetup());
  assert.equal(okay.error, null);
  assert.equal(okay.state.screen, Screen.Run);
  assert.equal(okay.state.paused, false);
});

test("session: paused run transitions keep the map and clear stale state", () => {
  let s = startRun(newSession(Screen.Builder), validSetup()).state;
  s = pauseRun(s);
  assert.equal(s.paused, true);
  s = editRun(s);
  assert.equal(s.screen, Screen.Builder);
  const back = startRun(s, validSetup()).state;
  assert.equal(back.screen, Screen.Run);
  assert.equal(back.paused, false);
  const paused = pauseRun(back);
  const restarted = restartRun(paused);
  assert.equal(restarted.screen, Screen.Run);
  assert.equal(restarted.paused, false);
});

test("session: finish records the run and returns home", () => {
  let s = startRun(newSession(Screen.Builder), validSetup()).state;
  const summary = { presetName: "Meadow", seed: 5, seconds: 12, ants: 200, delivered: 4, colonies: 1 };
  s = finishRun(pauseRun(s), summary);
  assert.equal(s.screen, Screen.Home);
  assert.deepEqual(s.lastRun, summary);
});

test("session: summarizeRun reports the live world", () => {
  const setup = validSetup();
  const world = worldFromSetup(setup, defaultParams());
  for (let i = 0; i < 60; i++) stepWorld(world);
  const summary = summarizeRun(world, setup);
  assert.equal(summary.presetName, "Meadow");
  assert.equal(summary.seconds, 1);
  assert.equal(summary.ants, world.ants.size());
  assert.equal(summary.colonies, 1);
});
```

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { BuilderModel, BuilderTool } from "../../src/ui/builder_model.js";
import { addColony, addFood, FoodKind, makeSetup } from "../../src/sim/setup.js";

function model() {
  const setup = makeSetup({ x: 400, y: 300 }, 1, "blank");
  return new BuilderModel(setup);
}

test("builder: the colony tool adds a colony and picks the next free colour", () => {
  const m = model();
  m.setTool(BuilderTool.Colony);
  assert.equal(m.applyAt({ x: 100, y: 100 }), true);
  m.applyAt({ x: 300, y: 200 });
  assert.deepEqual(m.setup.colonies.map((c) => [c.id, c.color]), [[0, 0], [1, 1]]);
  assert.deepEqual(m.selection, { kind: "colony", id: 1 });
});

test("builder: deleting the selection clears it", () => {
  const m = model();
  addColony(m.setup, { x: 100, y: 100 });
  addColony(m.setup, { x: 300, y: 200 });
  m.selectAt({ x: 100, y: 100 }, 24);
  assert.deepEqual(m.selection, { kind: "colony", id: 0 });
  assert.equal(m.deleteSelection(), true);
  assert.equal(m.selection, null);
  assert.equal(m.setup.colonies.length, 1);
});

test("builder: food and terrain edits mark the map dirty", () => {
  const m = model();
  m.setTool(BuilderTool.Food);
  m.setFoodKind(FoodKind.Leaves);
  m.setFoodAmount(2500);
  m.applyAt({ x: 200, y: 150 });
  assert.equal(m.setup.food[0].kind, FoodKind.Leaves);
  assert.equal(m.setup.food[0].amount, 2500);
  m.setTool(BuilderTool.Rock);
  m.setBrushRadius(500);
  assert.equal(m.brushRadius, 64);
  assert.ok(m.paintAt({ x: 200, y: 150 }) >= 0);
  assert.equal(m.dirty, true);
});

test("builder: a preset change asks before discarding edits", () => {
  const m = model();
  m.setTool(BuilderTool.Colony);
  m.applyAt({ x: 100, y: 100 });
  assert.equal(m.requestPreset("dunes"), "confirm");
  assert.equal(m.setup.presetId, "blank");
  assert.equal(m.pendingPreset(), "dunes");
  m.cancelPreset();
  assert.equal(m.pendingPreset(), null);
  assert.equal(m.setup.presetId, "blank");
  assert.equal(m.requestPreset("dunes"), "confirm");
  assert.equal(m.confirmPreset(), true);
  assert.equal(m.setup.presetId, "dunes");
  assert.equal(m.requestPreset("nope"), "unknown");
});

test("builder: selection colour and starting ants are bounded", () => {
  const m = model();
  addColony(m.setup, { x: 100, y: 100 });
  m.selectAt({ x: 100, y: 100 }, 24);
  m.setSelectionColor(9);
  assert.equal(m.setup.colonies[0].color, 7);
  m.setSelectionStartingAnts(5000);
  assert.equal(m.setup.colonies[0].startingAnts, 600);
});
```

- [ ] **Step 2: Run to verify RED**

```powershell
npm run build
```
Expected: FAIL with `TS2307` for `session.js` and `builder_model.js`.

- [ ] **Step 3: Implement the state machine and builder model**

Session transitions are pure and never throw. `startRun` validates first; on error returns the same state and the message; on success returns `screen: Run`, `paused: false`, `speed: 1`, `zen: false`. `pauseRun/resumeRun/togglePause` only act on Run. `editRun` sets `screen: Builder`, `paused: true`. `restartRun` sets Run/unpaused. `finishRun` sets Home, unpaused, stores the summary. `backHome` sets Home. `newSession` defaults Home, speed 1. `summarizeRun` uses `presetInfo(setup.presetId)?.name ?? setup.presetId`, `world.tick / params.simHz` rounded down to whole seconds, `world.ants.size()`, summed `deliveredTotal`, `world.colonies.length`.

`BuilderModel` clamps brush 8–64, food amount 500–20,000 in 500 steps, starting ants 10–600 in 10 steps, colour 0–7. Constructor takes ownership of the setup (the controller passes a `cloneSetup`). `selectAt` picks the nearest colony nest first, then the nearest food, within `hitRadius` (default 20); otherwise clears. `applyAt` by tool: Select → `selectAt`; Colony → `addColony` at the point and select it; Food → `addFood` with current kind/amount and select it; Rock/Water/Sand/Mud → `paintCells` with the brush; Erase → paint None. `paintAt` only paints terrain/Erase (used on drag) and returns whether anything changed. Every successful change sets `dirty`. `requestPreset` returns unknown for bad ids; if not dirty loads immediately (`replaceSetup(loadPreset(id, setup.seed))`, clears selection/dirty, tool Select); if dirty stores pending and returns `"confirm"`. `confirmPreset` loads the pending preset; `cancelPreset` clears it. `setSeed` accepts integers 0..2^32-1 and marks dirty.

- [ ] **Step 4: Implement `BuilderScreen`**

Build the DOM once in the constructor:
top bar (Back icon+label, wordmark/title, five preset pills, seed `<input type="number" min="0" max="4294967295">` + dice icon button, Start primary);
left tool rail with eight buttons (icon + label, `aria-pressed`, shortcuts 1–8 in `title`);
`<canvas>` is not here — the screen overlays the shared canvas;
bottom-left inspector card and a status line with the first validation message and a brush-size value.

`update()`: set active tool/preset, seed value, Start disabled state via `button.disabled = validateSetup(model.setup) !== null`, validation text, and inspector content. The inspector rebuilds only when `selection` or `tool` changes:
- colony selected → name, eight swatch buttons, starting-ants slider (10–600 step 10), Delete;
- food selected → kind segmented control (Seeds/Berries/Leaves), amount slider (500–20,000 step 500), Delete;
- no selection + Colony tool → colour swatches and starting ants for the next colony;
- no selection + Food tool → kind and amount;
- otherwise → a hint naming the tool.
After a control change call `update()` and `hooks.onChanged()`. `requestPreset` is invoked by the preset pills; when it returns `"confirm"`, show a `.confirm-strip` with "Replace your map?" and Replace/Cancel; Replace calls `confirmPreset()` and `hooks.onChanged()`, Cancel calls `cancelPreset()` and updates. The brush ring is not part of this screen: the controller owns a `.brush-ring` element appended to the UI root and positions it and sizes it from `model.brushRadius * camera.scale()` in Task 14.

- [ ] **Step 5: Run to verify GREEN**

```powershell
npm run build
node --test "dist/tests/app/test_session.test.js" "dist/tests/ui/test_builder_model.test.js"
```
Expected: PASS, 9 tests.

- [ ] **Step 6: Run the whole suite**

```powershell
npm test
```
Expected: all tests pass. `BuilderScreen` is not mounted yet, so the app is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/app/session.ts src/ui/builder_model.ts src/ui/builder_screen.ts tests/app/test_session.test.ts tests/ui/test_builder_model.test.ts
git commit -m "feat(ui): add the session machine, builder model and builder screen" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 14: Home screen, attract world and the app controller

**Files:**
- Create: `src/app/attract.ts`, `src/app/controller.ts`, `src/ui/home_screen.ts`
- Modify: `src/app/interactive.ts`, `src/app/options.ts`, `src/app/headless.ts`, `tools/screenshot.mjs`
- Test: `tests/app/test_attract.test.ts`, `tests/app/test_options.test.ts`

**Interfaces:**
- Consumes: everything above; `Screen`, session transitions; `BuilderScreen`; `RunHud`; themes.
- Produces:
```ts
export function makeAttractWorld(params: SimParams): World;
export function seedFromNow(nowMs: number): number;

export interface HomeScreenHooks { onQuickStart(): void; onNewWorld(): void; }
export class HomeScreen {
  readonly root: HTMLElement;
  constructor(root: HTMLElement, hooks: HomeScreenHooks);
  update(lastRun: RunSummary | null): void;
}
export class AppController {
  constructor(options: AppOptions, canvas: HTMLCanvasElement, uiRoot: HTMLElement, log?: (line: string) => void);
  start(): void;
  dispose(): void;
}
```
`AppOptions` gains `screen: "home" | "builder" | "run"` (default `"home"`) parsed from `--screen`, and `zoom: number` (default 1, valid 0.1–16) parsed from `--zoom`. The screenshot tool gains `--screen` and `--zoom`, both passed in the query.

- [ ] **Step 1: Write the failing tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { makeAttractWorld, seedFromNow } from "../../src/app/attract.js";
import { defaultParams } from "../../src/sim/params.js";
import { worldChecksum } from "../../src/sim/checksum.js";

test("attract: a deterministic 900-tick meadow with live ants and trails", () => {
  const a = makeAttractWorld(defaultParams());
  const b = makeAttractWorld(defaultParams());
  assert.equal(a.tick, 900);
  assert.ok(a.ants.size() > 100, `ants=${a.ants.size()}`);
  let homeCells = 0;
  for (let i = 0; i < a.markers.owner.length; i++) if (a.markers.toHome[i] > 0.02) homeCells++;
  assert.ok(homeCells > 20, `home cells=${homeCells}`);
  assert.equal(worldChecksum(a), worldChecksum(b));
});

test("attract: seedFromNow is deterministic and stays in uint32", () => {
  assert.equal(seedFromNow(1_700_000_000_000), seedFromNow(1_700_000_000_000));
  assert.notEqual(seedFromNow(1_700_000_000_000), seedFromNow(1_700_000_000_001));
  for (const now of [0, 1, 2 ** 31, 2 ** 42]) {
    const seed = seedFromNow(now);
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
  }
});
```

Options tests: default `screen` is `home`; `--screen builder` and `--screen run` parse; `--screen nowhere` errors with the valid values; `--zoom 3` parses; `--zoom 0` and `--zoom 20` error with the 0.1–16 range.

- [ ] **Step 2: Run to verify RED**

```powershell
npm run build
```
Expected: FAIL with `TS2307` for `attract.js`, and option tests failing on the missing `screen`/`zoom`.

- [ ] **Step 3: Implement attract and the home screen**

`makeAttractWorld`: `const setup = loadPreset("meadow", 7)!; const world = worldFromSetup(setup, params); for (let i = 0; i < 900; i++) stepWorld(world); return world;`. `seedFromNow`: `mix32(Math.floor(nowMs) >>> 0)`.

`HomeScreen` root `.screen.home` with a left-to-right scrim, a top bar (wordmark "ANT SIMULATOR", `M1.5` tag), a serif headline `Build a world.` / `Let it crawl.` (two lines, Georgia), a muted lede, primary "Quick start" and secondary "New world" buttons, and a Last run card (hidden when null) showing preset, elapsed clock, delivered, ants, colonies. `update(lastRun)` rebuilds only the card. No canvas drawing here.

- [ ] **Step 4: Implement the controller**

`AppController` owns `renderer`, `camera`, `params` (a mutable copy of defaults), `session`, `setup`, `runWorld`, `builderModel`, `builderScreen`, `homeScreen`, `runHud`, `cache`, `view`, `gait`, `clock`, and the frame loop.

Startup:
- create renderer, resize, set camera viewport;
- clear `uiRoot` and create all screen roots once;
- build the initial setup: `loadPreset(options.preset, options.seed) ?? loadPreset("meadow", options.seed)!`; for builder/home use `cloneSetup`;
- if `screen === "home"`: build the attract world, show Home, update with `session.lastRun`;
- if `screen === "builder"`: show Builder with a `BuilderModel(cloneSetup(setup))`;
- if `screen === "run"`: `session = startRun(...).state`, build the run world, pre-step `options.ticks` ticks, show Run.

Screen switching:
- `showHome(worldForBackdrop)`: cache = create for that world, camera fit, hide other roots, show Home, update last run;
- `showBuilder(model)`: create/replace the builder screen if needed, build a preview world with `{ spawnAnts: false }`, cache, fit camera, set `view.showGrid = true`, show Builder; no simulation stepping; HUD hidden;
- `showRun(world)`: cache, fit, restore `view.showGrid = runShowGrid` (a controller field, default `false`), apply `options.zoom` through `camera.zoomAt(viewport centre, options.zoom)` when it is not 1, show HUD, session Run.

`runHeadless` also applies `options.zoom` after `camera.fit(world.size)` so the non-interactive close-up screenshots work; `--screen` is ignored in headless mode, which always renders the run world.

Hooks:
- Home Quick start: `setup = quickStartSetup(seedFromNow(performance.now()))`; start.
- Home New world: `setup = loadPreset("meadow", seedFromNow(performance.now()))!`; `builderModel = new BuilderModel(cloneSetup(setup))`; show Builder.
- Builder Start: `validateSetup` via `startRun`; on error the screen already shows it; on success copy the model's setup into the run setup, build a fresh world from the current `params`, reset HUD, pre-step 0, show Run.
- Builder Back: if a paused run exists, show it paused; otherwise show Home (attract).
- HUD Pause: `session = togglePause(session)` (pause overlay arrives Task 15). Step: if paused, `stepWorld` once. Speed: set session speed. Reset: rebuild from the same setup with `worldFromSetup(setup, params)`, fit, paused false. Edit: pause and open Builder with `new BuilderModel(cloneSetup(setup))`. Finish: build summary and `session = finishRun(...)`, use the finished world as the Home backdrop, update Home. (Task 15 inserts the confirmation dialog.)
- Fit: camera fit. Heatmap/ants/grid toggles mutate `view`.
- Settings/Colonies buttons: log a line until Task 15.
- Roll seed: `seedFromNow(performance.now())`, applied via `builderModel.setSeed`, update.

Frame:
- resize; if viewport changed update camera; when on Builder, size the brush ring;
- Run: advance the fixed-step clock unless paused; apply `stepRequests`; step; `drawWorld` with interpolation alpha (paused = 1); update HUD with fps/state.
- Builder/Home: draw the preview/attract world at alpha 1; update Home only when switching, not every frame.
- `renderer.present()`.
- Keep DPI screen conversion for input.

Input:
- wheel zoom at cursor on all screens except Home; right/middle drag pan on Builder/Run;
- builder left pointer: `screenToWorld`, `applyAt` on down, `paintAt` on drag for terrain/Erase, `selectAt` for Select, move the selected entity on drag; call `builderScreen.update()`, rebuild the preview (or sync obstacles for terrain), set `cache.terrainDirty = true` for terrain;
- Delete/Backspace deletes selection; Escape cancels pending preset/selection;
- keyboard: P/Space/M/A/G/H/Home for Run; 1–8 for Builder; `H` toggles Zen via HUD and session;
- dispose removes every listener and cancels RAF.

`interactive.ts` becomes:
```ts
export function runInteractive(options, canvas, uiRoot, log = console.log): void {
  new AppController(options, canvas, uiRoot, log).start();
}
```
Update `tools/screenshot.mjs` to accept `--screen` (`home|builder|run`) and `--zoom` (0.1–16), validate, and add them to the query. Update usage text in `options.ts` (`--preset`, `--screen`, `--zoom`; mention `--scenario sandbox` as deprecated).

- [ ] **Step 5: Run to verify GREEN**

```powershell
npm run build
node --test "dist/tests/app/test_attract.test.js" "dist/tests/app/test_options.test.js"
```
Expected: PASS.

- [ ] **Step 6: Look at the three screens**

```powershell
npm run screenshot -- --interactive --screen home --size 1920x1080 --out captures\m1-5-home.png
npm run screenshot -- --interactive --screen builder --preset dunes --size 1920x1080 --out captures\m1-5-builder.png
npm run screenshot -- --interactive --screen run --ticks 900 --preset creek --size 1920x1080 --out captures\m1-5-run.png
```
Open each PNG. Expected: home has the serif headline over a dimmed live meadow and working-looking actions; builder shows the dunes map with tools, presets, seed, inspector and Start; run shows two Creek colonies with distinct colours, trails and the HUD. Fix layout breakage before continuing.

- [ ] **Step 7: Run the whole suite**

```powershell
npm test
```
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/attract.ts src/app/controller.ts src/app/interactive.ts src/app/options.ts src/ui/home_screen.ts tools/screenshot.mjs tests/app
git commit -m "feat(app): wire home, builder and run into one controller" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 15: Pause overlay, colony panel, settings drawer and finish dialog

**Files:**
- Create: `src/ui/pause_menu.ts`, `src/ui/finish_dialog.ts`, `src/ui/colony_panel.ts`, `src/ui/settings_drawer.ts`
- Modify: `src/ui/run_hud.ts`, `src/app/controller.ts`, `styles.css`
- Test: `tests/ui/test_view_models.test.ts` (extend if new formatting is added)

**Interfaces:**
- Consumes: `RunSummary`, `colonyRows`, `paramSpecs`, `param_specs` helpers, `RunHud` hosts.
- Produces:
```ts
export interface PauseMenuHooks { onResume(): void; onRestart(): void; onEdit(): void; onFinish(): void; }
export class PauseMenu {
  readonly root: HTMLElement;
  constructor(root: HTMLElement, hooks: PauseMenuHooks);
  open(): void; close(): void;
  isOpen(): boolean;
}

export interface FinishDialogHooks { onKeepWatching(): void; onFinish(): void; }
export class FinishDialog {
  readonly root: HTMLElement;
  constructor(root: HTMLElement, hooks: FinishDialogHooks);
  open(summary: RunSummary): void; close(): void;
}

export class ColonyPanel {
  readonly root: HTMLElement;
  constructor(root: HTMLElement, onFocus: (id: number) => void);
  update(world: World): void;
  setOpen(open: boolean): void;
}

export interface SettingsHooks {
  onHeatmap(mode: HeatmapMode): void; onAnts(): void; onGrid(): void;
  onParam(key: ParamKey, value: number): void; onResetParams(): void; onFit(): void;
}
export class SettingsDrawer {
  readonly root: HTMLElement;
  constructor(root: HTMLElement, params: SimParams, hooks: SettingsHooks);
  update(): void;
  setOpen(open: boolean): void;
}
```
Use `open` as a getter or `isOpen()` consistently; the controller must use one name. Choose `isOpen(): boolean`.

- [ ] **Step 1: Add any missing pure tests**

If a new string helper is added (e.g. `formatSummaryTime`), add it to `view_models.ts` with a failing test first. No DOM-only classes need Node tests; their verification is the screenshots below. Run the existing `node --test` for `test_view_models` first if any helper changes.

- [ ] **Step 2: Build the pause menu and finish dialog**

Pause card: dim + blur page, card `.modal__card.pause-menu`, title "Paused", subtitle preset and elapsed time, buttons Resume (primary), Restart, Edit world, Finish run (secondary/danger). Role `dialog`, `aria-modal`, focus the Resume button on open, restore the previous focus on close, Escape closes. Clicking the scrim resumes.

Finish dialog: title "Finish this run?", the numbers (elapsed, ants, delivered, colonies), secondary "Keep watching", primary/danger "Finish & home". Same focus and Escape rules.

- [ ] **Step 3: Build the colony panel and settings drawer**

Colony panel: rows from `colonyRows(world)`, each a button with swatch, name, population, delivered and food pool; extinct rows dimmed and tagged "extinct". Clicking calls `onFocus(id)` and the controller centres the camera on the nest. Collapsible host in the HUD.

Settings drawer: sections Movement / Trails / Colony using `paramSpecs()`, custom range inputs with live value labels, two switches (Ants, Grid), a three-way segmented control for trails, Fit world button, Reset parameters button, and the shortcut legend. Changes mutate the live `world.params` through the controller; the grid switch updates both `view.showGrid` and the controller's `runShowGrid`; `update()` refreshes values after a reset.

- [ ] **Step 4: Wire the overlay into the controller**

Show the pause menu whenever `session.screen === Run && session.paused`; hide it otherwise. Finish from the dock or pause menu opens the finish dialog; confirming computes `summarizeRun`, calls `finishRun`, uses the finished world as the Home backdrop and updates Home. Restart closes overlays and rebuilds the run. Edit closes overlays and opens Builder. Zen hides the HUD, panel, drawer and pause chrome (but not a modal); Escape exits Zen first, then opens Pause. Colony and settings buttons toggle their hosts; opening one closes the other.

- [ ] **Step 5: Verify visually**

```powershell
npm test
npm run screenshot -- --interactive --screen run --ticks 900 --preset meadow --size 1920x1080 --out captures\m1-5-hud.png
```
Expected: all tests pass; the run HUD screenshot still reads correctly. Open the app with `npm run serve`, pause, open the colony panel and settings drawer, finish a run and confirm the Home Last run card — no browser-default select or range styling, focus visible, Escape closes each layer in order.

- [ ] **Step 6: Commit**

```bash
git add src/ui/pause_menu.ts src/ui/finish_dialog.ts src/ui/colony_panel.ts src/ui/settings_drawer.ts src/ui/run_hud.ts src/app/controller.ts styles.css tests/ui
git commit -m "feat(ui): add pause, colony, settings and finish surfaces" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 16: Editor input, transitions, responsive polish and URL flags

**Files:**
- Modify: `src/app/controller.ts`, `src/ui/builder_screen.ts`, `styles.css`, `src/app/options.ts`, `tools/screenshot.mjs`
- Test: `tests/app/test_options.test.ts`, `tests/tools/test_screenshot.test.ts`

**Interfaces:**
- Consumes: all screens and overlays.
- Produces: the final interaction layer. No new modules expected.

- [ ] **Step 1: Write the failing tests**

In `test_options.test.ts`:
```ts
test("options: screen and zoom validate their ranges", () => {
  assert.equal(parseOptions(["--screen", "home"]).options.screen, "home");
  assert.equal(parseOptions(["--screen", "builder"]).options.screen, "builder");
  assert.match(parseOptions(["--screen", "nowhere"]).error, /home, builder, run/);
  assert.equal(parseOptions(["--zoom", "3.5"]).options.zoom, 3.5);
  assert.match(parseOptions(["--zoom", "0"]).error, /0\.1.*16/);
  assert.match(parseOptions(["--zoom", "17"]).error, /0\.1.*16/);
});
```

In `test_screenshot.test.ts`:
```ts
test("screenshot: rejects an unknown screen", { timeout: 30_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "antsim screen "));
  const out = join(dir, "screen.png");
  try {
    const { code, stderr } = await runTool(["--screen", "nowhere", "--out", out]);
    assert.equal(code, 2);
    assert.match(stderr, /home.*builder.*run/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("screenshot: interactive builder renders at 800x600", { timeout: 120_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "antsim builder "));
  const out = join(dir, "builder.png");
  try {
    const code = await new Promise<number>((resolve) => {
      const child = spawn(process.execPath, [
        "tools/screenshot.mjs", "--interactive", "--screen", "builder",
        "--preset", "dunes", "--size", "800x600", "--out", out,
      ], { stdio: "inherit" });
      child.on("exit", (c) => resolve(c ?? 1));
    });
    assert.equal(code, 0);
    const bytes = await readFile(out);
    assert.equal(bytes.readUInt32BE(16), 800);
    assert.equal(bytes.readUInt32BE(20), 600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run to verify RED**

```powershell
npm run build
node --test "dist/tests/app/test_options.test.js" "dist/tests/tools/test_screenshot.test.js"
```
Expected: the screen/zoom assertions fail; the screenshot tool exits 2 with `unknown option: --screen`.

- [ ] **Step 3: Finish the interaction layer**

Controller/editor:
- pointer capture on left drag in Builder; paint only when the pointer moved at least `brushRadius * 0.3` world units since the last paint;
- move a selected colony/food by dragging (clamped to world bounds); switching to a preset or deleting clears selection and pending confirm;
- brush ring: a DOM element positioned at the pointer in CSS px, diameter `2 * brushRadius * camera.scale() / devicePixelRatio`, hidden for non-brush tools and when the pointer leaves the canvas;
- cursors: crosshair for brush/food/colony, default for select, grabbing while panning, `not-allowed` when Start is disabled;
- pan/zoom works in Builder and Run, wheel anchored at the cursor; Home ignores pointer tools;
- keyboard: 1–8 select tools, Delete/Backspace delete the selection, Escape cancels confirm → clears selection → opens Pause (Run), Home ignores;
- screen transitions: toggle `.screen--active`; no layout jump; focus moves to the new screen's primary action;
- Zen: H hides HUD/panel/drawer/legend; Esc exits Zen before pausing.

Screenshot/URL:
- add `--screen` and `--zoom` to `tools/screenshot.mjs` with validation and query passing; add to its usage line;
- `optionsFromUrl` already forwards `screen`/`zoom` through the same parser; add a test that `?screen=builder&preset=dunes&zoom=2` parses;
- update `usageText` with the final flag list and deprecation note for `--scenario`.

Responsive and motion:
- at widths below 1100 px, the builder rail narrows to icons with labels hidden, the HUD chips hide FPS first, and the dock wraps into two rows; no horizontal scroll; the canvas still fills the viewport;
- all transitions use the token durations and collapse under reduced motion; verify the modal scrim is not a black block in headless.

- [ ] **Step 4: Run to verify GREEN**

```powershell
npm run build
node --test "dist/tests/app/test_options.test.js" "dist/tests/tools/test_screenshot.test.js"
```
Expected: PASS. The interactive builder screenshot test may need up to 120 s.

- [ ] **Step 5: Full visual sweep**

```powershell
npm run screenshot -- --interactive --screen home --size 1920x1080 --out captures\final-home.png
npm run screenshot -- --interactive --screen builder --preset creek --size 1920x1080 --out captures\final-builder.png
npm run screenshot -- --interactive --screen run --preset boulder --ticks 1800 --size 1920x1080 --out captures\final-run.png
npm run screenshot -- --interactive --screen run --preset meadow --ticks 1800 --zoom 4 --size 1920x1080 --out captures\final-closeup.png
npm run screenshot -- --interactive --screen run --preset meadow --ticks 1800 --zoom 0.5 --size 1920x1080 --out captures\final-wide.png
```
Open every PNG. Expected: no clipped text, no horizontal scroll, ants legible at 0.5× and detailed at 4×, builder tool rail and inspector tuned, home readable, colonies visually distinct, trails teal/amber, food clustered, anthills built. If something is wrong, fix it and rerun the relevant screenshot before committing.

- [ ] **Step 6: Run the whole suite**

```powershell
npm test
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/controller.ts src/ui/builder_screen.ts src/app/options.ts tools/screenshot.mjs styles.css tests/app/test_options.test.ts tests/tools/test_screenshot.test.ts
git commit -m "feat(ui): finish editor input, transitions and responsive polish" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 17: Acceptance, documentation sweep and milestone close

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-10-25-ant-simulator-structure.md`, `docs/superpowers/specs/2026-10-25-ant-simulator-design.md`, `docs/superpowers/specs/2026-10-25-presentation-overhaul-design.md`
- Test: the whole suite plus screenshots and the bench

**Interfaces:**
- Consumes: every task.
- Produces: a milestone that is complete, documented and reproducible.

- [ ] **Step 1: Remove dead code and stale references**

Delete any files still listed as removed if a task left them: `src/sim/scenarios.ts`, `src/ui/shell.ts`, `src/render/test_pattern.ts`, `tests/sim/test_scenarios_checksum.test.ts`, `tests/render/test_night_theme.test.ts`, `tests/render/test_theme_and_pattern.test.ts`, `tests/render/test_world_view.test.ts` (replaced by `test_layers`). Grep for `loadScenario|AppShell|nightTheme|sandTheme|colonyColor|buildActors|buildGround`. Expected: no production references; only historical docs may mention them.

- [ ] **Step 2: Run the full test suite and build**

```powershell
npm test
npm run build
```
Expected: both exit 0, no warnings. Record the exact passing test count for Step 5.

- [ ] **Step 3: Check the machine is plugged in and run the bench**

```powershell
Get-CimInstance -ClassName Win32_Battery | Select-Object -ExpandProperty BatteryStatus
```
Expected: `2` means on AC. If it is not 2, plug in and rerun, or report the bench as battery-powered and therefore non-qualifying. Then:
```powershell
npm run bench -- --preset meadow --ticks 1200
```
Record the whole table, the ant count, ticks/s and ant updates/s. Compare with the last M1 bench figure in the repo or report the new baseline if none is recorded.

- [ ] **Step 4: Capture the acceptance screenshots and look at them**

```powershell
npm run screenshot -- --interactive --screen home --size 1920x1080 --out captures\m1-5-home.png
npm run screenshot -- --interactive --screen builder --preset meadow --size 1920x1080 --out captures\m1-5-builder.png
npm run screenshot -- --interactive --screen run --preset creek --ticks 1800 --size 1920x1080 --out captures\m1-5-run.png
npm run screenshot -- --interactive --screen run --preset meadow --ticks 1800 --zoom 4 --size 1920x1080 --out captures\m1-5-closeup.png
npm run screenshot -- --interactive --screen run --preset meadow --ticks 600 --zoom 2 --size 1920x1080 --out captures\m1-5-food-early.png
npm run screenshot -- --interactive --screen run --preset meadow --ticks 7200 --zoom 2 --size 1920x1080 --out captures\m1-5-food-late.png
```
Open each PNG with the Read tool and judge: ants look like ants; anthills are built; food pieces visibly decrease in count from early to late; trails are teal/amber and do not clash with ants; layouts are unbroken; both Creek colonies have distinct colours. If a shot is wrong, fix the owning layer and rerun it. Do not claim a visual result from code inspection.

- [ ] **Step 5: Update the docs**

- `CLAUDE.md` Status: `Current milestone: **M1.5 (presentation overhaul) complete** (date), **M2 (walls and adaptation) next, not started.**` Include the test count, build/bench results, the screenshot paths, and a one-line note that pathfinding/collision/starvation/birth tuning is a separate later project, not M2. Update the Build and run examples to `--preset meadow` and add `--screen`/`--zoom` examples.
- Main design spec §15: mark M1.5 done with the date; trim M2/M3/M5 to what remains; §16 decisions 21–24 final wording.
- Presentation design doc: set Status to `implemented · <date>`; in §13 record any calls made during implementation (at minimum the exact final preset geometry and any art adjustments) with one line each.
- Structure doc: full sweep of every created/modified/deleted file and public export, matching the final tree; include tests and tools. Verify with `git ls-files` against the doc.
- If `docs/superpowers/plans/` has an index or README, mark this plan complete.

- [ ] **Step 6: Final manual smoke check**

```powershell
npm run serve
```
In Chrome at 127.0.0.1:8080: Home → New world → change a colony colour and starting ants → add a second colony → add food → paint each obstacle type → switch preset and confirm/cancel → Start → pause → step → speeds → reset → pause → edit → restart → finish → Home Last run card. Confirm there is no way to mutate a running world without Start/Reset replacing it. Stop the server.

- [ ] **Step 7: Commit the close**

```bash
git add CLAUDE.md docs captures
git commit -m "docs: close M1.5 with acceptance results and the new baseline" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** Every design section maps to a task: visual tokens (12, 15), palette (2, 9), ants (10), anthill (10, 11), food (7, 11), trails (9), terrain (11), themes (9), builder tools/validation (2, 13, 16), run HUD (12), colony panel/settings/pause/finish (15), simulation setup/colonies/obstacles/food/render (2–11), presets (5), home/controller (14), acceptance (17). The deferred mechanics from the user's other project are not implemented.

**Type consistency:** `WorldSetup` has no `nextColonyId`; colony ids are array indices everywhere. `FoodSource.uid/kind` are set in Task 4 before Task 7 uses them. `AtlasFrames` and `makeAtlasFrames` are introduced once (Task 8) and consumed unchanged by Tasks 10/11. `WorldRenderCache` is extended in Task 10 and finalized in Task 11. `SpeedSetting` lives in `view_models.ts` and is imported by session/HUD. `BuilderScreen` hook names match the controller list. `isOpen()` is the chosen overlay API.

**Step scan:** Each task has a failing test or a named visual verification, an implementation step with exact signatures/values, green runs, a full-suite run, and a commit. The only no-test task is the documentation amendment (Task 1), which is neither production code nor behavior. UI-only tasks carry screenshot verification and pure view-model tests.

**Proportion:** The plan is long because it pins 17 independently reviewable tasks, exact interfaces and exact acceptance thresholds; implementation bodies are left to the builder except for the territory rule, food layout and leg formulas, which the signatures and tests do not determine.

**Review Focus:** Five entries, each with its owning test. The invalid-map, selection-deletion, paused-transition and consumed-food cases are TDD tests in Tasks 2, 13, 13 and 7/11. The extreme-zoom case is a unit test in Task 10 plus screenshots in Task 16. No review-focus item is left only to manual inspection.
