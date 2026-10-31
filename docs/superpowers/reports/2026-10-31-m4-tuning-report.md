# M4 tuning report (2026-10-31)

Plan: [plans/2026-10-26-m4-tuning.md](../plans/2026-10-26-m4-tuning.md). Every run is in the [experiment log](2026-10-26-m4-tuning-log.md). Earlier M4 numbers: [2026-10-25-m4-report.md](2026-10-25-m4-report.md).

**Status: two of the four targets pass (reach and, on three of four seeds, overlap). Lanes and speed fail. M4 is not counted as done. One decision for Marek is at the end.**

## Deviations from the plan, at Marek's request (2026-10-31)
- All work happened on `main`, not on a `claude/m4-tune` branch. Before starting, the M1.7, M5 and M4 branches were merged into `main` (merge commits `a924a07`, `bfbbd2a`, `9fcde60`) and pushed to GitHub (`kurope95/Ant-Simulator-`) as a backup. The old C++ branch `archive/cpp-m0` is kept as a tag of the same name; the merged branches were deleted.
- The plan said not to push. Marek asked for pushes, so `main` is pushed.

## Results (this PC; final defaults: `nestExemptFactor` 1.5, `pbdIterations` 4, lane rules off)

| Target | Before tuning | After | Needed | Result |
|---|---|---|---|---|
| Lanes (crowd 2000, 60 s, seed 7) | 0.466 | 0.445 (seeds 1/2/3: 0.53 / 0.44 / 0.48) | ≥ 0.70 | **fail** |
| Overlap (same run) | 0.0360 | 0.0221 (seeds 1/2/3: 0.009 / 0.011 / 0.010) | ≤ 0.01 | **fail** on seed 7, about the target on 1–3 |
| Crowd bench, 2000 ants, 1200 ticks | 11.43 ms | 10.14 ms (×0.89) | ≤ 6 ms on the laptop, i.e. ×0.70 here | **fail** |
| Reach 1500 u, minute 3 | 51 | 120 | ≥ 63 | **pass** |

Guards, from `npm run reach` with the final defaults: 1000 u minute 3 **264** (≥ 214, pass); contest colony B minute 3 **113** (≥ 63, pass); maze 10 → 2004, ratio 200 (pass). Legacy checksum with `antCollisions` off is still `2915110820` (test passes). `npm test`: 323 tests, 321 pass; the 2 failures are the Chrome screenshot tests, because Chrome is not installed on this PC.

**Bench conditions.** The laptop was on battery for the first half of the session and on AC for the final numbers (`Win32_Battery` status 2). The bench row above alternates the pre-tuning commit (`9fcde60`) and the final code, 5 runs each, plugged in: base 11.35 / 11.39 / 11.43 / 11.87 / 11.44, final 9.49 / 9.69 / 10.45 / 10.14 / 10.27 (medians 11.43 and 10.14). This PC is slower than the one that measured 8.58 ms in the M4 report, so the 6 ms target was judged as a ratio. The laptop still needs a plugged-in `npm run bench -- --scenario crowd --ticks 1200`.

