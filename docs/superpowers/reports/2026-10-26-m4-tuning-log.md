# M4 tuning: experiment log

Plan: [plans/2026-10-26-m4-tuning.md](../plans/2026-10-26-m4-tuning.md). One row per run, appended by the runner as soon as the run finishes.

**Runner:** a scratch script (`tune.mjs`, not in the repo) that imports the compiled `dist/` modules. For each seed it builds `crowdWorld(seed, 2000)`, applies the `--set` overrides to `world.params`, steps 3600 ticks (60 s) and reads `crowdMetrics` — the same thing `npm run reach` does for its crowd line (seed 7). `ms` is the average `timings.totalMs` over ticks 61–1260 of those runs, the same window as `npm run bench -- --scenario crowd --ticks 1200`. Reach columns are minute-3 deliveries from a copy of the reach harness setup (seed 7, 200 ants, 2600×1000); `contestB` is colony B's minute 3 in the contest.

**This PC:** Windows, Node 24.22, no Chrome. **On battery for the whole session** (`Win32_Battery` status 1, discharging). Timing is noisy and roughly 2× slower than the M4 report's 8.58 ms: on 2026-10-31 the crowd bench gave 17.3 / 17.2 / 17.8 ms (median 17.3) on merged `main`, and 15.7 / 17.3 / 15.3 ms on the unmerged M4 commit `bb6a35e`, so the slowdown is the machine, not the merge. **The 6 ms target is therefore judged as a ratio: ≤ 70% of the same-session baseline** (6 / 8.58). The laptop, plugged in, has to confirm the absolute number.

## Baseline (2026-10-31, merged main `9fcde60`)
`npm run reach`: 500 u m3 627; 1000 u m3 314; 1500 u m3 **51**; 2000 u m3 43; contest B m3 82; maze ratio 711 pass; crowd lanes **0.466**, overlap **0.0360**.
Crowd bench ×3 (1200 ticks): total 17.77 / 17.17 / 17.32 ms → median **17.32 ms**; Think 15.2 ms, Collisions 1.6 ms.

## Runs
| time | change | settings | lanes (seed:value) | overlap | ms | reach m3 | verdict |
|---|---|---|---|---|---|---|---|
| 14:07 | baseline (check runner = reach) | `defaults` | 7:0.466 | 7:0.0360 | 19.99 | 1500:51 | |
| 14:07 | profile: collisions off | `antCollisions=false` | 7:0.465 | 7:0.5470 | 11.82 | - | |

## Profile (Task 1)
Crowd bench, 2000 ants, 1200 ticks, with the new sub-phase rows (one run; the ×3 medians above are for the total):

| piece | avg ms | share of 18.0 |
|---|---|---|
| think_ants (sensing, steering, movement) | 12.92 | 72% |
| avoidance (`computeAvoidance`) | 2.90 | 16% |
| collide_ants (PBD, 2 iterations) | 1.28 | 7% |
| collide_walls (clamp + walls, ×2) | 0.29 | 2% |
| collide_hash | 0.12 | <1% |
| decay | 0.29 | 2% |

With `antCollisions` off the same run averages 11.8 ms against 20.0 ms on (runner timing). A `--cpu-prof` of the bench shows self time in `senseMarkers` 24%, `directSightTarget` 18%, `fromAngle` 17% (one object per sensor sample), `nearestWithin` 12%, `queryWithin` 5%, `computeAvoidance` 4%, PBD itself under 2%.

**Decision.** The 70% target is 12.1 ms, about what the whole tick costs with collisions off, so trimming the collision passes alone cannot reach it. Order of work:
1. `directSightTarget`: a returning ant ray-marches to its nest every tick before the range check — move the range check first (same result, no ray march for the far half of the crowd).
2. `senseMarkers`: no `Vec2` allocation per sample (cos/sin inline, scalar `isSolidAt`/cell lookups), same arithmetic so results are bit-identical.
3. Avoidance: skip ants with nobody in the 3×3 hash block, then check that `maxNeighbours` 16 → 12/8 costs nothing in lanes/overlap.
4. PBD: `exemptAtNest` is evaluated for every neighbour pair; cache it once per ant per pass.
| 14:20 | perf: direct sight checks nest range before line of sight | defaults | (unchanged: same arithmetic) | | bench ×3 12.96 / 12.98 / 13.60 → **12.98** (think_ants 12.9 → 8.5) | | keep |
| 14:30 | perf: senseMarkers without per-sample Vec2 (inlined isSolidAt/cellIndex) | defaults | (unchanged) | | 13.20 / 13.07 / 12.81 → 13.07 | | **dropped**: no gain over 12.98, V8 already removes the allocations |
| 14:45 | perf: PBD caches the nest exemption once per ant per pass | defaults | (unchanged: same result) | | median of 5: 13.25 (collide_ants 1.13 → 1.03) | | keep (small) |
