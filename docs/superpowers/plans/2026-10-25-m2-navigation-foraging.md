# M2: Navigation and Foraging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ants flow around rocks instead of pinning on them, and colonies far from food still build trails and deliver.

**Scope:** Fix-pack Part 0 and Global constraints; Tasks 1-9 (wander, wall sliding, look-ahead steering, stuck detection, spawn safety, reach harness, retuned defaults, homing memory, per-colony trail layers); a new maze-and-breach task; a docs task. The fix pack's Tasks 10-14 (camera and looks) are the separate M1.6 plan.

**Tech Stack:** TypeScript 5.9.3, WebGL2, Node 24 `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-25-ant-simulator-design.md` is the source of truth for behaviour; `docs/superpowers/specs/2026-10-25-ant-simulator-structure.md` is the source of truth for files and names. A plan never overrides the spec.

**Numbering:** Tasks 1-9 keep the fix pack's numbers. The new maze task is Task 9b; the docs task is Task 15. Tasks 10-14 live in the M1.6 plan.

---

## Part 0: Findings

The line numbers below are from commit `2da57ce`.

### Issue 1: ants stuck on rocks
1. **Nothing steers ants around obstacles.** `chooseHeading` (`tick.ts` ~23–38) keeps the current heading when no markers are found. `resolveObstacles` (`collide.ts`) pushes an ant back out of a rock, but **never changes its heading**. So the ant walks into the same wall again every tick and stays pinned. `clampToWorld` (`tick.ts` ~239) does the same at the map edges.
2. **Wander is about 10× weaker than designed.** `if (updateWander(...)) desired += wanderOffset` (`tick.ts` ~64) adds the offset only on the one tick a new offset is picked (about every 0.4 s). That turn is then capped by `turnRate × dt` = 0.1 rad. A pinned ant therefore rotates away only very slowly. It also means explorers behave like followers.
3. **Stuck detection is missing.** `stuckTimeout`, `degradeTimer` and `RandStream.StuckTurn` exist but are never used, so dead-end trails never get erased (`degradeTimer` is never set).
4. **Ants can freeze inside obstacles.** `speedFactorAt` returns 0 inside rock or water (`obstacles.ts` ~90), so an ant whose centre ends up inside a solid cell can't move. `resolveObstacles` only tests *border* cells, so an ant deeper inside is never pushed out. `spawnAtNest` (`tick.ts` ~125) never checks for obstacles, and the spawn ring grows with population, so a nest beside a rock can spawn ants into it.

### Issue 2: a distant colony never builds a trail
1. **Trails are too short-lived for long trips.**
   - Deposits weaken by `exp(−0.11 × t)`, where t is seconds since the ant last touched its nest or food (`params.ts`: `emissionDecay: 0.11`). After 60 s, a deposit is 0.0013. Sensing ignores anything below `markerDetectMin` = 0.001, so after about 63 s an ant's trail is effectively invisible.
   - Trails also halve every 7.7 s.
   - Together these give a working foraging radius of roughly 30–45 s of walking. Wandering paths are 2–3× longer than the straight line, so in practice that's only a few hundred world units from the nest.
2. **Lost carriers never find home.** An ant carrying food with no to-home trail in range keeps its heading (`tick.ts` ~35). Direct sight of the nest only works within 32 u. Most carriers wander until they die (100 s of energy).
3. **The shared trail grid lets the first colony monopolise food.** Each cell has one owner (`marker_grid.ts` `deposit`). Sensing reads only cells your own colony owns (`sensing.ts` ~103).
   - Once colony A's busy highway owns the cells around a food source, colony B can't deposit there. With the territory rule off, its deposit is simply skipped. With it on, A's next pass undoes B's erosion.
   - B's ants also can't sense anything in that area.
   - So a colony that arrives second can never build a trail to shared food. This matches "the far colony never made a path to either food".