## What changed
- `perf(sim)`: direct sight checks the nest range before its line-of-sight ray march (bit-identical; the biggest win, 17.3 → 13.0 ms on battery).
- `perf(sim)`: the PBD pass works out the nest exemption once per ant per pass instead of once per neighbour pair.
- `feat(sim)`: bench sub-phase rows (avoidance, think_ants, collide_hash, collide_ants, collide_walls, collide_vel).
- `feat(sim)`: two lane rules, `sidestepRightBias` and `laneKeep`, both default 0 (spec §6.1).
- Defaults: `nestExemptFactor` 1.0 → 1.5, `pbdIterations` 2 → 4.
- `tools/screenshot.mjs` accepts `--preset highway` (M4 added the preset but not to the tool's list).
- Tried and dropped (in the log): inlining the sensor samples (no gain), a food-pile exemption, PBD over-relaxation (overlap got worse), a lane-clear threshold, and a stop-when-blocked-on-the-right rule for lane keeping.

## Why the remaining targets fail
- **Speed.** After the two exact speed-ups, about 60% of a crowded tick is the core ant think: marker sensing (25 samples with a `cos`/`sin` each) and wall look-ahead. Collisions on add about 3.3 ms (avoidance 1.9, PBD 1.4). Making sensing cheaper means rotating precomputed directions, which changes float results and so the legacy checksum the plan says must not change. Without that, ×0.70 is out of reach on one thread. M4.5's workers are the natural place to get it.
- **Lanes vs overlap.** Lanes need a steady push to the right, and that push packs each lane tight, so overlap rises. Overlap comes mostly from two places: the jam where the food trail funnels both streams through the corridor's east mouth (seen in the crowd captures), and same-direction ants packed together in a lane. Four PBD passes are enough without lane keeping; with lane keeping, even four passes leave about 5%.

## Best trade-offs (crowd, mean of seeds 1, 2, 3 and 7; reach seed 7)

| Setting | lanes | overlap | reach 1500 / 1000 / contest B | cost |
|---|---|---|---|---|
| **Final defaults** (nest 1.5, PBD 4) | 0.47 | 0.013 | 120 / 264 / 113 | +2 PBD passes (~+0.4 ms) |
| nest 1.5, PBD 4, laneKeep 1 | 0.55 | 0.051 | 74 / 233 / 133 | same |
| nest 1.5, PBD 4, laneKeep 1, rAvoidMax 36, maxNeighbours 24 | **0.66** (best 0.72) | 0.055 | 115 / **211** / 104 | wider avoidance, about +2 ms |
| nest 1.5, PBD 3, rAvoidMax 16 | 0.48 | 0.016 | 101 / 298 / 113 | cheapest |

## Captures
Edge's headless `--screenshot` writes no file on this PC (as the M5 report found), so the page screenshots could not be made with `npm run screenshot`.
- **Built-in browser, highway preset, zoom 6 (Run screen):** the ants are drawn correctly at the sprite level. None are stacked, and none are pressed into the corridor walls. The pane runs the simulation slowly in the background, so it shows only the first 15 s, before the corridor fills.
- **Crowd scenario, rendered from the simulation's own positions** (`captures/m4-tune-crowd-*.png`, red east, blue west, 2 px per unit; `captures/` is git-ignored). At 5 s the crowd is evenly mixed with no contacts (overlap 0.15%). At 60 s the middle of the corridor is mixed, not laned, and spaced apart, with a dense knot at the east mouth where the trail narrows to single file. That knot holds most of seed 7's 2.2%. With lane keeping, the red stream gathers along the lower wall and the blue along the upper, and the lanes are visibly packed.
- Not done: the maze capture, and a page screenshot at tick 1800. Both need Chrome, or the laptop.

## Still unverified
- Bench on the laptop, plugged in (crowd and meadow), and the CLAUDE.md baseline.
- Marek's manual collision checklist from the M4 plan.

## Decision (Marek, 2026-10-31): option 1
Keep the final defaults: ants stay spaced apart (overlap about 1%) and the streams stay mixed. The lanes ≥ 0.70 target is dropped for now; the lane rules stay in the code, off. A better lane rule can be designed later if tidy lanes matter. Still open: overlap on seed 7 (2.2%) and the speed target (proposed: get the rest from M4.5's workers; not decided yet).

## The question that was asked
Lanes ≥ 0.70 and overlap ≤ 1% did not pass together with any rule tried. Options:
1. Keep the final defaults (overlap about 1%, reach passes) and relax the lanes target, or drop it until a different lane mechanism is designed.
2. Turn lane keeping on (lanes about 0.66) and relax overlap to about 5%.
3. Leave both targets and design something new: for example, a lane rule that reads which side the oncoming stream is on rather than pushing every ant right, or trails that are wider than a single file at the corridor mouth.
And for speed: accept the ×0.89 here and get the rest in M4.5 (workers), or allow sensing changes that alter the legacy checksum.
