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
| 14:18 | avoid neighbours 16 | `maxNeighbours=16` | 7:0.466 | 7:0.0360 | 13.31 | - | |
| 14:19 | avoid neighbours 12 | `maxNeighbours=12` | 7:0.527 | 7:0.0340 | 13.74 | - | |
| 14:20 | avoid neighbours 8 | `maxNeighbours=8` | 7:0.519 | 7:0.0455 | 12.57 | - | |
| 14:21 | avoid radius 16 | `rAvoidMax=16` | 7:0.417 | 7:0.0195 | 12.19 | - | |
| 14:22 | avoid radius 12 | `rAvoidMax=12` | 7:0.343 | 7:0.0225 | 11.25 | - | |
| 14:25 | lane grid (parallel, ms not comparable) | `sidestepRightBias=0.5` | 7:0.445 | 7:0.0265 | 20.04 | - | |
| 14:25 | lane grid (parallel, ms not comparable) | `sidestepRightBias=0.25` | 7:0.516 | 7:0.0325 | 20.33 | - | |
| 14:25 | lane grid (parallel, ms not comparable) | `laneKeep=0.15` | 7:0.411 | 7:0.0290 | 20.14 | - | |
| 14:25 | lane grid (parallel, ms not comparable) | `sidestepRightBias=0.5,laneKeep=0.15` | 7:0.503 | 7:0.0560 | 20.61 | - | |
| 14:25 | lane grid (parallel, ms not comparable) | `laneKeep=0.3` | 7:0.508 | 7:0.0330 | 20.39 | - | |
| 14:25 | lane grid (parallel, ms not comparable) | `sidestepRightBias=0.5,laneKeep=0.3` | 7:0.508 | 7:0.0595 | 20.62 | - | |
| 14:25 | lane grid (parallel, ms not comparable) | `sidestepRightBias=1` | 7:0.600 | 7:0.1005 | 20.78 | - | |
| 14:25 | lane grid (parallel, ms not comparable) | `sidestepRightBias=1,laneKeep=0.3` | 7:0.554 | 7:0.1455 | 21.02 | - | |
| 14:28 | lane grid 2 (parallel) | `laneKeep=1` | 7:0.579 | 7:0.0475 | 19.69 | - | |
| 14:28 | lane grid 2 (parallel) | `laneKeep=0.6` | 7:0.535 | 7:0.0711 | 19.84 | - | |
| 14:28 | lane grid 2 (parallel) | `laneKeep=1,sidestepRightBias=0.5` | 7:0.594 | 7:0.0771 | 19.95 | - | |
| 14:28 | lane grid 2 (parallel) | `laneKeep=0.6,sidestepRightBias=0.5` | 7:0.625 | 7:0.0690 | 20.01 | - | |
| 14:28 | lane grid 2 (parallel) | `laneKeep=1,rAvoidMax=36` | 7:0.633 | 7:0.0735 | 22.82 | - | |
| 14:28 | lane grid 2 (parallel) | `laneKeep=0.6,rAvoidMax=36` | 7:0.516 | 7:0.0680 | 23.03 | - | |
| 14:28 | lane grid 2 (parallel) | `laneKeep=1,rAvoidMax=36,maxNeighbours=24` | 7:0.707 | 7:0.1055 | 23.55 | - | |
| 14:28 | lane grid 2 (parallel) | `laneKeep=1,sidestepRightBias=0.25,rAvoidMax=36` | 7:0.681 | 7:0.0505 | 23.40 | - | |
| 14:30 | lane clear grid (parallel) | `laneKeep=1,laneClearFactor=2` | 7:0.545 | 7:0.0645 | 20.62 | - | |
| 14:30 | lane clear grid (parallel) | `laneKeep=1,laneClearFactor=4` | 7:0.514 | 7:0.0855 | 20.83 | - | |
| 14:30 | lane clear grid (parallel) | `laneKeep=1,laneClearFactor=2,rAvoidMax=36` | 7:0.534 | 7:0.0775 | 22.93 | - | |
| 14:30 | lane clear grid (parallel) | `laneKeep=1.5,laneClearFactor=2,rAvoidMax=36` | 7:0.497 | 7:0.1775 | 22.01 | - | |
| 14:30 | lane clear grid (parallel) | `laneKeep=1,laneClearFactor=2,sidestepRightBias=0.25,rAvoidMax=36` | 7:0.564 | 7:0.0860 | 23.01 | - | |
| 14:30 | lane clear grid (parallel) | `laneKeep=1,laneClearFactor=4,rAvoidMax=36` | 7:0.592 | 7:0.0806 | 23.02 | - | |
| 14:30 | lane clear grid (parallel) | `laneKeep=1,laneClearFactor=0,rAvoidMax=36,maxNeighbours=24` | 7:0.538 | 7:0.0665 | 23.81 | - | |
| 14:30 | lane clear grid (parallel) | `laneKeep=1,laneClearFactor=2,rAvoidMax=36,maxNeighbours=24` | 7:0.589 | 7:0.0720 | 24.32 | - | |
| 14:33 | PBD grid (parallel) | `pbdRelax=1.3` | 7:0.404 | 7:0.0500 | 19.86 | - | |
| 14:33 | PBD grid (parallel) | `pbdIterations=3` | 7:0.505 | 7:0.0195 | 20.97 | - | |
| 14:33 | PBD grid (parallel) | `pbdRelax=1.6` | 7:0.413 | 7:0.2026 | 20.22 | - | |
| 14:33 | PBD grid (parallel) | `pbdIterations=4` | 7:0.535 | 7:0.0110 | 21.94 | - | |
| 14:33 | PBD grid (parallel) | `laneKeep=1,rAvoidMax=36,maxNeighbours=24,pbdRelax=1.3` | 7:0.584 | 7:0.0585 | 24.91 | - | |
| 14:33 | PBD grid (parallel) | `laneKeep=1,rAvoidMax=36,maxNeighbours=24,pbdRelax=1.6` | 7:0.660 | 7:0.1315 | 25.63 | - | |
| 14:33 | PBD grid (parallel) | `laneKeep=1,rAvoidMax=36,maxNeighbours=24,pbdIterations=3,pbdRelax=1.3` | 7:0.585 | 7:0.0330 | 26.29 | - | |
| 14:33 | PBD grid (parallel) | `laneKeep=1,rAvoidMax=36,maxNeighbours=24,pbdIterations=4` | 7:0.622 | 7:0.0495 | 26.24 | - | |
| 14:39 | lane block grid (parallel) | `laneKeep=1,laneBlockFactor=3,sidestepRightBias=0.5` | 7:0.529 | 7:0.0705 | 20.85 | - | |
| 14:39 | lane block grid (parallel) | `laneKeep=1,laneBlockFactor=3` | 7:0.524 | 7:0.0480 | 21.10 | - | |
| 14:39 | lane block grid (parallel) | `laneKeep=1,rAvoidMax=36,maxNeighbours=24,laneBlockFactor=4` | 7:0.510 | 7:0.0285 | 25.01 | - | |
| 14:39 | lane block grid (parallel) | `laneKeep=1,rAvoidMax=36,maxNeighbours=24,laneBlockFactor=3` | 7:0.552 | 7:0.0585 | 24.79 | - | |
| 14:39 | lane block grid (parallel) | `laneKeep=1,rAvoidMax=36,maxNeighbours=24,laneBlockFactor=3,sidestepRightBias=0.25` | 7:0.568 | 7:0.0625 | 25.12 | - | |
| 14:39 | lane block grid (parallel) | `laneKeep=1,rAvoidMax=36,maxNeighbours=24,laneBlockFactor=3,laneClearFactor=2` | 7:0.534 | 7:0.1315 | 25.63 | - | |
| 14:39 | lane block grid (parallel) | `laneKeep=1,rAvoidMax=36,maxNeighbours=24,laneBlockFactor=3,pbdIterations=3` | 7:0.577 | 7:0.0675 | 26.56 | - | |
| 14:39 | lane block grid (parallel) | `laneKeep=1,rAvoidMax=36,maxNeighbours=24,laneBlockFactor=4,pbdIterations=3` | 7:0.501 | 7:0.0205 | 29.15 | - | |
| 14:45 | 4-seed check (parallel) | `pbdIterations=2` | 1:0.435 2:0.383 3:0.501 7:0.466 | 1:0.0255 2:0.0380 3:0.0290 7:0.0360 | 22.46 | - | |
| 14:45 | 4-seed check (parallel) | `laneKeep=1` | 1:0.594 2:0.578 3:0.658 7:0.579 | 1:0.1155 2:0.1115 3:0.0930 7:0.0475 | 22.89 | - | |
| 14:45 | 4-seed check (parallel) | `sidestepRightBias=1` | 1:0.528 2:0.544 3:0.503 7:0.600 | 1:0.0530 2:0.0876 3:0.0675 7:0.1005 | 22.99 | - | |
| 14:45 | 4-seed check (parallel) | `pbdIterations=4` | 1:0.477 2:0.454 3:0.491 7:0.535 | 1:0.0245 2:0.0185 3:0.0050 7:0.0110 | 24.33 | - | |
| 14:45 | 4-seed check (parallel) | `laneKeep=1,sidestepRightBias=0.25,rAvoidMax=36` | 1:0.689 2:0.604 3:0.591 7:0.681 | 1:0.0980 2:0.0970 3:0.0745 7:0.0505 | 26.78 | - | |
| 14:45 | 4-seed check (parallel) | `laneKeep=1,rAvoidMax=36,maxNeighbours=24` | 1:0.554 2:0.630 3:0.690 7:0.707 | 1:0.0925 2:0.0705 3:0.0900 7:0.1055 | 27.19 | - | |
| 14:46 | 4-seed check (parallel) | `laneKeep=1,sidestepRightBias=0.25,rAvoidMax=36,laneBlockFactor=3,pbdIterations=3` | 1:0.574 2:0.538 3:0.519 7:0.488 | 1:0.0735 2:0.0440 3:0.0790 7:0.0475 | 27.59 | - | |
| 14:46 | 4-seed check (parallel) | `laneKeep=1,rAvoidMax=36,maxNeighbours=24,pbdIterations=4` | 1:0.604 2:0.697 3:0.665 7:0.622 | 1:0.0606 2:0.0570 3:0.0580 7:0.0495 | 28.09 | - | |
| 14:47 | reach: nestExemptFactor 1.5 (parallel) | `nestExemptFactor=1.5` | 7:0.527 | 7:0.0025 | 0.00 | 1500:105 | |
| 14:47 | reach: avoidMaxSpeedFactor 0 (no avoidance, parallel) | `avoidMaxSpeedFactor=0` | 7:0.497 | 7:0.0445 | 0.00 | 1500:65 | |
| 14:47 | reach: pbdIterations 4 (parallel) | `pbdIterations=4` | 7:0.540 | 7:0.0000 | 0.00 | 1500:97 | |
| 14:47 | reach: laneKeep=1,rAvoidMax=36,maxNeighbours=24 (parallel) | `laneKeep=1,rAvoidMax=36,maxNeighbours=24` | 7:0.600 | 7:0.0110 | 0.00 | 1500:86 | |
| 14:47 | reach: collisions off (parallel) | `antCollisions=false` | 7:0.486 | 7:0.3560 | 0.00 | 1000:285 1500:84 | |
| 14:50 | Task 4 queue exemption (parallel) | `foodExemptFactor=1.5,nestExemptFactor=1.5` | 7:0.383 | 7:0.0508 | 16.84 | 500:326 1000:229 1500:85 2000:37 contestB:111 | |
| 14:50 | Task 4 queue exemption (parallel) | `foodExemptFactor=1.5` | 7:0.580 | 7:0.0280 | 16.93 | 500:638 1000:269 1500:61 2000:45 contestB:138 | |
| 14:50 | Task 4 queue exemption (parallel) | `foodExemptFactor=2` | 7:0.502 | 7:0.0230 | 16.86 | 500:575 1000:262 1500:89 2000:60 contestB:100 | |
| 14:50 | Task 4 queue exemption (parallel) | `nestExemptFactor=1.5` | 7:0.452 | 7:0.0216 | 16.70 | 500:867 1000:279 1500:105 2000:49 contestB:109 | |
| 14:50 | Task 4 queue exemption (parallel) | `foodExemptFactor=1` | 7:0.466 | 7:0.0360 | 16.96 | 500:627 1000:314 1500:51 2000:43 contestB:82 | |
| 14:55 | final candidates (parallel) | `nestExemptFactor=1.5,rAvoidMax=16,pbdIterations=3` | 1:0.546 2:0.416 3:0.492 7:0.454 | 1:0.0170 2:0.0115 3:0.0150 7:0.0221 | 9.36 | 1000:298 1500:101 contestB:113 | |
| 14:55 | final candidates (parallel) | `nestExemptFactor=1.5` | 1:0.494 2:0.454 3:0.484 7:0.452 | 1:0.0416 2:0.0546 3:0.0225 7:0.0216 | 9.86 | 1000:279 1500:105 contestB:109 | |
| 14:55 | final candidates (parallel) | `nestExemptFactor=1.5,pbdIterations=3` | 1:0.467 2:0.382 3:0.517 7:0.453 | 1:0.0261 2:0.0432 3:0.0101 7:0.0180 | 10.40 | 1000:247 1500:130 contestB:91 | |
| 14:55 | final candidates (parallel) | `nestExemptFactor=1.5,pbdIterations=4` | 1:0.530 2:0.435 3:0.482 7:0.445 | 1:0.0090 2:0.0110 3:0.0100 7:0.0221 | 10.99 | 1000:264 1500:120 contestB:113 | |
| 14:55 | final candidates (parallel) | `nestExemptFactor=1.5,laneKeep=1,pbdIterations=4` | 1:0.592 2:0.510 3:0.600 7:0.516 | 1:0.0629 2:0.0512 3:0.0472 7:0.0422 | 11.45 | 1000:233 1500:74 contestB:133 | |
| 14:56 | final candidates (parallel) | `nestExemptFactor=1.5,laneKeep=1,rAvoidMax=36,maxNeighbours=24,pbdIterations=4` | 1:0.603 2:0.676 3:0.719 7:0.638 | 1:0.0517 2:0.0480 3:0.0738 7:0.0447 | 13.60 | 1000:211 1500:115 contestB:104 | |
| final | final defaults: nestExemptFactor 1.5, pbdIterations 4 (`npm run reach`, deterministic) | defaults | 7:0.445 | 7:0.0221 | bench alternating ×5, plugged in: base 11.43 / final 10.14 (×0.89) | 1000:264 1500:120 contestB:113, maze ratio 200 | adopted; lanes and speed fail, see report |

Note on the `time` column: the runner writes UTC; rows added by hand carry a label instead of a time. Rows marked "(parallel)" ran several processes at once, so their `ms` is not comparable with single runs. The 2 PBD-relax rows and the lane-clear / lane-block rows used experiment code that was removed again (see the report).

Summary and decisions: [2026-10-31-m4-tuning-report.md](2026-10-31-m4-tuning-report.md).
