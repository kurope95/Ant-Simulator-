# Ant Colony Simulator — Design Spec

- **Date:** 2026-10-25
- **Revision 2026-10-25:** the project moved from C++/SDL3 to TypeScript/WebGL in Chrome (see §2, §3 and §16). The simulation design in §4–§6 is unchanged.
- **Status:** Direction approved by the user ("I agree with your suggestions; we'll figure out problems as they come"). Items marked *(Claude's call)* were decided by Claude and are open to change. They are collected in §16.
- **Origin:** A Gemini-written summary of Pezzza's Work's "Ant Simulator 2" YouTube series (Mar 2025 – Jun 2026). This spec revises it for correctness, performance and this laptop.
- **Reference material:** The videos, and Pezzza's original open-source simulator (github.com/johnBuffer/AntSimulator, MIT, C++/SFML), which can be read for ideas. Ant Simulator 2's own code is Patreon-only and is not used.

---

## 1. What we're building, and why

A real-time, top-down 2D ant colony simulator in the spirit of Pezzza's "Ant Simulator 2". Thousands of ants:

- leave pheromone trails,
- discover food,
- settle on short routes,
- recover when the world changes under them,
- compete across several colonies.

Meanwhile the user paints walls, drops food, opens shortcuts and follows individual ants.

The user saw Pezzza's videos and wants their own version on their own laptop. Success means it *feels* like the videos:

- trails emerge on their own and harden into highways,
- ants solve a maze and then switch to a newly opened shortcut,
- opposing streams weave past each other,
- all of it runs smoothly at large scale.

### Goals
- Emergent foraging from local rules plus pheromone gradients (stigmergy).
- Adaptation: ants abandon blocked routes and adopt new shortcuts.
- Several colonies (up to 8; Red, Yellow, Blue and Green first) with visible, competing territories.
- Crowd behaviour: ants never overlap, and head-on traffic sidesteps into lanes.
- Visual polish: a procedural six-legged tripod walk when zoomed in, contact shadows and pheromone heatmaps.
- Sandbox UI: brushes, preset scenarios, overlays, an ant inspector, live telemetry and sliders.
- Scale: **20,000 ants at a 60 Hz simulation rate** on this laptop, plugged in.

### Non-goals (v1)
- Inter-colony hostilities or combat. This is an open topic (§14).
- 3D, sound, networking, web or mobile builds, save files.
- Machine-learning ants, or any external AI/LLM service.
- Simulation on the GPU (compute shaders).

### Anti-goals (a failure even if it technically "works")
- **Ants that know where things are.** That includes pathfinding (A*), global maps and teleporting. Every decision must come from what an ant senses locally plus its own small memory.
- **Behaviour that changes with frame rate or thread count.**
- **A one-shot monolith that nobody can tune.** Every milestone (§15) must run and be verified before the next one starts.
- **Choppy or blurry output** on the laptop's 2.8K 120 Hz screen.

---

## 2. Platform and constraints

| | |
|---|---|
| Machine | ASUS Vivobook S 15 (S5507QA) laptop, Windows 11 Home **ARM64** |
| CPU | Snapdragon X Plus X1P-42-100: 8 Oryon cores, all the same speed, no SMT |
| Memory | 16 GB LPDDR5X, shared with the GPU |
| GPU | Adreno X1-45 (integrated), reached through Chrome's ANGLE → Direct3D 11 path |
| Display | 2880×1620 at 120 Hz, Windows scaling 200% |
| Power | Runs on battery. Performance figures only count when plugged in |
| Runtime | Chrome 155 and Node 24.13 are installed; nothing else is |
| Security | **Smart App Control is on and blocks unsigned executables.** The project never builds, installs or runs a native program |

What follows from this:
- **Run in the browser.** The simulator is a static site: TypeScript compiled by `tsc` into ES modules and loaded by Chrome. Nothing new ever runs as a Windows program, so Smart App Control never gets involved.
- **WebGL2 only.** Chrome renders through ANGLE and Direct3D 11; there is no native OpenGL on this laptop.
- **Be per-monitor DPI-aware.** The canvas backing store is sized to `devicePixelRatio` (2.0 here), so the picture is the full 2880×1620; the DOM UI scales itself.
- **The CPU is the main performance lever.** Eight equal cores; Web Workers are added in M4. The GPU is modest, so everything is drawn in a handful of batched draw calls, never one call per ant or per leg.
- **Build tools must be pure JavaScript.** Vite, esbuild, Rollup's native builds and TypeScript 7's Go compiler are unsigned native programs; use `tsc` 5.9.3 and Node's built-in test runner instead.

---

## 3. Tech stack

| Concern | Choice |
|---|---|
| Language | TypeScript 5.9.3, strict, ES2022 modules |
| Build | `tsc -p tsconfig.json` → `dist/`; npm scripts; no bundler |
| Window, input, 2D rendering | **WebGL2** in Chrome; colour, texture and sprite shaders; batched triangle vertex buffers |
| UI | **DOM + CSS** overlay — crisp at any display scale, no dependencies |
| Unit tests | **`node:test`** with `node:assert/strict`, run by `npm test` |
| PNG output for headless screenshots | **Chrome headless** `--screenshot` against the served page |
| Threading | **Web Workers** (M4) over fixed-size chunks, results combined in chunk order |
| Dev server | `tools/serve.mjs`, a dependency-free Node static server |

---

## 4. World model

### 4.1 Units and grids
- **World units (u):** 1 u is 1 physical pixel at camera scale 1. The default world is 1920×1080 u, and scenarios set their own size.
- **World edges** are solid walls.

| Grid | Cell size | Contents |
|---|---|---|
| Marker grid | 8 u | a `to_home` and a `to_food` layer per colony, derived owner |
| Obstacle grid | 4 u | `solid` flag, `border` flag |
| Spatial hash | 6 u | ant indices, rebuilt every tick |

All three grids share the same world origin. The obstacle grid is finer than the marker grid so painted walls look less blocky *(Claude's call)*.

### 4.2 Marker grid (one grid shared by all colonies)

Every colony has its own pair of trail layers, so a cell stores, for each colony `k`:
- `float to_home[k]` (0–1),
- `float to_food[k]` (0–1).

The layers are colony-major: `index = k × cells + cell`. A derived `int8 owner` array records the colony with the strongest signal in each cell (−1 when every layer is empty); it exists for drawing only — sensing, deposit and degrade all address a colony's own layer.

Two colonies' trails therefore coexist in one cell *(M2: with a single-owner cell, the first colony to touch a cell locked every rival out of it, and the contest preset's second colony delivered nothing)*.

**Decay (every tick).** Multiply both channels of every layer by `f = 2^(−dt / MARKER_HALF_LIFE)`. Values below `MARKER_EPS` become 0. After decaying, `owner` is recomputed with hysteresis (M1.7): the current owner keeps the cell until a rival's `max(to_home, to_food)` is at least `FLIP_MARGIN` (1.25) times the owner's. An unowned cell, or one whose owner has faded to 0, takes the strongest colony. It is −1 when every layer is 0.
- The default half-life is 15 s, raised from 7.7 s in the M2 retune so a carrier's trail survives a long trip, then trimmed from 20 s at review so an exhausted source's trail clears `MARKER_DETECT_MIN` within 150 s (a full-strength deposit reaches 2^(−150/15) ≈ 0.00098). 7.7 s matched the original "×0.9985 per tick" at 60 Hz, but stays the same at any frame rate. *(Fix: the original per-tick factor made trails fade twice as fast at 120 FPS.)*

**Emission strength.** A deposit has strength `e = exp(−time_since_anchor × EMISSION_DECAY)`.
- The anchor is the place the ant last touched: its nest when laying `to_home`, the food source when laying `to_food`.
- Deposits are strong near the source and weak far from it, so the trail has a gradient that points toward the source.
- For that gradient to survive the marker decay, `EMISSION_DECAY` must exceed the decay rate `ln 2 / MARKER_HALF_LIFE`, which is 0.09/s at 7.7 s and 0.046/s at 15 s. At a decay below that rate a returning ant's trail inverts at read time (at 0.05 with a 7.7 s half-life, seed 1 delivered 0 and ants walked away from the nest); the M2 retune reproduced that failure at 0.03–0.04 with a 15–20 s half-life. `0.11` keeps the gradient pointing at the source while leaving roughly a minute of a full trip's deposits above `MARKER_DETECT_MIN`. *(M1 tuning ruling, rechecked in M2.)*
- No deposit is made when `e < MARKER_EPS`.

**Who deposits what:**

| Ant state | Deposits |
|---|---|
| FORAGING | `to_home` |
| RETURNING_FOOD | `to_food` |
| RETURNING_EXHAUSTED | nothing *(fix: if it deposited `to_food`, it would lay fake food trails)* |

**When.** Every ant tracks a *drop point*. When the ant is at least `MARKER_DROP_DIST` from it:
- it deposits (if its state deposits anything),
- it sets `drop point = pos` and `time_since_last_marker = 0`.

Exhausted ants still move their drop point, because stuck detection (§5.5) relies on it.

**Deposit rule** for cell `c` and an ant of colony `k`:
1. Write the depositing colony's own layer: `to_home[k][c] = max(to_home[k][c], e)` (or `to_food[k][c]`). A rival's trail never blocks the deposit.
2. If the territory rule is on (`TERRITORY_RULE`, the default), multiply every *other* colony's `to_home` and `to_food` at `c` by `1 − e × FOREIGN_ERASURE_FACTOR`. Territory wears rival trails down; it never locks them out.

This rule is implemented in `src/sim/marker_grid.ts` (`deposit`). The single-owner rule of M1.5 was replaced in M2 (§15).

**Scent competition (M1.7).** In plain words: every cell holds each colony's scent. Laying scent weakens rivals' scent on that cell, so the colony that walks there more wins it. A cell changes owner only once the challenger is clearly stronger. Ants dislike rivals' scent, so they keep to their own roads unless they've taken the road over. Three rules make that happen:
1. **Contest on deposit:** the territory rule above, with `FOREIGN_ERASURE_FACTOR` exposed in Settings as *Territory pressure* (0–1, default 0.5).
2. **Ownership with hysteresis:** `FLIP_MARGIN` 1.25, applied in the owner recompute of the decay step above.
3. **Foreign scent deters:** `FOREIGN_AVERSION` 0.35, exposed in Settings as *Foreign scent aversion* (0–1). In `senseMarkers` (§5.3), a sample's score is its own channel minus `FOREIGN_AVERSION` times the strongest rival's `max(to_home, to_food)` on that cell. A score of 0 or less does not count as found. Direct sight of food or the nest ignores this.

**Erasing dead-end trails.** While an ant's `degrade_timer > 0`, each time it enters a new marker cell whose own layer still holds the channel it is following, it multiplies *that channel of its own layer* by `DEGRADE_FACTOR` (0.5). It follows `to_food` while FORAGING and `to_home` otherwise. Rival layers are never erased this way.

All writes to the marker grid happen in the serial event phase (§5.2), in a fixed order.

### 4.3 Obstacles
- A 4 u grid with one byte per cell: `0` empty, `1` Rock, `2` Water, `3` Sand, `4` Mud. The builder paints or erases cells with a circular brush; presets seed the grid.
- **Rock and Water are solid.** Only their border cells are collidable: a border cell is Rock/Water and has at least one of its four direct neighbours out of bounds or not Rock/Water. Interior cells are never tested, which keeps the original "hollow collider" optimisation. Border flags are rebuilt only in the area around an edit.
  - The collision shape is the cell's box (circle-against-box test) *(Claude's call: a circle per cell makes walls bumpy)*.
  - **Buried-ant recovery.** An ant whose centre sits in a solid *interior* cell is invisible to the border push, so `resolveObstacles` teleports it to the nearest open cell centre found by a breadth-first search (at most 16 solid cells). If the search finds nothing, its energy is set to 0 and it is removed. A centre inside a solid cell also moves at full speed for that tick, so collision can carry it out instead of it standing frozen.
