# Ant Simulator — Presentation Overhaul & World Builder (Design)

**Status:** approved, in implementation · 2026-10-25
**Implementation plan:** [2026-10-25-presentation-overhaul.md](../plans/2026-10-25-presentation-overhaul.md)
**Amends:** the main design spec, effectively replacing §7, §8, §9 and §10, and adding a milestone between M1 and M2.

## 1. Why

M1 proved the simulation works, but the product does not yet look or behave like something a
person would choose to open. The user's verdict, in their words:

> the ants look horrible. I need actual ant-looking thing. Also, make the anthill look better.
> Also, the food needs to be like a cluster of pieces that is being consumed and slowly spent.
> Also, the trail looks weird — ants are red, and the trail goes from blue to red […] The buttons
> are low-level, lazy, low effort. Completely missing button to reset or just finish the
> simulation and return to homepage. […] no possibility to add/remove/edit obstacles, add other
> colonies […] no way to stop, reset, or change ANYTHING. Design, UI and UX-wise, this is a
> tragedy.

The simulation is the engine; this project makes the thing around it feel like a finished
sandbox game: a home screen, a world builder, a run you can pause, restart, edit or finish,
and a world that is a pleasure to look at at every zoom level.

Mechanics tuning (pathfinding, crowd collisions, starvation, births, territory balance) is a
separate, later project. This one adds only the mechanics that editing and multiple colonies
strictly need: obstacle collision, terrain speed, sight blocking, and multi-colony setup.

## 2. Goals

1. **Open to a home screen**, never to a running world with no controls.
2. **Every run is controllable**: pause, step, speed, restart, edit world, finish and return home.
3. **The player builds the world** before starting: 0–8 colonies, each with a colour and a
   starting population; any number of food piles; rock, water, sand and mud painted with a brush;
   five map presets; an editable seed.
4. **Ants read as ants** at fit zoom and at close zoom: three body segments, six legs, antennae,
   mandibles, colour-marked by colony, animated gait, carrying visible food.
5. **The landscape reads as a place**: a built anthill, food piles that visibly shrink piece by
   piece, textured ground, distinct obstacles, and trails whose colours belong to the scene.
6. **A coherent high-end UI**: one dark glass design system, real hierarchy, motion, no default
   browser widgets, responsive at the laptop's 200% scaling.
7. **Nothing regresses**: determinism, the SoA simulation, the test suite and the bench still hold.

## 3. Non-goals (this milestone)

- Solving mazes, stuck detection, fallback rays, wall-following intelligence.
- PBD crowd collisions, PBMAD avoidance, worker threads, 20k-ant tuning.
- Starvation, birth-rate or colony-balance tuning.
- Inter-colony combat (still an open topic; do not implement).
- Save/load of worlds, undo history, audio, touch-first editor, multiplayer.
- Persisting the builder setup across a page reload.

## 4. Anti-goals

- A home screen that silently throws away an edited map.
- A Start button that can produce a broken world (nest inside rock, no colony, no food).
- Ants that are coloured blobs, or legs that only exist in code.
- Trails that compete with the ants' own colours.
- UI that needs a manual; controls must be discoverable and labelled.
- Editing that mutates a live simulation mid-run. Edits are staged; starting applies them.
- More than one draw call per layer; one sprite atlas, batched.

## 5. Experience map

```
Home ──New world──▶ Builder ──Start──▶ Run ──Pause──▶ Paused ──Edit world──▶ Builder
 │                     ▲                 │                │
 │                     └───Back──────────┘                ├──Restart──▶ Run
 ├──Quick start──────────────▶ Run                       ├──Resume───▶ Run
 │                                                       └──Finish───▶ Home (summary)
 └──Finish (from dock or pause)──────────────────────────────────────▶ Home (summary)
```

- **Home** — title, two actions, the last run's summary, and a dimmed, paused world as backdrop.
  The backdrop is a 900-tick attract run of Meadow on first load, or the finished run afterwards.
- **Builder** — the editable map, no ants, no simulation running. Presets, seed, tools, colony and
  food inspectors. Start is disabled until the map passes validation, with the reason shown.
- **Run** — the live world with a compact HUD: top bar, bottom control dock, optional colony panel
  and settings drawer.
- **Paused** — a modal over the dimmed run: Resume, Restart, Edit world, Finish run.
- **Finish** — confirmation with the run's numbers; then Home with a "Last run" card.

Editing from a paused run opens the builder with the current map. Starting again discards the
running world and builds a fresh one from the edited setup. There is no live map mutation.

## 6. Visual language

### 6.1 UI tokens

| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#060907` | page, outside the world |
| `--bg-1` | `#0A0F0C` | vignette, recessed areas |
| `--panel` | `rgba(12, 17, 14, 0.78)` | glass surfaces |
| `--panel-strong` | `#101711` | menus that need opacity |
| `--stroke` | `rgba(235, 241, 229, 0.09)` | hairlines |
| `--stroke-strong` | `rgba(235, 241, 229, 0.18)` | hover borders |
| `--text` | `#ECEFE7` | primary text |
| `--muted` | `#9AA79B` | labels, secondary |
| `--accent` | `#E7B36A` | primary actions, focus |
| `--accent-strong` | `#F4CB8C` | hover |
| `--accent-ink` | `#1A1309` | text on amber |
| `--secondary` | `#67C4B2` | live/teal accents |
| `--danger` | `#E07361` | destructive actions |
| `--radius` | `18px` | panels, modals |
| `--radius-sm` | `12px` | buttons, chips, swatches |
| `--shadow` | `0 28px 80px rgba(0, 0, 0, 0.55)` | raised surfaces |
| `--blur` | `22px` | backdrop-filter |
| `--ease` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | all transitions |
| `--fast` / `--base` / `--slow` | `140ms` / `220ms` / `360ms` | motion |

- **Type:** UI uses `"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif` at 13–14 px;
  labels are 10–11 px, uppercase, `letter-spacing: 0.12em`. The home headline and the wordmark
  use `Georgia, "Times New Roman", serif`; the wordmark is 13 px uppercase with `0.24em` tracking.
  Numbers use `font-variant-numeric: tabular-nums`.
- **Surfaces:** 1 px hairline, 18 px radius, glass blur, a soft inner top highlight
  (`inset 0 1px 0 rgba(255,255,255,0.05)`). No flat grey boxes, no browser default buttons,
  selects or range inputs.
- **Actions:** primary = amber fill with dark ink; secondary = glass with a stroke; ghost =
  transparent with muted text; icon buttons are 36–40 px squares with accessible labels and
  tooltips. Hover lifts 1 px and brightens; active presses to 0.98; focus is a 2 px amber ring
  with a 2 px offset.
- **Motion:** screen transitions fade and translate 10 px over `--base`; drawers slide; modals
  fade the page behind them with `backdrop-filter: blur(10px)`; selection rings pulse once.
  All of it collapses to 1 ms under `prefers-reduced-motion: reduce`.
- **Vignette:** a fixed DOM layer above the canvas, `radial-gradient(ellipse at 50% 45%, transparent
  45%, rgba(0,0,0,0.42) 100%)`. Home adds a left-to-right dark gradient so the serif headline reads.
- **Icons:** inline SVG built in `src/ui/dom.ts`: play, pause, step, reset, edit (pencil),
  finish (home), menu, close, plus, trash, dice, chevron, palette, with a 1.75 px stroke.

### 6.2 Colony palette

Eight colours, stable by index everywhere (atlas, nest, UI swatches, colony mode):

| # | Name | Hex | | # | Name | Hex |
|---|---|---|---|---|---|---|
| 0 | Ember | `#E2603F` | | 4 | Orchid | `#A26BD8` |
| 1 | Gold | `#D9A441` | | 5 | Rose | `#DF7590` |
| 2 | Azure | `#4C8DDE` | | 6 | Lagoon | `#34B3A0` |
| 3 | Fern | `#5FAE6B` | | 7 | Chalk | `#CFC6B4` |

Duplicates are allowed (the player may want two red colonies); new colonies default to the first
unused colour. Colour is an accent on a dark, realistic body — never a flat red plastic ant.

### 6.3 Ants

- **Anatomy, baked into a 128 px sprite cell:** gaster (large oval, four segment bands), petiole
  node, thorax, head with two mandibles, two elbowed antennae, and six two-segment legs for the
  small-LOD frame. Body faces **+x**.
- **Palette:** umber body `#241A14`, lit carapace `#4A382B`, outline `#0B0806`; the colony colour
  tints the thorax sheen, one gaster band, the antenna tips and the leg joints. The result reads
  brown-black from a distance, with a colony signature up close.
- **Variants:** two per colony (gaster width ±4%, antenna splay ±6°, baked-leg angles differ),
  chosen by `uid % 2`, so a column of ants is not a rubber stamp.
- **Size:** `antLength = 10 u`. Draw a body sprite whose quad is `1.25 × antLength` world units so
  the 80%-fill body is ~10 u. At fit zoom on the default world and a 2× DPR that is ~15 device px
  (7.5 CSS px); the animated legs appear from about 1.2× zoom, the close-up view from 3×.
