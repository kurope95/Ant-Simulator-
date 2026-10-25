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
| Window, input, 2D rendering | **WebGL2** in Chrome; one shader; batched triangle vertex buffers |
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
| Marker grid | 8 u | owner colony, `to_home`, `to_food` |
| Obstacle grid | 4 u | `solid` flag, `border` flag |
| Spatial hash | 6 u | ant indices, rebuilt every tick |

All three grids share the same world origin. The obstacle grid is finer than the marker grid so painted walls look less blocky *(Claude's call)*.

### 4.2 Marker grid (one grid shared by all colonies)
Each cell stores three fields, as three separate arrays:
- `int8 owner` (−1 means no owner),
- `float to_home` (0–1),
- `float to_food` (0–1).

Each cell has one owner, so colonies compete for cells.

**Decay (every tick).** Multiply both channels by `f = 2^(−dt / MARKER_HALF_LIFE)`. Values below `MARKER_EPS` become 0, and when both channels are 0 the owner resets to −1.
- The default half-life is 7.7 s. That matches the original "×0.9985 per tick" at 60 Hz, but stays the same at any frame rate. *(Fix: the original per-tick factor made trails fade twice as fast at 120 FPS.)*

**Emission strength.** A deposit has strength `e = exp(−time_since_anchor × EMISSION_DECAY)`.
- The anchor is the place the ant last touched: its nest when laying `to_home`, the food source when laying `to_food`.
- Deposits are strong near the source and weak far from it, so the trail has a gradient that points toward the source.
- For that gradient to survive the marker decay, `EMISSION_DECAY` must exceed the decay rate `ln 2 / MARKER_HALF_LIFE ≈ 0.09/s`; at 0.05 a returning ant's single trail inverted at read time (seed 1: delivered 0, ants walked away from the nest). `0.11` keeps the gradient pointing at the source while leaving roughly a minute of a full trip's deposits above `MARKER_DETECT_MIN`. *(M1 tuning ruling; see the plan ledger.)*
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
1. If `c.owner == k` or `c.owner == −1`: set `c.owner = k` and `c.channel = max(c.channel, e)`.
2. Otherwise, if the territory rule is on (`TERRITORY_RULE`, the default):
   - subtract `e × FOREIGN_ERASURE_FACTOR` from both channels, clamping at 0;
   - if both reach 0, set `c.owner = k` and immediately apply rule 1 *(Claude's call)*.
3. Otherwise (the territory rule is off): leave the cell alone.

**Erasing dead-end trails.** While an ant's `degrade_timer > 0`, each time it enters a new marker cell owned by its own colony, it multiplies the channel it is *following* by `DEGRADE_FACTOR` (0.5). It follows `to_food` while FORAGING and `to_home` otherwise.

All writes to the marker grid happen in the serial event phase (§5.2), in a fixed order.

### 4.3 Obstacles
- A `solid` bitmap at 4 u cells, painted or erased with a circular brush, or set up by a scenario.
- **Only border cells are collidable.** A border cell is solid and has at least one non-solid neighbour among its 4 direct neighbours. Interior cells are never tested, which keeps the original "hollow collider" optimisation.
  - Border flags are recomputed only in the area around each brush stroke.
  - The collision shape is the cell's box (circle-against-box test) *(Claude's call: a circle per cell makes walls bumpy)*.
- **Painting over ants:** each trapped ant moves to the nearest free cell (a breadth-first search up to 16 cells away). If there is none, the ant dies.
- Painting a wall clears the marker cells under it. Food under a wall stays, but can't be reached.

### 4.4 Food sources
- Food sources are discrete circles with a position and an `amount` in units, or are flagged `infinite` for stress tests.
- Radius = `FOOD_BASE_R × sqrt(amount / FOOD_REF_AMOUNT)`, with a minimum.
- They are placed with the Food tool, whose capacity is set by a slider. An empty source disappears.
- All colonies share all food sources.

### 4.5 Colonies and nests
- Each colony has: an id, a colour, a nest position, `food_pool`, population and stats. Up to `MAX_COLONIES` (8) colonies; the first four colours are Red, Yellow, Blue and Green.
- Nest radius = `NEST_BASE_R + NEST_GROWTH × sqrt(population)`, so the nest grows as the colony grows.
- **Spawning.** While `food_pool ≥ SPAWN_COST`:
  - subtract `SPAWN_COST` from `food_pool`,
  - spawn one ant at the nest edge facing outward,
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
| Legs (6 per ant, arrays sized N×6) | `foot_x/y`, `step_from_x/y`, `step_to_x/y`, `step_t`; per ant: `stepping_mask` (u8), `legs_valid` (u8) |

- **Stable ids.** A `uid → index` map is kept in sync on every spawn and removal. Anything that refers to an ant across frames (the inspector, follow mode) stores its `uid`.
- **Removal** is swap-and-pop at the end of the tick, in descending index order so it's deterministic.

### 5.2 Tick pipeline
The simulation uses a fixed time step: `dt = 1/60 s`. Each tick runs these phases:

1. **Build the spatial hash.** Counting-sort the ant indices into 6 u cells (`cell_start[]`, `cell_items[]`).
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
4. **Collisions (PBD).** Rebuild the hash, then run `PBD_ITERATIONS` (2) passes. Each pass resolves ant-against-ant overlaps first, then ant-against-wall, and walls always win (§6.2). Finally set `vel = (pos − prev) / dt`.
5. **Removals.** Ants with `energy ≤ 0` are removed. The hash is rebuilt next tick, so no "ghost collider" of a dead ant can survive.
6. **Marker decay.** Runs in parallel over grid rows.
7. **Stats.** Food delivered per colony goes into ring buffers for the sparklines.

- **Legs** (§8) update after all of a frame's ticks, and only for visible ants.
- **This phase structure is used from Milestone 1 on,** even before workers are switched on in M4.

### 5.3 Sensing and steering
The field of view is ±60°, out to `SENSOR_RADIUS` (32 u).

- **Direct sight.** If the ant's current target is within the field of view and no wall sits halfway between, it steers straight at it. The target is a food source when FORAGING and its own nest when returning.
- **Followers** sample a fixed polar pattern of 25 points in the cone: 5 angles × 5 distances.
  - Points inside walls are skipped, and so are points whose halfway point to the ant is solid (a cheap line-of-sight check).
  - A point's score is the followed channel, counted only in cells owned by the ant's colony.
  - The followed channel is `to_food` when FORAGING, and `to_home` when RETURNING_FOOD or RETURNING_EXHAUSTED.
  - The ant steers toward the best point if its score is at least `MARKER_DETECT_MIN`.
- **Explorers** work the same way, but with only 4 sample points and stronger wander (§5.4), so they drift off highways and find new routes.
  - An exhausted Explorer uses the Follower pattern, because it just wants to get home.
- **No marker found: fall back to open space.** Cast `FALLBACK_RAYS` (12) rays across the field of view, each up to `FALLBACK_RANGE` (48 u), through the obstacle grid.
  - Steer along the ray with the longest free distance.
  - Ties are common in open space; they go to the ray closest to the current wander heading. *(Fix: the original rule had no tie-break, which would make ants in open space jitter.)*
- **Speed** is `ANT_SPEED`, varied per ant by up to ±`SPEED_JITTER`.

### 5.4 Wander
Each ant has a smooth random wander offset:
- Every `WANDER_INTERVAL` (randomised by ±50%), pick a new offset within ±`WANDER_ANGLE`.
- Add the offset to the desired heading.

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
   - fewer than `CROWD_LIMIT` ants are within `3 × ANT_RADIUS` of it.

*(Fix: a traffic jam at the nest isn't a dead end. Without this check, crowds would erase the busiest trails.)*

### 5.6 Energy and life cycle
- Energy starts at `ENERGY_MAX` (100) and burns at `ENERGY_BURN` (1 per second), which gives about 100 s of autonomy.
- It refills to 100 when the ant touches its own nest or any food source.
- At 0 the ant dies (removed in phase 5).
- Scenarios may override the burn rate. The maze, for example, lowers it so the long route is survivable.

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

### 6.2 Hard collisions (PBD)
- Run 2 Jacobi iterations per tick.
  - For each ant, in parallel: sum the corrections from neighbours closer than `2 × ANT_RADIUS`, weighted by inverse mass. Divide by the contact count and write the result into a scratch buffer.
  - Then apply all scratch corrections at once.
- After the ant-against-ant pass, push ants out of border obstacle boxes. Walls always win.
- Velocity is recomputed from the corrected movement.

### 6.3 Determinism and threading rules
- Ants are processed in **fixed-size chunks** (`CHUNK_SIZE`, 1024), whatever the thread count.
- Parallel phases write only their own ant slots and their own chunk's event list. Serial phases consume the event lists in chunk order.
- No floating-point sums across threads: sum per chunk, then combine the chunk sums in chunk order.
- User edits (brushes, buttons) are queued and applied between ticks.
- **Required test:** with the same seed, scenario and inputs, the state after N ticks is bit-identical with 1 thread and with 8 threads.

---

## 7. Rendering

Each frame draws these layers in order, using a few batched WebGL2 draw calls in total:

1. **Background** in the theme colour.
2. **Marker heatmap**, if enabled. The CPU fills an RGBA texture at marker-grid resolution, in fixed chunks (in parallel once M4 adds workers). It is drawn as one world-sized quad with linear filtering. There are three modes:
   - **Colony colour:** the owner's colour × the stronger channel.
   - **Dual-channel:** `to_home` and `to_food` in two colours, like Pezzza's original.
   - Off.
3. **Obstacles:** a texture at obstacle-grid resolution, updated only when edited.
4. **Food sources and nests:** circles. Each nest is in its colony's colour, and grows with the population.
5. **Shadows**, drawn with a multiply blend: each ant's body silhouette offset by `SHADOW_OFFSET` (2, 3) u. When legs are drawn, hips and knees are offset too, but feet are not, so they stay planted.
6. **Ants:** textured quads with a sprite generated at startup (head, thorax, abdomen), tinted by colony. Carried food is a small dot at the head.
   - When an ant is only a few pixels long, draw a plain shape or a smaller sprite to avoid shimmering.
   - Legs are drawn once an ant is at least `LEGS_MIN_PX` (20) physical pixels long on screen (§8).
7. **Debug overlays:** spatial hash grid, border colliders, and for the selected ant its sample points, rays and avoidance neighbours.
8. **The DOM UI overlay.**

- **Culling and batching:** only ants inside the view (plus a margin) are drawn, and the vertex arrays are filled in parallel.
- **Smooth motion:** the renderer draws `lerp(prev, pos, alpha)`, where `alpha` is the leftover fraction of the fixed-step accumulator. Motion stays smooth at 120 Hz with a 60 Hz simulation.
- **Speed controls:** pause, single step, and 1×, 2× and 4× speed run more ticks per frame. **Max** runs as many ticks as fit in the frame, capped so the app can never spiral into lag.
- **Themes:**
  - **Night (the app's default since M1, 2026-10-25):** a dark background with glowing markers, like Pezzza's original. Shadows are subtle here. The user asked for a high-end dark UI, so the interactive app ships Night.
  - **Sand:** light terrain where shadows show *(Claude's call)*. It remains available in code and returns as a switch with the M5 theme work.
- **Camera:** the mouse wheel zooms at the cursor, right- or middle-drag pans, and follow mode keeps the selected ant centred. The camera starts with the whole world fitted to the window.

---

## 8. Procedural legs (tripod gait)

- **Numbering.** Left front, middle and hind legs are 0, 1, 2; right front, middle and hind are 3, 4, 5.
- **Tripods.** **Tripod A = {0, 4, 2}** (left-front, right-middle, left-hind). **Tripod B = {3, 1, 5}**.
- Each leg has a rest point in body space, projected into the world on every update.
- **When a tripod steps.** A tripod starts a step when **any** of its legs is farther than `STEP_THRESHOLD` from its rest point **and no leg of the other tripod is stepping**. All three legs of that tripod then step together.

  *(Fix: the original rule stopped two legs on the same side from stepping at once, but a tripod needs front and hind legs on the same side to move together, so it could never happen.)*
- **A step** moves the foot from where it is to `rest_world + velocity × STEP_LEAD` (0.1 s), over `STEP_DURATION` (0.08 s), with smoothstep easing.
- **Knee:** two-bone inverse kinematics (law of cosines) between hip and foot, bending outward.
- **Which ants get legs.** Legs are simulated only for ants that are on screen and at least `LEGS_MIN_PX` long *(Claude's call: a pixel size instead of the original "zoom > 1.8×", so the threshold works for any world size and screen DPI; on the default world it is about the same zoom)*. When an ant enters that set, its feet start at their rest points.
- **Invariant (unit-tested):** legs of tripod A and tripod B never step at the same time.

---

## 9. UI and controls

The UI is a DOM overlay (HTML/CSS) above the WebGL canvas, so text stays crisp at any display scale. **H** toggles Zen mode, which hides all UI.

**The M1 control drawer (shipped 2026-10-25).** A glass top bar holds the brand, four live chips (tick, ants, delivered, FPS), pause and step, the speed pills (1×, 2×, 4×, Max), the heatmap cycle and the drawer toggle. The drawer holds collapsible Movement, Trails and Colony sections with live sliders, Ants and Grid switches, a Fit-world button, the key legend and Reset parameters. The palette is dark with an amber accent and a blue secondary; every control is custom-styled, and layout and motion follow the CSS contract in the M1 plan (Task 11). Screenshots of both the trail and the UI are part of the M1 acceptance.

**Bottom toolbar** *(full version arrives with the editing tools, M2)*
- Tools: Select/Pan, Wall brush, Erase brush, Food, New colony.
- Brush radius and food capacity sliders.
- Pause, step and speed (1×, 2×, 4×, Max).
- Scenario menu and overlay menu.

**Right panel**
- **Inspector.** Click an ant to select it (the nearest one within a few pixels, found through the spatial hash). It shows a follow toggle, name and uid, colony, role, state, an energy bar, whether it's carrying food, and time since anchor. It also draws that ant's sample points and rays.
- **Colonies.** Per colony: population, food pool, total food delivered, and a sparkline of the collection rate over the last 120 s.
- **Telemetry.** FPS, frame time, simulation milliseconds per phase (hash, think and avoid, events, collisions, decay, legs), render milliseconds and the ant count.
- **Parameters.** Live sliders for Explorer ratio %, Marker half-life and PBMAD horizon. An "Advanced" section holds every tunable from §12, with "Reset to defaults".

**New colony tool.** Click to place a nest with `NEW_COLONY_ANTS` ants.

**Names.** Each ant gets a female first name, since worker ants are all female. The name is picked deterministically from its uid, out of an embedded list.

**Keys:**

| Key | Action |
|---|---|
| P | pause |
| Space | step one tick (while paused) |
| H | Zen mode |
| M | cycle marker overlay |
| A | toggle ants |
| S | Max speed |
| F | follow the selected ant |
| W | wall tool |
| E | erase tool |
| Esc | deselect |
| Home | fit the whole world in view |

**Mouse:** left button uses the current tool, right or middle drag pans, the wheel zooms.

---

## 10. Scenarios

Scenarios can set the world size, place nests, food and walls, and override any parameter from §12.

1. **Four-colony resource war.**
   - A roughly 1600×1600 u world with a nest in each corner (Red, Yellow, Blue, Green).
   - Symmetric food: one large central pile plus four edge piles.
   - 400 ants per colony, with the territory rule on.
2. **Winding maze with a shortcut.**
   - A serpentine maze of about 6 lanes, with the nest at the start and the food at the end.
   - The walls include marked "breach" segments which, once removed, open a direct route from nest to food.
   - The **"Breach shortcut"** button removes them mid-run.
   - Energy burn is lowered so the long route can be survived.
   - Success: after the breach, most deliveries take the shortcut within a few minutes of simulated time.
3. **Stress test: 20,000 ants in opposing streams.**
   - A wide world (about 3840×1080 u) with the nest on the left and an `infinite` food pile on the right.
   - 20,000 ants are spawned up front, half of them already carrying food.
   - Energy burn and spawning are off, so the count stays fixed.
   - This is the scenario bench mode measures.
4. **Sandbox.** An open world with one nest (`NEW_COLONY_ANTS` ants) and one food source. The user adds the rest.

---

## 11. Verification and tooling

Three entry points, all started by npm scripts:
- **`npm run serve`** opens the interactive app in Chrome. URL parameters `?scenario=<name>&seed=<n>` choose what to start with; `?headless&ticks=N&size=WxH` runs without UI and renders one final frame.
- **`npm run screenshot -- --ticks N --out <file.png>`** serves the page, drives Chrome headless and saves the final frame as a PNG, so Claude can look at the result.
- **`npm run bench -- --scenario <name> --ticks N [--threads T]`** runs the simulation under Node and prints the average and 95th-percentile milliseconds per phase, plus ant updates per second. No rendering.

Unit tests (`node:test`, run by `npm test`) cover:
- deposits, foreign-cell erasure, the ownership flip and degrading;
- decay half-life being independent of frame rate;
- exhausted ants never depositing `to_food`;
- the stuck rule, including the crowd exemption;
- the tripod invariant;
- spatial hash neighbours matching a brute-force search;
- the `uid → index` map staying correct through spawns and removals;
- **determinism:** 1 worker and 8 workers giving identical results (M4).

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
| `ANT_RADIUS` / `ANT_LENGTH` | 2.5 / 8 | u | collision circle / sprite length |
| `ANT_SPEED` / `SPEED_JITTER` | 50 / 10 | u/s / % | |
| `TURN_RATE` | 6 | rad/s | |
| `SENSOR_RADIUS` / half-FOV | 32 / 60 | u / ° | |
| `FOLLOWER_SAMPLES` / `EXPLORER_SAMPLES` | 25 / 4 | | |
| `FALLBACK_RAYS` / `FALLBACK_RANGE` | 12 / 48 | – / u | |
| `EXPLORER_RATIO` | 10 | % | slider |
| `WANDER_INTERVAL` (F / E) | 0.4 / 0.25 | s | |
| `WANDER_ANGLE` (F / E) | 0.3 / 1.0 | rad | |
| `MARKER_DROP_DIST` | 8 | u | |
| `EMISSION_DECAY` | 0.11 | 1/s | |
| `MARKER_HALF_LIFE` | 7.7 | s | slider |
| `MARKER_EPS` / `MARKER_DETECT_MIN` | 1e-4 / 1e-3 | | |
| `TERRITORY_RULE` / `FOREIGN_ERASURE_FACTOR` | on / 0.5 | | |
| `STUCK_TIMEOUT` / `DEGRADE_TIME` / `DEGRADE_FACTOR` | 2.5 / 3.0 / 0.5 | s / s / – | |
| `CROWD_LIMIT` | 4 | ants | within 3 × `ANT_RADIUS` |
| `STUCK_TURN_JITTER` / `CROWD_RADIUS_FACTOR` / `ZONE_MARGIN` | 0.6 / 3 / 16 | rad / × `ANT_RADIUS` / u | the ±0.6 turn, the "3 ×" crowd radius and the nest/food zone margin from §5.5 |
| `ENERGY_MAX` / `ENERGY_BURN` / `EXHAUSTED_AT` | 100 / 1.0 / 30 | – / per s / – | |
| `PUSH_ON_SIGNAL` | 0.4 | | |
| `MASS` / carrying | 1 / 3 | | |
| `SPAWN_COST` | 5 | food | |
| `NEST_BASE_R` / `NEST_GROWTH` | 20 / 0.4 | u | r = base + growth × √population |
| `FOOD_BASE_R` / `FOOD_REF_AMOUNT` | 12 / 500 | u / units | |
| `FOOD_MIN_R` | 4 | u | smallest drawn and touchable food radius |
| `MAX_COLONIES` / `NEW_COLONY_ANTS` | 8 / 200 | | |
| `MAX_ANTS_TOTAL` | 50,000 | | |
| `T_HORIZON` | 1.0 | s | slider 0.25–2.5 |
| `R_AVOID_MAX` / `MAX_NEIGHBOURS` | 24 / 16 | u / – | |
| `AVOID_MAX_SPEED` | 0.5 × `ANT_SPEED` | u/s | |
| `PBD_ITERATIONS` | 2 | | |
| `LEGS_MIN_PX` | 20 | px | on-screen ant length |
| `STEP_THRESHOLD` / `STEP_DURATION` / `STEP_LEAD` | 3.0 / 0.08 / 0.1 | u / s / s | |
| `SHADOW_OFFSET` | (2, 3) | u | |
| `CHUNK_SIZE` | 1024 | ants | |

---

## 13. Code layout (planned)

```
package.json, tsconfig.json, index.html, styles.css
src/app/     browser entry, URL/CLI options, bench CLI, headless and interactive modes
src/core/    vector math, counter-based RNG, fixed-step clock, stats, timers
src/sim/     params, world grids, ants (SoA in typed arrays), colonies, food, tick phases, scenarios
src/render/  camera, geometry batches, WebGL2 renderer, theme, test pattern, world view
src/ui/      DOM panels, tools and brushes, input mapping
tests/       node:test unit tests
tools/       static server and headless-Chrome screenshot driver
docs/        specs and plans
```

The simulation (`src/sim`, `src/core`) must not depend on SDL or ImGui, so it can be tested and benchmarked on its own.

The full file-by-file structure, build targets and every module's interface are in [2026-10-25-ant-simulator-structure.md](2026-10-25-ant-simulator-structure.md).

---

## 14. Open topics (not in v1)

- **Inter-colony hostilities.** The user wants combat later; it isn't designed yet. These pieces will already exist to build on:
  - a colony id on every ant,
  - neighbour queries through the spatial hash,
  - reserved state values,
  - the territory rule, which is v1's only cross-colony interaction.
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
| M2 | **Walls and adaptation.** Obstacle grid and brushes, border flags, spatial hash (the stuck rule needs neighbour counts), wall collisions, fallback rays, stuck detection and degrading, maze scenario and breach button | Ants solve the maze; after the breach, most deliveries take the shortcut; before and after screenshots |
| M3 | **Colonies.** Several colonies, ownership and the territory rule (toggle), New colony tool, four-colony scenario, colony-colour heatmap | Four colonies forage at once; territories are visible; erasure and flip are tested |
| M4 | **Crowds and scale.** PBD collisions, PBMAD avoidance, worker pool, stress scenario, bench mode | No overlapping ants; opposing streams form lanes; 20k-ant bench numbers recorded; determinism test passes with 1 and 8 workers |
| M5 | **Looks and UI.** Legs and tripod gait, shadows, themes, inspector (follow, names, sensor drawing), telemetry and sparklines, parameter panel, Zen mode, debug overlays | Zoomed-in screenshots look right; tripod test passes |
| M6 | **Tuning and hardening.** Tune the defaults toward the look of the videos, performance passes, edge cases (painting over nests or food, extinct colonies, ant caps) | User is happy with how it looks and feels |

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

## Glossary

- **Stigmergy:** coordination through marks left in the environment, here pheromone trails.
- **SoA (Structure of Arrays):** storing each ant field in its own array, which is fast to process in bulk.
- **PBD (Position-Based Dynamics):** resolving collisions by moving positions apart directly.
- **PBMAD:** PBD extended with collision prediction, so agents steer around each other before they touch.
- **Tick:** one fixed simulation step (1/60 s).
- **Anchor:** the last nest or food source an ant touched.