4. **The heatmap squares faint trails away.** `fillHeatmapRgba` multiplies the colour by the intensity *and* sets the alpha from the intensity (`heatmap.ts` ~35–42), so a trail at 0.1 shows at about 1% opacity. Weak trails that do exist look like no trail at all.

### Issue 3: the camera
- **The touchpad can only zoom.** The wheel handler (`controller.ts` `onWheel`) always zooms at the cursor. On a laptop touchpad, two-finger scroll *and* pinch both arrive as wheel events, so both zoom.
- **Panning is awkward.** It works only with middle or right mouse drag (`onPointerDown`: `button !== 1 && button !== 2`), which is hard on a touchpad. Left-drag does nothing in Run mode.
- **No touch, keyboard panning or bounds.** There's no touch support, no keyboard panning, and nothing stops the world from being dragged off-screen.

### Issue 4: looks
- **Terrain is low-resolution.** It's baked once with Canvas2D at at most 0.5 texels per world unit (`terrain_texture.ts`) and stretched over the world. At normal zoom it's upscaled 3×, and at full zoom up to 32×, so it looks blurry.
- **Obstacles have no depth or edges.** Rocks are drawn as one flat disc per 4 u cell: no shading, no shadow, soft edges. Water is a flat colour.
- **Rocks barely show.** Themes are very dark: the meadow ground is `#0b100d` and rocks are `#2c3034`, so the two hardly contrast.

### Other risks found
| # | Severity | Where | Problem | Task |
|---|---|---|---|---|
| R1 | High | `steering.ts`, `tick.ts` | wander applied for one tick only | 1 |
| R2 | High | `collide.ts`, `clampToWorld` | heading unchanged after a wall push, so ants pin | 2 |
| R3 | High | `tick.ts` | stuck detection and degrading never run | 4 |
| R4 | High | `params.ts` | trail and energy settings limit range to a few hundred u | 6–7 |
| R5 | High | `marker_grid.ts` | single owner per cell lets one colony monopolise food | 9 |
| R6 | Medium | `tick.ts` | lost carriers have no way home | 8 |
| R7 | Medium | `tick.ts` spawn, `speedFactorAt` | ants spawn or freeze inside rock and water | 5 |
| R8 | Medium | `heatmap.ts` | faint trails invisible because intensity is applied twice | M1.6 Task 11 |
| R9 | Low | `sensing.ts` | explorer samples only at ±60°, never straight ahead, so explorers zig-zag across trails | 3 (adds a 0° sample) |
| R10 | Low | `camera.ts` | no bounds; minimum scale is absolute (0.05), not relative to fit | M1.6 Task 10 |
| R11 | Low (perf) | `collide.ts` | every ant checks 9 cells twice per tick, even far from obstacles | 2 (early-out) |
| R12 | Info | territory rule | colonies whose routes cross erase each other's trails at the crossing, by design | 9 |

### Quick things you can try before any code changes
- **For far colonies:** open Settings, set **Trail half-life** to 25 s and **Energy burn** to 0.5/s. This helps partly. The steep emission decay (R4) still needs Task 7.
- **To pan today:** drag with the **right or middle mouse button**.

---

## Global constraints (from CLAUDE.md)
- **No native binaries.** TypeScript 5.9.3 and `@types/node` only. Build with `npm run build`, test with `npm test`.
- **`src/core` and `src/sim` never touch the DOM, WebGL or Chrome APIs.**
- **Ant data stays Structure-of-Arrays.** Every new per-ant field is added to `spawn`, `removeSwap`, `ensureCapacity` and `checksum`.
- **All randomness** comes from `randU32`/`randRange(seed, uid, tick, stream)`. New streams are added to `RandStream`.
- **Determinism is kept.** Same seed gives the same checksum. The existing determinism tests must still pass.
- **Batched drawing:** one buffer and one draw per layer. The UI stays DOM.
- **Performance budget:** after every task, `npm run bench -- --preset meadow --ticks 1200` (plugged in) must stay within +25% of the 0.385 ms average step baseline. Note any regression in the commit message.