- **Legs:** animated below, drawn in screen space; the animated body frames contain no legs.
  Below `legsMinPx = 18` screen px the small frame with baked legs is used. At lower zoom only the
  sprite is drawn. Gait: two tripods, `A = {0, 2, 4}`, `B = {1, 3, 5}` (indices follow §8 of the
  main spec), phase advances with distance travelled (`stride = 24 u`), swing displaces the foot
  ±0.22 body lengths along the heading and lifts the knee slightly outward. The invariant that
  the two tripods never swing together is unit-tested.
- **Shadows:** each ant's body sprite, offset 2 px right and 3 px down in screen space, tinted
  `rgba(0, 0, 0, 0.28)`, drawn before all bodies in the same sprite batch.
- **Carried food:** a small seed sprite at the mandibles, drawn after the body.
- **Ants never use the trail colours as body colours.** Trails are teal/amber; ants are
  brown-black with colony accents.

### 6.4 Anthill

- A 256 px bird's-eye sprite per colony, baked with its colony rim colour, drawn at
  `3.2 × nestRadius` world units and scaled by population growth.
- **Art:** an irregular mound in dark umber (`#2A2119`), a lighter excavated spoil ring
  (`#34281E`), radial ridges, scattered pebbles, a dark central crater (`#070504`) with a thin
  colony-coloured inner rim. Rotation is fixed per colony id so it doesn't shimmer.
- The colony colour appears only as the rim and a faint outer glow — the hill stays dirt.

### 6.5 Food clusters

- **Kinds:** Seeds (`#D9C48B`, teardrop with a dark hilum), Berries (`#C4475E`, round with a
  highlight), Leaves (`#7FAE5A`, veined teardrop). Four sprite variants each.
- **Amount ↔ pieces:** one piece per 100 food units, 1–48 pieces; an infinite source always shows
  48. A pile of 6,000 therefore starts full at 48 and loses its outermost piece every 100 units.
- **Layout:** a deterministic golden-angle spiral inside `foodRadius`, jittered by a visual hash of
  the source uid and piece index. Piece positions never move; the list is inner-first, so piece
  count shrinking removes only the outer ones. This is rendering state, not simulation randomness.
- Each piece gets a 1 px shadow, a per-piece rotation and a frame variant. At fit zoom a pile reads
  as a cluster of distinct pieces, not a dot.

### 6.6 Trails and heatmap

- Default mode **Trails**: `to_home` in teal `#4FC3B0`, `to_food` in amber `#F0B45E`, alpha
  `0.62 × min(home + food, 1)`, drawn over the terrain and under the actors. The two channels
  blend additively into the pixel colour, as today.
- **Colonies** mode: the owner's palette colour × the stronger channel; **Off** hides it.
- Teal/amber are deliberately outside the ant palette's body treatment, so trails glow behind
  ants without competing.
- A small legend in the run HUD names the two channels when Trails is on.

### 6.7 Terrain

- One baked terrain texture per world/setup at **half world resolution** (2 u per texel, max
  2048 px on the long side), rebuilt only when the map changes. It replaces the flat ground fill
  and the separate obstacle draw, so the ground is one draw call.
- **Ground:** the preset's base colour plus ~4,000 deterministic speckles, tiny tufts and broad
  tonal drifts; no visible repeating tile.
- **Rock:** slate `#2C3034` with a top-left highlight and a hard dark underside, clusters drawn as
  rounded blobs, never a grid of squares.
- **Water:** deep `#0F2F3C`, lighter `#1E4C5C` ripples and a soft bank; no animation.
- **Sand:** pale drift `#3A3122` with grain dots; **Mud:** dark `#251F17` with damp highlights.
- Edges are softened by the 2 u texel scale and linear filtering. A faint 120 u grid is available
  in the builder only, at 6% opacity.
- A world border hairline is drawn in the theme's border colour.

### 6.8 Themes (map presets, not a settings toggle)

Five presets each own a `Theme`:

| Preset | Ground | Character |
|---|---|---|
| Meadow | `#0B100D` moss | speckled moss, scattered boulders, sand drift, mud patch |
| Dunes | `#2A2117` warm sand | long drifts, exposed rock, a muddy oasis |
| Creek | `#0D1412` damp earth | river with two rock crossings, sandy banks |
| Boulder field | `#14171A` slate | many boulder clusters, moss tufts |
| Blank canvas | `#0B0E0F` neutral | no obstacles, no food, no colonies |

## 7. The builder

