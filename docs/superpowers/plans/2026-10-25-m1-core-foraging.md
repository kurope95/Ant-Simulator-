# Milestone 1 (Core Foraging + Control UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One colony of 200 ants forages on its own: it leaves the nest, wanders, lays pheromone trails, finds food, carries it home, delivers it, and spawns more ants. The world is drawn in a dark, high-end WebGL view with a dual-channel trail heatmap, and a polished DOM control drawer switches overlays and tweaks every live parameter with smooth transitions.

**Architecture:**
- Structure-of-Arrays ants in typed arrays; a fixed 60 Hz tick runs Think over fixed chunks (each chunk appends to its own event list), then serial Events, Removals, Decay and Stats in chunk order.
- `core` and `sim` stay free of DOM/WebGL so Node runs them for tests and the bench; all randomness comes from `randU32(seed, uid, tick, stream)`.
- Rendering is one batched geometry pass for the world plus one textured quad for the marker heatmap.
- The UI is a DOM/CSS overlay: a top bar, a glass drawer with animated sections, toggle switches, segmented controls and live parameter sliders. No canvas text, no dependencies.

**Tech Stack:** TypeScript 5.9.3 (strict, ES2022 modules), Node 24.13, Chrome 155, WebGL2, `node:test`. Two dev dependencies only (`typescript`, `@types/node`).

**Spec:**
- `docs/superpowers/specs/2026-10-25-ant-simulator-design.md` — *what*: this plan implements row M1 of §15 and the user's 2026-10-25 request for the control UI.
- `docs/superpowers/specs/2026-10-25-ant-simulator-structure.md` — *where*, and every public name.

## Global Constraints

- **No native executables.** Smart App Control blocks unsigned Windows programs. Only Node and Chrome run. Never install esbuild, Vite, Rollup native builds or TypeScript 7.
- **TypeScript 5.9.3**, `strict`, ES2022 modules, imports written with a `.js` extension. No new npm dependencies, runtime or dev.
- **Layering:** `src/core` and `src/sim` never reference `document`, `window`, `canvas`, `WebGL*` or `chrome`. `src/ui` may import pure `render` modules (`view_settings.ts`, `theme.ts`) that never touch WebGL.
- **Randomness:** only `randU32`/`randUnit`/`randRange` from `src/core/rng.ts`, with the `RandStream` values from `src/sim/types.ts`. Never `Math.random`.
- **Storage:** all simulation numbers live in typed arrays. Float32 rounding is part of determinism; never compare a `Float32Array` value with an unrounded double for equality.
- **Units:** world units (u), seconds, radians; x right, **y down**; heading 0 = +x.
- **Naming:** files `snake_case.ts`; types `PascalCase`; functions and variables `camelCase`; constants `kPascalCase`.
- **Tests:** every task is RED → GREEN. `npm test` must be green before the task's commit. Never weaken an assertion to pass.
- **Commits:** one per task, subject given in the task. Every commit ends with the trailer `Co-Authored-By: Claude Code <noreply@anthropic.com>` — pass it as a second `-m`, e.g. `git commit -m "feat(sim): ..." -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"`. Never commit `dist/`, `node_modules/` or `captures/`.
- **UI quality bar (user requirement, 2026-10-25):** dark, high-end, no placeholder styling. The palette, layout, motion timings and component states in Task 11 are the specification; a plain grey box with default browser controls does not satisfy this plan.
- **Performance claims** only from `npm run bench`, and the final report must state whether the laptop was plugged in.

## Review Focus

Failure modes this milestone can produce that ordinary tests would miss. Each line names the test that pins it, in the task that owns the code.

1. **Live parameter extremes.** A slider dragged to its minimum or maximum mid-run (energy burn 5/s, sensor radius 10 u, explorer ratio 0 %) must not produce NaN positions, a stalled tick or a crash. Pinned by Task 11 "every extreme still steps the sandbox without NaN".
2. **Long autonomous runs.** 7,200 ticks with deaths, spawns and removals must leave finite state, a non-empty colony and an actual trail — not a silently frozen simulation. Pinned by Task 8 "sandbox: a trail forms and food is delivered within 7,200 ticks".
3. **Degenerate worlds.** No ants, no colonies, no food, or a food source emptied by the first contact in a tick must all step safely. Pinned by Task 7 "stepWorld on an empty world is safe" and "the last unit goes to the earlier chunk".
4. **Extreme zoom and culling.** Ants drawn at sub-pixel size or far outside the view must not emit NaN vertices or disappear wrongly; a zero-size viewport must stay finite. Pinned by Task 10 "off-screen ants are culled" and "alpha interpolates between prev and pos without NaN".
5. **Screenshot truthfulness.** The acceptance image must come from the fixed screenshot tool, which now rejects invalid input and wrong-size PNGs; it is then read and judged by eye, never inferred from the code. Pinned by Task 13's acceptance steps.

---

## Before you start

Run every command from the repository root.

```powershell
node --version
npm test
```

**Expected:** Node `v24.13.0`; `npm test` → `tests 42`, `pass 42`, `fail 0`.