## Part 1: Navigation (issue 1)

### Task 1: Make the wander offset persist
**Files:** `src/sim/tick.ts`, `src/sim/steering.ts`; test `tests/sim/test_steering.test.ts`.

**Change:**
- Call `updateWander(world, ant, dt)` every tick and **always** add `ants.wanderOffset[ant]` to `desired`. The offset holds until the next pick, which is what spec §5.4 means.
- **Exception:** skip the wander offset when the heading came from `directSightHeading`, so ants don't miss food or the nest in the last metres. `chooseHeading` returns a `fromSight: boolean`.

**Tests:**
- `wander: explorers turn more than followers`. Blank 6000×6000 world, 200 explorers and 200 followers at the centre, no markers, 300 ticks. Mean absolute heading change per second is at least 3× higher for explorers, and above 0.05 rad/s for followers.
- `wander: no offset while the target is in direct sight`. An ant 20 u from food, facing it, reaches it within 40 ticks with its heading staying within 0.05 rad of the direct bearing.

**Commit:** `fix(sim): wander offset persists between picks`

### Task 2: Slide along walls and map edges
**Files:** `src/sim/collide.ts`, `src/sim/tick.ts` (`clampToWorld`); test `tests/sim/test_collide.test.ts`.

**Change:**
- Whenever `resolveObstacles` or `clampToWorld` moves an ant, take the push direction as the wall normal `n`, pointing out of the wall, and update the heading with this rule:

```ts
// h = ants.heading[i]; n = unit normal out of the wall; uid = ants.uid[i]
const hx = Math.cos(h), hy = Math.sin(h);
const into = hx * n.x + hy * n.y;
if (into < 0) {                                   // moving into the wall
  let tx = hx - into * n.x, ty = hy - into * n.y; // keep only the sliding part
  if (tx * tx + ty * ty < 0.04) {                 // nearly head-on: pick a side
    const side = (uid & 1) === 0 ? 1 : -1;        // deterministic per ant
    tx = -n.y * side; ty = n.x * side;
  }
  ants.heading[i] = Math.atan2(ty, tx);
}
```

- For a world edge, `n` is ±x or ±y.
- **Early-out (R11):** skip the 3×3 cell scan when the ant's own cell and its 8 neighbours are all non-solid. Check the centre cell first, then return early if `!anySolidNear`. Precompute a `nearSolid: Uint8Array` (cell or any 8-neighbour is solid) in `rebuildBorder`.

**Tests:**
- `collide: an ant hitting a wall head-on slides along it`. 80×80 u rock; ant 1 u to the left, heading 0 (into the rock); 60 ticks. It ends with |Δy| > 20 u and never inside a solid cell.
- `collide: ants slide along map edges`. Ant at the right edge heading +x; 60 ticks. It moves more than 20 u along the edge and isn't pinned (more than 0.5 u per tick on average).
- `collide: nearSolid flags match a brute-force check` on a random painted grid.

**Commit:** `fix(sim): ants slide along walls and edges instead of pinning`

### Task 3: Look-ahead steering and fallback rays
**Files:** `src/sim/obstacles.ts` (new `freeDistance`), `src/sim/sensing.ts` (fallback rays, explorer pattern), `src/sim/tick.ts`, `src/sim/params.ts` (new `lookAhead: 20`); tests `tests/sim/test_obstacles.test.ts`, `tests/sim/test_sensing.test.ts`.

**New function:** `freeDistance(grid, origin: Vec2, angle: number, maxDist: number): number`. Same DDA walk as `lineOfSight`. Returns the distance to the first solid cell, `maxDist` if there is none, and 0 when starting inside a solid cell.

**Steering order in `thinkChunk`:**
1. sight or markers or fallback;
2. plus wander;
3. then `steerAroundWalls`;
4. then `turnToward`.