**Layout:** a 64 px top bar (back, title, preset pills, seed field + dice, Start), a 92 px left
tool rail with icon + label, and a bottom-left inspector card for the current tool or selection.
A status line above Start names the first validation problem. A faint grid is on by default here.

**Tools** (shortcuts 1–8): Select, Colony, Food, Rock, Water, Sand, Mud, Erase.

- **Select:** click a nest or food pile to select it; drag to move; Delete removes. Colonies expose
  name, eight colour swatches, a starting-ants slider (10–600, step 10) and a delete action. Food
  exposes kind, amount (500–20,000, step 500) and delete. Empty space clears the selection.
- **Colony:** click free ground to add a colony (max 8); the inspector sets the colour and starting
  ants for the next colony. New colonies use the first unused palette colour and 200 ants.
- **Food:** click to add a pile of the selected kind and amount (default Seeds, 4,000).
- **Rock / Water / Sand / Mud:** drag to paint a circular brush, radius 8–64 u (default 24).
  **Erase** paints `None`.
- Right/middle drag pans, the wheel zooms at the cursor. The brush ring follows the pointer.
- **Presets:** choosing one loads its complete map. If the current map was edited, a small popover
  asks "Replace your map?" with Replace / Cancel. Cancelling changes nothing.
- **Seed:** an integer 0–4,294,967,295 with a dice button. It is shown on the run screen.
- Painting over a nest or food is allowed and then reported by validation, rather than silently
  blocked; the player can see the problem and erase it.

**Validation before Start** (first message wins, in this order):

1. `Add at least one colony.`
2. `Place at least one food source.`
3. `Move a colony inside the world.` (nest must be at least 24 u from every edge)
4. `Move a colony off rock or water.`
5. `Move food off rock or water.`
6. `Nests are too close together.` (closer than 96 u)

Starting ants are clamped to 10–600; food amount to 500–20,000; brush radius to 8–64.

## 8. The run

**Top bar:** wordmark, preset name and seed, live chips (ants, delivered, elapsed sim time, FPS),
then colony-panel and settings buttons. **Bottom dock:** Pause/Play, Step, 1×/2×/4×/Max, a divider,
Reset, Edit, Finish. Reset rebuilds the same setup with the same seed; Edit opens the builder;
Finish opens the confirmation.

**Colony panel (left, collapsible):** one row per colony — swatch, palette name, population,
delivered, food pool; extinct colonies are dimmed and tagged. Clicking a row centres the camera on
that nest. Multiple colonies are visible at once.

**Settings drawer (right):** the existing nine live parameter sliders in Movement, Trails and
Colony sections, plus Ants/Grid switches, the trails mode cycle, Fit world, Reset parameters and
the shortcut legend. Restyled to the design system; no behaviour change to the sliders.

**Pause overlay:** dim + blur the run; a card with Resume, Restart, Edit world and Finish run.
Esc opens it; Esc again resumes. H hides all run UI (Zen); Esc leaves Zen.

**Finish:** a confirmation card showing elapsed time, ants, delivered and colony count, with Keep
watching / Finish & home. Finishing returns to Home with the finished world as a dimmed backdrop
and a Last run card: preset, time, delivered, ants, colonies.

**Keys:** P pause · Space step · 1/2/3/4 speed · M trails · A ants · G grid · H Zen · Home fit ·
Esc pause/close · right/middle drag pan · wheel zoom.

## 9. Simulation changes

### 9.1 World setup (new, pure data)

```ts
WorldSetup { presetId, seed, size, colonies: ColonySetup[], food: FoodSetup[],
             obstacles: ObstacleCells, nextFoodUid }

ColonySetup { id, nest, color, startingAnts }
FoodSetup   { uid, pos, amount, kind }
ObstacleCells { cell: 4, width, height, kind: Uint8Array }  // 0 none, 1 rock, 2 water, 3 sand, 4 mud
```

The builder edits a `WorldSetup`. Starting a run copies it into a fresh `World` (colonies in
array order with ids 0…n-1, food in order, obstacle cells copied). Preview worlds contain no ants.
No builder operation touches a running world. `golden` rule: same setup + seed gives the same run.

### 9.2 Colonies

- Up to 8; each sim `Colony` gains `color` (palette index). Ids stay equal to array indices.
- Starting populations spawn in setup order at tick 0 through `spawnAtNest`, exactly N per colony.
- The existing per-colony marker ownership works for multiple colonies; the territory deposit rule
  is now actually applied (today `deposit` ignores it — fixed here and tested).
- All colonies share food sources and only deliver to their own nest.

### 9.3 Obstacles and terrain