Read `CLAUDE.md`, both spec documents, and the M0 plan's architecture sections. Do not start M2 work (walls, obstacles, stuck detection, spatial hash).

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/core/ring_buffer.ts` | fixed-capacity history buffer | 1 |
| `src/sim/types.ts` (modify) | `RandStream` values | 1 |
| `src/sim/ants.ts` | SoA ant storage, spawn, swap-remove, uid map | 2 |
| `src/sim/marker_grid.ts` | marker grid, deposit, degrade, decay, emission | 3 |
| `src/sim/params.ts` (modify) | `markerDecayFactor` | 3 |
| `src/sim/food.ts`, `src/sim/colony.ts` | food sources, colony and nest radius | 4 |
| `src/sim/events.ts`, `src/sim/sensing.ts`, `src/sim/steering.ts` | event types, sensing patterns, wander and turning | 5 |
| `src/sim/world.ts` (modify) | M1 world members; phase pipeline | 5, 7 |
| `src/sim/tick.ts` | think chunk, event application, spawns, removals, stats | 6, 7 |
| `src/sim/scenarios.ts`, `src/sim/checksum.ts` | sandbox scenario, world checksum | 8 |
| `src/render/theme.ts` (modify), `src/render/view_settings.ts`, `src/render/heatmap.ts`, `src/render/gl_renderer.ts` (modify) | night theme, view toggles, heatmap pixels, texture drawing | 9 |
| `src/render/ant_layer.ts`, `src/render/world_view.ts` | ant quads, full world frame | 10 |
| `src/ui/param_specs.ts`, `src/ui/shell.ts`, `styles.css` (rewrite) | control drawer, parameter metadata, dark styling | 11 |
| `src/app/interactive.ts`, `headless.ts`, `bench.ts` (modify) | scenario loading, world rendering, speed, keys, bench | 12 |
| `docs/superpowers/specs/*.md`, `CLAUDE.md` | signatures, decisions, status | 13 |

Tests mirror `src/`: `tests/core`, `tests/sim`, `tests/render`, `tests/ui`, `tests/tools`.

Test counts at the end of each task: 46, 50, 56, 62, 69, 78, 89, 96, 101, 105, 109, 109, 109.

---

### Task 1: Rand streams and the ring buffer

**Files:**
- Create: `src/core/ring_buffer.ts`, `src/sim/types.ts` (modify), `tests/core/test_ring_buffer.test.ts`, `tests/sim/test_rand_stream.test.ts`

**Interfaces:**
- Produces: `class RingBuffer<T> { constructor(capacity: number); push(v: T): void; size(): number; get(i: number): T }` — `get(0)` is the oldest value; `get` throws `RangeError` outside `0..size()-1`; the constructor throws `RangeError` for `capacity < 1`.
- Produces: `enum RandStream { WanderOffset = 1, WanderInterval, StuckTurn, SpawnHeading, SpawnRole, SpeedJitter, ContactTurn }`.

- [ ] **Step 1: Write the failing tests**

`tests/core/test_ring_buffer.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { RingBuffer } from "../../src/core/ring_buffer.js";

test("ring buffer: keeps the newest values in order", () => {
  const ring = new RingBuffer<number>(3);
  assert.equal(ring.size(), 0);
  ring.push(1);
  ring.push(2);
  assert.equal(ring.size(), 2);
  assert.equal(ring.get(0), 1);
  ring.push(3);
  ring.push(4);
  assert.equal(ring.size(), 3);
  assert.equal(ring.get(0), 2);
  assert.equal(ring.get(1), 3);
  assert.equal(ring.get(2), 4);
});

test("ring buffer: get rejects an index outside the stored range", () => {
  const ring = new RingBuffer<string>(2);
  assert.throws(() => ring.get(0), RangeError);
  ring.push("a");
  assert.equal(ring.get(0), "a");
  assert.throws(() => ring.get(1), RangeError);
  assert.throws(() => ring.get(-1), RangeError);
});

test("ring buffer: capacity must be at least 1", () => {
  assert.throws(() => new RingBuffer<number>(0), RangeError);
});
```

`tests/sim/test_rand_stream.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { RandStream } from "../../src/sim/types.js";

test("rand streams: values are pinned and unique", () => {
  const values = [
    RandStream.WanderOffset,
    RandStream.WanderInterval,
    RandStream.StuckTurn,
    RandStream.SpawnHeading,
    RandStream.SpawnRole,
    RandStream.SpeedJitter,
    RandStream.ContactTurn,
  ];
  assert.deepEqual(values, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(new Set(values).size, 7);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run build`

**Expected:** FAIL to compile — `Cannot find module '../../src/core/ring_buffer.js'` and `RandStream` is not exported.

- [ ] **Step 3: Implement**

`src/core/ring_buffer.ts` — a circular buffer: `data: (T | undefined)[]` of length `capacity`, `count`, `head` (index of the oldest). `push` writes at `(head + count) % capacity` when not full; when full it overwrites the oldest and advances `head`. `get(i)` validates the index, then reads `data[(head + i) % capacity]!`.

`src/sim/types.ts` — add the enum exactly as listed in Interfaces.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`

**Expected:** `tests 46`, `pass 46`, `fail 0` (the 42 existing tests plus 4).

- [ ] **Step 5: Commit**

```powershell
git add src/core/ring_buffer.ts src/sim/types.ts tests/core/test_ring_buffer.test.ts tests/sim/test_rand_stream.test.ts
git commit -m "feat(core): ring buffer and rand stream ids"
```

---

### Task 2: Ants — Structure of Arrays with a stable uid map

**Files:**
- Create: `src/sim/ants.ts`, `tests/sim/test_ants.test.ts`

**Interfaces:**
- Produces: `interface AntSpawn { pos: Vec2; heading?: number; colony?: number; role?: AntRole; state?: AntState }`.
- Produces: `class Ants` with public array fields, all of the same capacity: `uid: Uint32Array`, `colony/role/state: Uint8Array`, `posX/posY/prevX/prevY/velX/velY/heading/speed/mass: Float32Array`, `energy/timeSinceAnchor/dropX/dropY/timeSinceLastMarker/degradeTimer: Float32Array`, `lastMarkerCell: Int32Array`, `wanderOffset/wanderTimer: Float32Array`.
- Produces: `constructor(capacity = 64)`, `size(): number`, `spawn(a: AntSpawn, uid: number, speed: number, params: SimParams): number` (returns the new index), `removeSwap(index: number): void`, `indexOf(uid: number): number | null`.
- Defaults set by `spawn`: `heading = a.heading ?? 0`, `colony = a.colony ?? 0`, `role = a.role ?? AntRole.Follower`, `state = a.state ?? AntState.Foraging`, `mass = params.mass`, `energy = params.energyMax`, `prev = pos`, velocities 0, `drop = pos`, `timeSinceAnchor = 0`, `timeSinceLastMarker = 0`, `degradeTimer = 0`, `lastMarkerCell = -1`, `wanderOffset = 0`, `wanderTimer = 0`.

- [ ] **Step 1: Write the failing tests**

`tests/sim/test_ants.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { randU32 } from "../../src/core/rng.js";
import { Ants } from "../../src/sim/ants.js";
import { defaultParams } from "../../src/sim/params.js";
import { AntRole, AntState } from "../../src/sim/types.js";

test("ants: spawn appends an ant with defaults", () => {
  const ants = new Ants();
  const params = defaultParams();
  const index = ants.spawn({ pos: { x: 10, y: 20 } }, 7, 50, params);
  assert.equal(index, 0);
  assert.equal(ants.size(), 1);
  assert.equal(ants.uid[0], 7);
  assert.equal(ants.posX[0], 10);
  assert.equal(ants.posY[0], 20);
  assert.equal(ants.prevX[0], 10);
  assert.equal(ants.energy[0], params.energyMax);
  assert.equal(ants.mass[0], params.mass);
  assert.equal(ants.state[0], AntState.Foraging);
  assert.equal(ants.role[0], AntRole.Follower);
  assert.equal(ants.colony[0], 0);
  assert.equal(ants.speed[0], 50);
  assert.equal(ants.lastMarkerCell[0], -1);
});

test("ants: spawn grows the arrays past their capacity", () => {
  const ants = new Ants(1);
  for (let i = 0; i < 5; i++) {
    ants.spawn({ pos: { x: i, y: 0 } }, 100 + i, 10, defaultParams());
  }
  assert.equal(ants.size(), 5);
  assert.equal(ants.posX[0], 0);
  assert.equal(ants.posX[4], 4);
  assert.equal(ants.uid[4], 104);
});

test("ants: removeSwap moves the last ant into the hole", () => {
  const ants = new Ants();
  const params = defaultParams();
  for (let i = 0; i < 3; i++) ants.spawn({ pos: { x: i, y: i } }, 10 + i, 10, params);
  ants.removeSwap(0);
  assert.equal(ants.size(), 2);
  assert.equal(ants.indexOf(10), null);
  assert.equal(ants.indexOf(12), 0);
  assert.equal(ants.uid[0], 12);
  assert.equal(ants.posX[0], 2);
  assert.equal(ants.indexOf(11), 1);
});

test("ants: the uid map survives 1,000 mixed spawns and removals", () => {
  const ants = new Ants(4);
  const params = defaultParams();
  const expected = new Map<number, { x: number; y: number }>();
  let nextUid = 1;
  for (let step = 0; step < 1000; step++) {
    const op = randU32(1, step, 0, 7) % 3;
    if (op !== 0 || expected.size === 0) {
      const pos = { x: step, y: step * 2 };
      const uid = nextUid++;
      ants.spawn({ pos }, uid, 50, params);
      expected.set(uid, pos);
    } else {
      const uids = [...expected.keys()];
      const victim = uids[randU32(2, step, 0, 7) % uids.length];
      const index = ants.indexOf(victim);
      assert.notEqual(index, null);
      ants.removeSwap(index!);
      expected.delete(victim);
    }
    assert.equal(ants.size(), expected.size);
    for (const [uid, pos] of expected) {
      const index = ants.indexOf(uid);
      assert.notEqual(index, null);
      assert.equal(ants.uid[index!], uid);
      assert.equal(ants.posX[index!], pos.x);
      assert.equal(ants.posY[index!], pos.y);
    }
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run build`

**Expected:** FAIL — no module `src/sim/ants.js`.

- [ ] **Step 3: Implement `Ants`**

One typed array per field, a `count`, and `private readonly indexByUid = new Map<number, number>()`. `spawn` calls a private `ensureCapacity()` that doubles every array and copies the first `count` values when full, appends at `count`, writes all defaults, registers the uid in the map, and returns `count - 1`.

`removeSwap(index)`: validate `0 <= index < count`; read the removed uid; when `index !== count - 1`, copy every field from `count - 1` into `index`; delete the removed uid from the map; when a move happened, set the moved uid's map entry to `index`; `count -= 1`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`

**Expected:** `tests 50`, `pass 50`.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/ants.ts tests/sim/test_ants.test.ts
git commit -m "feat(sim): structure-of-arrays ants with a stable uid map"
```

---

### Task 3: Marker grid, deposits, degradation and decay

**Files:**
- Create: `src/sim/marker_grid.ts`, `tests/sim/test_marker_grid.test.ts`
- Modify: `src/sim/params.ts` (`markerDecayFactor`)

**Interfaces:**
- Produces: `enum MarkerChannel { ToHome, ToFood }`.
- Produces: `interface MarkerGrid { width: number; height: number; cell: number; owner: Int8Array; toHome: Float32Array; toFood: Float32Array; resize(worldSize: Vec2, cellSize: number): void; cellIndex(pos: Vec2): number }` — `cellIndex` returns `-1` outside the world; a fresh grid's owner is all `kNoOwner` (−1).
- Produces: `makeMarkerGrid(worldSize: Vec2, cellSize: number): MarkerGrid` (`width = Math.ceil(size.x / cell)`, same for height).
- Produces: `emissionStrength(timeSinceAnchor: number, params: SimParams): number` = `Math.exp(-timeSinceAnchor * params.emissionDecay)`.
- Produces: `deposit(grid, cell, colony, channel, strength, params): void` — M1 rule: if `owner[cell] === colony || owner[cell] === kNoOwner`, set owner and `channel[cell] = Math.max(channel[cell], strength)`; a foreign owner is left untouched (the territory rule arrives in M3).
- Produces: `degrade(grid, cell, colony, channel, factor): void` — if `owner[cell] === colony`, multiply that channel by `factor`.
- Produces: `decayMarkers(grid, factor, eps): void` — multiply both channels by `factor`; zero any value below `eps`; when both are 0, set the owner to `kNoOwner`.
- Produces: `markerDecayFactor(params: SimParams, dt: number): number` = `Math.pow(2, -dt / params.markerHalfLife)` in `params.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/sim/test_marker_grid.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { kNoOwner } from "../../src/sim/types.js";
import {
  MarkerChannel,
  decayMarkers,
  degrade,
  deposit,
  emissionStrength,
  makeMarkerGrid,
} from "../../src/sim/marker_grid.js";
import { defaultParams, markerDecayFactor } from "../../src/sim/params.js";

test("markers: cellIndex maps positions and rejects outside", () => {
  const grid = makeMarkerGrid({ x: 64, y: 32 }, 8);
  assert.equal(grid.width, 8);
  assert.equal(grid.height, 4);
  assert.equal(grid.cellIndex({ x: 0, y: 0 }), 0);
  assert.equal(grid.cellIndex({ x: 7.9, y: 7.9 }), 0);
  assert.equal(grid.cellIndex({ x: 8, y: 0 }), 1);
  assert.equal(grid.cellIndex({ x: 63.9, y: 31.9 }), 31);
  assert.equal(grid.cellIndex({ x: 64, y: 0 }), -1);
  assert.equal(grid.cellIndex({ x: -0.1, y: 0 }), -1);
  assert.equal(grid.cellIndex({ x: 0, y: 32 }), -1);
  assert.equal(grid.owner[0], kNoOwner);
});

test("markers: deposit claims free cells and keeps the strongest value", () => {
  const grid = makeMarkerGrid({ x: 64, y: 32 }, 8);
  const params = defaultParams();
  deposit(grid, 5, 0, MarkerChannel.ToHome, 0.4, params);
  assert.equal(grid.owner[5], 0);
  assert.equal(grid.toHome[5], 0.4);
  deposit(grid, 5, 0, MarkerChannel.ToHome, 0.2, params);
  assert.equal(grid.toHome[5], 0.4);
  deposit(grid, 5, 0, MarkerChannel.ToHome, 0.9, params);
  assert.equal(grid.toHome[5], 0.9);
  assert.equal(grid.toFood[5], 0);
});

test("markers: deposit leaves a foreign cell alone in M1", () => {
  const grid = makeMarkerGrid({ x: 64, y: 32 }, 8);
  const params = defaultParams();
  deposit(grid, 5, 1, MarkerChannel.ToFood, 0.8, params);
  deposit(grid, 5, 0, MarkerChannel.ToFood, 0.8, params);
  assert.equal(grid.owner[5], 1);
  assert.equal(grid.toFood[5], 0.8);
});

test("markers: degrade halves only the ant's own channel", () => {
  const grid = makeMarkerGrid({ x: 64, y: 32 }, 8);
  const params = defaultParams();
  deposit(grid, 3, 0, MarkerChannel.ToHome, 0.8, params);
  deposit(grid, 3, 0, MarkerChannel.ToFood, 0.8, params);
  degrade(grid, 3, 0, MarkerChannel.ToFood, 0.5);
  assert.equal(grid.toFood[3], 0.4);
  assert.equal(grid.toHome[3], 0.8);
  degrade(grid, 3, 1, MarkerChannel.ToHome, 0.5);
  assert.equal(grid.toHome[3], 0.8);
});

test("markers: decay scales both channels and resets empty owners", () => {
  const grid = makeMarkerGrid({ x: 16, y: 8 }, 8);
  const params = defaultParams();
  deposit(grid, 0, 0, MarkerChannel.ToHome, 0.5, params);
  deposit(grid, 0, 0, MarkerChannel.ToFood, 0.25, params);
  deposit(grid, 1, 2, MarkerChannel.ToFood, 1e-5, params);
  decayMarkers(grid, 0.5, 1e-4);
  assert.ok(Math.abs(grid.toHome[0] - 0.25) < 1e-6);
  assert.ok(Math.abs(grid.toFood[0] - 0.125) < 1e-6);
  assert.equal(grid.owner[0], 0);
  assert.equal(grid.toFood[1], 0);
  assert.equal(grid.owner[1], kNoOwner);
});

test("markers: the decay factor matches 0.9985 per tick and is frame-rate independent", () => {
  const params = defaultParams();
  const f60 = markerDecayFactor(params, 1 / 60);
  assert.ok(Math.abs(f60 - 0.9985) <= 2e-5, `factor ${f60}`);
  const f120 = markerDecayFactor(params, 1 / 120);
  assert.ok(Math.abs(f120 * f120 - f60) < 1e-12);
});

test("markers: emission strength falls off with time since the anchor", () => {
  const params = defaultParams();
  assert.equal(emissionStrength(0, params), 1);
  assert.ok(Math.abs(emissionStrength(20, params) - Math.exp(-1)) < 1e-9);
  assert.ok(emissionStrength(200, params) < params.markerEps);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run build`

**Expected:** FAIL — no module `src/sim/marker_grid.js`; `markerDecayFactor` is not exported.

- [ ] **Step 3: Implement**

`makeMarkerGrid` allocates `owner = new Int8Array(width * height)` then `.fill(kNoOwner)`, and two zeroed `Float32Array`s. `resize` does the same for a new size and replaces the fields, so `MarkerGrid` holds mutable arrays (`owner` etc. are properties, reassigned on resize).

`deposit` picks the array with `channel === MarkerChannel.ToHome ? grid.toHome : grid.toFood`; the `params` argument is accepted for signature compatibility and unused until M3.

`decayMarkers` visits every cell, applies the factor to both channels, zeroes values `< eps`, and clears the owner when both channels are 0.

`markerDecayFactor` goes in `src/sim/params.ts` next to `validate`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`

**Expected:** `tests 56`, `pass 56`.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/marker_grid.ts src/sim/params.ts tests/sim/test_marker_grid.test.ts
git commit -m "feat(sim): marker grid with deposit, degrade and decay"
```

### Task 4: Food sources and a colony

**Files:**
- Create: `src/sim/food.ts`, `src/sim/colony.ts`, `tests/sim/test_food_colony.test.ts`

**Interfaces:**
- Produces: `interface FoodSource { pos: Vec2; amount: number; infinite: boolean }`.
- Produces: `foodRadius(source: FoodSource, params: SimParams): number` — infinite sources are `params.foodBaseR * 2`; otherwise `Math.max(params.foodMinR, params.foodBaseR * Math.sqrt(source.amount / params.foodRefAmount))`.
- Produces: `interface FoodSources { items: FoodSource[]; findTouching(pos: Vec2, radius: number, params: SimParams): number; takeOne(index: number): boolean; removeEmpty(): void }`; `makeFoodSources(): FoodSources`; `addFoodSource(sources, pos: Vec2, amount: number, infinite = false): number` (appends, returns the index).
- Semantics: `findTouching` returns the nearest source whose centre is within `foodRadius(source) + radius`, else `-1`. `takeOne` returns `false` for a spent finite source, otherwise decrements (infinite sources never change) and returns `true`. `removeEmpty` removes finite sources whose `amount <= 0`, preserving order.
- Produces: `interface Colony { id: ColonyId; nest: Vec2; foodPool: number; population: number; deliveredTotal: number; deliveredLastSample: number; deliveredPerSecond: RingBuffer<number>; extinct: boolean }`; `makeColony(id, nest, historyCapacity = 120): Colony`; `nestRadius(colony, params) = params.nestBaseR + params.nestGrowth * Math.sqrt(colony.population)`.

- [ ] **Step 1: Write the failing tests**

`tests/sim/test_food_colony.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { addFoodSource, foodRadius, makeFoodSources } from "../../src/sim/food.js";
import { makeColony, nestRadius } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";

test("food: radius follows the amount, clamped to the minimum", () => {
  const params = defaultParams();
  const at = (amount: number) =>
    foodRadius({ pos: { x: 0, y: 0 }, amount, infinite: false }, params);
  assert.equal(at(500), 12);
  assert.equal(at(2000), 24);
  assert.equal(at(1), params.foodMinR);
  assert.equal(foodRadius({ pos: { x: 0, y: 0 }, amount: 0, infinite: true }, params), 24);
});

test("food: findTouching returns the nearest source in range", () => {
  const params = defaultParams();
  const sources = makeFoodSources();
  addFoodSource(sources, { x: 100, y: 0 }, 500, false);
  addFoodSource(sources, { x: 0, y: 0 }, 500, false);
  assert.equal(sources.findTouching({ x: 96, y: 0 }, params.antRadius, params), 0);
  addFoodSource(sources, { x: 90, y: 0 }, 500, false);
  assert.equal(sources.findTouching({ x: 96, y: 0 }, params.antRadius, params), 2);
  assert.equal(sources.findTouching({ x: 60, y: 0 }, params.antRadius, params), -1);
  assert.equal(sources.findTouching({ x: 500, y: 500 }, params.antRadius, params), -1);
});

test("food: takeOne decrements, reports the unit and never empties an infinite source", () => {
  const sources = makeFoodSources();
  addFoodSource(sources, { x: 0, y: 0 }, 2, false);
  assert.equal(sources.takeOne(0), true);
  assert.equal(sources.items[0].amount, 1);
  assert.equal(sources.takeOne(0), true);
  assert.equal(sources.items[0].amount, 0);
  assert.equal(sources.takeOne(0), false);
  addFoodSource(sources, { x: 10, y: 0 }, 0, true);
  assert.equal(sources.takeOne(1), true);
  assert.equal(sources.takeOne(1), true);
});

test("food: removeEmpty drops spent sources and keeps the rest in order", () => {
  const sources = makeFoodSources();
  addFoodSource(sources, { x: 1, y: 0 }, 0, false);
  addFoodSource(sources, { x: 2, y: 0 }, 5, false);
  addFoodSource(sources, { x: 3, y: 0 }, 0, true);
  sources.removeEmpty();
  assert.deepEqual(sources.items.map((s) => s.pos.x), [2, 3]);
});

test("colony: starts empty and holds a 120-sample delivery history", () => {
  const colony = makeColony(2, { x: 5, y: 6 });
  assert.equal(colony.id, 2);
  assert.deepEqual(colony.nest, { x: 5, y: 6 });
  assert.equal(colony.foodPool, 0);
  assert.equal(colony.population, 0);
  assert.equal(colony.deliveredTotal, 0);
  assert.equal(colony.deliveredLastSample, 0);
  assert.equal(colony.extinct, false);
  assert.equal(colony.deliveredPerSecond.size(), 0);
  for (let i = 0; i < 130; i++) colony.deliveredPerSecond.push(i);
  assert.equal(colony.deliveredPerSecond.size(), 120);
  assert.equal(colony.deliveredPerSecond.get(0), 10);
});

test("colony: nest radius grows with the square root of the population", () => {
  const params = defaultParams();
  const colony = makeColony(0, { x: 0, y: 0 });
  assert.equal(nestRadius(colony, params), 20);
  colony.population = 400;
  assert.equal(nestRadius(colony, params), 28);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run build`

**Expected:** FAIL — no modules `src/sim/food.js` or `src/sim/colony.js`.

- [ ] **Step 3: Implement**

`food.ts` — `makeFoodSources` returns an object whose methods close over its own `items` array; `removeEmpty` assigns `sources.items = sources.items.filter(...)`. `findTouching` scans every item, keeps the smallest centre distance that is within `foodRadius(item) + radius`.

`colony.ts` — `makeColony` builds the `RingBuffer(historyCapacity)` and zeroed counters. `nestRadius` is a one-line formula.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`

**Expected:** `tests 62`, `pass 62`.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/food.ts src/sim/colony.ts tests/sim/test_food_colony.test.ts
git commit -m "feat(sim): food sources and colony model"
```

---

### Task 5: Events, sensing, direct sight, wander and turning

**Files:**
- Create: `src/sim/events.ts`, `src/sim/sensing.ts`, `src/sim/steering.ts`, `tests/sim/test_sensing.test.ts`, `tests/sim/test_steering.test.ts`
- Modify: `src/sim/world.ts`

**Interfaces:**
- Produces: `interface DepositEvent { cell: number; colony: ColonyId; channel: MarkerChannel; strength: number }`; `interface DegradeEvent { cell: number; colony: ColonyId; channel: MarkerChannel }`; `enum ContactKind { Food, Nest }`; `interface ContactEvent { antIndex: number; kind: ContactKind; target: number }`; `interface ChunkEvents { deposits: DepositEvent[]; degrades: DegradeEvent[]; contacts: ContactEvent[] }`; `makeChunkEvents(): ChunkEvents`.
- Produces: `interface SensorSample { angleOffset: number; distance: number }`.
  - `followerPattern(): readonly SensorSample[]` — 25 samples, distances `[6.4, 12.8, 19.2, 25.6, 32]` in the outer loop and angles `[-π/3, -π/6, 0, π/6, π/3]` in the inner loop.
  - `explorerPattern(): readonly SensorSample[]` — 4 samples, distances `[16, 32]` in the outer loop and angles `[-π/3, π/3]` in the inner loop.
- Produces: `interface SenseResult { found: boolean; targetHeading: number; bestSignal: number; bestFoodSignal: number }`.
- Produces: `senseMarkers(world: World, ant: number, channel: MarkerChannel, pattern: readonly SensorSample[]): SenseResult` — samples at `pos + fromAngle(heading + angleOffset) * distance`; skips points outside the world and cells not owned by the ant's colony; `bestSignal` is the strongest value of the followed channel, `bestFoodSignal` the strongest `toFood` in the same pass; `found = bestSignal >= params.markerDetectMin`; `targetHeading = angleOf(bestPoint − pos)` (0 when nothing is found).
- Produces: `directSightHeading(world: World, ant: number): number | null` — FORAGING looks for the nearest food source (M1 has no walls), otherwise for the ant's own nest; returns the angle when the target is within `params.sensorRadius` and within the half-FOV, else `null`.
- Produces: `turnToward(heading: number, target: number, maxTurn: number): number` — `heading + clamp(wrapAngle(target − heading), −maxTurn, +maxTurn)`.
- Produces: `updateWander(world: World, ant: number, dt: number): void` — decrements `wanderTimer`; at zero or below, sets `wanderOffset = randRange(seed, uid, tick, RandStream.WanderOffset, −angle, +angle)` and `wanderTimer = interval * randRange(seed, uid, tick, RandStream.WanderInterval, 0.5, 1.5)`, where `angle`/`interval` come from the ant's role (`wanderAngleFollower/IntervalFollower` or the Explorer values).
- Modifies `World`: adds `ants: Ants; markers: MarkerGrid; colonies: Colony[]; food: FoodSources; chunkEvents: ChunkEvents[]; nextUid: number`. `makeWorld` builds empty ants (`new Ants()`), a marker grid sized from `params.worldW/worldH`, empty colonies/food/chunk-event arrays and `nextUid = 0`.

- [ ] **Step 1: Write the failing tests**

`tests/sim/test_sensing.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { makeColony } from "../../src/sim/colony.js";
import {
  directSightHeading,
  explorerPattern,
  followerPattern,
  senseMarkers,
} from "../../src/sim/sensing.js";
import { MarkerChannel } from "../../src/sim/marker_grid.js";
import { defaultParams } from "../../src/sim/params.js";
import { AntState } from "../../src/sim/types.js";
import { makeWorld, type World } from "../../src/sim/world.js";

function makeSenseWorld(): { world: World; index: number } {
  const params = defaultParams();
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 0, y: 0 }));
  const index = world.ants.spawn({ pos: { x: 100, y: 100 }, heading: 0 }, 7, params.antSpeed, params);
  return { world, index };
}

test("sensing: follower and explorer patterns have pinned shapes", () => {
  const follower = followerPattern();
  assert.equal(follower.length, 25);
  assert.deepEqual(follower[0], { angleOffset: -Math.PI / 3, distance: 6.4 });
  assert.deepEqual(follower[24], { angleOffset: Math.PI / 3, distance: 32 });
  const explorer = explorerPattern();
  assert.equal(explorer.length, 4);
  assert.deepEqual(explorer[0], { angleOffset: -Math.PI / 3, distance: 16 });
  assert.deepEqual(explorer[3], { angleOffset: Math.PI / 3, distance: 32 });
});

test("sensing: an own-colony cell ahead is found", () => {
  const { world, index } = makeSenseWorld();
  const cell = world.markers.cellIndex({ x: 120, y: 100 });
  world.markers.owner[cell] = 0;
  world.markers.toFood[cell] = 0.8;
  const result = senseMarkers(world, index, MarkerChannel.ToFood, followerPattern());
  assert.equal(result.found, true);
  assert.equal(result.bestSignal, 0.8);
  assert.equal(result.bestFoodSignal, 0.8);
  assert.ok(Math.abs(result.targetHeading) < 1e-9);
});

test("sensing: a foreign-owned cell is ignored", () => {
  const { world, index } = makeSenseWorld();
  const cell = world.markers.cellIndex({ x: 120, y: 100 });
  world.markers.owner[cell] = 1;
  world.markers.toFood[cell] = 0.9;
  const result = senseMarkers(world, index, MarkerChannel.ToFood, followerPattern());
  assert.equal(result.found, false);
  assert.equal(result.bestSignal, 0);
  assert.equal(result.bestFoodSignal, 0);
});

test("sensing: the food signal is reported even while following home", () => {
  const { world, index } = makeSenseWorld();
  const cell = world.markers.cellIndex({ x: 120, y: 100 });
  world.markers.owner[cell] = 0;
  world.markers.toHome[cell] = 0.2;
  world.markers.toFood[cell] = 0.7;
  const result = senseMarkers(world, index, MarkerChannel.ToHome, followerPattern());
  assert.equal(result.found, true);
  assert.equal(result.bestSignal, 0.2);
  assert.equal(result.bestFoodSignal, 0.7);
});

test("sensing: direct sight needs range, facing and the right target", () => {
  const { world, index } = makeSenseWorld();
  world.food.items.push({ pos: { x: 120, y: 110 }, amount: 500, infinite: false });
  const heading = directSightHeading(world, index);
  assert.notEqual(heading, null);
  assert.ok(Math.abs(heading! - Math.atan2(10, 20)) < 1e-9);

  world.ants.heading[index] = Math.PI;
  assert.equal(directSightHeading(world, index), null);

  world.ants.state[index] = AntState.ReturningFood;
  world.ants.posX[index] = 20;
  world.ants.posY[index] = 0;
  world.ants.heading[index] = Math.PI;
  const nestHeading = directSightHeading(world, index);
  assert.notEqual(nestHeading, null);
  assert.ok(Math.abs(nestHeading! - Math.PI) < 1e-9);

  const far = makeSenseWorld();
  far.world.food.items.push({ pos: { x: 300, y: 100 }, amount: 500, infinite: false });
  assert.equal(directSightHeading(far.world, far.index), null);
});
```

`tests/sim/test_steering.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { wrapAngle } from "../../src/core/math.js";
import { makeColony } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { turnToward, updateWander } from "../../src/sim/steering.js";
import { AntRole } from "../../src/sim/types.js";
import { makeWorld } from "../../src/sim/world.js";

test("steering: turnToward turns at most maxTurn and takes the short way", () => {
  assert.equal(turnToward(0, Math.PI / 2, 0.1), 0.1);
  assert.ok(Math.abs(turnToward(0, -Math.PI / 2, 0.1) + 0.1) < 1e-12);
  const acrossPi = turnToward(3, -3, 0.5);
  assert.ok(Math.abs(wrapAngle(acrossPi) - wrapAngle(3 + 0.5)) < 1e-9);
});

test("steering: wander stays inside each role's angle and resamples on a timer", () => {
  const params = defaultParams();
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 0, y: 0 }));
  const follower = world.ants.spawn({ pos: { x: 10, y: 10 } }, 1, 50, params);
  const explorer = world.ants.spawn(
    { pos: { x: 20, y: 20 }, role: AntRole.Explorer },
    2,
    50,
    params,
  );
  for (let t = 0; t < 200; t++) {
    world.tick = t;
    updateWander(world, follower, 1 / 60);
    updateWander(world, explorer, 1 / 60);
    assert.ok(Math.abs(world.ants.wanderOffset[follower]) <= params.wanderAngleFollower + 1e-6);
    assert.ok(Math.abs(world.ants.wanderOffset[explorer]) <= params.wanderAngleExplorer + 1e-6);
    assert.ok(world.ants.wanderTimer[follower] > 0);
    assert.ok(world.ants.wanderTimer[explorer] > 0);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run build`

**Expected:** FAIL — no modules `sensing.js`, `steering.js`, `events.js`; `makeWorld` returns no `ants`/`markers`/`food`.

- [ ] **Step 3: Implement**

Extend `World` and `makeWorld` exactly as listed in Interfaces.

`sensing.ts`: the two patterns are module-level frozen arrays built once. `senseMarkers` performs a single pass; keep the best point's coordinates to derive the heading. `directSightHeading` chooses its target by state (`Foraging` → nearest food source within range; otherwise the ant's colony nest), rejects targets outside `sensorRadius` or outside `Math.abs(angleDiff(heading, angleToTarget)) <= (sensorHalfFovDeg * Math.PI) / 180`, and returns the angle.

`steering.ts`: `turnToward` uses `clamp(angleDiff(heading, target), -maxTurn, maxTurn)`. `updateWander` selects interval/angle from `ants.role[ant] === AntRole.Explorer`, and uses the ant's stored `uid` and the current `world.tick` for both draws.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`

**Expected:** `tests 69`, `pass 69`.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/events.ts src/sim/sensing.ts src/sim/steering.ts src/sim/world.ts tests/sim/test_sensing.test.ts tests/sim/test_steering.test.ts
git commit -m "feat(sim): sensing, direct sight, wander and M1 world members"
```

---

### Task 6: The think chunk

**Files:**
- Create: `src/sim/tick.ts` (`thinkChunk` and its helpers only), `tests/sim/test_think.test.ts`

**Interfaces:**
- Produces: `thinkChunk(world: World, begin: number, end: number, out: ChunkEvents): void` — for each ant index in `[begin, end)`, in this order:
  1. **Timers:** `energy -= energyBurn * dt`; `timeSinceAnchor += dt`; `timeSinceLastMarker += dt`; `degradeTimer = max(0, degradeTimer − dt)`.
  2. **Choose a heading:** if `directSightHeading` returns an angle, steer at it, and set `bestFoodSignal` to `1` when the ant is `Foraging` (its sighted target is food) or `0` otherwise. If there is no direct sight, call `senseMarkers` with the follower pattern, or the explorer pattern for an Explorer that is not `ReturningExhausted`; steer at `targetHeading` when `found`, and otherwise keep the current heading. This path takes `bestFoodSignal` from `senseMarkers`.
  3. **Exhaustion:** a `Foraging` ant with `energy < exhaustedAt` and `bestFoodSignal < pushOnSignal` becomes `ReturningExhausted` and chooses its heading again (now for home).
  4. **Wander:** `updateWander(...)`, then `desired += wanderOffset`.
  5. **Steer and move:** `heading = turnToward(heading, desired, turnRate * dt)`; `vel = speed * fromAngle(heading)`; `prev = pos`; `pos += vel * dt`.
  6. **Deposit:** when the distance from `pos` to the drop point is at least `markerDropDist`, compute the cell; for `Foraging` push a `ToHome` deposit and for `ReturningFood` a `ToFood` deposit (none for `ReturningExhausted`) when `cell >= 0` and `emissionStrength(timeSinceAnchor, params) >= markerEps`; then set `drop = pos` and `timeSinceLastMarker = 0` for every state.
  7. **Degrade:** when `degradeTimer > 0` and the current cell differs from `lastMarkerCell`, record the new cell; if that cell is owned by the ant's colony, push a `DegradeEvent` for the channel the ant follows (`ToFood` while `Foraging`, else `ToHome`).
  8. **Contacts:** push a `Food` contact for the nearest touching source (`findTouching(pos, antRadius, params)`), and a `Nest` contact when the distance to its own colony's nest is at most `nestRadius + antRadius`.
- Produces: nothing else in this task; `resetChunkEvents`, event application and `stepWorld` come in Task 7.

- [ ] **Step 1: Write the failing tests**

`tests/sim/test_think.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import type { Vec2 } from "../../src/core/vec2.js";
import { makeColony } from "../../src/sim/colony.js";
import { ContactKind, makeChunkEvents, type ChunkEvents } from "../../src/sim/events.js";
import { MarkerChannel } from "../../src/sim/marker_grid.js";
import { defaultParams, type SimParams } from "../../src/sim/params.js";
import { thinkChunk } from "../../src/sim/tick.js";
import { AntRole, AntState } from "../../src/sim/types.js";
import { makeWorld, type World } from "../../src/sim/world.js";

function makeThinkWorld(pos: Vec2, heading = 0): { world: World; index: number; params: SimParams } {
  const params = defaultParams();
  params.worldW = 200;
  params.worldH = 200;
  params.wanderAngleFollower = 0;
  params.wanderAngleExplorer = 0;
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 10, y: 10 }));
  const index = world.ants.spawn({ pos, heading }, 42, params.antSpeed, params);
  return { world, index, params };
}

function thinkOnce(world: World, out: ChunkEvents = makeChunkEvents()): ChunkEvents {
  thinkChunk(world, 0, world.ants.size(), out);
  return out;
}

test("think: timers advance and energy burns", () => {
  const { world, index } = makeThinkWorld({ x: 100, y: 100 });
  world.ants.degradeTimer[index] = 3;
  thinkOnce(world);
  assert.ok(Math.abs(world.ants.energy[index] - (100 - 1 / 60)) < 1e-4);
  assert.ok(Math.abs(world.ants.timeSinceAnchor[index] - 1 / 60) < 1e-5);
  assert.ok(Math.abs(world.ants.timeSinceLastMarker[index] - 1 / 60) < 1e-5);
  assert.ok(Math.abs(world.ants.degradeTimer[index] - (3 - 1 / 60)) < 1e-5);
});

test("think: an ant moves along its heading and keeps the previous position", () => {
  const { world, index } = makeThinkWorld({ x: 100, y: 100 });
  for (let t = 0; t < 10; t++) thinkOnce(world);
  assert.ok(Math.abs(world.ants.posX[index] - (100 + (50 * 10) / 60)) < 1e-3);
  assert.ok(Math.abs(world.ants.posY[index] - 100) < 1e-3);
  assert.ok(Math.abs(world.ants.prevX[index] - (100 + (50 * 9) / 60)) < 1e-3);
});

test("think: a visible target turns the ant at most turnRate * dt", () => {
  const { world, index, params } = makeThinkWorld({ x: 100, y: 100 });
  const target = 0.5;
  world.food.items.push({
    pos: { x: 100 + Math.cos(target) * 20, y: 100 + Math.sin(target) * 20 },
    amount: 500,
    infinite: false,
  });
  thinkOnce(world);
  assert.ok(Math.abs(world.ants.heading[index] - params.turnRate / 60) < 1e-5);
});

test("think: a low-energy forager turns back unless food is sensed", () => {
  const hungry = makeThinkWorld({ x: 100, y: 100 });
  hungry.world.ants.energy[hungry.index] = 20;
  thinkOnce(hungry.world);
  assert.equal(hungry.world.ants.state[hungry.index], AntState.ReturningExhausted);

  const fed = makeThinkWorld({ x: 100, y: 100 });
  fed.world.ants.energy[fed.index] = 20;
  const cell = fed.world.markers.cellIndex({ x: 120, y: 100 });
  fed.world.markers.owner[cell] = 0;
  fed.world.markers.toFood[cell] = 0.8;
  thinkOnce(fed.world);
  assert.equal(fed.world.ants.state[fed.index], AntState.Foraging);
});

test("think: a forager deposits a home trail after the drop distance", () => {
  const { world, index, params } = makeThinkWorld({ x: 100, y: 100 });
  const out = makeChunkEvents();
  for (let t = 0; t < 10; t++) thinkChunk(world, 0, 1, out);
  assert.equal(out.deposits.length, 1);
  const event = out.deposits[0];
  assert.equal(event.channel, MarkerChannel.ToHome);
  assert.equal(event.colony, 0);
  assert.equal(
    event.cell,
    world.markers.cellIndex({ x: world.ants.posX[index], y: world.ants.posY[index] }),
  );
  assert.ok(
    Math.abs(event.strength - Math.exp(-world.ants.timeSinceAnchor[index] * params.emissionDecay)) <
      1e-5,
  );
  assert.equal(world.ants.dropX[index], world.ants.posX[index]);
  assert.equal(world.ants.timeSinceLastMarker[index], 0);
});

test("think: exhausted ants move their drop point without depositing", () => {
  const { world, index } = makeThinkWorld({ x: 100, y: 100 });
  world.ants.state[index] = AntState.ReturningExhausted;
  const out = makeChunkEvents();
  for (let t = 0; t < 10; t++) thinkChunk(world, 0, 1, out);
  assert.equal(out.deposits.length, 0);
  assert.equal(world.ants.dropX[index], world.ants.posX[index]);
});

test("think: a returning ant deposits food trail", () => {
  const { world, index } = makeThinkWorld({ x: 100, y: 100 });
  world.ants.state[index] = AntState.ReturningFood;
  const out = makeChunkEvents();
  for (let t = 0; t < 10; t++) thinkChunk(world, 0, 1, out);
  assert.equal(out.deposits.length, 1);
  assert.equal(out.deposits[0].channel, MarkerChannel.ToFood);
});

test("think: a degrading ant erases each new own cell once", () => {
  const { world, index } = makeThinkWorld({ x: 100, y: 100 });
  world.ants.degradeTimer[index] = 3;
  const cell = world.markers.cellIndex({ x: 100, y: 100 });
  world.markers.owner[cell] = 0;
  world.markers.toFood[cell] = 1;
  const out = makeChunkEvents();
  thinkChunk(world, 0, 1, out);
  thinkChunk(world, 0, 1, out);
  assert.equal(out.degrades.length, 1);
  assert.equal(out.degrades[0].cell, cell);
  assert.equal(out.degrades[0].channel, MarkerChannel.ToFood);
});

test("think: contacts fire for food and the ant's own nest only", () => {
  const foodWorld = makeThinkWorld({ x: 100, y: 100 });
  foodWorld.world.food.items.push({ pos: { x: 100, y: 100 }, amount: 500, infinite: false });
  const foodOut = thinkOnce(foodWorld.world);
  assert.equal(foodOut.contacts.some((c) => c.kind === ContactKind.Food && c.target === 0), true);

  const nestWorld = makeThinkWorld({ x: 10, y: 10 });
  const nestOut = thinkOnce(nestWorld.world);
  assert.equal(nestOut.contacts.some((c) => c.kind === ContactKind.Nest && c.target === 0), true);

  const foreignWorld = makeThinkWorld({ x: 50, y: 50 });
  foreignWorld.world.colonies.push(makeColony(1, { x: 50, y: 50 }));
  const foreignOut = thinkOnce(foreignWorld.world);
  assert.equal(foreignOut.contacts.length, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run build`

**Expected:** FAIL — no module `src/sim/tick.js`.

- [ ] **Step 3: Implement `thinkChunk`**

Write it as one loop with private helpers in the same file: `chooseHeading(world, ant): { heading: number; bestFoodSignal: number }` and `depositChannel(state): MarkerChannel | null`. Use `dt = 1 / world.params.simHz`. Keep every write to the ant's own fields and to `out` — nothing else in the world is touched in this phase.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`

**Expected:** `tests 78`, `pass 78`.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/tick.ts tests/sim/test_think.test.ts
git commit -m "feat(sim): think chunk with sensing, steering and trail events"
```

### Task 7: The serial phases and `stepWorld`

**Files:**
- Modify: `src/sim/tick.ts`, `src/sim/world.ts`
- Create: `tests/sim/test_pipeline.test.ts`

**Interfaces:**
- Produces: `resetChunkEvents(world: World): void` — sets `world.chunkEvents.length` to `Math.ceil(ants.size() / chunkSize)`, clearing the three arrays of every existing list and appending fresh `makeChunkEvents()` lists as needed.
- Produces: `applyEvents(world: World, events: readonly ChunkEvents[]): void`, in chunk order:
  - a deposit → `deposit(world.markers, event.cell, event.colony, event.channel, event.strength, world.params)`;
  - a degrade → `degrade(world.markers, event.cell, event.colony, event.channel, world.params.degradeFactor)`;
  - a **Food** contact (`target` = source index): if the ant is `ReturningFood`, only `energy = energyMax`. Otherwise, when `world.food.takeOne(target)`, set `state = ReturningFood`, `mass = params.massCarrying`, `energy = params.energyMax`, `heading = wrapAngle(heading + Math.PI)`, `timeSinceAnchor = 0`, `dropX/dropY = posX/posY`, `timeSinceLastMarker = 0`;
  - a **Nest** contact (`target` = colony id): `ReturningFood` → `foodPool += 1`, `deliveredTotal += 1`, `deliveredLastSample += 1`, `mass = params.mass`, `state = Foraging`; `ReturningExhausted` → `state = Foraging`; every state → `energy = params.energyMax`, `timeSinceAnchor = 0`, and for the two returning states `heading = wrapAngle(heading + Math.PI)`, `dropX/dropY = posX/posY`, `timeSinceLastMarker = 0`.
  - After all chunks: `world.food.removeEmpty()`, then for each colony in array order, while `foodPool >= params.spawnCost && ants.size() < params.maxAntsTotal`: `foodPool -= params.spawnCost` and `spawnAtNest(world, colony)`.
- Produces: `spawnAtNest(world: World, colony: Colony): number` — `uid = world.nextUid++`; `angle = randRange(seed, uid, tick, RandStream.SpawnHeading, -π, π)`; `role = randUnit(seed, uid, tick, RandStream.SpawnRole) < explorerRatio ? Explorer : Follower`; `speed = antSpeed × randRange(seed, uid, tick, RandStream.SpeedJitter, 1 − speedJitter, 1 + speedJitter)`; spawns at `nest + fromAngle(angle) × nestRadius(colony, params)` (radius read before the population grows), heading `angle`, with the colony id; then `colony.population += 1`; returns the new index. `scenarios.ts` uses it in Task 8.
- Produces: `removeDead(world: World): void` — descending index order; when `energy[index] <= 0`, decrement that colony's `population` and `ants.removeSwap(index)`.
- Produces: `updateStats(world: World): void` — when `world.tick % params.simHz === 0`, push each colony's `deliveredLastSample` into its ring buffer and reset it to 0; then set `extinct = population === 0 && foodPool < params.spawnCost`.
- Modifies `stepWorld(world)`: `world.timings = emptyPhaseTimings()`; `world.tick += 1`; then, timing each into its `Phase` slot: `resetChunkEvents`; `thinkChunk` per chunk from `chunk * chunkSize` to `min(begin + chunkSize, ants.size())`; `applyEvents`; `removeDead`; `decayMarkers(markers, markerDecayFactor(params, 1 / params.simHz), params.markerEps)`; `updateStats`; finally `timings.totalMs`. Phases `SpatialHash` and `Collisions` stay 0 in M1. M1 has no wall collisions (M2): ants may leave the world, and markers are only laid inside it.

- [ ] **Step 1: Write the failing tests**

`tests/sim/test_pipeline.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { randRange, randUnit } from "../../src/core/rng.js";
import { fromAngle, type Vec2 } from "../../src/core/vec2.js";
import { makeColony, nestRadius } from "../../src/sim/colony.js";
import { kPhaseCount } from "../../src/sim/phases.js";
import { defaultParams, markerDecayFactor, type SimParams } from "../../src/sim/params.js";
import { AntRole, AntState, RandStream } from "../../src/sim/types.js";
import { makeWorld, stepWorld, type World } from "../../src/sim/world.js";

function makePipelineWorld(nest: Vec2 = { x: 10, y: 10 }): { world: World; params: SimParams } {
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 400;
  params.wanderAngleFollower = 0;
  params.wanderAngleExplorer = 0;
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, nest));
  return { world, params };
}

function spawnAnt(world: World, pos: Vec2, heading = 0): number {
  const index = world.ants.spawn(
    { pos, heading },
    world.nextUid++,
    world.params.antSpeed,
    world.params,
  );
  world.colonies[0].population += 1;
  return index;
}

test("pipeline: stepWorld on an empty world is safe", () => {
  const world = makeWorld(defaultParams(), 1);
  for (let i = 0; i < 10; i++) stepWorld(world);
  assert.equal(world.tick, 10);
  assert.equal(world.ants.size(), 0);
  assert.equal(world.timings.ms.length, kPhaseCount);
  assert.ok(Number.isFinite(world.timings.totalMs));
  assert.ok(Number.isFinite(world.markers.toHome[0]));
});

test("events: a food pickup flips heading, state and mass", () => {
  const { world, params } = makePipelineWorld();
  const index = spawnAnt(world, { x: 100, y: 100 });
  world.ants.energy[index] = 50;
  world.food.items.push({ pos: { x: 100, y: 100 }, amount: 5, infinite: false });
  stepWorld(world);
  assert.equal(world.ants.state[index], AntState.ReturningFood);
  assert.equal(world.ants.mass[index], params.massCarrying);
  assert.equal(world.ants.energy[index], params.energyMax);
  assert.ok(Math.abs(Math.abs(world.ants.heading[index]) - Math.PI) < 1e-5);
  assert.equal(world.ants.timeSinceAnchor[index], 0);
  assert.equal(world.food.items[0].amount, 4);
});

test("events: a carrying ant only refills energy at food", () => {
  const { world } = makePipelineWorld();
  const index = spawnAnt(world, { x: 100, y: 100 });
  world.ants.state[index] = AntState.ReturningFood;
  world.ants.energy[index] = 50;
  world.food.items.push({ pos: { x: 100, y: 100 }, amount: 5, infinite: false });
  stepWorld(world);
  assert.equal(world.ants.state[index], AntState.ReturningFood);
  assert.equal(world.ants.energy[index], world.params.energyMax);
  assert.equal(world.food.items[0].amount, 5);
});

test("events: arriving at the nest delivers food and refills energy", () => {
  const { world, params } = makePipelineWorld();
  const index = spawnAnt(world, { x: 10, y: 10 });
  world.ants.state[index] = AntState.ReturningFood;
  world.ants.energy[index] = 40;
  stepWorld(world);
  const colony = world.colonies[0];
  assert.equal(colony.foodPool, 1);
  assert.equal(colony.deliveredTotal, 1);
  assert.equal(colony.deliveredLastSample, 1);
  assert.equal(world.ants.state[index], AntState.Foraging);
  assert.equal(world.ants.mass[index], params.mass);
  assert.equal(world.ants.energy[index], params.energyMax);
  assert.equal(world.ants.timeSinceAnchor[index], 0);
});

test("events: an exhausted ant that reaches the nest forages again", () => {
  const { world } = makePipelineWorld();
  const index = spawnAnt(world, { x: 10, y: 10 });
  world.ants.state[index] = AntState.ReturningExhausted;
  world.ants.energy[index] = 10;
  stepWorld(world);
  assert.equal(world.ants.state[index], AntState.Foraging);
  assert.equal(world.ants.energy[index], world.params.energyMax);
  assert.equal(world.ants.timeSinceAnchor[index], 0);
});

test("events: a forager touching its own nest refills energy", () => {
  const { world } = makePipelineWorld();
  const index = spawnAnt(world, { x: 10, y: 10 });
  world.ants.energy[index] = 50;
  stepWorld(world);
  assert.equal(world.ants.state[index], AntState.Foraging);
  assert.equal(world.ants.energy[index], world.params.energyMax);
  assert.equal(world.ants.timeSinceAnchor[index], 0);
});

test("events: spawning spends the food pool and appends an ant at the nest edge", () => {
  const { world, params } = makePipelineWorld();
  spawnAnt(world, { x: 300, y: 300 });
  const colony = world.colonies[0];
  colony.foodPool = params.spawnCost;
  const radiusBefore = nestRadius(colony, world.params);
  const uid = world.nextUid;
  stepWorld(world);
  assert.equal(world.ants.size(), 2);
  assert.equal(colony.foodPool, 0);
  assert.equal(colony.population, 2);
  const index = world.ants.indexOf(uid);
  assert.notEqual(index, null);
  const angle = randRange(world.seed, uid, 1, RandStream.SpawnHeading, -Math.PI, Math.PI);
  const expected = {
    x: colony.nest.x + fromAngle(angle).x * radiusBefore,
    y: colony.nest.y + fromAngle(angle).y * radiusBefore,
  };
  assert.ok(Math.abs(world.ants.posX[index!] - expected.x) < 1e-4);
  assert.ok(Math.abs(world.ants.posY[index!] - expected.y) < 1e-4);
  assert.ok(Math.abs(world.ants.heading[index!] - angle) < 1e-4);
  const role =
    randUnit(world.seed, uid, 1, RandStream.SpawnRole) < params.explorerRatio
      ? AntRole.Explorer
      : AntRole.Follower;
  assert.equal(world.ants.role[index!], role);
});

test("events: the last unit goes to the earlier chunk", () => {
  const { world } = makePipelineWorld();
  world.params.chunkSize = 1;
  const first = spawnAnt(world, { x: 100, y: 100 });
  const second = spawnAnt(world, { x: 101, y: 100 });
  world.food.items.push({ pos: { x: 100, y: 100 }, amount: 1, infinite: false });
  stepWorld(world);
  assert.equal(world.ants.state[first], AntState.ReturningFood);
  assert.equal(world.ants.state[second], AntState.Foraging);
  assert.equal(world.food.items.length, 0);
});

test("removals: dead ants are removed and populations fall", () => {
  const { world } = makePipelineWorld();
  const alive = spawnAnt(world, { x: 200, y: 200 });
  const dead = spawnAnt(world, { x: 210, y: 200 });
  const alsoDead = spawnAnt(world, { x: 220, y: 200 });
  world.ants.energy[dead] = 0;
  world.ants.energy[alsoDead] = -1;
  const uid = world.ants.uid[alive];
  stepWorld(world);
  assert.equal(world.ants.size(), 1);
  assert.equal(world.ants.uid[0], uid);
  assert.equal(world.colonies[0].population, 1);
});

test("decay: stepWorld fades markers by the per-tick factor", () => {
  const world = makeWorld(defaultParams(), 1);
  world.markers.owner[5] = 0;
  world.markers.toHome[5] = 1;
  stepWorld(world);
  assert.ok(
    Math.abs(world.markers.toHome[5] - markerDecayFactor(world.params, 1 / 60)) < 1e-6,
  );
});

test("stats: deliveries are sampled once per simulated second", () => {
  const { world, params } = makePipelineWorld();
  const colony = world.colonies[0];
  colony.deliveredLastSample = 7;
  world.tick = params.simHz - 1;
  stepWorld(world);
  assert.equal(colony.deliveredPerSecond.size(), 1);
  assert.equal(colony.deliveredPerSecond.get(0), 7);
  assert.equal(colony.deliveredLastSample, 0);
  for (let i = 0; i < 30; i++) stepWorld(world);
  assert.equal(colony.deliveredPerSecond.size(), 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run build`

**Expected:** FAIL — `resetChunkEvents`/`applyEvents`/`removeDead`/`updateStats`/`spawnAtNest` are not exported; `stepWorld` still only advances the tick.

- [ ] **Step 3: Implement the serial phases and `stepWorld`**

Add `spawnAtNest`, `resetChunkEvents`, `applyEvents`, `removeDead` and `updateStats` to `tick.ts` as listed in Interfaces. Keep `import type { World }` type-only in `tick.ts`; `world.ts` imports the functions, so a value import back would create a real cycle.

`stepWorld` uses this timing shape for each phase:

```ts
const timed = (phase: Phase, run: () => void): void => {
  const watch = stopwatch();
  run();
  world.timings.ms[phase] = watch.elapsedMs();
};
```

Because spawning appends ants, `applyEvents` must finish all chunk lists before the spawn loop. Because removals use swap-and-pop, `removeDead` must walk indices downwards.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`

**Expected:** `tests 89`, `pass 89`.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/tick.ts src/sim/world.ts tests/sim/test_pipeline.test.ts
git commit -m "feat(sim): event application, spawning, removals, stats and stepWorld"
```

---

### Task 8: The sandbox scenario and the world checksum

**Files:**
- Create: `src/sim/scenarios.ts`, `src/sim/checksum.ts`, `tests/sim/test_scenarios_checksum.test.ts`

**Interfaces:**
- Produces: `scenarioNames(): readonly string[]` — `["sandbox"]` in M1.
- Produces: `loadScenario(world: World, name: string): string | null` — returns `unknown scenario: <name>` **before touching the world**; on `"sandbox"`: add colony 0 with its nest at `(400, 540)`, add one finite food source at `(1000, 720)` with `amount = 8000`, then call `spawnAtNest(world, colony)` `world.params.newColonyAnts` (200) times. Uses the default 1920×1080 world. The nest and food are deliberately at different heights, so a vertically mirrored heatmap is obvious in the acceptance screenshot. (The structure doc listed a `seed` argument; the seed lives on `world` and `makeWorld` already took it, so the final signature drops it — Task 13 records this.)
- Produces: `worldChecksum(world: World): number` — `mix32` over, in this order: tick, seed, ant count; per ant in index order `uid`, colony, role, state, posX, posY, heading, speed, energy, mass, timeSinceAnchor, degradeTimer; every marker cell in index order `owner`, `toHome`, `toFood`; per colony in array order `foodPool`, `population`, `deliveredTotal`. Floats are hashed through a single reusable `DataView` (`setFloat32(0, v)` then `getUint32(0)`), so the hash uses the stored Float32 bit pattern.

- [ ] **Step 1: Write the failing tests**

`tests/sim/test_scenarios_checksum.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { worldChecksum } from "../../src/sim/checksum.js";
import { foodRadius } from "../../src/sim/food.js";
import { defaultParams } from "../../src/sim/params.js";
import { loadScenario, scenarioNames } from "../../src/sim/scenarios.js";
import { makeWorld, stepWorld } from "../../src/sim/world.js";

test("scenarios: M1 lists only the sandbox", () => {
  assert.deepEqual(scenarioNames(), ["sandbox"]);
});

test("scenarios: an unknown name is rejected and leaves the world untouched", () => {
  const world = makeWorld(defaultParams(), 3);
  const error = loadScenario(world, "maze");
  assert.match(error ?? "", /unknown scenario/);
  assert.equal(world.tick, 0);
  assert.equal(world.ants.size(), 0);
  assert.equal(world.colonies.length, 0);
  assert.equal(world.food.items.length, 0);
});

test("scenarios: the sandbox places a nest, food and 200 ants", () => {
  const world = makeWorld(defaultParams(), 1);
  assert.equal(loadScenario(world, "sandbox"), null);
  assert.equal(world.colonies.length, 1);
  const colony = world.colonies[0];
  assert.deepEqual(colony.nest, { x: 400, y: 540 });
  assert.equal(colony.population, 200);
  assert.equal(world.ants.size(), 200);
  assert.equal(world.nextUid, 200);
  assert.equal(world.food.items.length, 1);
  const source = world.food.items[0];
  assert.deepEqual(source.pos, { x: 1000, y: 720 });
  assert.equal(source.amount, 8000);
  assert.equal(source.infinite, false);
  assert.equal(foodRadius(source, world.params), 48);
  for (let i = 0; i < world.ants.size(); i++) {
    const dist = Math.hypot(world.ants.posX[i] - 400, world.ants.posY[i] - 540);
    assert.ok(dist <= 26, `ant ${i} is ${dist} u from the nest`);
  }
});

test("checksum: equal worlds hash equally and different seeds differ", () => {
  const a = makeWorld(defaultParams(), 7);
  const b = makeWorld(defaultParams(), 7);
  const c = makeWorld(defaultParams(), 8);
  for (const world of [a, b, c]) assert.equal(loadScenario(world, "sandbox"), null);
  assert.equal(worldChecksum(a), worldChecksum(b));
  assert.notEqual(worldChecksum(a), worldChecksum(c));
});

test("checksum: moving one ant changes the hash", () => {
  const a = makeWorld(defaultParams(), 7);
  const b = makeWorld(defaultParams(), 7);
  loadScenario(a, "sandbox");
  loadScenario(b, "sandbox");
  b.ants.posX[3] += 1;
  assert.notEqual(worldChecksum(a), worldChecksum(b));
});

test("determinism: the same seed reproduces the sandbox after 600 ticks", () => {
  const a = makeWorld(defaultParams(), 7);
  const b = makeWorld(defaultParams(), 7);
  loadScenario(a, "sandbox");
  loadScenario(b, "sandbox");
  for (let i = 0; i < 600; i++) {
    stepWorld(a);
    stepWorld(b);
  }
  assert.equal(worldChecksum(a), worldChecksum(b));
  assert.equal(a.ants.size(), b.ants.size());
});

test("sandbox: a trail forms and food is delivered within 7,200 ticks", { timeout: 120_000 }, () => {
  const world = makeWorld(defaultParams(), 1);
  assert.equal(loadScenario(world, "sandbox"), null);
  for (let i = 0; i < 7200; i++) stepWorld(world);
  const colony = world.colonies[0];
  assert.ok(colony.deliveredTotal >= 5, `delivered ${colony.deliveredTotal}`);
  assert.ok(world.ants.size() >= 100, `ants ${world.ants.size()}`);
  let homeCells = 0;
  let foodCells = 0;
  for (let cell = 0; cell < world.markers.owner.length; cell++) {
    if (world.markers.owner[cell] !== 0) continue;
    if (world.markers.toHome[cell] > 0.02) homeCells++;
    if (world.markers.toFood[cell] > 0.02) foodCells++;
  }
  assert.ok(homeCells >= 20, `to_home cells ${homeCells}`);
  assert.ok(foodCells >= 20, `to_food cells ${foodCells}`);
  for (let i = 0; i < world.ants.size(); i++) {
    assert.ok(Number.isFinite(world.ants.posX[i]));
    assert.ok(Number.isFinite(world.ants.posY[i]));
    assert.ok(Number.isFinite(world.ants.energy[i]));
    assert.ok(Number.isFinite(world.ants.heading[i]));
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run build`

**Expected:** FAIL — no modules `src/sim/scenarios.js` or `src/sim/checksum.js`.

- [ ] **Step 3: Implement**

`scenarios.ts` checks the name first, then builds the sandbox exactly as listed. `checksum.ts` implements the field order and Float32 bit hashing from Interfaces; it must not allocate inside the loops (one `DataView`, created once per call).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`

**Expected:** `tests 96`, `pass 96`. The 7,200-tick test takes a few seconds; if it fails on the delivery or trail counts, the simulation is not forager enough — investigate, do not lower the thresholds.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/scenarios.ts src/sim/checksum.ts tests/sim/test_scenarios_checksum.test.ts
git commit -m "feat(sim): sandbox scenario and world checksum"
```

---

### Task 9: Night theme, view settings, heatmap pixels and texture drawing

**Files:**
- Modify: `src/render/theme.ts`, `src/render/gl_renderer.ts`
- Create: `src/render/view_settings.ts`, `src/render/heatmap.ts`, `tests/render/test_view_settings.test.ts`, `tests/render/test_heatmap.test.ts`, `tests/render/test_night_theme.test.ts`

**Interfaces:**
- Modifies `Theme`: adds `food: Rgba8; heatHome: Rgba8; heatFood: Rgba8`. `sandTheme()` keeps its four existing values and adds `food: rgb(0x6b8f3a)`, `heatHome: rgb(0x3a7be0)`, `heatFood: rgb(0xe04b3a)`.
- Produces: `nightTheme(): Theme` — `outside: rgb(0x05070a)`, `ground: rgb(0x0b0f14)`, `grid: rgb(0x111823)`, `border: rgb(0x1c2733)`, `food: rgb(0x7fe08a)`, `heatHome: rgb(0x2f7dff)`, `heatFood: rgb(0xff8a3d)`.
- Produces in `view_settings.ts`: `enum HeatmapMode { Off, DualChannel, ColonyColor }`; `interface ViewSettings { heatmap: HeatmapMode; showAnts: boolean; showGrid: boolean; showHash: boolean; showColliders: boolean }`; `defaultViewSettings(): ViewSettings` = `{ heatmap: DualChannel, showAnts: true, showGrid: true, showHash: false, showColliders: false }`; `cycleHeatmap(mode): HeatmapMode` = Off → DualChannel → ColonyColor → Off.
- Produces: `fillHeatmapRgba(grid: MarkerGrid, mode: HeatmapMode, theme: Theme, rgbaOut: Uint8Array): void` — for each cell at `(c * 4)`:
  - `Off`, or `owner === kNoOwner` → four zero bytes.
  - `DualChannel` → `r/g/b = Math.round(Math.min(255, heatHome.channel × toHome + heatFood.channel × toFood))`, `a = Math.round(255 × Math.min(toHome + toFood, 1))`.
  - `ColonyColor` → `color = colonyColor(owner)`, `k = Math.min(Math.max(toHome, toFood), 1)`, `r/g/b = Math.round(color.channel × k)`, `a = Math.round(255 × k)`.
- Modifies `GlRenderer`: adds `createTexture(): WebGLTexture | null`, `updateTexture(texture, width, height, rgba: Uint8Array): void`, `drawTexture(texture: WebGLTexture, rect: Rect): void`. The texture program uses a unit quad, a `u_resolution` uniform and a `u_rect` (x, y, width, height in pixels) uniform; sampling is `LINEAR` with `CLAMP_TO_EDGE`; uploads set `UNPACK_FLIP_Y_WEBGL` to `true` (and back to `false`) so row 0 is the top of the screen rect. **Create two VAOs** — one for the geometry batch, one for the unit quad — and bind the matching VAO in `drawBatch`/`drawTexture`, otherwise the texture draw leaves the geometry attribute pointers pointing at the quad buffer.

- [ ] **Step 1: Write the failing tests**

`tests/render/test_view_settings.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  HeatmapMode,
  cycleHeatmap,
  defaultViewSettings,
} from "../../src/render/view_settings.js";

test("view settings: defaults and the heatmap cycle", () => {
  const settings = defaultViewSettings();
  assert.equal(settings.heatmap, HeatmapMode.DualChannel);
  assert.equal(settings.showAnts, true);
  assert.equal(settings.showGrid, true);
  assert.equal(settings.showHash, false);
  assert.equal(settings.showColliders, false);
  assert.equal(cycleHeatmap(HeatmapMode.Off), HeatmapMode.DualChannel);
  assert.equal(cycleHeatmap(HeatmapMode.DualChannel), HeatmapMode.ColonyColor);
  assert.equal(cycleHeatmap(HeatmapMode.ColonyColor), HeatmapMode.Off);
});
```

`tests/render/test_heatmap.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { fillHeatmapRgba } from "../../src/render/heatmap.js";
import { nightTheme } from "../../src/render/theme.js";
import { HeatmapMode } from "../../src/render/view_settings.js";
import { makeMarkerGrid } from "../../src/sim/marker_grid.js";

test("heatmap: Off writes transparent pixels", () => {
  const grid = makeMarkerGrid({ x: 16, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 1;
  const rgbaOut = new Uint8Array(2 * 4);
  fillHeatmapRgba(grid, HeatmapMode.Off, nightTheme(), rgbaOut);
  assert.deepEqual([...rgbaOut], new Array(8).fill(0));
});

test("heatmap: dual-channel adds home blue and food orange by strength", () => {
  const grid = makeMarkerGrid({ x: 8, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 1;
  grid.toFood[0] = 0.5;
  const rgbaOut = new Uint8Array(4);
  fillHeatmapRgba(grid, HeatmapMode.DualChannel, nightTheme(), rgbaOut);
  assert.deepEqual([...rgbaOut], [175, 194, 255, 255]);
});

test("heatmap: empty cells stay clear and ColonyColor uses the owner's colour", () => {
  const grid = makeMarkerGrid({ x: 16, y: 8 }, 8);
  grid.owner[0] = 0;
  grid.toHome[0] = 0.5;
  grid.toFood[0] = 0.25;
  const rgbaOut = new Uint8Array(2 * 4);
  fillHeatmapRgba(grid, HeatmapMode.ColonyColor, nightTheme(), rgbaOut);
  assert.deepEqual([...rgbaOut.subarray(0, 4)], [112, 38, 29, 128]);
  assert.deepEqual([...rgbaOut.subarray(4)], [0, 0, 0, 0]);
});
```

`tests/render/test_night_theme.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { nightTheme, sandTheme } from "../../src/render/theme.js";

test("theme: night is dark and its heat channels point different ways", () => {
  const night = nightTheme();
  assert.equal(night.outside.r, 0x05);
  assert.equal(night.ground.r, 0x0b);
  assert.equal(night.ground.g, 0x0f);
  assert.ok(night.heatHome.b > night.heatHome.r);
  assert.ok(night.heatFood.r > night.heatFood.b);
  assert.ok(night.ground.r < night.food.r);
  const sand = sandTheme();
  assert.equal(sand.ground.r, 0xe8);
  assert.equal(sand.heatHome.b, 0xe0);
  assert.equal(sand.heatFood.r, 0xe0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run build`

**Expected:** FAIL — no `heatmap.js` or `view_settings.js`; `nightTheme` and the new `Theme` fields do not exist.

- [ ] **Step 3: Implement**

`fillHeatmapRgba` visits `0..grid.width * grid.height - 1` once, writing four bytes per cell. `GlRenderer` gains the texture program, the two VAOs and the three methods; `drawTexture` early-returns for an empty rect. No unit test can run WebGL under Node, so the texture path is verified by the Task 12/13 screenshots.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`

**Expected:** `tests 101`, `pass 101`.

- [ ] **Step 5: Commit**

```powershell
git add src/render/theme.ts src/render/view_settings.ts src/render/heatmap.ts src/render/gl_renderer.ts tests/render/test_view_settings.test.ts tests/render/test_heatmap.test.ts tests/render/test_night_theme.test.ts
git commit -m "feat(render): night theme, view settings, heatmap pixels and textures"
```

---

### Task 10: Ants and the world frame

**Files:**
- Create: `src/render/ant_layer.ts`, `src/render/world_view.ts`, `tests/render/test_ant_layer.test.ts`, `tests/render/test_world_view.test.ts`

**Interfaces:**
- Produces: `buildAnts(batch: GeometryBatch, world: World, camera: Camera, alpha: number, theme: Theme): void` — culls to `expanded(camera.visibleWorldRect(), 32)`; for each surviving ant: interpolate `p = lerpVec(prev, pos, alpha)`; `dir = fromAngle(heading)`, `perp = { x: -dir.y, y: dir.x }`; `lengthPx = Math.max(params.antLength × camera.scale(), 1.5)`, `widthPx = lengthPx × 0.45`; add one diamond quad in screen space — nose `p + dir × lengthPx/2`, right `p − perp × widthPx/2`, tail `p − dir × lengthPx/2`, left `p + perp × widthPx/2` — in `colonyColor(ants.colony[i])`. When `ants.mass[i] > params.mass`, add a `theme.food` circle at `p + dir × lengthPx × 0.55` with radius `Math.max(1.2, lengthPx × 0.28)` and 8 segments.
- Produces: `interface WorldRenderCache { heatmapTexture: WebGLTexture | null; heatmapPixels: Uint8Array; ground: GeometryBatch; actors: GeometryBatch }`.
- Produces: `createWorldRenderCache(renderer: GlRenderer, world: World): WorldRenderCache` — pixels sized `markers.width × markers.height × 4`; texture from `renderer.createTexture()` (may be `null`).
- Produces: `buildGround(batch: GeometryBatch, camera: Camera, worldSize: Vec2, theme: Theme, settings: ViewSettings): void` — ground rect, grid lines every 120 u when `settings.showGrid` (1 px, `theme.grid`), world border 2 px `theme.border`.
- Produces: `buildActors(batch: GeometryBatch, world: World, camera: Camera, alpha: number, settings: ViewSettings, theme: Theme): void` — food discs in `theme.food` with `foodRadius(source, params) × scale` (minimum radius 1 px) plus a highlight disc at 40 % radius, 45 % alpha; nest rings in `colonyColor(id)` — a full disc at `nestRadius + 2`, an inner disc in `theme.ground` at `nestRadius`, and a 55 %-radius disc of `colonyColor` at 35 % alpha; then `buildAnts` when `settings.showAnts`.
- Produces: `drawWorld(renderer: GlRenderer, cache: WorldRenderCache, world: World, camera: Camera, settings: ViewSettings, theme: Theme, alpha: number): void` — clear `theme.outside`; build and draw `cache.ground`; when `heatmap !== Off` and the texture exists, `fillHeatmapRgba` into `cache.heatmapPixels`, `updateTexture`, then `drawTexture` over the world's screen rect; build and draw `cache.actors`. Three draw calls at most, never one per ant.

- [ ] **Step 1: Write the failing tests**

`tests/render/test_ant_layer.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { GeometryBatch } from "../../src/render/batch.js";
import { Camera } from "../../src/render/camera.js";
import { buildAnts } from "../../src/render/ant_layer.js";
import { colonyColor, nightTheme } from "../../src/render/theme.js";
import { makeColony } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { makeWorld, type World } from "../../src/sim/world.js";

function makeLayerWorld(): { world: World; camera: Camera } {
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 300;
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 60, y: 60 }));
  world.ants.spawn({ pos: { x: 100, y: 100 } }, 0, world.params.antSpeed, world.params);
  world.ants.spawn({ pos: { x: 120, y: 100 } }, 1, world.params.antSpeed, world.params);
  const camera = new Camera();
  camera.setViewport({ x: 800, y: 600 });
  camera.fit(world.size);
  return { world, camera };
}

test("ants: one body quad per visible ant in its colony colour", () => {
  const { world, camera } = makeLayerWorld();
  const batch = new GeometryBatch();
  buildAnts(batch, world, camera, 0, nightTheme());
  assert.equal(batch.vertexCount(), 8);
  assert.equal(batch.indexCount(), 12);
  const color = colonyColor(0);
  assert.ok(Math.abs(batch.vertexData()[2] - color.r / 255) < 1e-6);
});

test("ants: off-screen ants are culled and a zero viewport stays finite", () => {
  const { world, camera } = makeLayerWorld();
  for (const index of [0, 1]) {
    world.ants.posX[index] = 2000;
    world.ants.prevX[index] = 2000;
    world.ants.posY[index] = 2000;
    world.ants.prevY[index] = 2000;
  }
  const batch = new GeometryBatch();
  buildAnts(batch, world, camera, 0.5, nightTheme());
  assert.equal(batch.indexCount(), 0);
  world.ants.posX[0] = 200;
  world.ants.posY[0] = 150;
  world.ants.prevX[0] = 200;
  world.ants.prevY[0] = 150;
  world.ants.posX[1] = 2000;
  world.ants.posY[1] = 2000;
  const zero = new Camera();
  zero.setViewport({ x: 0, y: 0 });
  zero.fit(world.size);
  buildAnts(batch, world, zero, 0.5, nightTheme());
  assert.ok(batch.vertexCount() > 0);
  for (const value of batch.vertexData()) assert.ok(Number.isFinite(value));
});

test("ants: alpha interpolates between prev and pos without NaN", () => {
  const { world, camera } = makeLayerWorld();
  world.ants.prevX[0] = 100;
  world.ants.posX[0] = 110;
  world.ants.prevY[0] = 100;
  world.ants.posY[0] = 100;
  world.ants.heading[0] = 0;
  world.ants.posX[1] = 2000;
  world.ants.posY[1] = 2000;
  const batch = new GeometryBatch();
  buildAnts(batch, world, camera, 0.5, nightTheme());
  const data = batch.vertexData();
  for (const value of data) assert.ok(Number.isFinite(value));
  const expectedX = camera.worldToScreen({ x: 105, y: 100 }).x;
  let sumX = 0;
  for (let vertex = 0; vertex < 4; vertex++) sumX += data[vertex * 6];
  assert.ok(Math.abs(sumX / 4 - expectedX) < 1e-6);
});
```

`tests/render/test_world_view.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { GeometryBatch } from "../../src/render/batch.js";
import { Camera } from "../../src/render/camera.js";
import { nightTheme } from "../../src/render/theme.js";
import { defaultViewSettings } from "../../src/render/view_settings.js";
import { buildActors } from "../../src/render/world_view.js";
import { makeColony } from "../../src/sim/colony.js";
import { defaultParams } from "../../src/sim/params.js";
import { makeWorld } from "../../src/sim/world.js";

test("world view: an empty world still draws its nests", () => {
  const params = defaultParams();
  params.worldW = 400;
  params.worldH = 300;
  const world = makeWorld(params, 1);
  world.colonies.push(makeColony(0, { x: 200, y: 150 }));
  const camera = new Camera();
  camera.setViewport({ x: 800, y: 600 });
  camera.fit(world.size);
  const batch = new GeometryBatch();
  buildActors(batch, world, camera, 0, defaultViewSettings(), nightTheme());
  assert.ok(batch.indexCount() >= 18);
  assert.ok(batch.vertexCount() > 0);
  for (const value of batch.vertexData()) assert.ok(Number.isFinite(value));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run build`

**Expected:** FAIL — no modules `ant_layer.js` or `world_view.js`.

- [ ] **Step 3: Implement**

`buildAnts` uses `contains`/`expanded` from `core/rect`, `lerpVec`/`fromAngle` from `core/vec2`, and `colonyColor`; it never allocates a `Vec2` per vertex beyond those helpers. `world_view.ts` follows Interfaces; `drawWorld` clears both batches before rebuilding them.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`

**Expected:** `tests 105`, `pass 105`.

- [ ] **Step 5: Commit**

```powershell
git add src/render/ant_layer.ts src/render/world_view.ts tests/render/test_ant_layer.test.ts tests/render/test_world_view.test.ts
git commit -m "feat(render): batched ants and the world frame"
```

---

### Task 11: The control drawer and the dark UI

**Files:**
- Create: `src/ui/param_specs.ts`, `src/ui/shell.ts`, `tests/ui/test_param_specs.test.ts`
- Rewrite: `styles.css`

**Interfaces:**
- Produces in `param_specs.ts`:
  - `type ParamKey = "antSpeed" | "turnRate" | "sensorRadius" | "sensorHalfFovDeg" | "explorerRatio" | "markerHalfLife" | "markerDropDist" | "degradeTime" | "energyBurn" | "spawnCost"`.
  - `type ParamGroup = "movement" | "trails" | "colony"`.
  - `interface ParamSpec { key: ParamKey; label: string; unit: string; min: number; max: number; step: number; scale: number; group: ParamGroup }`.
  - `paramSpecs(): readonly ParamSpec[]` — exactly these ten, in this order:

    | key | label | unit | min | max | step | scale | group |
    |---|---|---|---|---|---|---|---|
    | `antSpeed` | Speed | `u/s` | 10 | 120 | 1 | 1 | movement |
    | `turnRate` | Turn rate | `rad/s` | 1 | 12 | 0.5 | 1 | movement |
    | `sensorRadius` | Sensor range | `u` | 10 | 80 | 1 | 1 | movement |
    | `sensorHalfFovDeg` | Sensor angle | `°` | 20 | 90 | 1 | 1 | movement |
    | `explorerRatio` | Explorers | `%` | 0 | 100 | 1 | 100 | movement |
    | `markerHalfLife` | Trail half-life | `s` | 1 | 30 | 0.1 | 1 | trails |
    | `markerDropDist` | Mark every | `u` | 2 | 24 | 1 | 1 | trails |
    | `degradeTime` | Degrade after | `s` | 0.5 | 10 | 0.5 | 1 | trails |
    | `energyBurn` | Energy burn | `/s` | 0.1 | 5 | 0.1 | 1 | colony |
    | `spawnCost` | Spawn cost | `food` | 1 | 20 | 1 | 1 | colony |

  - `specValue(spec, params): number` = `params[spec.key] × spec.scale` (the value a slider shows).
  - `applySpecValue(spec, params, displayValue): number` — clamps to `[min, max]`, snaps to `min + Math.round((v − min) / step) × step`, stores `v / scale` in `params[spec.key]`, returns the stored value.
  - `formatSpecValue(spec, displayValue): string` — `toFixed(1)` when `spec.step < 1`, otherwise `Math.round`; then ` ${spec.unit}` when the unit is non-empty (`"25 %"`, `"50 u/s"`, `"1.3 /s"`).
- Produces in `shell.ts`:
  - `type SpeedSetting = 1 | 2 | 4 | "max"`.
  - `interface ShellHooks { onPause(): void; onStep(): void; onSpeed(speed: SpeedSetting): void; onHeatmap(): void; onAnts(): void; onGrid(): void; onResetParams(): void; onResetCamera(): void; onParam(key: ParamKey, value: number): void }`.
  - `interface ShellFrame { fps: number; frameMs: number; tick: number; ants: number; delivered: number; paused: boolean; speed: SpeedSetting; heatmap: HeatmapMode; showAnts: boolean; showGrid: boolean; stepsThisFrame: number }`.
  - `class AppShell { constructor(root: HTMLElement, params: SimParams, hooks: ShellHooks); update(frame: ShellFrame): void; setParams(params: SimParams): void; setVisible(visible: boolean): void }`.
- **DOM** (all built in `shell.ts`, appended to `#ui`):

  ```
  div.shell[data-visible=true]
    header.bar
      div.brand > span.pulse + span.brand-name "Ant Colony"
      div.chips > 4 × div.chip > span.chip-label + span.chip-value[data-stat=tick|ants|delivered|fps]
      div.bar-actions
        button.btn[data-action=pause][aria-pressed] "Pause"
        button.btn[data-action=step] "Step"
        div.segmented > 4 × button[data-speed=1|2|4|max] "1×" "2×" "4×" "Max"
        button.btn[data-action=heatmap][aria-pressed] "Trails"
        button.btn[data-action=drawer][aria-expanded] "Menu"
    aside.drawer[data-open=true]
      section.section[data-group=movement|trails|colony][data-open=true]
        button.section-head[aria-expanded] > span + span.chevron
        div.section-body > div.section-inner > one label.slider-row per spec in that group
      section.section[data-open=true] "Overlays"
        div.row > span.row-label "Ants" + button.switch[data-switch=ants][role=switch][aria-checked] > span.thumb
        div.row > span.row-label "Grid" + button.switch[data-switch=grid] …
        button.btn.btn-wide[data-action=camera] "Fit world"
      section.section[data-open=false] "Shortcuts"
        div.keys — the key legend from Task 13's list (P, Space, H, M, A, G, S, Home, Drag, Wheel)
      button.btn.btn-wide.btn-reset[data-action=reset-params] "Reset parameters"
  ```

  Each `label.slider-row` is `div.slider-head > span.slider-label (spec.label) + span.slider-value[data-value=key]`, then `input.slider[type=range][data-param=key]` with `min`, `max`, `step` from the spec and `value = specValue(...)`.
- **Behaviour:**
  - `update` writes the four chip values (`fps` rounded, others integer; set the FPS chip's `title` to `frameMs.toFixed(1) + " ms"` and the Tick chip's to `${stepsThisFrame} steps/frame`), the pause label (`Pause`/`Resume`) and `aria-pressed`, the Step button's `disabled = !paused`, the speed buttons' `aria-pressed`, the heatmap button's label (`Trails` / `Colony` / `Off`) and pressed state, and both switches' `aria-checked`. Text nodes are only rewritten when the string changed.
  - Slider refresh (constructor and `setParams`) writes `input.value`, `--fill` (percentage of `value` across `[min, max]`) and the readout. Refresh skips a slider that is `document.activeElement`, so dragging is never fought by a frame.
  - A slider `input` event applies `applySpecValue`, updates its readout and `--fill`, and calls `hooks.onParam(spec.key, stored)`.
  - The drawer button toggles `drawer.dataset.open` and `aria-expanded`; each section head toggles its own section.
  - `onResetParams` buttons run `hooks.onResetParams()` and then `setParams(this.params)` (the app mutates `world.params` in place, so the reference stays live).
  - `setVisible(false)` sets `shell.dataset.visible = "false"`; `true` restores it.
- **CSS contract** (rewrite `styles.css` in full; the palette and motion are binding, not suggestions). Tokens:

  ```css
  :root {
    --bg-0: #05070a; --bg-1: #0a0e14;
    --glass: rgba(13, 18, 26, 0.72);
    --stroke: rgba(255, 255, 255, 0.08);
    --text: #e8eef7; --muted: #8b98ab;
    --accent: #ffb347; --accent-2: #5b9dff; --danger: #ff6b6b;
    --radius: 14px;
    --shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
    --ease: cubic-bezier(0.22, 0.61, 0.36, 1);
    --fast: 160ms; --slow: 320ms;
  }
  ```

  - Reset `box-sizing: border-box`; `html, body` fill the window, `overflow: hidden`, background `var(--bg-0)`, colour `var(--text)`; font stack `"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`; chip values and slider readouts use `font-variant-numeric: tabular-nums`.
  - `#view` fixed, inset 0, 100 % × 100 %. `#ui` fixed, inset 0, `pointer-events: none`, `z-index: 10`; `.bar` and `.drawer` set `pointer-events: auto`.
  - `.bar`: fixed top 16, left 16, right 16, height 60, flex, align centre, gap 18, padding 0 14 0 18, `background: var(--glass)`, `backdrop-filter: blur(18px) saturate(140%)` (and the `-webkit-` twin), 1 px `var(--stroke)`, `border-radius: var(--radius)`, `box-shadow: var(--shadow)`.
  - `.pulse`: 8 px circle, `background: var(--accent)`, `box-shadow: 0 0 16px var(--accent)`, `@keyframes pulse` scaling 1 → 1.35 and fading 1 → 0.55 over 2.4 s ease-in-out infinite. `.brand-name`: 12 px, weight 650, `letter-spacing: 0.22em`, uppercase.
  - `.chips`: flex, gap 8, `margin-left: auto`. `.chip`: flex column, gap 1, min-width 62, padding 6 10, `border-radius: 10px`, `background: rgba(255,255,255,0.03)`, 1 px `var(--stroke)`; label 9 px, 600, `letter-spacing: 0.14em`, uppercase, `var(--muted)`; value 13 px, 650.
  - `.bar-actions`: flex, align centre, gap 10.
  - `.btn`: height 32, padding 0 12, `border-radius: 10px`, `background: rgba(255,255,255,0.04)`, 1 px `var(--stroke)`, `color: var(--text)`, 12 px, 650, `cursor: pointer`, transition `background var(--fast) var(--ease), border-color var(--fast) var(--ease), transform var(--fast) var(--ease)`; hover `rgba(255,255,255,0.09)` background and `rgba(255,255,255,0.16)` border; `:active` `scale(0.97)`; `:disabled` `opacity: 0.4`, `cursor: default`. `[aria-pressed="true"]`: `background: rgba(255,179,71,0.16)`, `border-color: rgba(255,179,71,0.5)`, `color: var(--accent)`. `.btn-wide`: width 100 %, margin-top 10. `.btn-reset`: margin-top 2, and `color: var(--danger)` with a `rgba(255,107,107,0.4)` border on hover.
  - `.segmented`: inline-flex, gap 2, padding 3, `border-radius: 12px`, `background: rgba(0,0,0,0.35)`, 1 px `var(--stroke)`. Its buttons: height 26, padding 0 9, radius 10, transparent, `var(--muted)`, 11 px, 700, transition `background var(--fast), color var(--fast)`; `[aria-pressed="true"]`: `background: rgba(91,157,255,0.18)`, `color: var(--accent-2)`, `box-shadow: inset 0 0 0 1px rgba(91,157,255,0.45)`.
  - `.switch`: 38 × 22, radius 999, `background: rgba(255,255,255,0.08)`, 1 px `var(--stroke)`, padding 0, cursor pointer, transition `background var(--fast) var(--ease), box-shadow var(--fast) var(--ease)`; `.thumb`: 18 px circle, white, `transform: translateX(0)`, transition `transform var(--fast) var(--ease)`. `[aria-checked="true"]`: track `background: var(--accent)`, `border-color: transparent`, glow `0 0 14px rgba(255,179,71,0.45)`, thumb `translateX(16px)`.
  - `.drawer`: fixed top 92, right 16, bottom 16, width 340, flex column, gap 12, `overflow-y: auto`, `padding-right: 4`, transition `transform var(--slow) var(--ease), opacity var(--fast) var(--ease)`; `[data-open="false"]`: `transform: translateX(calc(100% + 32px))`, `opacity: 0`, `pointer-events: none`. Scrollbar: `scrollbar-width: thin`, `scrollbar-color: rgba(255,255,255,0.18) transparent`; `::-webkit-scrollbar` 8 px with a rounded translucent thumb and no track.
  - `.section`: `background: var(--glass)`, `backdrop-filter` as the bar, 1 px `var(--stroke)`, `border-radius: var(--radius)`, `overflow: hidden`, `box-shadow: 0 16px 40px rgba(0,0,0,0.4)`.
  - `.section-head`: full width, height 44, padding 0 14, flex, space-between, align centre, transparent, no border, `color: var(--text)`, 11 px, 700, `letter-spacing: 0.14em`, uppercase, cursor pointer; hover `rgba(255,255,255,0.03)`.
  - `.chevron`: 7 × 7, border-right and border-bottom 1.5 px `var(--muted)`, `transform: rotate(45deg)`, transition `transform var(--fast) var(--ease)`; `[aria-expanded="false"] .chevron` rotates to −45°.
  - `.section-body`: `display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--slow) var(--ease)`; `[data-open="true"] > .section-body`: `1fr`. `.section-inner`: `overflow: hidden`, `padding: 0 14px 14px`; `min-height: 0`.
  - `.slider-row`: block, padding 10 0 2; `.slider-head`: flex, space-between, margin-bottom 6; `.slider-label` 12 px `var(--muted)`; `.slider-value` 12 px, 650.
  - `.slider`: `appearance: none`, width 100 %, height 18, transparent background, cursor pointer. WebKit track: height 4, radius 999, `linear-gradient(to right, var(--accent) 0%, var(--accent) var(--fill), rgba(255,255,255,0.10) var(--fill), rgba(255,255,255,0.10) 100%)`; WebKit thumb: 16 px, `margin-top: -6px`, white, `border: 3px solid var(--accent)`, `transition: transform var(--fast) var(--ease), box-shadow var(--fast)`; hover `scale(1.15)` with `box-shadow: 0 0 0 4px rgba(255,179,71,0.18)`; active `scale(1.05)`. Provide the `::-moz-range-track` / `::-moz-range-thumb` equivalents.
  - `.row`: flex, space-between, align centre, padding 8 0; `.row-label` 12 px `var(--muted)`.
  - `.keys`: grid `auto 1fr`, gap 6 10, 11 px, `var(--muted)`; `.key`: 10 px, 600, padding 3 6, radius 6, 1 px `var(--stroke)`, `color: var(--text)`, `background: rgba(255,255,255,0.04)`, `justify-self: start`.
  - Focus: `:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px }` on buttons, switches and sliders; never remove focus styling without that ring.
  - Zen: `.shell[data-visible="false"] .bar { opacity: 0; transform: translateY(-14px); pointer-events: none }` and `.shell[data-visible="false"] .drawer { opacity: 0; transform: translateX(calc(100% + 32px)); pointer-events: none }`; the bar's opacity/transform transition is `var(--slow) var(--ease)`.
  - `@media (prefers-reduced-motion: reduce)`: every transition and animation collapses to `1ms` with `animation-iteration-count: 1`; no element may still slide or pulse.
  - `#log`: fixed left 16, bottom 16, max-width 46ch, 12 px/1.5 Consolas monospace, `#9fb0c4`, glass background, 1 px `var(--stroke)`, radius 10, padding 8 10, `white-space: pre-wrap`; `#log:empty { display: none }`.
  - `body.headless #ui, body.headless #log { display: none }` stays exactly as it is.
  - `@media (max-width: 720px)`: `.bar` wraps (`flex-wrap: wrap`, height auto, min-height 56, padding 10 12, gap 10), `.brand-name` and `.chip-label` hide, `.drawer` becomes `left: 16px; right: 16px; width: auto; top: auto; max-height: 58vh`.
  - The old `.panel` rules are removed on purpose: the interactive page stops using `DebugPanel` in Task 12. `src/ui/debug_panel.ts` itself stays on disk until M5.

- [ ] **Step 1: Write the failing tests**

`tests/ui/test_param_specs.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { defaultParams } from "../../src/sim/params.js";
import { loadScenario } from "../../src/sim/scenarios.js";
import { makeWorld, stepWorld, type World } from "../../src/sim/world.js";
import {
  applySpecValue,
  formatSpecValue,
  paramSpecs,
  specValue,
} from "../../src/ui/param_specs.js";

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

function assertFiniteWorld(world: World): void {
  assert.ok(Number.isFinite(world.timings.totalMs));
  for (let i = 0; i < world.ants.size(); i++) {
    for (const value of [
      world.ants.posX[i],
      world.ants.posY[i],
      world.ants.heading[i],
      world.ants.energy[i],
      world.ants.mass[i],
    ]) {
      assert.ok(Number.isFinite(value), `ant ${i}`);
    }
  }
}

test("param specs: ten unique controls with valid ranges and defaults", () => {
  const specs = paramSpecs();
  assert.equal(specs.length, 10);
  assert.equal(new Set(specs.map((spec) => spec.key)).size, 10);
  const defaults = defaultParams();
  for (const spec of specs) {
    assert.ok(["movement", "trails", "colony"].includes(spec.group), spec.key);
    assert.ok(spec.min < spec.max, spec.key);
    assert.ok(spec.step > 0, spec.key);
    assert.ok(spec.scale > 0, spec.key);
    const display = specValue(spec, defaults);
    assert.ok(display >= spec.min && display <= spec.max, spec.key);
    const params = { ...defaults };
    const stored = applySpecValue(spec, params, display);
    assert.ok(Math.abs(stored - defaults[spec.key]) < 1e-5, spec.key);
  }
});

test("param specs: explorer ratio is edited as a percentage", () => {
  const spec = paramSpecs().find((candidate) => candidate.key === "explorerRatio");
  assert.ok(spec);
  const params = defaultParams();
  assert.equal(specValue(spec, params), 10);
  assert.equal(applySpecValue(spec, params, 0), 0);
  assert.equal(params.explorerRatio, 0);
  assert.equal(formatSpecValue(spec, 25), "25 %");
});

test("param specs: values clamp and snap to the step", () => {
  const spec = paramSpecs().find((candidate) => candidate.key === "energyBurn");
  assert.ok(spec);
  const params = defaultParams();
  near(applySpecValue(spec, params, 99), 5);
  near(applySpecValue(spec, params, -3), 0.1);
  near(applySpecValue(spec, params, 1.26), 1.3);
  near(params.energyBurn, 1.3);
});

test("every extreme still steps the sandbox without NaN", () => {
  const world = makeWorld(defaultParams(), 1);
  assert.equal(loadScenario(world, "sandbox"), null);
  const specs = paramSpecs();
  for (const spec of specs) applySpecValue(spec, world.params, spec.min);
  for (let i = 0; i < 300; i++) stepWorld(world);
  assertFiniteWorld(world);
  for (const spec of specs) applySpecValue(spec, world.params, spec.max);
  for (let i = 0; i < 300; i++) stepWorld(world);
  assertFiniteWorld(world);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run build`

**Expected:** FAIL — no module `src/ui/param_specs.js`.

- [ ] **Step 3: Implement the specs, the shell and the stylesheet**

Build `param_specs.ts` from the table. `applySpecValue` clamps before snapping and stores the unscaled value; `formatSpecValue` handles an empty unit without a trailing space. Build `AppShell` to the DOM and behaviour lists above: query nothing from `index.html` except the `#ui` root passed in, and create every node with `document.createElement`. Then rewrite `styles.css` against the CSS contract — every listed value is required; a default browser control anywhere in the drawer means the task is not done.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`

**Expected:** `tests 109`, `pass 109`.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/param_specs.ts src/ui/shell.ts tests/ui/test_param_specs.test.ts styles.css
git commit -m "feat(ui): dark control drawer, parameter specs and themed stylesheet" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 12: Wire the app to the world, the shell and the scenario

**Files:**
- Modify: `src/app/interactive.ts`, `src/app/headless.ts`, `src/app/bench.ts`

**Interfaces:**
- Consumes: `loadScenario`; `nightTheme`; `defaultViewSettings`, `cycleHeatmap`, `HeatmapMode`; `createWorldRenderCache`, `drawWorld`; `AppShell`, `SpeedSetting`, `ShellHooks`, `ShellFrame`; `defaultParams`.
- Produces: `runInteractive(options, canvas, uiRoot, log): void` — same signature as M0.
- Produces: `runHeadless(options, canvas, log): number` — same signature as M0.
- Produces: `runBench(options): number` — same signature; returns 1 on an unknown scenario.

- [ ] **Step 1: Wire `src/app/interactive.ts`**

Replace the test pattern and `DebugPanel` with the simulation world and the shell:
1. After the renderer exists: `const world = makeWorld(defaultParams(), options.seed)`; `const scenarioError = loadScenario(world, options.scenario)`; when non-null, `log(\`error: ${scenarioError}\`)`, `log("falling back to sandbox")`, `loadScenario(world, "sandbox")`.
2. `const theme = nightTheme()`, `const settings = defaultViewSettings()`, `const cache = createWorldRenderCache(renderer, world)`, then the hook object from item 4, then `const shell = new AppShell(uiRoot, world.params, hooks)`.
3. State: `paused = false`, `zen = false`, `speed: SpeedSetting = 1`, `stepRequests = 0`; `speedSteps(speed) = speed === "max" ? 1000 : speed`.
4. Hooks: pause toggles `paused`; step adds one request; speed sets `speed`; heatmap sets `settings.heatmap = cycleHeatmap(settings.heatmap)`; ants and grid flip their `settings` flags; reset params does `Object.assign(world.params, defaultParams())`; reset camera does `camera.fit(world.size)`; `onParam(key, value)` assigns `world.params[key] = value`.
5. Keys: `P` pause, `Space` one step while paused, `H` zen (`zen = !zen; shell.setVisible(!zen)`), `M` heatmap, `A` ants, `G` grid, `S` speed `"max"`, `Home` fit world. Keep the existing wheel/pointer handlers.
6. Frame: advance the clock with `clock.advance(frameSeconds, paused ? 0 : speedSteps(speed))`, add `stepRequests` and reset it to 0, call `stepWorld` per step, then `drawWorld(renderer, cache, world, camera, settings, theme, paused ? 1 : clock.alpha())`, `renderer.present()`, and `shell.update(frame)` with the `ShellFrame` fields (`delivered` is the sum of `colony.deliveredTotal`).
7. Delete the M0 `buildTestPattern` call, the `GeometryBatch`, the `panel` and `simSeconds` locals that are now unused.

- [ ] **Step 2: Wire `src/app/headless.ts`**

Load the scenario (on error: `log(\`error: ${error}\`)`, return 1), keep `renderer.setBackingSize`, `camera.setViewport`, `camera.fit`, step `effectiveTicks(options)`, then `drawWorld(renderer, cache, world, camera, settings, nightTheme(), 1)`, `renderer.present()`. Create the cache after the world and the renderer. Keep the `headless` body class, the log lines, the document title and `__antsimReady`.

- [ ] **Step 3: Wire `src/app/bench.ts`**

After `makeWorld`: `const scenarioError = loadScenario(world, options.scenario)`; on error write `${scenarioError}\n` to `process.stderr` and return 1. Keep the 60-tick warmup. Accumulate `antTicks += world.ants.size()` after each timed `stepWorld`, and report `ants: world.ants.size()` and `antUpdatesPerSec: seconds > 0 ? antTicks / seconds : 0`. `threads: 1` stays.

- [ ] **Step 4: Run the tests**

Run: `npm test`

**Expected:** `tests 109`, `pass 109` (no new tests; the wire-up must not break any).

- [ ] **Step 5: Prove the world renders before the task closes**

```powershell
npm run screenshot -- --ticks 600 --size 960x540 --out captures\m1-smoke.png
```

Read `captures\m1-smoke.png` with the Read tool. **Expected:** a dark ground, a nest disc at about (400, 540) in world space, a green food disc at (1000, 720) below and to the right of it, ants between them, and a faint bluish home trail near the nest (the orange food trail appears only after the first delivery). A blank frame, the old M0 test pattern, or the sand palette means the wiring is wrong.

- [ ] **Step 6: Commit**

```powershell
git add src/app/interactive.ts src/app/headless.ts src/app/bench.ts
git commit -m "feat(app): run the sandbox with the night view, control drawer and bench" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 13: Docs, acceptance and the M1 sign-off

**Files:**
- Modify: `docs/superpowers/specs/2026-10-25-ant-simulator-structure.md`, `docs/superpowers/specs/2026-10-25-ant-simulator-design.md`, `CLAUDE.md`

- [ ] **Step 1: Finalize the structure doc**

Update these entries to the code that now exists:
- `loadScenario(world, name)` — two arguments; the seed comes from `world.seed`.
- New sim exports: `spawnAtNest`, `resetChunkEvents`, `applyEvents`, `removeDead`, `updateStats`, `addFoodSource`, `Colony.deliveredLastSample`, `worldChecksum`, `scenarioNames`.
- `Theme` gains `food`, `heatHome`, `heatFood`; add `nightTheme`.
- `render/view_settings.ts`: `HeatmapMode`, `ViewSettings`, `defaultViewSettings`, `cycleHeatmap`. `render/heatmap.ts`: `fillHeatmapRgba`.
- `GlRenderer` gains `createTexture`, `updateTexture`, `drawTexture` and its two VAOs.
- `render/ant_layer.ts` (`buildAnts`) and `render/world_view.ts` (`WorldRenderCache`, `createWorldRenderCache`, `buildGround`, `buildActors`, `drawWorld`).
- `ui/param_specs.ts` (`ParamKey`, `ParamGroup`, `ParamSpec`, `paramSpecs`, `specValue`, `applySpecValue`, `formatSpecValue`) and `ui/shell.ts` (`SpeedSetting`, `ShellHooks`, `ShellFrame`, `AppShell`).
- Remove `render/sprites.ts` / `createAntSprite` from the M1 row and note they move to M5.
- Note that `DebugPanel` is kept but no longer used by the interactive mode.
- Fix the known M0 mismatches while there: the stopwatch export (it is `stopwatch()`, not a `Stopwatch` class) and the `runInteractive`/`runHeadless` return types (void and number). Mark the M1 row done.

- [ ] **Step 2: Finalize the design doc**

- §9: the control drawer (top bar, sections, sliders, toggles, speed control) ships in M1, not M5.
- §7: the app's default theme is Night (dark); Sand remains available in code. Record it in §16 as a decision dated 2026-10-25, together with the user's request for a high-end dark UI.
- §15: tick the M1 acceptance row.

- [ ] **Step 3: Update `CLAUDE.md`**

Set the Status line to: M1 (core foraging + control UI) complete 2026-10-25, 109 tests, bench and screenshots run; current milestone M2, not started.

- [ ] **Step 4: Run the full acceptance**

```powershell
npm test
npm run bench -- --scenario sandbox --ticks 1200
npm run screenshot -- --ticks 7200 --size 1920x1080 --out captures\m1-trail.png
npm run screenshot -- --interactive --ticks 30 --size 1920x1080 --out captures\m1-ui.png
```

**Expected:** `tests 109`, `pass 109`; the bench prints 12 lines with `ants=200` (or more, if the colony spawned) and a non-zero `ant_updates_per_sec`; both screenshots succeed at their exact sizes. Record the bench's `ticks_per_sec` and `ant_updates_per_sec` in the final report, and state that the laptop was plugged in (the numbers do not count otherwise).

- [ ] **Step 5: Judge both screenshots by eye**

Read `captures\m1-trail.png`. It must show the dark ground, the nest at (400, 540) with ants around it, a visible diagonal trail running down-right to the food at (1000, 720), the green food disc, and the ant stream. The glow must sit under the ants along the whole diagonal — a mirrored glow means the heatmap texture is flipped vertically. If the trail is missing, the ants are invisible, or the frame is blank, the milestone is not done.

Read `captures\m1-ui.png`. It must show the glass top bar (brand, four chips, pause/step, speed pills, heatmap button, menu), the open 340 px drawer with the Movement/Trails/Colony sections and sliders with accent-filled tracks, the switches, and no default browser widgets. Then hand the checklist in Step 6 to the user for the interactive pass.

- [ ] **Step 6: Interactive checklist (human, in Chrome)**

Run `npm run serve`, open `http://127.0.0.1:8080/` and confirm:
- dragging each of the ten sliders changes the simulation live and the readout tracks the thumb;
- each section opens and closes with the row animation, the drawer opens and closes, and the zen key fades the whole UI;
- pause/step/speed/heatmap/ants/grid all behave, and every key in the legend works;
- nothing looks like a default `<input>`; reduced-motion (Windows animation settings off) removes the motion.

- [ ] **Step 7: Commit**

```powershell
git add docs/superpowers/specs/2026-10-25-ant-simulator-structure.md docs/superpowers/specs/2026-10-25-ant-simulator-design.md CLAUDE.md
git commit -m "docs: finalize M1 signatures, decisions and status" -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Done means

`npm test` is 109/109; the sandbox screenshot shows a dark colony and a glowing two-channel trail by eye; the bench numbers are recorded and the laptop was plugged in; the UI screenshot shows the dark drawer with no default widgets; the structure doc matches every public name; and `CLAUDE.md` says M1 is complete. Stop there — M2 (walls, obstacles, stuck detection, spatial hash) is a separate plan.