```ts
// Returns a heading that has `lookAhead` units of free space, as close as possible to `desired`.
function steerAroundWalls(world: World, ant: number, desired: number): number {
  const p = { x: world.ants.posX[ant], y: world.ants.posY[ant] };
  const look = world.params.lookAhead;
  if (freeDistance(world.obstacles, p, desired, look) >= look) return desired;
  const side = world.ants.wanderOffset[ant] >= 0 ? 1 : -1;     // keep turning the way it was drifting
  for (let k = 1; k <= 6; k++) {                               // ±15°, ±30° ... ±90°
    const off = (k * Math.PI) / 12;
    if (freeDistance(world.obstacles, p, desired + side * off, look) >= look) return desired + side * off;
    if (freeDistance(world.obstacles, p, desired - side * off, look) >= look) return desired - side * off;
  }
  return desired + Math.PI;                                    // boxed in: turn around
}
```

**Fallback rays (spec §5.3):** when there is no sight and no markers, cast `fallbackRays` (12) rays evenly across ±`sensorHalfFovDeg`, each up to `fallbackRange` (48), and choose the longest free ray. Ties within 0.5 u go to the ray closest to `heading + wanderOffset`. Implement it as `fallbackHeading(world, ant): number` in `sensing.ts`.

**Explorer pattern (R9):** use angle fractions `[-1, 0, 1]` and distance fractions `[0.5, 1]`, which is 6 samples. Update `explorerSamples` to 6 and the pinned test.

**Midpoint line-of-sight:** if the midpoint check isn't in `senseMarkers` yet, add it now.

**Tests:**
- `obstacles: freeDistance`. Rock 20 u ahead gives 20 ± cell. Open space gives `maxDist`. Starting inside a rock gives 0.
- `sensing: fallback picks the open gap`. A wall ahead with a gap 30° to the left: the chosen heading is within 10° of the gap.
- `steer: an ant heading at a rock goes around it`. Blank map, a 30 u rock 40 u ahead of the ant, no markers. Within 300 ticks the ant is more than 150 u from its start, and it's never pinned (no 60-tick window with less than 3 u of movement).
- `steer: ants pass a 12 u gap`. Two rocks with a 12 u gap between them, straight ahead. The ant passes through within 200 ticks.
- **Regression helper** `fractionTouchingSolid(world)`: the share of ants within `antRadius + 1` of a solid cell. On the boulder preset, seed 1, sampled every 600 ticks over 7200 ticks, it should average **below 0.05**. If that isn't reachable, it must be at least 3× lower than before this pack. Record both values in the commit message.

**Commit:** `feat(sim): look-ahead wall steering and fallback rays`

### Task 4: Spatial hash, stuck detection and trail degrading
**Files:** `src/sim/spatial_hash.ts` (new), `src/sim/stuck.ts` (new), `src/sim/world.ts` (run `Phase.SpatialHash` at the start of `stepWorld`), `src/sim/tick.ts`; tests `tests/sim/test_spatial_hash.test.ts`, `tests/sim/test_stuck.test.ts`.

**`SpatialHash`:**
- A counting-sort grid: `cell = params.hashCell`, arrays `cellStart: Uint32Array(cells + 1)` and `items: Uint32Array(n)`.
- `build(xs, ys, count, worldSize, cell)`.
- `countWithin(x, y, r, xs, ys, exclude): number`.
- Rebuild it once per tick, before Think.

**`evaluateStuck(timeSinceLastMarker, inZone, nearby, params): { stuck, degrade }`**, as in spec §5.5:
- `stuck` = `timeSinceLastMarker > stuckTimeout`;
- `degrade` = `stuck && !inZone && nearby < crowdLimit`;
- `inZone` = within `nestRadius + zoneMargin` of its own nest, or `foodRadius + zoneMargin` of any food;
- `nearby` = `countWithin(pos, crowdRadiusFactor × antRadius)`.

**When stuck:**
- `heading += π + randRange(seed, uid, tick, RandStream.StuckTurn, −jitter, +jitter)`;
- reset the drop point and `timeSinceLastMarker`;
- if `degrade`, set `degradeTimer = degradeTime`.