- **Rock:** solid, blocks movement, scent sensing and direct sight.
- **Water:** solid, blocks movement, scent and direct sight.
- **Sand:** walkable, movement ×0.60.
- **Mud:** walkable, movement ×0.45.
- Collision uses the existing spec's border-cell optimisation: 4 u cells, circle-vs-box, only
  solid cells with a non-solid 4-neighbour are tested. Two resolution passes, then the world-edge
  clamp. Ants painted inside a wall are pushed out.
- Sensor samples inside solid cells are ignored; direct sight requires a clear line of sight.
- No stuck detection, fallback rays or pathfinding in this milestone. Presets are open spaces, not
  mazes, so basic collision is enough.

### 9.4 Food

`FoodSource` gains `uid` (stable per source, never reused) and `kind`. Amount semantics are
unchanged; piece layout is derived for rendering only.

### 9.5 Rendering architecture

- New batched **sprite pipeline**: one atlas texture (2048×1024) and one `drawSprites` call per
  layer. Frames: 16 ant body, 16 ant small, 12 food, 8 nest.
- Layer order: terrain texture → heatmap texture → under geometry (grid, border, rings) → back
  sprites (nests, food) → leg geometry → ant sprites (shadows, bodies, carried food). Six draw
  calls total, never one per ant.
- The terrain texture is baked with Canvas2D and uploaded; it is never updated per frame while
  running. The builder rebakes it after a stroke (throttled).
- The heatmap path and interpolation are unchanged.
- Sprite art is generated procedurally at startup; no image files, no external assets.

## 10. Presets

| Id | Name | Size | Colonies (start) | Food | Terrain |
|---|---|---|---|---|---|
| `meadow` | Meadow | 1920×1080 | Ember 200 | Seeds 6,000; Berries 3,000 | moss, 5 rock clusters, sand drift, mud |
| `dunes` | Dunes | 1920×1080 | Ember 180; Azure 180 | Leaves 8,000 | warm sand drifts, 3 rocks, muddy oasis |
| `creek` | Creek | 2240×1200 | Fern 200; Rose 200 | Seeds 5,000; Berries 5,000 (opposite banks) | river with two rock crossings, sand banks |
| `boulder` | Boulder field | 1920×1080 | Gold 220 | Seeds 7,000; Berries 4,000 | dense boulder clusters, moss, mud |
| `blank` | Blank canvas | 1920×1080 | none | none | empty neutral soil |

The presets are data, generated deterministically. Quick start uses `meadow` with a fresh seed.
"Creek" is a showcase, not a pathfinding challenge: two crossings exist, but no maze-solving is
promised in this milestone.

## 11. Roadmap changes

A new milestone, **M1.5 — Presentation & world builder**, lands before M2. It absorbs:

- from old M2: obstacle grid, border flags, wall collision, painting tools;
- from old M3: multiple colonies, colours, New colony tool, multi-colony HUD;
- from old M5: ant art, legs/gait, shadows, themes, the UI overhaul, Zen mode.

What remains in later milestones:

- **M2** — stuck detection and degrading, fallback rays, the maze scenario and breach button,
  wall-following quality.
- **M3** — colony balance, territory tuning, the four-colony scenario, colony-colour analysis.
- **M4** — PBD/PBMAD, workers, stress scenario, 20k bench.
- **M5** — ant inspector (names, follow, sensor drawing), telemetry and sparklines, advanced
  parameters.
- **M6** — tuning and hardening, including the deferred mechanics project.

## 12. Acceptance

1. `npm test` green, `npm run build` clean.
2. `npm run bench -- --preset meadow --ticks 1200` recorded while plugged in.
3. Screenshots read and judged: home, builder (two presets), run at fit zoom, close-up ants
   (zoom ≥ 3×), a food pile at two depletion levels.
4. Home → New world → edit (colonies, colour, starting ants, food, each obstacle type, preset,
   seed) → Start → pause → edit → restart → finish → home all work by hand.
5. Two colonies visibly forage with distinct colours and separate trails; no red-ant/red-trail
   clash; food pieces visibly decrease as food is delivered; legs animate when zoomed in.
6. `src/core` and `src/sim` still import no DOM, WebGL or Chrome APIs.

## 13. Left to the builder

Within the direction above, the implementer may refine: exact curve control points and shading in
the sprite art, the noise recipe for terrain, exact CSS spacing at widths below 1100 px, modal
copy punctuation, and micro-timing inside the stated motion ranges. The values for palette,
sizes, obstacle effects, validation messages, preset contents, food piece math and draw order are
fixed here and in the plan. Simulation tuning is explicitly out of scope.
