# M4: Ant Collisions and Avoidance (Implementation Plan)

> **For the implementing agent (Haiku, DeepSeek or any other):**
> - Read `CLAUDE.md`, then spec §5.2 (tick phases) and §6 (crowd physics), then the structure doc's `sim` section.
> - Work through the tasks in order. Each task ends with `npm test` passing and a commit. Never weaken a test.
> - The code snippets in this plan are the design. Match their behaviour and adapt the names to the surrounding code.
> - Work on a branch. Don't merge into `main` until Marek has reviewed it.
> - First commit this plan file itself: `docs: M4 plan`.

**Goal:** ants no longer walk through each other. They push apart physically, step aside before bumping, and opposing streams settle into lanes. The app must stay smooth at the ant counts Marek actually plays with.

**Scope split (Claude's call; Marek can override):** spec §15's M4 combined collisions with large-scale threading. That is two jobs of very different risk.
- **M4 (this plan)** is collisions and avoidance on one thread. That's enough for a few thousand ants at 60 Hz.
- **M4.5** is workers, shared memory and the 20,000-ant stress run. It gets its own plan after M4 lands, written against the real code. An outline is at the end of this file.

**Built on:** `main` at `3e58352` (M2 and M1.6 merged).

## What exists today
- **`src/sim/spatial_hash.ts`:** a counting-sort grid (`hashCell` 6 u), rebuilt at the start of every tick. It only offers `countWithin`.
- **`src/sim/collide.ts`:** `resolveObstacles` relocates ants stuck inside rock, pushes ants out of border cells (2 passes), and slides the heading along the wall. There is no ant-to-ant code.
- **`stepWorld`** (`src/sim/world.ts`) phase order: SpatialHash, Think, Events, Collisions (`clampToWorld`, `resolveObstacles`, `clampToWorld`), Removals, Decay, Stats.
- **`thinkChunk`** steering order: `chooseHeading`, then wander and fallback, then `steerAroundWalls`, then `turnToward`, then move. `velX`/`velY` hold the *intended* velocity (heading × speed).
- **Params that already exist** but are unused: `tHorizon` 1.0, `rAvoidMax` 24, `maxNeighbours` 16, `avoidMaxSpeedFactor` 0.5, `pbdIterations` 2.
- **M2 reference numbers** (reach harness, after M2), used below as the throughput guard:
  - 1000 u: first delivery at 36.3 s, 285 deliveries in minute 3;
  - 1500 u: 84 deliveries in minute 3;
  - contest: colony B delivers 84 in minute 3.

## Global constraints
Everything in `CLAUDE.md`:
- no native binaries;
- `src/core` and `src/sim` free of the DOM;
- Structure-of-Arrays, so every new per-ant field goes into `spawn`, `removeSwap`, the growth path and `checksum`;
- randomness only from `randU32`/`randRange` with named streams;
- determinism tests must keep passing.

Also:
- **Order independence.** Every new pass reads only start-of-pass data and writes only its own ant's slots or a scratch buffer. That keeps M4.5's multithreading from changing results.
- **No per-tick allocation.** Scratch arrays are sized to the ant capacity and reused.

---

### Task 1: Neighbour queries on the spatial hash
**Files:** `src/sim/spatial_hash.ts`; test `tests/sim/test_spatial_hash.test.ts`.

**Add** two methods. Both are closure-free, for speed in hot loops.
```ts
// Writes the indices of every ant within `radius` of (x, y), except `exclude`, into `out`.
// Returns how many were written (at most out.length).
queryWithin(x: number, y: number, radius: number, xs: Float32Array, ys: Float32Array,
            exclude: number, out: Uint32Array): number;

// Like queryWithin, but keeps only the `k` nearest, sorted by distance (ties broken by the lower index).
// Distances squared go into outDistSq. Returns the count kept (at most k).
nearestWithin(x: number, y: number, radius: number, xs: Float32Array, ys: Float32Array,
              exclude: number, k: number, outIdx: Uint32Array, outDistSq: Float32Array): number;
```

**Implementation:** walk the same cell range `countWithin` uses. For `nearestWithin`, keep a sorted insertion buffer of size `k`.

**Tests:**
- `queryWithin` matches a brute-force search on 2000 random ants and 20 random radii.
- `nearestWithin` returns the same k indices as a brute-force sort, ties included.
- Both respect `exclude` and the length of `out`.

**Commit:** `feat(sim): neighbour queries on the spatial hash`

### Task 2: Ant-to-ant collisions (PBD, Jacobi)
**Files:** `src/sim/collide.ts` (new `resolveAntOverlaps`), `src/sim/world.ts` (Collisions phase), `src/sim/params.ts` (`antCollisions: true`, `nestExemptFactor: 1.0`), `src/sim/types.ts` (no new stream is needed); test `tests/sim/test_collide.test.ts`.

**Collisions phase, new shape** (spec §5.2 step 4, §6.2):
```ts
timed(Phase.Collisions, () => {
  if (world.params.antCollisions) {
    world.spatialHash.build(ants.posX, ants.posY, ants.size(), world.size, params.hashCell); // positions moved during Think
  }
  for (let it = 0; it < params.pbdIterations; it++) {
    if (params.antCollisions) resolveAntOverlaps(world, scratch);
    clampToWorld(world);
    resolveObstacles(world);           // walls always win, every iteration
    clampToWorld(world);
  }
  // Velocity is the movement that actually happened, including pushes.
  for (let i = 0; i < ants.size(); i++) {
    ants.velX[i] = (ants.posX[i] - ants.prevX[i]) * params.simHz;
    ants.velY[i] = (ants.posY[i] - ants.prevY[i]) * params.simHz;
  }
});
```
`scratch` is a world-owned `{ corrX: Float32Array; corrY: Float32Array; count: Uint16Array; nb: Uint32Array(64) }`, grown with the ant capacity.

**`resolveAntOverlaps`:**
```ts
// Jacobi: every correction is computed from the same positions, then all are applied together.
const d = 2 * params.antRadius, dSq = d * d;
for (let i = 0; i < n; i++) {
  corrX[i] = 0; corrY[i] = 0; count[i] = 0;
  if (exemptAtNest(world, i)) continue;
  const found = hash.queryWithin(posX[i], posY[i], d + 1, posX, posY, i, nb);   // +1 u: positions shift between iterations
  for (let k = 0; k < found; k++) {
    const j = nb[k];
    if (exemptAtNest(world, j)) continue;
    let dx = posX[i] - posX[j], dy = posY[i] - posY[j];
    let distSq = dx * dx + dy * dy;
    if (distSq >= dSq) continue;
    let nx: number, ny: number, overlap: number;
    if (distSq < 1e-8) {                                  // coincident: a fixed, antisymmetric direction per pair
      const lo = Math.min(uid[i], uid[j]), hi = Math.max(uid[i], uid[j]);
      const a = (mix32((Math.imul(lo, 0x9e3779b1) ^ hi) >>> 0) / 4294967296) * Math.PI * 2;
      const s = uid[i] === lo ? 1 : -1;
      nx = Math.cos(a) * s; ny = Math.sin(a) * s; overlap = d;
    } else {
      const dist = Math.sqrt(distSq);
      nx = dx / dist; ny = dy / dist; overlap = d - dist;
    }
    const wi = 1 / mass[i], wj = 1 / mass[j];
    const share = wi / (wi + wj);                         // carriers (mass 3) move less
    corrX[i] += nx * overlap * share;
    corrY[i] += ny * overlap * share;
    count[i]++;
  }
}
for (let i = 0; i < n; i++) {
  if (count[i] === 0) continue;
  posX[i] += corrX[i] / count[i];
  posY[i] += corrY[i] / count[i];
}
```
- **Nest exemption:** `exemptAtNest(world, i)` is true when ant `i` is within `nestRadius(colony) × nestExemptFactor` of its own nest. Ants are "in the anthill" there, so pile-ups at the entrance don't block deliveries.
- **Headings:** ant-to-ant pushes don't change headings (Task 3 does the steering). Wall pushes keep their existing heading slide.

**Tests:**
- `collide: a packed cluster separates`. 200 ants dropped inside a 40 u circle in open ground. After 120 ticks, no pair is closer than `2 × antRadius − 0.5`.
- `collide: carriers are pushed less`. A pair overlapping by 2 u, masses 1 and 3. After one `resolveAntOverlaps`, the light ant has moved 3× as far as the heavy one (±5%).
- `collide: coincident ants separate deterministically`. 50 ants at the same point. No NaN ever. They separate within 60 ticks, and the same seed gives the same checksum.
- `collide: walls win`. 300 ants pushed against a 4 u thick wall from one side (heading straight into it) for 300 ticks. None ends inside or beyond the wall.
- `collide: ants inside their own nest radius don't collide`.
- `collide: antCollisions false restores the old behaviour`: the checksum equals a run on the pre-M4 rules.
- `collide: velocity is the actual movement`. A pushed ant's `velX` equals `(pos − prev) × simHz`.

**Commit:** `feat(sim): ants push each other apart; walls still win`

### Task 3: Step aside before bumping (PBMAD-style avoidance)
**Files:** `src/sim/avoidance.ts` (new), `src/sim/ants.ts` (new SoA fields `avoidX` and `avoidY`, added to spawn, removeSwap, growth and checksum), `src/sim/tick.ts`, `src/sim/world.ts`; test `tests/sim/test_avoidance.test.ts`.

**Order inside the Think phase:** a separate pass runs *before* the `thinkChunk` loops. It reads the start-of-tick positions and last tick's actual velocities, and writes only `avoidX`/`avoidY`. That makes it order-independent.
```ts
// Pure helper: the earliest t > 0 at which two circles touch, or null.
export function timeToCollision(dpx: number, dpy: number, dvx: number, dvy: number, radiusSum: number): number | null {
  const a = dvx * dvx + dvy * dvy;
  const b = 2 * (dpx * dvx + dpy * dvy);
  const c = dpx * dpx + dpy * dpy - radiusSum * radiusSum;
  if (c < 0 || a < 1e-6) return null;                     // already touching (PBD's job) or no relative motion
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t > 0 ? t : null;
}

// Recompute for ants whose (uid + tick) is even; the others keep last tick's value (spec §6.1 time-slicing).
export function computeAvoidance(world: World, scratch: AvoidScratch): void {
  for (let i = 0; i < n; i++) {
    if (((uid[i] + world.tick) & 1) !== 0) continue;
    let ax = 0, ay = 0;
    if (params.antCollisions && !exemptAtNest(world, i)) {
      const sp = speed[i];
      const fx = Math.cos(heading[i]), fy = Math.sin(heading[i]);
      const R = Math.min(2 * sp * params.tHorizon, params.rAvoidMax);
      const k = hash.nearestWithin(posX[i], posY[i], R, posX, posY, i, params.maxNeighbours, scratch.idx, scratch.d2);
      for (let m = 0; m < k; m++) {
        const j = scratch.idx[m];
        const dpx = posX[j] - posX[i], dpy = posY[j] - posY[i];
        if (dpx * fx + dpy * fy <= 0) continue;           // only ants in front
        const dvx = velX[j] - velX[i], dvy = velY[j] - velY[i];
        const t = timeToCollision(dpx, dpy, dvx, dvy, 2 * params.antRadius);
        if (t === null || t >= params.tHorizon) continue;
        // At contact, i sits at (pi + vi t) and j at (pj + vj t). Step sideways away from j, across the relative motion.
        let lx = -(dpx + dvx * t), ly = -(dpy + dvy * t);   // from j to i at contact
        const rl = Math.hypot(dvx, dvy);
        const ux = dvx / rl, uy = dvy / rl;
        const along = lx * ux + ly * uy;
        lx -= along * ux; ly -= along * uy;                // keep only the lateral part
        let ll = Math.hypot(lx, ly);
        if (ll < 1e-3) { lx = -fy; ly = fx; ll = 1; }      // exactly head-on: sidestep to own right (y-down screen)
        const urgency = 1 - t / params.tHorizon;
        const weight = mass[j] / (mass[i] + mass[j]);     // unloaded ants give way to carriers
        ax += (lx / ll) * sp * urgency * weight;
        ay += (ly / ll) * sp * urgency * weight;
      }
      const cap = params.avoidMaxSpeedFactor * sp;
      const len = Math.hypot(ax, ay);
      if (len > cap) { ax *= cap / len; ay *= cap / len; }
    }
    avoidX[i] = ax; avoidY[i] = ay;
  }
}
```

**Using it in `thinkChunk`:** after wander and fallback, and **before** `steerAroundWalls`, so walls still win:
```ts
if (params.antCollisions && (ants.avoidX[ant] !== 0 || ants.avoidY[ant] !== 0)) {
  const sp = ants.speed[ant];
  desired = Math.atan2(Math.sin(desired) + ants.avoidY[ant] / sp, Math.cos(desired) + ants.avoidX[ant] / sp);
}
```
This is a spec §6.1 simplification (Claude's call). The sideways push is scaled by urgency × mass share and capped, rather than computed as "overlap one step after contact projected on the tangent". Update §6.1 to match.

**Tests:**
- `timeToCollision`: two ants 20 u apart, closing at 100 u/s, radius sum 5 → t = 0.15 s. Moving apart → null. Already overlapping → null.
- `avoidance: head-on ants both sidestep to their own right`. Ant A heads +x and ant B heads −x on the same line. A's `avoidY` > 0 (down on screen) and B's `avoidY` < 0.
- `avoidance: ants walking the same way don't react`. Same heading and speed, 8 u apart → (0, 0).
- `avoidance: a carrier barely yields`. Head-on, A unloaded and B carrying: |avoid A| ≈ 3 × |avoid B|.
- `avoidance: time-slicing`. On a tick when an ant's `(uid + tick)` is odd, its `avoidX`/`avoidY` are unchanged.
- `avoidance: capped`. |avoid| ≤ `avoidMaxSpeedFactor × speed` in a dense head-on crowd.

**Commit:** `feat(sim): ants step aside before bumping; head-on traffic passes on the right`

### Task 4: Crowd scenarios and measurements
**Files:**
- `src/sim/presets.ts`: new user preset `highway`.
- `src/app/bench_scenarios.ts` (new): the hidden `crowd` scenario.
- `src/app/bench.ts`, `src/app/bench_cli.ts`: `--scenario crowd --ants N`.
- `src/app/reach.ts`: two new rows.
- Tests for the new pieces.

**`highway` preset** (visible, boulder palette), for watching lanes form:
- world 2400×900;
- one colony at (200, 450) with 600 ants;
- food 20,000 at (2200, 450);
- rock walls 16 u thick along y = 360 and y = 540, from x = 400 to x = 2000, forming a 180 u corridor;
- `paramOverrides`: `energyBurn` 0.3.

**`crowd` scenario** (bench and reach only, not in the menu):
- the same map, with *infinite* food;
- `energyBurn` 0 and `spawnCost` 1e9, so the ant count stays fixed;
- N ants (default 2000) spread evenly along the corridor;
- even uids are Foraging and heading +x; odd uids are ReturningFood (mass 3) and heading −x.

**New reach rows (60 s of the crowd scenario at 2000 ants):**
- `lanes`: among ants in the corridor's middle third, (share of +x movers below the centre line + share of −x movers above it) / 2. Target **≥ 0.70**. Random mixing gives about 0.5.
- `overlap`: the share of ants with any neighbour closer than `2 × antRadius − 0.5`, excluding nest-exempt ants. Target **≤ 0.01**.
- Print `pass`/`fail` against each target, the way the maze row does.

**Bench:** `npm run bench -- --scenario crowd --ants 2000` and `--ants 5000` print the usual table.

**Tests:**
- `highway` validates.
- The `crowd` scenario builds exactly N ants with alternating states.
- The lane metric returns 1.0 for a perfectly laned set and about 0.5 for a random one.

**Commit:** `feat(app): highway preset, crowd scenario, lane and overlap metrics`

### Task 5: Settings
**Files:** `src/ui/param_specs.ts` (and the settings drawer, if booleans need a control); tests for the specs.

**Add:**
- **Ant collisions** (`antCollisions`, on/off). Follow whatever pattern the homing toggle uses; if there's none, add a boolean spec kind rendered as a switch.
- **Avoidance look-ahead** (`tHorizon`, 0.25–2.5 s, step 0.05).

Changing either takes effect on the next tick, with no restart.

**Commit:** `feat(ui): ant-collision and avoidance settings`

### Task 6: Tuning and acceptance
Run and record (plugged in). Put the tables in the M4 report.
1. **`npm run reach`**, all rows:
   - **Throughput guard:** at 1000 u, minute-3 deliveries are at least 75% of M2's 285 (so ≥ 214). At 1500 u, at least 75% of 84 (≥ 63). The contest colony B is at least 75% of 84 (≥ 63).
   - `lanes` ≥ 0.70 and `overlap` ≤ 0.01.
   - The maze row still passes.
2. **Bench (plugged in):**
   - meadow, 200 ants, 1200 ticks: record it as the **new baseline** and write it into CLAUDE.md (the old +25% rule restarts from here);
   - crowd, 2000 ants: **≤ 6 ms** average step;
   - crowd, 5000 ants: record the number. The stretch target is ≤ 16 ms (one 60 Hz frame); over that is M4.5's job.
3. **If a target misses, tune only these, within these ranges:**
   - `tHorizon` 0.5–1.5;
   - `avoidMaxSpeedFactor` 0.3–0.7;
   - `pbdIterations` 1–3;
   - `nestExemptFactor` 1.0–1.5.

   Fast-path ideas for performance:
   - skip avoidance for ants with no neighbour within `R` (one `countWithin` check);
   - skip `resolveAntOverlaps` for ants alone in their 3×3 hash cells.
4. **Screenshots:**
   - `npm run screenshot -- --preset highway --ticks 3600 --zoom 3 --focus 1200,450 --out captures\m4-highway.png`: two visible lanes;
   - the same at zoom 8: no ants drawn on top of each other.
5. **Manual check for Marek:**
   - ants visibly bump and slide past each other;
   - streams on the highway preset split into lanes;
   - anthills don't jam;
   - turning **Ant collisions** off brings back the old ghost behaviour.

**Commit:** `tune(sim): collisions and avoidance meet the M4 targets`

### Task 7: Docs and report
1. **Spec:**
   - §5.2: the avoidance pre-pass, and the Collisions phase with a hash rebuild, iterations and velocity recompute;
   - §6.1: the implemented sidestep rule;
   - §6.2: nest exemption and coincident separation;
   - §9: the new settings;
   - §12: `antCollisions`, `nestExemptFactor`, and any tuned values.
2. **Spec §15:** split the M4 row:
   - `M4 | Ant collisions and avoidance. Spatial-hash neighbour queries; PBD ant-to-ant collisions with walls winning; nest exemption; PBMAD-style sidestepping and lanes; collision settings; highway preset and crowd scenario | No overlap (≤ 1%); lanes ≥ 0.70; reach within 75% of M2; 2000 ants ≤ 6 ms per step plugged in`
   - `M4.5 | Scale. Worker pool over SharedArrayBuffer typed arrays (browser module workers and Node worker_threads), cross-origin isolation headers, a 20,000-ant stress scenario, determinism with 1 and N workers | 20,000-ant bench recorded; 1 and 8 workers give identical checksums; the page holds 60 Hz at 20,000 ants`
3. **Structure doc:** `avoidance.ts`, the new hash methods, the collide changes, `bench_scenarios.ts`, the highway preset, and the §5 who-writes-what row for the avoidance pass.
4. **CLAUDE.md:** the Status line, the new bench baseline, and the line about collisions (M4 done; M4.5 next).
5. **Report:** write `docs/superpowers/reports/2026-10-25-m4-report.md`, under 60 lines:
   - commits and test count;
   - reach table before and after;
   - lanes and overlap;
   - bench at 200, 2000 and 5000 ants, and whether the laptop was plugged in;
   - screenshots;
   - deviations and open questions.

**Commit:** `docs: M4 ant collisions and avoidance complete`

---

## Review focus: failure modes the tests above don't cover
1. **Queues at food.** Many ants arriving at once can wall the food off and drop deliveries. Expected: the throughput guard in Task 6 holds. If it fails, add a `foodExemptFactor` alongside the nest exemption, rather than weakening collisions everywhere.
2. **Crowds pushing ants through thin walls.** Expected: never, because walls run after every ant-to-ant iteration. The `walls win` test covers a 4 u wall; also check a 1-cell diagonal wall in the maze.
3. **Stuck rule and jams.** Ants squeezed in a jam can trip the 2.5 s stuck timer and turn around. That's fine, but the crowd exemption must keep them from erasing trails. Expected: on `highway`, no `degrade` events fire inside the corridor while traffic flows. Add a counter and assert it.
4. **Dense spikes.** 600 ants spawned at one nest start fully overlapping. Expected: no frame slower than 3× the average while they spread. Bench the first 120 ticks of `highway` separately.
5. **Order independence ahead of M4.5.** Expected: running `resolveAntOverlaps` and `computeAvoidance` with the ant order reversed gives identical positions after one tick. Add this as a test now, so M4.5's workers can't change results.

---

## Outline for M4.5: Scale (planned separately, after M4)
- **Shared memory:** all SoA arrays, the marker layers, the obstacle grid and the hash move onto `SharedArrayBuffer`. Growth reallocates and re-sends the views.
- **Pool:** a `WorkerPool` with `parallelFor(count, chunkSize, phaseId)`.
  - Browser: `new Worker(url, { type: "module" })` running the same `dist/` sim modules.
  - Node (bench and tests): `worker_threads`.
- **Cross-origin isolation:** `tools/serve.mjs` and the launcher send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, which `SharedArrayBuffer` needs.
- **What goes parallel:**
  - the avoidance pass, the think chunks (with per-chunk event lists, merged in chunk order), the PBD correction pass and decay rows run on workers;
  - events, removals and spawns stay serial.
  - M2's crowd count in `thinkChunk` reads positions mid-loop. It must switch to a start-of-tick snapshot first.
- **Determinism test:** 1, 2 and 8 workers give identical checksums after 600 ticks of the crowd scenario.
- **Stress:** the crowd scenario at 20,000 ants; record bench numbers and the in-page frame time.