The existing degrade events then fire.

**Tests:**
- `spatial hash: counts match brute force` with 2000 random ants and random radii.
- `stuck: a jam at the nest never degrades`, and `stuck: a dead end degrades the trail it followed`: an ant following `toFood` into a U-shaped rock pocket reduces `toFood` in the pocket by at least 50% within 5 s.
- `stuck: the turn uses StuckTurn`: same seed gives the same heading.

**Commit:** `feat(sim): stuck detection and dead-end trail erasure`

### Task 5: Never spawn or stay inside rock or water
**Files:** `src/sim/tick.ts` (`spawnAtNest`), `src/sim/obstacles.ts` (new `nearestFreePoint(grid, pos, maxCells): Vec2 | null`, a breadth-first search over cells), `src/sim/collide.ts`; test `tests/sim/test_collide.test.ts`.

**Change:**
- **Spawning:** try 16 positions at the spawn radius, at angles `a + k × 2.39996` (the golden angle) for `k = 0..15`. Take the first that isn't solid; otherwise spawn at the nest centre.
- **Moving:** in `thinkChunk`, treat a speed factor of 0 as 1, so an ant whose centre is inside a solid cell can still move. Collision handles the walls.
- **Collisions:** in `resolveObstacles`, if the ant's own cell is solid but not a border cell, move it to `nearestFreePoint(..., 16)`. If that returns null, set its energy to 0 so it's removed.

**Tests:**
- `spawn: never inside rock`: a nest 30 u from a rock, 300 spawns, none inside a solid cell.
- `collide: an ant inside a rock is moved out` in one step.

**Commit:** `fix(sim): ants never spawn or freeze inside obstacles`

---

## Part 2: Foraging range (issue 2)

### Task 6: A reach harness
**Files:** `src/app/reach.ts` and `src/app/reach_cli.ts` (copy the `bench.ts` / `bench_cli.ts` pattern); `package.json` script `"reach"`.

**What it does:** prints a table so tuning is measured, not guessed. The setup is built in code, not as a user-visible preset:
- **Single-colony runs:** world 2600×1000, nest at (200, 500), one food source of 20,000 at distance D ∈ {500, 1000, 1500, 2000} on the same row, 200 ants, seed 7, 180 s (10,800 ticks).
- **Contest run:** colony A 500 u from the food, colony B 1500 u from it, on the opposite side.

**Columns:** D, deliveries in minutes 1, 2 and 3, ants alive at the end, B's deliveries (contest only). Also time to the first delivery.

**Verify:** `npm run reach`. Paste the "before" table into the commit message.

**Commit:** `feat(app): reach harness for foraging range`

### Task 7: Retune the trail and energy defaults
**Files:** `src/sim/params.ts`, `src/ui/param_specs.ts` (add **Trail fade with distance** = `emissionDecay`, range 0.005–0.2), the pinned defaults tests, spec §12.

**Starting values:**

| Parameter | Now | New |
|---|---|---|
| `emissionDecay` | 0.11 | 0.03 |
| `markerHalfLife` | 7.7 | 20 |
| `energyBurn` | 1.0 | 0.5 |
| `exhaustedAt` | 30 | 60 |

**Tuning steps:**
1. Run `npm run reach`.
2. Adjust *only* within these ranges: `emissionDecay` 0.02–0.04, `markerHalfLife` 15–30, `energyBurn` 0.4–0.7.
3. Aim for these results:
   - D = 1000 has a first delivery under 60 s and at least 3× the "before" deliveries in minute 3;
   - D = 1500 delivers in minute 3;
   - the meadow and boulder presets still look clean: stale trails around exhausted food fade within about 2 minutes.

**Tests:**
- Update the defaults test.
- Add `reach: 1000 u delivers` as a 120 s single-colony run (150 ants). Deliveries ≥ floor(0.7 × the measured value). Write the measured value in a comment.

**Commit:** `tune(sim): trails and energy reach distant food`