- **Sand and Mud are walkable terrain.** They do not collide; they scale walking speed: Sand ×0.60, Mud ×0.45.
- **Sight and scent.** Rock and Water block line of sight and the marker sense. A sensor sample inside a Rock/Water cell is skipped, as is a sample whose halfway point to the ant is solid.
- **Editing only in the builder.** A run's obstacle grid is immutable. Start and Reset build a fresh world from the setup; nothing mutates a running world. `validateSetup` rejects a nest or food source whose centre or edge ring lies in Rock/Water, so no run begins with an unreachable nest or pile.
- Painting a solid cell clears the marker cells under it. The builder does not allow food under Rock/Water at setup time.

### 4.4 Food sources
- Food sources are discrete circles with a position, an `amount` in units, a stable `uid` and a `kind` (Seeds, Berries or Leaves); they may be flagged `infinite` for stress tests.
- Radius = `FOOD_BASE_R × sqrt(amount / FOOD_REF_AMOUNT)`, with a minimum.
- They are placed with the Food tool, whose capacity and kind are chosen in the builder. An empty source disappears.
- All colonies share all food sources.
- **Visible pieces:** one piece per 100 units, 1–48 pieces; an infinite source always shows 48. Pieces sit on a deterministic golden-angle spiral, inner-first, so each 100 units consumed removes only the outer pieces. This is rendering state; it uses a visual hash, never `randU32`.

### 4.5 Colonies and nests
- Each colony has: an id, a nest position, a palette colour (0–7), `food_pool`, population and stats. Up to `MAX_COLONIES` (8) colonies. The palette is Ember, Gold, Azure, Fern, Orchid, Rose, Lagoon and Chalk; Ember, Gold, Azure and Fern stand in for the original Red, Yellow, Blue and Green. Duplicate colours are allowed.
- The builder sets each colony's colour and starting ants (10–600, default 200). All starting ants spawn at the nest edge before tick 0.
- A run may have one or many colonies. `quickStartSetup` seeds a single Ember colony with 200 ants for tests and the bench.
- Nest radius = `NEST_BASE_R + NEST_GROWTH × sqrt(population)`, so the nest grows as the colony grows.
- **Spawning.** With `LIFE_CYCLE` on (the default), the queen lays at a steady rate and only from spare food (§5.6): each tick her egg credit grows by `(BIRTH_RATE_BASE + BIRTH_RATE_PER_ANT × population) / SIM_HZ`, capped at `BIRTH_BURST`, and while the credit is at least 1 and `food_pool − SPAWN_COST ≥ reserve` she spends one credit and `SPAWN_COST` food on one ant. With it off, the original rule: while `food_pool ≥ SPAWN_COST`:
  - subtract `SPAWN_COST` from `food_pool`,
  - spawn one ant at the nest edge facing outward. The ring position is sampled in golden-angle steps `a + k × 2.39996` (`k = 0..15`) and the first non-solid sample wins, so a rock overlapping the nest cannot swallow the ant; if all 16 are solid it spawns at the nest centre,
  - make it an Explorer with probability `EXPLORER_RATIO`, otherwise a Follower.
- Spawning pauses while the total ant count is at `MAX_ANTS_TOTAL`.
- A colony with no ants and too little food to spawn is extinct. Its nest is drawn greyed out.
- Ants interact only with their own nest.

---

## 5. Ants

### 5.1 Data layout (Structure of Arrays)
Each field is one contiguous array, indexed by ant index `i`:

| Group | Fields |
|---|---|
| Identity | `uid` (u32, stable, never reused), `colony` (u8), `role` (u8: 0 Follower, 1 Explorer), `state` (u8: 0 FORAGING, 1 RETURNING_FOOD, 2 RETURNING_EXHAUSTED; values 3 and up are reserved for the future) |
| Motion | `pos_x/y`, `prev_x/y` (position at the start of the tick), `vel_x/y`, `heading`, `speed`, `mass` |
| Life | `energy`, `time_since_anchor` |
| Trail | `drop_x/y`, `time_since_last_marker`, `degrade_timer`, `last_marker_cell` |
| Wander | `wander_offset`, `wander_timer` |
| Avoidance | `avoid_x/y` (last avoidance correction, reused on the tick it isn't recomputed) |
| Legs | none in the simulation; the tripod gait is render-only and lives in `src/render/legs.ts` (§8) |

- **Stable ids.** A `uid → index` map is kept in sync on every spawn and removal. Anything that refers to an ant across frames (the inspector, follow mode) stores its `uid`.
- **Removal** is swap-and-pop at the end of the tick, in descending index order so it's deterministic.

### 5.2 Tick pipeline
The simulation uses a fixed time step: `dt = 1/60 s`. Each tick runs these phases:

1. **Build the spatial hash.** Counting-sort the ant indices into 6 u cells (`cell_start[]`, `cell_items[]`). With ant collisions on (M4), the avoidance pre-pass (§6.1) then runs over these start-of-tick positions and last tick's velocities, before any ant is thought about.
2. **Think and move.** Runs in parallel over chunks of ants. It reads the world and writes only the ant's own fields plus its chunk's event list.
   1. Timers: `energy −= ENERGY_BURN × dt`; `time_since_anchor` and `time_since_last_marker` increase by dt; `degrade_timer` decreases by dt.
   2. Stuck check (§5.5).
   3. Sense for the current state and choose a desired heading (§5.3).
   4. Exhaustion: a FORAGING ant with `energy < EXHAUSTED_AT` switches to RETURNING_EXHAUSTED. The exception is when the strongest `to_food` sensed in step 3 is above `PUSH_ON_SIGNAL` (0.4): then it keeps going to the food. If the state changed, sense again for the new state.
   5. Add wander (§5.4).
   6. Avoidance (§6.1): recomputed on this ant's turn, otherwise the stored `avoid` value is reused.
   7. Steer and move: turn toward the desired heading by at most `TURN_RATE × dt`, add the avoidance velocity, then `prev = pos; pos += vel × dt`.
   8. Emit events: a deposit (drop-distance rule), a degrade (entered a new cell while degrading), or a contact (overlapping a food source or its own nest).
3. **Apply events.** Serial, processing the chunk lists in chunk order:
   - Marker deposits, erasures and degrades (§4.2).
   - **Food pickup**, by an ant that isn't carrying food (FORAGING or RETURNING_EXHAUSTED), only while the source still has food:
     - the source loses 1 unit,
     - the ant switches to RETURNING_FOOD, with `mass = 3` and `energy = 100`,
     - `heading += π`, `time_since_anchor = 0`.

     An ant that is already carrying food and touches food only gets its energy refilled.
   - **Arriving at its own nest:**
     - RETURNING_FOOD: `food_pool += 1`; `mass = 1`; `energy = 100`; switch to FORAGING; `heading += π`; `time_since_anchor = 0`.
     - RETURNING_EXHAUSTED: `energy = 100`; switch to FORAGING; `time_since_anchor = 0`.
     - FORAGING: `energy = 100`; `time_since_anchor = 0`.
   - Spawning (§4.5).
4. **Collisions (PBD).** With ant collisions on (M4), rebuild the hash from the positions Think wrote, then run `PBD_ITERATIONS` passes. Each pass resolves ant-against-ant overlaps first, then ant-against-wall, and walls always win (§6.2). Finally set `vel = (pos − prev) / dt`. With ant collisions off, the pass is the pre-M4 one: a single clamp, wall resolve and clamp.
5. **Removals.** Ants with `energy ≤ 0` are removed. The hash is rebuilt next tick, so no "ghost collider" of a dead ant can survive.
6. **Marker decay.** Runs in parallel over grid rows.
7. **Stats.** Food delivered per colony goes into ring buffers for the sparklines.

- **Gait** (§8) is render-only. After a frame's last tick, the renderer advances each visible ant's visual tripod phase from its interpolated distance travelled. No simulation state or randomness is involved.
- **This phase structure is used from Milestone 1 on,** even before workers are switched on in M4.

### 5.3 Sensing and steering
The field of view is ±60°, out to `SENSOR_RADIUS` (32 u).

- **Direct sight.** If the ant's current target is within the field of view and no wall sits halfway between, it steers straight at it. The target is a food source when FORAGING and its own nest when returning.
- **Followers** sample a polar pattern of 25 points in the cone: 5 angles × 5 distances, spanning the live `SENSOR_FOV` and `SENSOR_RADIUS` (the pattern is scaled from these parameters, so the sliders change the marker sense itself).
  - Points inside walls are skipped, and so are points whose halfway point to the ant is solid (a cheap line-of-sight check).
  - A point's score is the followed channel, counted only in cells owned by the ant's colony.
  - The followed channel is `to_food` when FORAGING, and `to_home` when RETURNING_FOOD or RETURNING_EXHAUSTED.
  - The ant steers toward the best point if its score is at least `MARKER_DETECT_MIN`.
- **Explorers** work the same way, but with only 6 sample points and stronger wander (§5.4), so they drift off highways and find new routes.
  - An exhausted Explorer uses the Follower pattern, because it just wants to get home.
- **No marker found: fall back to open space.** If the wander heading has `LOOK_AHEAD` (20 u) of free space, steer straight along it. Otherwise cast `FALLBACK_RAYS` (12) rays across the field of view, each up to `FALLBACK_RANGE` (48 u), through the obstacle grid.
  - Steer along the ray with the longest free distance.
  - Ties are common in open space; they go to the ray closest to the wander heading — the heading the ant took on its last wander redraw (§5.4). *(Fix: the original rule had no tie-break, which would make ants in open space jitter.)*
  - The choice also reports whether it has `LOOK_AHEAD` of free space, so the look-ahead steering pass below can skip its probe.
- **Look-ahead steering.** A desired heading needs `LOOK_AHEAD` (20 u) of free space. If it doesn't have it, the ant turns in one direction only — its own, taken from its `uid` parity so it never flips sides — and searches from the heading it already holds, in 15° steps, up to half a turn; it reverses if nothing is free. Searching from the current heading is what makes it follow a wall; searching from `desired` makes the answer jump as the target moves, and the ant stays pressed against the wall instead of getting round it. *(Fix, 2026-10-25: the original rule rotated ±90° off `desired` with an unstable side, so a carrier in the maze never got round a long wall.)*
- **Speed** is `ANT_SPEED`, varied per ant by up to ±`SPEED_JITTER`.

### 5.4 Wander
Each ant redraws a random wander offset every `WANDER_INTERVAL` (randomised by ±50%):
- On redraw it draws an offset, sets the **wander heading** to `current heading + offset` (wrapped), and steers toward that absolute heading under `TURN_RATE`. The heading persists until the next redraw.
- Between redraws, wander steers only when there is no direct sight and no marker: the ant keeps converging on the wander heading (§5.3's fallback).
- Picking up food or reaching the nest flips the heading by π and resets the wander heading to the new heading, so a carrier walks back the way it came.
- §5.3's fallback tie-break compares against the wander heading.

*(Fix, 2026-10-25: the original rule applied the offset only on the redraw tick, so wander barely steered and a pinned ant turned away very slowly. Two other forms fail too: adding the offset to `desired` every tick makes `desired = heading + offset` a permanent turn, so ants circle at radius `v / ω ≈ 8` u; and taking the fallback ray nearest that relative target does the same, because the ray fan rotates with the heading and no ray sits exactly on the target. Hence one absolute wander heading per redraw, and a straight run along it whenever its look-ahead is free.)*

Starting values are below. Tune them so Explorers leave an established highway roughly **10× more often** than Followers.

| Role | `WANDER_INTERVAL` | `WANDER_ANGLE` |
|---|---|---|
| Follower | 0.4 s | 0.3 rad |
| Explorer | 0.25 s | 1.0 rad |

**Randomness.** Every random number comes from a counter-based hash, `rand(seed, uid, tick, stream)`. There is no shared random-number state, so results don't depend on how threads are scheduled.

### 5.5 Stuck detection and blocked routes
An ant is stuck when `time_since_last_marker > STUCK_TIMEOUT` (2.5 s), meaning it hasn't advanced `MARKER_DROP_DIST` in that time. Then:

1. It turns around: `heading += π + rand(−0.6, 0.6)`.
2. It resets: `time_since_last_marker = 0`, `drop point = pos`.
3. It sets `degrade_timer = DEGRADE_TIME` (3 s), but **only if** both hold:
   - it is outside every nest and food zone,
   - fewer than `CROWD_LIMIT` ants are within `3 × ANT_RADIUS` of it, counted through the spatial hash.

*(Fix: a traffic jam at the nest isn't a dead end. Without this check, crowds would erase the busiest trails.)*

### 5.6 Energy and life cycle
- Energy starts at `ENERGY_MAX` (100) and burns at `ENERGY_BURN` (0.5 per second), which gives about 200 s of autonomy.
- It refills to 100 when the ant touches its own nest or any food source.
- At 0 the ant dies of hunger (removed in phase 5).

**Life cycle** (`LIFE_CYCLE`, default on; added 2026-10-31 at Marek's request). A colony grows only while food comes in faster than it is eaten, and shrinks when it does not:
- **Meals at home cost food.** Eating at the own nest takes `FOOD_PER_ENERGY` (0.01) stored food per unit of energy, so a full meal from empty costs 1 food and an ant eats about 0.3 food a minute. When the stores run short the ant eats what is left; with empty stores it gets nothing and, in time, starves. Eating at a food source stays free: the ant feeds where it finds food.
- **Old age.** Each ant lives `ANT_LIFESPAN` (600 s) × a factor drawn once from `[1 − LIFESPAN_JITTER, 1 + LIFESPAN_JITTER]` (stream `Lifespan`). The starting ants begin part-way through their lives, with ¼ to all of a life left (stream `StartingAge`), so the first generation does not die all at once. An ant whose life runs out dies in phase 5.
- **Births.** The queen lays at `BIRTH_RATE_BASE + BIRTH_RATE_PER_ANT × population` eggs per second (more ants, more nurses) and only from food above the **reserve**: `RESERVE_SECONDS` of the colony's eating at home, `RESERVE_SECONDS × ENERGY_BURN × FOOD_PER_ENERGY × population`. Each colony starts with its reserve in the stores. See §4.5.
- **Why a reserve** (with future fighting in mind): the reserve feeds the colony through a lean spell and lets it rebuild after losing ants, because the reserve shrinks with the population and the food above it goes back into eggs. A colony that loses its food sources loses its income and shrinks by age and hunger. Deaths are counted by cause per colony (`born`, `diedOfAge`, `diedOfHunger`), so deaths in fights can be added as a third cause.
- Ants that die leave nothing behind yet; on the fighting branch, dead ants may be carried home as food.
- With `LIFE_CYCLE` off, ants never age, meals are free and births are instant (the rules before 2026-10-31). The legacy checksum test runs with it off.
- Scenarios may override the burn rate (§10's maze sets 0.2, so an ant has 200 s to search instead of 133 s and can reach food 157 s away).

### 5.7 Homing memory (path integration)
A returning ant that can neither see food nor sense a trail still has a rough idea of where home is, from its own movement. Spec §1 allows the ant's own memory, and this is it: it rescues carriers that lose the trail far from the nest. `HOMING_ENABLED` (default on) gates the whole rule.

- **Estimate.** Every ant keeps `home_err = (0, 0)`, reset on spawn and whenever it touches its own nest.
- **Drift.** On each wander redraw (§5.4) the estimate accumulates the error of the leg just walked: `home_err += (rand(−1, 1), rand(−1, 1)) × HOMING_DRIFT × speed × interval`, with the pair drawn from the `HomingDrift` stream. `HOMING_DRIFT` (0.04) is the fraction of a leg's length the estimate can be off by.
- **Use.** In §5.3's priority chain, when direct sight and markers both come up empty, an ant in `ReturningFood` or `ReturningExhausted` steers toward `nest + home_err` instead of its previous heading. The wander fallback is skipped that tick; wall steering still applies.

*(Measured with 200 ants on the reach harness: a lone carrier 800 u from the nest with no trail at all delivers in about 17 s with the rule on, and never with it off.)*

---

## 6. Crowd physics

### 6.1 Predictive avoidance (PBMAD-style)
Based on Weiss et al., *Position-Based Multi-Agent Dynamics for Real-Time Crowd Simulation* (MiG 2017, arXiv:1802.02673). Pezzza links this paper in his June 2026 video.

- **Time-slicing.** Ants with an even `uid` recompute on even ticks and ants with an odd `uid` on odd ticks. Each ant stores its correction and reuses it on the tick in between. *(Claude's call: the original "×2 on one tick, nothing on the next" jitters; `uid` parity is used because array indices change when ants are removed.)*
- **Which neighbours count.**
  - Only ants in front: `dot(p_j − p_i, forward) > 0`.
  - Only ants within `R_AVOID = min(2 × speed × T_HORIZON, R_AVOID_MAX)`.
  - At most the `MAX_NEIGHBOURS` (16) nearest.

  The defaults are `T_HORIZON` 1.0 s (slider 0.25–2.5 s) and `R_AVOID_MAX` 24 u. *(Fix: the original `2 × speed × 2.5 s` is a radius of about 250 u, which means thousands of neighbours per ant in a dense stream.)*
- **Time to collision.** The smallest `t > 0` with `|Δp + Δv·t| = r_i + r_j`, where `Δp = p_j − p_i` and `Δv = v_j − v_i`.
- **Correction.** If `0 < t < T_HORIZON`:
  1. predict both positions at the moment of contact;
  2. take the collision normal `n` between those predicted positions;
  3. take the overlap the pair would have one step after contact and project it onto the **tangent** (perpendicular to `n`), so ants slip past instead of braking;
  4. scale by the urgency `(1 − t / T_HORIZON)` and by `m_j / (m_i + m_j)`, so unloaded ants give way to ants carrying food.
- **Exactly head-on** (tangential part ≈ 0): both ants sidestep to their own right *(Claude's call: always picking the same side makes lanes form)*.
- **Output.** A sideways velocity, capped at `AVOID_MAX_SPEED` and blended into steering. It is never a position jump.
- **Implemented in M4 (Claude's call, replacing the projection step above):** for each neighbour that will touch within `T_HORIZON`, take the lateral part of the relative miss at contact (the part across the relative motion, pointing away from the other ant). Exactly head-on, that part is zero, so both ants sidestep to their own right. Scale by `sp × urgency × m_j / (m_i + m_j)`, sum over neighbours, cap at `AVOID_MAX_SPEED`, then blend into the heading before the wall check, so walls still win. Ants inside their own nest radius are skipped.
- **Open (M4 finding):** the away-from-the-other-ant rule is mirror-symmetric, so off-axis pairs repel instead of forming lanes. Always sidestepping to the own right raised the `lanes` score only from 0.47 to 0.56 and doubled overlap, so it was not adopted. A lane rule needs a decision from Marek; see the M4 report.
- **Lane rules (M4 tuning, 2026-10-31; both off by default):**
  - `SIDESTEP_RIGHT_BIAS`: each sidestep direction is `away + bias × own_right`, normalised. For two ants walking at each other both terms flip sign between them, so the pushes stay mirror images and the pair agrees on right-hand passing.
  - `LANE_KEEP`: while any oncoming ant is in front among the avoidance neighbours, add a drift of `LANE_KEEP × AVOID_MAX_SPEED` to the own right before the cap.
  - Measured on the crowd (4 seeds): lane keeping raises `lanes` from about 0.45 to about 0.64, but overlap rises to 5–10%, because the drift packs each lane tight. No setting met lanes ≥ 0.70 and overlap ≤ 1% together; see the M4 tuning report. **Marek's decision (2026-10-31): keep both rules off and drop the lanes target for now; spacing matters more than tidy lanes.**

### 6.2 Hard collisions (PBD)
- Run 2 Jacobi iterations per tick.
  - For each ant, in parallel: sum the corrections from neighbours closer than `2 × ANT_RADIUS`, weighted by inverse mass. Divide by the contact count and write the result into a scratch buffer.
  - Then apply all scratch corrections at once.
- After the ant-against-ant pass, push ants out of border obstacle boxes. Walls always win.
- Velocity is recomputed from the corrected movement.
- **Nest exemption (M4):** an ant within `nestRadius × NEST_EXEMPT_FACTOR` of its own nest neither pushes nor is pushed by ant-to-ant corrections, so entrance pile-ups do not block deliveries. Walls still apply. *(M4 tuning: the factor is 1.5, which took reach at 1500 u from 51 to 105–120 deliveries in minute 3. A matching exemption at food piles was tried and dropped: it helped less and lowered the 1000 u row.)*
- **Coincident ants (M4):** two ants at the same point separate along a fixed direction per pair, derived from a hash of their uids, antisymmetric between the pair, so the result is deterministic and never NaN.

### 6.3 Determinism and threading rules
- Ants are processed in **fixed-size chunks** (`CHUNK_SIZE`, 1024), whatever the thread count.
- Parallel phases write only their own ant slots and their own chunk's event list. Serial phases consume the event lists in chunk order.
- No floating-point sums across threads: sum per chunk, then combine the chunk sums in chunk order.
- User edits (brushes, buttons) are queued and applied between ticks.
- **Required test:** with the same seed, scenario and inputs, the state after N ticks is bit-identical with 1 thread and with 8 threads.

---

## 7. Rendering

Each frame draws these layers in order, with one draw call per layer:

1. **Terrain.** A procedural fragment shader over one obstacle mask: one RGBA texel per obstacle cell (R rock, G water, B sand, A mud; linear, mipmapped). It draws two-tone ground with grain, rocks with a lit rim and a shadow to the bottom-right, water darker in the middle with a pale shoreline and a slow shimmer, and sand and mud with ripples. Edges stay sharp at any zoom. The mask is rebuilt only when the map changes. At 2880 × 1620 on the laptop GPU the shader pass costs 3.9 ms (mixed map), 2.4 ms (open ground) and 7.0 ms (rock everywhere). A frame therefore draws the terrain into a screen-size copy and reuses it until the view, mask, theme or water shimmer (10 Hz) changes.
2. **Marker heatmap**, if enabled, at marker-grid resolution: one world-sized quad with linear filtering.
   - **Colonies (default, M1.7):** each cell takes its owner's luminous trail colour, the palette entry lifted for dark ground (`trailHex`). Food trails are bright and home trails dim (60%), in the same hue. Where a rival is as strong as the owner, the colour greys by up to 55%, so hues never mix. Alpha `0.62 × min(1, √total)`, where `total` sums every colony's `max(to_home, to_food)`. The run legend lists each colony and the bright/dim key.
   - **Trail type:** `to_home` teal `#4FC3B0`, `to_food` amber `#F0B45E`. The colour is the pure hue mixed by food share, and the alpha is `0.62 × min(1, √(home + food))`, so a faint trail keeps its hue. The layer draws additively, so trails glow on dark ground. The run legend names both channels.
   - **Off.**
3. **Food and nests.** Food shows 1–48 sprite pieces (Seeds, Berries or Leaves). Each colony's anthill is a 256 px sprite drawn at `2.6 × nest radius`: a lit mound with soil scattered round it, a dark entrance, a colony-coloured ring at the foot (0.14 r wide at 95% alpha), and a colony-colour glow out to 1.5 r. The crest is tinted 20% toward the colony colour (M1.7). A nest is never smaller than 28 CSS px. It is rotated deterministically per colony id and tinted grey when extinct (the ring stays).
4. **Shadows.** Ant bodies and food pieces cast a shadow: the sim's `shadowOffsetX/Y` (2, 3) in world units times the zoom, 35% black, in one shadows batch drawn beneath the nests, food, legs and ants.
5. **Ants.** A procedural atlas. The gaster is the colony colour. The waist, thorax and head take it 55% toward dark brown, and a white sheen marks the carapace (`antColors`, M1.7). Legs and joints stay dark; the antenna tips take the colony colour. A small ant is one colour all over, with a 2 px outline. An ant is never drawn shorter than 4 CSS px. Two variants per colony, body facing +x, drawn as screen-aligned quads at interpolated positions. Carried food is a seed sprite at the mandibles.
6. **Legs.** Screen-space two-segment legs, six per ant, animated when the ant is at least `LEGS_MIN_PX` (18) physical pixels long; below that a baked-leg frame is used (§8).
7. **Debug overlays:** for the selected ant its sample points, rays and avoidance neighbours; spatial hash and border colliders in developer mode.
8. **The DOM UI overlay.**

- **No image assets.** The atlas and every terrain texture are generated from code at startup or on map change.
- **Batching and culling:** one vertex buffer and one `drawElements` per layer. Only ants and pieces inside the view plus a margin are emitted; there is never a draw call per ant or per leg.
- **Smooth motion:** the renderer draws `lerp(prev, pos, alpha)`, where `alpha` is the leftover fraction of the fixed-step accumulator. Motion stays smooth at 120 Hz with a 60 Hz simulation.
- **Speed controls:** pause, single step, and 1×, 2× and 4× speed run more ticks per frame. **Max** runs as many ticks as fit in the frame, capped so the app can never spiral into lag.
- **Themes** are the five map presets (§10), not a settings toggle. Each preset owns its ground, outside, grid, border, food and heat colours plus four obstacle colours.
- **Camera:** map-style input, see §9. Follow mode keeps the selected ant centred. The camera starts with the whole world fitted to the window.

---

## 8. Visual tripod gait

- **Render-only.** The simulation stores no leg state. For each visible ant the renderer keeps a phase advanced by distance travelled (`stride = 24 u`), seeded from the ant's uid when it first appears. No simulation state, no randomness.
- **Numbering.** Left front, middle and hind legs are 0, 1, 2; right front, middle and hind are 3, 4, 5.
- **Tripods.** **A = {0, 2, 4}**, **B = {1, 3, 5}**. `wave = sin(2π × phase + (tripod A ? 0 : π))`; the tripod whose wave is positive swings, the other stays planted with `lift = 0`.
- **Geometry.** Six legs, each two screen-space segments (hip→knee, knee→foot). Body-local rest positions, hips and foot sweep are fixed fractions of ant length; the swing displaces the foot ±0.22 body lengths along the heading. The knee sits between hip and foot, offset outward by 0.12 body lengths. The body-local pose is rotated by the ant's screen-space heading.
- **Which ants get legs.** Only ants at least `LEGS_MIN_PX` (18) physical pixels long on screen. Smaller ants use the baked-leg sprite frame, so detail never shimmers. This is a pixel threshold rather than a zoom factor so it holds for any world size and DPI.
- **Invariant (unit-tested):** the swing intervals of tripods A and B never overlap.
- **Shadows.** Legs cast no shadow of their own; the body shadow in §7.4 stands in for them.

---

## 9. UI and controls

The UI is a DOM overlay (HTML/CSS) above the WebGL canvas, crisp at any display scale. **H** toggles Zen, which hides the HUD.

**Screens.** A pure session state machine owns three screens:

- **Home.** Wordmark, a serif headline over a dimmed live meadow, **Quick start** and **New world**, and a Last run card (preset, elapsed time, delivered, ants, colonies).
- **Builder.** A left tool rail (Select, Colony, Food, Rock, Water, Sand, Mud, Erase), a glass left panel (five preset cards, seed with roll, selected colony's palette colour and starting ants, selected food kind and amount, brush radius), the canvas with a 6% 120 u grid and a brush ring, a top bar with Back and Start, and a validation line naming the first problem. Start is disabled while `validateSetup` fails. The builder edits a `WorldSetup`; no simulation runs.
- **Run.** A glass top bar (wordmark, preset and seed, tick/ants/delivered/FPS chips, Colonies and Settings) and a bottom dock (Pause/Play, 1×/2×/4×/Max, Reset, Edit, Finish), with a legend that lists each colony in Colonies view, or names the Home (teal) and Food (amber) trails in Trail type view. Overlays: a pause menu (Resume, Step, Restart, Edit world, Finish run), a colony panel (per colony: swatch, population, delivered, food pool, extinct), a settings drawer (live sliders and switches, Fit, Reset parameters) and a finish dialog (Confirm Finish returns Home).
- **Stopping.** Finish ends the run and stores its summary; Reset rebuilds the same setup from tick 0; Edit pauses and returns to the Builder. A running world is never mutated in place — Start and Reset build a fresh world from the setup.

**Camera:** the view is a map. Left-drag pans on Run once the press moves 4 px; on the Builder it pans over empty ground with Select, or while Space is held. Right- or middle-drag pans on every screen. A trackpad's two-finger scroll pans, and its pinch zooms at the cursor. A mouse notch zooms at the cursor over 120 ms. Touch pans with one finger and pinch-zooms with two; in the Builder one finger paints and two fingers move the camera. Arrow keys and W, S, D pan at 900 CSS px/s while held; A pans only in the Builder, because on Run it toggles the ants. + and − zoom 1.25× about the centre. Double-click zooms 2× at the point on Run. Home fits the whole world. The zoom floor is 0.6 × the fit scale, the ceiling is 16 px per unit, and the centre stays inside the world. A screen fits the camera on entry; `--zoom` and `--focus` apply the close-up on Run.

**Speed:** pause, single step, 1×, 2×, 4× and Max (as many ticks as fit, capped).

**Keys:**

| Key | Action |
|---|---|
| P | pause |
| Space | step one tick (while paused) |
| H | Zen mode |
| M | cycle the trail view: Colonies, Trail type, Off |
| A | toggle ants |
| G | toggle the grid |
| F | follow the selected ant (Run; any pan, arrow or WASD key cancels it) |
| V | show the selected ant's sensors (Run) |
| Home | fit the whole world |
| + / − | zoom about the view centre |
| Arrows, W, S, D (A in the Builder) | pan while held |
| Esc | deselect or cancel a pending preset |
| Delete / Backspace | remove the selected colony or food (builder) |
| 1–8 | choose a builder tool (Select, Colony, Food, Rock, Water, Sand, Mud, Erase) |

**Mouse:** left uses the current builder tool (or pans, see Camera), right or middle drag pans, the wheel zooms at the cursor. On Run, a click (a press that moves less than 4 px) picks the nearest ant within 12 px and opens the inspector; a click on empty ground clears the selection.

**Inspector (M5):** the selected ant's name (from its uid), colony, energy, role, what it is doing, whether it carries food, speed, heading and time since its anchor. Follow keeps the camera on it; Sensors draws its cone, its sample points (brighter where the marker is stronger) and the point it can see directly. The selection is by uid and clears on Reset, Edit, Finish and Back. When the ant dies, the panel says so. The inspector shares the right-hand slot with the settings drawer; opening settings hides it, and the selection stays.

**Telemetry (M5):** each colony row carries two sparklines, delivered per second and ants, sampled once a second over the last two minutes.

This replaces the M1 control drawer; its sliders move into the settings drawer. The **Degrade after** slider returned with M2, when stuck detection exists, and it is live again: M5 restored its row in the trails group. M1.7 adds **Territory pressure** (`FOREIGN_ERASURE_FACTOR`, 0–1, default 0.5) and **Foreign scent aversion** (`FOREIGN_AVERSION`, 0–1, default 0.35) to the Trails group.

---

## 10. Map presets

A preset is a named `WorldSetup`: size, seed, colonies (nest, palette colour, starting ants), food (position, amount, kind), painted obstacle cells, and optionally `breach` rectangles and `paramOverrides` for the scenario's own parameters. Editing happens in the builder and never mutates the preset. Six ship:

| Preset | Size | Character |
|---|---|---|
| **Meadow** | 1920×1080 | one Ember colony, Seeds and Berries, rock clusters, a sand drift, a mud patch |
| **Dunes** | 1920×1080 | Ember and Azure, a central Leaves pile, exposed rock, a mud oasis, broad sand |
| **Creek** | 2240×1200 | Fern and Rose, a river with two rock crossings, sandy banks, food on both banks |
| **Boulder field** | 1920×1080 | one Gold colony, many boulder clusters, moss tufts, two food piles |
| **Maze** | 1920×1080 | one colony at (90, 960), 20 000 food at (90, 120), three 24 u rock walls with alternating 160 u gaps, a route of about 7 800 u; `breach` holds the left ends of the outer walls; `paramOverrides` sets `energyBurn` 0.2, and for the life cycle `antLifespan` 1800 and `reserveSeconds` 900, so the colony outlasts the ten minutes before the breach |
| **Blank canvas** | 1920×1080 | no colonies, food or obstacles; the builder starts empty |

The maze's outer walls (y = 270 and 810) open at their right ends (x 1760–1920) and the middle wall (y = 540) at its left end (x 0–160). Opening the breach — the run HUD's "Breach shortcut" button, `?breach=<tick>` or `--breach-tick` — clears the left ends of the outer walls, leaving a straight route of about 840 u up the left side (acceptance evidence in §15).

The exact positions, colours, starting populations and validation are pinned in the presentation-overhaul plan (Task 5). Every non-blank preset passes `validateSetup`. The legacy `sandbox` name maps to `meadow`. The four-colony war and stress scenarios move to later milestones; the M4 bench will generate its opposing-stream world.

---

## 11. Verification and tooling

Four entry points, all started by npm scripts:
- **`npm run serve`** opens the interactive app in Chrome. URL parameters `?preset=<id>&seed=<n>&screen=<home|builder|run>&zoom=<n>` choose what to start with; `?headless&ticks=N&size=WxH&zoom=<n>` runs without UI and renders one final frame. `?scenario=sandbox` is accepted as a deprecated alias for `meadow`. `?breach=<tick>` opens the preset's breach segments once the run reaches that tick.
- **`npm run screenshot -- --preset <id> --screen <home|builder|run> --zoom <n> --ticks N [--breach-tick N] --out <file.png>`** serves the page, drives Chrome headless and saves the final frame as a PNG, so Claude can look at the result.
- **`npm run bench -- --preset <id> --ticks N [--threads T]`** runs the simulation under Node and prints the average and 95th-percentile milliseconds per phase, plus ant updates per second. No rendering.
- **`npm run reach`** runs the foraging-range harness under Node and prints its table: one colony at 500/1000/1500/2000 u, a contest row where two colonies see one pile from opposite sides, and the maze row with its breach at minute 10 (§15's M2 evidence).

Unit tests (`node:test`, run by `npm test`) cover:
- setup editing, clamping, validation and preset integrity;
- world construction from setup, colony colours and stable identity;
- obstacle solidity, border flags, terrain speed factors and line of sight;
- deposits, foreign-cell erasure, the ownership flip and degrading;
- decay half-life being independent of frame rate;
- exhausted ants never depositing `to_food`;
- food piece layout and consumption order;
- the stuck rule, including the crowd exemption;
- the tripod invariant and gait phase;
- spatial hash neighbours matching a brute-force search;
- the `uid → index` map staying correct through spawns and removals;
- sessions, options, view models and the atlas layout;
- **determinism:** the same seed and inputs give the same checksum, and 1 worker and 8 workers agree (M4).

Rules:
- Run the tests after every change to the simulation.
- Check behaviour by taking a headless screenshot and looking at it.
- Performance claims only come from `npm run bench` runs, and must say whether the laptop was plugged in.

---

## 12. Parameters (starting values; all tunable)

| Name | Default | Unit | Notes |
|---|---|---|---|
| `SIM_HZ` | 60 | Hz | fixed step |
| `WORLD_W × WORLD_H` | 1920 × 1080 | u | scenarios override |
| `MARKER_CELL` / `OBSTACLE_CELL` / `HASH_CELL` | 8 / 4 / 6 | u | hash cell ≥ 2 × `ANT_RADIUS` |
| `ANT_RADIUS` / `ANT_LENGTH` | 2.5 / 10 | u | collision circle / sprite length |
| `ANT_SPEED` / `SPEED_JITTER` | 50 / 10 | u/s / % | |
| `TURN_RATE` | 6 | rad/s | |
| `SENSOR_RADIUS` / half-FOV | 32 / 60 | u / ° | |
| `FOLLOWER_SAMPLES` / `EXPLORER_SAMPLES` | 25 / 6 | | |
| `FALLBACK_RAYS` / `FALLBACK_RANGE` | 12 / 48 | – / u | |
| `LOOK_AHEAD` | 20 | u | free space required before wall steering turns an ant |
| `EXPLORER_RATIO` | 10 | % | slider |
| `WANDER_INTERVAL` (F / E) | 0.4 / 0.25 | s | |
| `WANDER_ANGLE` (F / E) | 0.3 / 1.0 | rad | |
| `MARKER_DROP_DIST` | 8 | u | |
| `EMISSION_DECAY` | 0.11 | 1/s | slider "Trail fade with distance", range 0.005–0.2 |
| `MARKER_HALF_LIFE` | 15 | s | slider |
| `MARKER_EPS` / `MARKER_DETECT_MIN` | 1e-4 / 1e-3 | | |
| `TERRITORY_RULE` / `FOREIGN_ERASURE_FACTOR` | on / 0.5 | | rival layers × `1 − e × factor` per foreign deposit (§4.2) |
| `FLIP_MARGIN` | 1.25 | | an owner keeps a cell until a rival is this many times its strength (§4.2, M1.7) |
| `FOREIGN_AVERSION` | 0.35 | | rival scent comes off an ant's own signal on each sampled cell (§4.2, §5.3, M1.7) |
| `STUCK_TIMEOUT` / `DEGRADE_TIME` / `DEGRADE_FACTOR` | 2.5 / 3.0 / 0.5 | s / s / – | |
| `CROWD_LIMIT` | 4 | ants | within 3 × `ANT_RADIUS` |
| `STUCK_TURN_JITTER` / `CROWD_RADIUS_FACTOR` / `ZONE_MARGIN` | 0.6 / 3 / 16 | rad / × `ANT_RADIUS` / u | the ±0.6 turn, the "3 ×" crowd radius and the nest/food zone margin from §5.5 |
| `ENERGY_MAX` / `ENERGY_BURN` / `EXHAUSTED_AT` | 100 / 0.5 / 60 | – / per s / – | the maze overrides the burn to 0.2 (§10) |
| `HOMING_ENABLED` / `HOMING_DRIFT` | on / 0.04 | – / fraction of a leg | Settings switch "Homing memory"; §5.7 |
| `ANT_COLLISIONS` / `NEST_EXEMPT_FACTOR` | on / 1.5 | – / × nest radius | Settings switch "Ant collisions" (off restores the pre-M4 ghost ants); §6.2 |
| `PUSH_ON_SIGNAL` | 0.4 | | |
| `MASS` / carrying | 1 / 3 | | |
| `SPAWN_COST` | 5 | food | |
| `LIFE_CYCLE` | on | | §5.6; off restores free meals, no old age and instant births |
| `ANT_LIFESPAN` / `LIFESPAN_JITTER` | 600 / 0.25 | s / ± fraction | §5.6 |
| `FOOD_PER_ENERGY` | 0.01 | food per energy | a full meal from empty costs 1 food |
| `RESERVE_SECONDS` | 120 | s | stores the queen keeps back, in seconds of the colony's eating |
| `BIRTH_RATE_BASE` / `BIRTH_RATE_PER_ANT` / `BIRTH_BURST` | 1 / 0.004 / 3 | eggs per s / per ant per s / eggs | §4.5 |
| `NEST_BASE_R` / `NEST_GROWTH` | 20 / 0.4 | u | r = base + growth × √population |
| `FOOD_BASE_R` / `FOOD_REF_AMOUNT` | 12 / 500 | u / units | |
| `FOOD_MIN_R` | 4 | u | smallest drawn and touchable food radius |
| `MAX_COLONIES` / `NEW_COLONY_ANTS` | 8 / 200 | | |
| `MAX_ANTS_TOTAL` | 50,000 | | |
| `T_HORIZON` | 1.0 | s | slider 0.25–2.5 |
| `R_AVOID_MAX` / `MAX_NEIGHBOURS` | 24 / 16 | u / – | |
| `AVOID_MAX_SPEED` | 0.5 × `ANT_SPEED` | u/s | |
| `PBD_ITERATIONS` | 4 | | M4 tuning: 2 left 3.6% of the crowd overlapping |
| `SIDESTEP_RIGHT_BIAS` / `LANE_KEEP` | 0 / 0 | – / × `AVOID_MAX_SPEED` | §6.1; off until Marek picks a lane trade-off |
| `LEGS_MIN_PX` | 18 | px | on-screen ant length |
| `GAIT_STRIDE` / `GAIT_SWING` / `GAIT_KNEE` | 24 / 0.22 / 0.12 | u / × length / × length | visual only |
| `SAND_SPEED` / `MUD_SPEED` | 0.60 / 0.45 | × | terrain speed |
| `FOOD_PIECE_UNITS` / `MAX_FOOD_PIECES` | 100 / 48 | units / pieces | visual mapping |
| `SHADOW_OFFSET` | (2, 3) | u | world units, times the zoom (M1.6) |
| `CHUNK_SIZE` | 1024 | ants | |

---

## 13. Code layout

```
package.json, tsconfig.json, index.html, styles.css
src/app/     browser entry, URL/CLI options, session machine, controller, bench CLI, headless and interactive modes
src/core/    vector math, counter-based RNG, fixed-step clock, stats, timers
src/sim/     params, setup, world grids, obstacles, ants (SoA in typed arrays), colonies, food, presets, tick phases
src/render/  camera, batches, WebGL2 renderer, procedural atlas, sprites, legs, food layout, terrain texture, themes, world view
src/ui/      design-system helpers, screens, HUD, panels, builder model, view models
tests/       node:test unit tests
tools/       static server, Chrome launcher, headless screenshot driver
docs/        specs and plans
```

The simulation (`src/sim`, `src/core`) must not touch the DOM, WebGL or Chrome APIs, so it can be tested and benchmarked on its own under Node.

The full file-by-file structure, build targets and every module's interface are in [2026-10-25-ant-simulator-structure.md](2026-10-25-ant-simulator-structure.md).

---

## 14. Open topics (not in v1)

- **Inter-colony hostilities.** The user wants combat later; it isn't designed yet. These pieces will already exist to build on:
  - a colony id on every ant,
  - neighbour queries through the spatial hash,
  - reserved state values,
  - the territory rule and foreign-scent aversion (M1.7), which are v1's only cross-colony interactions.
- Painting food with a brush (as in Pezzza's original) and loading maps from images.
- Saving and loading.
- Larger scales through GPU compute.

---

## 15. Milestones

Each milestone ends with a running app and the checks listed.

| # | Milestone | Done when |
|---|---|---|
| M0 | **Skeleton.** npm/TypeScript project and test harness, DPI-aware WebGL2 canvas at native resolution with a DOM debug panel, fixed-step loop with interpolation, camera, URL/CLI modes, RNG, headless screenshots, bench | The page opens crisp at devicePixelRatio 2; the log says `webgl2`; a headless screenshot works; tests run |
| M1 | **Core foraging, one colony.** SoA ants in typed arrays, nest, food, marker grid, wander, energy and states, spawning, ants and dual-channel heatmap drawn, phase pipeline, night view and the control drawer | In the sandbox, a trail forms between nest and food on its own; screenshot reviewed; tests cover deposit, decay and state changes. **Done 2026-10-25** |
| M1.5 | **Presentation & world builder.** Home/Builder/Run screens; staged setup; palette, starting populations and several colonies; Rock/Water/Sand/Mud with terrain speed and collision; five presets; food clusters; procedural ants with tripod gait; anthill art; baked terrain; sprite and trail themes; HUD, pause, reset, edit and finish | Every preset validates; a built map runs with the chosen colonies and obstacles; all acceptance screenshots pass. **Done 2026-10-25** |
| M1.6 | Camera and looks. Map-style pan and zoom (drag, pinch, two-finger scroll, touch, keys, bounds); visible glowing trails; procedural terrain shader; anthill mounds; ant and food shadows | The camera checklist passes on the laptop; acceptance screenshots at zoom 1, 4 and 6 look sharp; terrain costs under 3 ms per frame. **Built 2026-10-25; the laptop camera checklist is pending.** Evidence: 246 tests; bench 0.464 ms average, 0.607 ms p95 (meadow, 1200 ticks, plugged in; budget 0.481 ms). The terrain pass is 3.9 ms on a mixed map, so the 3 ms bar holds on idle frames (0.8 ms copy) but not on camera-move or shimmer frames. See the M1.6 report. Marek accepted the 3.9 ms pass on camera-move and shimmer frames for now (2026-10-25). |
| M1.7 | Colony identity and scent competition. Trails, ants and nests take their colony's colour, and Colonies is the default view. Scents compete per cell: Territory pressure, a flip margin with hysteresis, and foreign-scent aversion. | Screenshots with four or five colonies at fit zoom, zoom 6 on ants, a nest close-up and a contested border look right; the reach guard holds (contest colony B at least 63 deliveries in minute 3); tests pass. **Built 2026-10-26; merged into main 2026-10-31.** Evidence: 258 tests; reach contest colony B 1 / 58 / 122 per minute (M2: 1 / 58 / 84); single-colony reach rows unchanged. The bench runs were on battery and are not quoted. See the M1.7 report. |
| M2 | Navigation and foraging. Wander fix; sliding along walls and edges; look-ahead steering and fallback rays; spatial hash; stuck detection with dead-end trail erasure; spawn safety; reach harness; retuned trail and energy defaults; homing memory; one trail layer per colony; maze preset with a breach control | On the boulder preset fewer than 5% of ants touch rocks (or 3x fewer than before); reach harness: at 1000 u the first delivery comes within 60 s, and at 1500 u ants deliver in minute 3; the far colony in the contest delivers; in the maze, deliveries per minute after the breach are at least 3x those before it. **Done 2026-10-25.** Evidence: boulder ants touching rock 0.0211 → 0.0007 (3.3% → 0.07%); reach first delivery 36.3 s at 1000 u, 84 deliveries in minute 3 at 1500 u; contest colony B 1 / 58 / 84 per minute (was 0); maze 4 deliveries in minutes 7–9 against 1016 in minutes 12–14 after the breach at 10:00 (ratio 254); 228 tests; bench 0.448–0.457 ms avg across runs, plugged in |
| M3 | **Absorbed and closed.** Multi-colony setup, palette, territory and the colony heatmap shipped in M1.5. Only inter-colony hostilities (§14) remain, and they are not scheduled. | — |
| M4 | **Ant collisions and avoidance (single thread).** Spatial-hash neighbour queries; PBD ant-to-ant collisions with walls winning; nest exemption; PBMAD-style sidestepping; collision settings; highway preset and crowd scenario | No overlap (≤ 1%); lanes ≥ 0.70; reach within 75% of M2; 2000 ants ≤ 6 ms per step plugged in. **Built 2026-10-25, tuned 2026-10-31, merged into main; not counted as done.** Lanes target dropped by Marek (2026-10-31: keep ants spaced, streams mixed). After tuning: reach 1500 u 120 (pass); overlap about 1% on seeds 1–3 but 2.2% on seed 7; lanes 0.45 (fail); crowd step 0.89× the pre-tuning time on this PC, not the 0.70× the 6 ms target needs (fail). See the M4 tuning report. |
| M4.5 | **Scale.** Worker pool over SharedArrayBuffer typed arrays, cross-origin isolation headers, a 20,000-ant stress scenario, determinism with 1 and N workers | 20,000-ant bench recorded; 1 and 8 workers give identical checksums; the page holds 60 Hz at 20,000 ants. Not started. |
| M5 | **Inspector and telemetry. Built 2026-10-26; waiting on Marek's check.** Ant inspector with follow and names, sensor drawing, telemetry with sparklines, and the live `degradeTime` control once M2 makes degradation fire | Zoomed-in inspector screenshots look right; the inspector follows one ant through a food trip. Evidence: see the M5 report (tests, golden checksum, screenshots). |
| M6 | **Tuning and hardening.** Tune the defaults toward the look of the videos, performance passes, edge cases (painting over nests or food, extinct colonies, ant caps) | User is happy with how it looks and feels |

M1.5 absorbed the obstacle editing, multi-colony setup and visual work previously listed under M2, M3 and M5, and closed them. Navigation and foraging range, formerly part of a separate mechanics project, are now M2. Ant-to-ant collisions stay in M4. Birth and population tuning remain unscheduled. The wall painting, obstacle collision and terrain-speed pieces M2's maze builds on already shipped in M1.5.

---

## 16. Decisions made by Claude (open to change)

1. SDL3 instead of SFML or raylib, because this laptop has no native OpenGL.
2. A fixed 60 Hz simulation with rates expressed per second. The 7.7 s half-life keeps the original ×0.9985 per tick at 60 Hz.
3. Deterministic multithreading through phases, fixed chunks and counter-based randomness, run on a small custom worker pool.
4. Exhausted ants deposit nothing.
5. Being stuck only triggers trail erasure away from nests and food, and outside crowds.
6. Avoidance limited to a 24 u radius, the 16 nearest ants and a 1.0 s horizon. It is time-sliced by `uid` parity, the correction is reused on off-ticks, and head-on cases sidestep to the right.
7. **Browser TypeScript 5.9 + WebGL2 instead of C++20 + SDL3** (2026-10-25). Smart App Control blocks unsigned Windows executables and the user will not disable it. A browser app keeps the same simulation design, reaches the GPU through ANGLE/Direct3D 11, and nothing new runs as a Windows program. The completed C++ skeleton is archived on branch `archive/cpp-m0`.
8. **DOM UI instead of Dear ImGui**, because HTML/CSS is crisp at 200% scaling with no dependency, and panels and sliders remain easy to build.
9. **32-bit counter-based RNG** (`mix32`) instead of the C++ 64-bit SplitMix64. JavaScript's fast integer path is 32-bit (`Math.imul`); determinism only needs repeatability, not a particular bit width.
10. **Workers only from M4.** M0–M3 run single-threaded; the phase structure is written so that moving a phase onto workers cannot change results.
7. Legs are locked by tripod group.
8. Obstacle cells are 4 u, and border cells collide as boxes.
9. The territory rule stays in v1 behind a toggle (on by default). Flipping a cell's owner applies the new deposit immediately.
10. Fallback rays break ties toward the wander heading, with a 48 u range. Ants steer straight at food or their nest when they can see it.
11. The legs threshold is an on-screen size (20 px) rather than a zoom factor.
12. The Sand theme is the default, with Night as an option.
13. A serpentine maze with breach segments; scenarios may override parameters such as energy burn.
14. Up to 8 colonies, with Red, Yellow, Blue and Green first.
15. Discrete food sources for v1; a food brush comes later.
16. Wander values, sprite level of detail, and the uid-based female names.
17. **Night is the interactive app's default theme** (2026-10-25). The user asked for a high-end dark UI ("dark background … no lazy shit"); Sand stays in code and returns as a theme switch with the M5 work. This supersedes item 12 for M1.
18. **The control drawer ships in M1** (2026-10-25), not M5. It was part of the user's M1 UI request; the full toolbar, inspector, telemetry and parameter panel remain M5.
19. **Ants are flat batched diamonds in M1** (2026-10-25). Sprites, shadows and legs arrive in M5; the M1 renderer keeps one draw call per layer.
20. **The sandbox long-run acceptance runs 10,800 ticks** (2026-10-25). Tick 7,200 is the first-generation starvation minimum (76 of 200 ants, measured with seed 1); the suite pins the full thresholds (≥100 ants, ≥5 deliveries, both trail channels) at 10,800, and a 7,200 guard (≥40 ants, live trail, finite state) catches a collapse that never recovers.
21. **M1.5 ships before M2** (2026-10-25). Presentation and the world builder were a separate user request; mechanics tuning waits until the app looks and reads as intended.
22. **Staged setup, rebuilt on Start and Reset** (2026-10-25). The builder edits a pure `WorldSetup` — size, seed, colonies with palette colour and starting ants, food with uid and kind, obstacle cells. Start and Reset build a fresh world, and Edit reopens the builder seeded from the running setup while Back discards; a running world is never mutated. This keeps runs deterministic and gives Stop/Reset/Edit a single, simple story.
23. **A procedural sprite atlas, no image assets** (2026-10-25). Ants, food and nests are painted from code into a 2048×1024 atlas, and each map bakes its own terrain texture. The app stays dependency-free and every pixel is reproducible.
24. **Visual-only legs, obstacle-blocked senses** (2026-10-25). The tripod gait is screen-space rendering driven by distance travelled; the simulation stores no leg state. Rock and Water block sight and scent; Sand and Mud scale speed. Obstacle collisions stay in a serial phase.

## Glossary

- **Stigmergy:** coordination through marks left in the environment, here pheromone trails.
- **SoA (Structure of Arrays):** storing each ant field in its own array, which is fast to process in bulk.
- **PBD (Position-Based Dynamics):** resolving collisions by moving positions apart directly.
- **PBMAD:** PBD extended with collision prediction, so agents steer around each other before they touch.
- **Tick:** one fixed simulation step (1/60 s).
- **Anchor:** the last nest or food source an ant touched.