### Task 8: Homing memory (path integration), on by default
**Why:** real ants keep a running estimate of the way home from their own movement. Spec §1 allows "own memory", and this is that. It rescues carriers that lose the trail.

**Files:**
- `src/sim/ants.ts`: new SoA fields `homeErrX` and `homeErrY` (Float32Array). Add them to spawn, removeSwap, ensureCapacity and checksum.
- `src/sim/params.ts`: `homingEnabled: true`, `homingDrift: 0.04`.
- `src/sim/types.ts`: `RandStream.HomingDrift`.
- `src/sim/tick.ts`; Settings toggle **Homing memory**.

**Rule:**
- **Reset:** on spawn and on any nest contact, set `homeErr = (0, 0)`.
- **Drift:** on each wander pick, `homeErr += (randRange(−1, 1), randRange(−1, 1)) × homingDrift × distance walked since the last pick`, using stream `HomingDrift`.
- **Homing:** in `chooseHeading`, when the state is ReturningFood or ReturningExhausted, nothing is in direct sight and `senseMarkers` finds nothing, then `heading = angleOf(nest + homeErr − pos)` instead of the current heading.

**Tests:**
- `homing: a carrier with no trail gets home`. Carrier 800 u from the nest, blank map, no markers. With homing on it delivers within 1800 ticks; with homing off it doesn't.
- `homing: determinism` (same seed, same checksum).

**Verify:** rerun `npm run reach`. D = 2000 should now deliver. Then tune Task 7 lightly if trails became too strong.

**Commit:** `feat(sim): homing memory for ants that lose the trail`

### Task 9: One trail layer per colony (fixes the monopoly)
**Files:** `src/sim/marker_grid.ts`, `src/sim/sensing.ts`, `src/sim/world.ts`, `src/sim/setup_apply.ts` (resize after the colonies are known), `src/render/heatmap.ts`, `src/sim/checksum.ts`; tests for each.

**New grid shape:**
```ts
interface MarkerGrid {
  width: number; height: number; cell: number;
  colonies: number;                 // layers, >= 1
  owner: Int8Array;                 // derived: dominant colony per cell, for drawing only
  toHome: Float32Array;             // colonies * cells, colony-major: index = colony * cells + cell
  toFood: Float32Array;
  resize(worldSize: Vec2, cellSize: number, colonies: number): void;
  cellIndex(pos: Vec2): number;
}
homeAt(grid, colony, cell): number;  foodAt(grid, colony, cell): number;
```

**Rules:**
- **`deposit`:** max-rule into the depositing colony's own layer, always. Foreign cells never block it.
- **Territory rule (if on):** at the same cell, every *other* colony's two channels are multiplied by `1 − foreignErasureFactor × strength`.
- **`degrade`:** works on the colony's own layer only.
- **`decayMarkers`:** decays all layers, then recomputes `owner` as the argmax of `max(home, food)` over colonies, or `kNoOwner` when all are 0.
- **Sensing:** reads `homeAt`/`foodAt` for the ant's own colony, instead of checking `owner === colony`.
- **Heatmap:** dual-channel mode sums each channel over colonies (clamped). Colony-colour mode keeps using `owner`.

**Tests:**
- `markers: two colonies share a cell`: both deposits survive when the territory rule is off.
- `markers: territory erodes but never blocks`: a foreign layer drops, and the depositor's own value is set.
- `markers: owner is the stronger colony after decay`.
- **Contest check:** `npm run reach` shows colony B delivering more than 0 (it was 0 before).

**Commit:** `feat(sim): one trail layer per colony; territory erodes instead of blocking`


## Part 2b: M2 proper

### Task 9b: Maze preset and breach

**Files:** `src/sim/presets.ts`, `src/sim/setup.ts`, `src/sim/setup_apply.ts`, `src/sim/obstacles.ts`, `src/sim/world.ts`, `src/ui/run_hud.ts`, `src/app/controller.ts`, `src/app/headless.ts`, `src/app/options.ts`, `src/app/reach.ts`, `tests/sim/test_presets.test.ts`, `tests/sim/test_setup_apply.test.ts`.

**Preset:** add `"maze"` to `kPresetIds`, named `"Maze"`, using the boulder palette.
- World 1920x1080.
- One colony at (90, 960) with 200 ants.
- One food source at (90, 120), amount 20000.
- Rock walls 24 u thick, across the full width, at y = 270, 540 and 810, each with a 160 u gap.
- The y = 810 and y = 270 walls are open at the right end (x 1760-1920).
- The y = 540 wall is open at the left end (x 0-160).
- The route snakes through four lanes, about 7,000 u long.

**Breach segments:** the left ends (x 0-160) of the y = 810 and y = 270 walls.
- Store them in the setup as `WorldSetup.breach`, a list of rectangles. It is empty for every other preset.
- Breaching sets those cells to None, opening a straight route of about 840 u up the left side.

**Applying a breach:** an edit applied between ticks.
- New sim function `applyBreach(world, rects): void` clears the cells and rebuilds border and nearSolid.
- A "Breach shortcut" button in the run HUD, shown only when the setup has breach rectangles.
- The renderer refreshes the terrain mask afterwards.
- Headless and reach runs take a breach tick (`?breach=<tick>` in the URL, `--breach-tick` on the command line).

**Parameter override:** add `WorldSetup.paramOverrides` (`Partial<SimParams>`) and apply it in `worldFromSetup`. The maze sets `energyBurn` to 0.3 so the long route is survivable.

**Acceptance:** a `"maze"` row in the reach harness.
- Ants deliver before the breach, within 10 simulated minutes.
- With the breach at minute 10, deliveries per minute in minutes 12-14 are at least 3x those in minutes 7-9.
- Take screenshots before and after the breach.

**Tests:**
- `maze: the preset validates`.
- `maze: line of sight is blocked before the breach` - from the nest to the food along x = 90 is blocked.
- `maze: applyBreach clears the shortcut` - after `applyBreach` the same line is clear, and border/nearSolid agree with a rebuilt grid.

**Commit:** `feat(sim): maze preset with a breach shortcut`

### Task 15: Docs and acceptance (M2)

1. **Spec:** update section 4.2 (one trail layer per colony; territory wears rival layers down), sections 5.3-5.6 (look-ahead, fallback rays, stuck detection and degrading, homing memory), section 10 (maze preset and breach), section 12 (new and retuned parameters), and section 15 (the M2 row and acceptance evidence). Update the milestone paragraph that says navigation is a separate project.
2. **Structure doc:** add `src/sim/spatial_hash.ts`, `src/sim/stuck.ts`, `src/app/reach.ts`, `src/app/reach_cli.ts`; update `MarkerGrid`, `WorldSetup` (`breach`, `paramOverrides`), `applyBreach`, `freeDistance`, `fallbackHeading`, `steerAroundWalls`, `nearestFreePoint`, `fractionTouchingSolid`, the new ant SoA fields, and `npm run reach`.
3. **CLAUDE.md:** keep the Status line current and add `npm run reach` to Build and run.
4. **Final checks:** all tests pass; the reach before/after tables are in the final commit; the bench is within +25% of the 0.385 ms baseline; the maze screenshots exist before and after the breach; the boulder `fractionTouchingSolid` before and after values are recorded.

**Commit:** `docs: m2 navigation and foraging complete`

---

## Review focus: failure modes the tests above don't cover

1. **Narrow gaps (about 1–2 ant widths):** look-ahead with a 20 u range can make ants avoid real gaps. Expected: they pass gaps of 12 u or more. Covered by `steer: ants pass a 12 u gap` in Task 3.
2. **Trails that stay too long after tuning:** expected to fade within about 2 minutes once food runs out. Add `trails: an exhausted food's trail fades below markerDetectMin within 150 s` to Task 7.
3. **Several colonies at the same food:** expected that both deliver. This is the reach contest row (Task 9).
