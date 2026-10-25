# Ant Simulator — Project Structure and Module Interfaces

- **Date:** 2026-10-25
- **Companion to:** [the design spec](2026-10-25-ant-simulator-design.md). That document says *what* the simulator does; this one says *where* every piece lives and what it's called.
- **Rule for every plan and every agent:** don't rename or move anything listed here without updating this file in the same commit. Private helpers inside a `.cpp` are free.
- **Status of the signatures:**
  - Milestone 0 signatures are final; the M0 plan builds exactly these.
  - Signatures for M1–M6 are the intended shape. Each milestone's own plan finalizes them and updates this file.

---

## 1. Repository layout

```
Ant Simulator/
├── CMakeLists.txt              top level: options, dependencies, subfolders
├── CMakePresets.json           "arm64" configure preset; debug/release build and test presets
├── CLAUDE.md                   project rules for any coding agent
├── AGENTS.md                   points other agent apps to CLAUDE.md
├── .gitignore
├── cmake/
│   ├── Dependencies.cmake      FetchContent pins: SDL3, Dear ImGui, doctest, stb, plus the imgui and stb targets
│   └── CompilerWarnings.cmake  antsim_target_defaults(): warning and conformance flags for our targets
├── docs/superpowers/
│   ├── specs/                  design spec + this structure doc
│   └── plans/                  one implementation plan per milestone
├── src/
│   ├── core/                   pure C++ utilities (no SDL, no ImGui)
│   ├── sim/                    the simulation (no SDL, no ImGui)
│   ├── render/                 drawing with SDL3's renderer
│   ├── ui/                     Dear ImGui panels and tools
│   └── app/                    entry point, command-line modes, main loop
├── tests/                      doctest unit tests, mirroring src/ (tests/core, tests/sim, ...)
└── build/                      generated (gitignored); executables in build/<Config>/
```

---

## 2. Build targets and dependency rules

| Target | Kind | Sources | Links | May include |
|---|---|---|---|---|
| `antsim_core` | static lib | `src/core/*.cpp` | none | C++ standard library only |
| `antsim_sim` | static lib | `src/sim/*.cpp` | `antsim_core` | core |
| `antsim_appcore` | static lib | `src/app/options.cpp`, `src/app/bench.cpp` | `antsim_sim` | core, sim |
| `antsim_render` | static lib | `src/render/*.cpp` | `antsim_sim`, `SDL3::SDL3`; `stb` (private) | core, sim, SDL3, stb |
| `antsim_ui` | static lib | `src/ui/*.cpp` | `antsim_render`, `imgui` | everything above, plus ImGui |
| `AntSim` | console executable | `src/app/main.cpp`, `sdl_session.cpp`, `headless.cpp`, `interactive.cpp` | `antsim_appcore`, `antsim_ui` | everything |
| `antsim_tests` | executable (CTest: `antsim_tests`, `headless_screenshot`) | `tests/**/*.cpp` | `antsim_appcore`, `antsim_render`, `doctest::doctest` | everything except ImGui |

Third-party targets are all defined in `cmake/Dependencies.cmake` and built from source for ARM64:
- `SDL3::SDL3` (static),
- `imgui` (static; our own target over the ImGui sources and its SDL3 / SDL_Renderer3 backends),
- `stb` (header-only interface),
- `doctest::doctest`.

**Layering is enforced by linking.** `core`, `sim` and `appcore` don't link SDL or ImGui, so including those headers there fails to compile. Keep it that way: the simulation must stay testable and benchmarkable without a window.

---

## 3. Conventions

- **Namespaces:** `antsim::core`, `antsim::sim`, `antsim::render`, `antsim::ui`, `antsim::app`.
- **Naming:**
  - files `snake_case.hpp` / `snake_case.cpp`;
  - types `PascalCase`;
  - functions and variables `snake_case`;
  - constants `kPascalCase`;
  - private members end with `_`;
  - `enum class` values are `PascalCase`.
- **Includes:** own headers use quotes, relative to `src/` (`#include "core/vec2.hpp"`). Third-party headers use angle brackets (`<SDL3/SDL.h>`, `<imgui.h>`, `<doctest/doctest.h>`). The compiler silences warnings from angle-bracket headers.
- **Units:**
  - distances in world units (u), times in seconds, angles in radians;
  - x points right and **y points down** (the screen convention), so a positive angle turns clockwise on screen;
  - heading 0 means +x.
- **Numbers:** `float` for simulation data, `double` for time accumulation and measurements.
- **Errors:**
  - Functions that can fail return `bool` (or `std::optional`) and fill a `std::string* error`. No exceptions cross module boundaries.
  - Exit codes are 0 for success, 1 for a runtime failure and 2 for a usage error.
- **No global mutable state.** Everything hangs off `World`, the app loop, or an explicit object.
- **Comments** only where the code isn't self-explanatory.
- **Simulation data is a plain struct with free functions** (data-oriented), not class hierarchies.

---

## 4. Module reference

The milestone that creates or extends each item is shown in brackets.

### 4.1 `core`: pure utilities

```cpp
// core/build_info.hpp                                               [M0]
std::string_view build_info();   // "AntSim 0.1.0 (MSVC 1951, ARM64, C++20)"

// core/vec2.hpp, core/rect.hpp, core/math.hpp, core/color.hpp      [M0] header-only
struct Vec2 { float x = 0.f, y = 0.f; };   // + - * / += -= *= ==, unary -
float dot(Vec2, Vec2);  float cross(Vec2, Vec2);  float length(Vec2);  float length_sq(Vec2);
Vec2 normalized(Vec2);  Vec2 perp(Vec2);  Vec2 rotated(Vec2, float radians);
Vec2 from_angle(float radians);  float angle_of(Vec2);  Vec2 lerp(Vec2, Vec2, float t);
struct Rect { Vec2 min, max; };
bool contains(const Rect&, Vec2);  bool intersects(const Rect&, const Rect&);  Rect expanded(const Rect&, float margin);
inline constexpr float kPi, kTwoPi;
float wrap_angle(float);  float angle_diff(float from, float to);  float lerp(float, float, float);  float smoothstep(float);
struct Rgba8 { std::uint8_t r = 0, g = 0, b = 0, a = 255; };
constexpr Rgba8 rgb(std::uint32_t hex);   // rgb(0xE8DCC2)

// core/rng.hpp                                                      [M0] header-only
std::uint64_t mix64(std::uint64_t);
std::uint32_t rand_u32(std::uint64_t seed, std::uint32_t uid, std::uint64_t tick, std::uint32_t stream);
float rand_unit(std::uint64_t seed, std::uint32_t uid, std::uint64_t tick, std::uint32_t stream);   // [0, 1)
float rand_range(std::uint64_t seed, std::uint32_t uid, std::uint64_t tick, std::uint32_t stream, float lo, float hi);

// core/thread_pool.hpp                                              [M0]
class ThreadPool {
public:
    explicit ThreadPool(unsigned thread_count);   // total threads including the caller; 0 = hardware threads
    unsigned thread_count() const;
    using ChunkFn = std::function<void(std::size_t chunk_index, std::size_t begin, std::size_t end)>;
    void parallel_for(std::size_t count, std::size_t chunk_size, const ChunkFn& fn);   // blocks until done
};
std::size_t chunk_count(std::size_t count, std::size_t chunk_size);

// core/fixed_step.hpp                                               [M0]
class FixedStepClock {
public:
    FixedStepClock(double step_seconds, int max_steps_per_frame);
    int advance(double frame_seconds, double speed);   // number of simulation steps to run now
    double alpha() const;                              // interpolation fraction in [0, 1)
    double step_seconds() const;
    void reset();
};

// core/stopwatch.hpp                                                [M0] header-only
class Stopwatch { public: void restart(); double elapsed_ms() const; double elapsed_seconds() const; };

// core/stats.hpp                                                    [M0]
struct SampleSummary { double avg = 0.0; double p95 = 0.0; };
SampleSummary summarize(std::span<const double> samples);   // nearest-rank p95

// core/ring_buffer.hpp                                              [M1] header-only, for sparklines
template <class T, std::size_t N> class RingBuffer {
public: void push(T value); std::size_t size() const; T operator[](std::size_t i) const;   // 0 = oldest
};
```

### 4.2 `sim`: the simulation

```cpp
// sim/types.hpp                                                     [M0]; RandStream [M1]
inline constexpr int kMaxColonies = 8;
using ColonyId = std::uint8_t;
inline constexpr std::int8_t kNoOwner = -1;
enum class AntState : std::uint8_t { Foraging = 0, ReturningFood = 1, ReturningExhausted = 2 };   // 3+ reserved
enum class AntRole  : std::uint8_t { Follower = 0, Explorer = 1 };
enum class RandStream : std::uint32_t { WanderOffset = 1, WanderInterval, StuckTurn, SpawnHeading,
                                        SpawnRole, SpeedJitter, ContactTurn };                   // [M1]

// sim/params.hpp                                                    [M0]; marker_decay_factor [M1]
struct SimParams { /* every tunable from spec §12; the exact field list is in the M0 plan, Task 6 */ };
bool validate(const SimParams&, std::string* error);
float marker_decay_factor(const SimParams&, float dt);   // 2^(-dt / marker_half_life)      [M1]

// sim/phases.hpp                                                    [M0]
enum class Phase : std::uint8_t { SpatialHash, Think, Events, Collisions, Removals, Decay, Stats, Count };
inline constexpr std::size_t kPhaseCount = 7;
std::string_view phase_name(Phase);   // "spatial_hash", "think", ...
struct PhaseTimings { std::array<double, kPhaseCount> ms{}; double total_ms = 0.0; };

// sim/world.hpp                                                     [M0] skeleton; one member group per milestone
struct World {
    SimParams params;
    std::uint64_t seed = 1;
    std::uint64_t tick = 0;
    core::Vec2 size;
    PhaseTimings timings;
    // [M1] Ants ants; MarkerGrid markers; std::vector<Colony> colonies; FoodSources food;
    //      std::vector<ChunkEvents> chunk_events; std::uint32_t next_uid = 1;
    // [M2] ObstacleGrid obstacles; SpatialHash hash; std::vector<Edit> pending_edits;
};
World make_world(const SimParams& params, std::uint64_t seed);
void step_world(World& world, core::ThreadPool& pool);   // runs the spec §5.2 phases in order

// sim/ants.hpp                                                      [M1]; avoid_x/y [M4]; legs [M5]
struct AntSpawn { core::Vec2 pos; float heading = 0; ColonyId colony = 0; AntRole role = AntRole::Follower;
                  AntState state = AntState::Foraging; };
struct Ants {   // Structure of Arrays: every vector has size() elements
    std::vector<std::uint32_t> uid; std::vector<std::uint8_t> colony, role, state;
    std::vector<float> pos_x, pos_y, prev_x, prev_y, vel_x, vel_y, heading, speed, mass;
    std::vector<float> energy, time_since_anchor;
    std::vector<float> drop_x, drop_y, time_since_last_marker, degrade_timer;
    std::vector<std::int32_t> last_marker_cell;
    std::vector<float> wander_offset, wander_timer;
    std::size_t size() const;
    std::size_t spawn(const AntSpawn&, std::uint32_t uid, float speed, const SimParams&);   // returns index
    void remove_swap(std::size_t index);                // swap-and-pop; keeps the uid map in sync
    std::optional<std::size_t> index_of(std::uint32_t uid) const;
};

// sim/marker_grid.hpp                                               [M1]; ownership/territory [M3]
enum class MarkerChannel : std::uint8_t { ToHome, ToFood };
struct MarkerGrid { int width = 0, height = 0; float cell = 8.f;
                    std::vector<std::int8_t> owner; std::vector<float> to_home, to_food;
                    void resize(core::Vec2 world_size, float cell_size);
                    int cell_index(core::Vec2 world_pos) const; };   // -1 outside the world
float emission_strength(float time_since_anchor, const SimParams&);
void deposit(MarkerGrid&, int cell, ColonyId, MarkerChannel, float strength, const SimParams&);   // spec §4.2
void degrade(MarkerGrid&, int cell, ColonyId, MarkerChannel, float factor);
void decay_markers(MarkerGrid&, float factor, float eps, core::ThreadPool&);
void clear_markers_in_circle(MarkerGrid&, core::Vec2 center, float radius);                      // [M2]

// sim/food.hpp, sim/colony.hpp                                      [M1]; multiple colonies [M3]
struct FoodSource { core::Vec2 pos; float amount = 0; bool infinite = false; };
float food_radius(const FoodSource&, const SimParams&);
struct FoodSources { std::vector<FoodSource> items;
                     int find_touching(core::Vec2 pos, float radius, const SimParams&) const;   // -1 if none
                     bool take_one(int index);  void remove_empty(); };
struct Colony { ColonyId id = 0; core::Vec2 nest; float food_pool = 0; std::uint32_t population = 0;
                std::uint64_t delivered_total = 0; core::RingBuffer<float, 120> delivered_per_second;
                bool extinct = false; };
float nest_radius(const Colony&, const SimParams&);

// sim/events.hpp                                                    [M1]
struct DepositEvent { int cell; ColonyId colony; MarkerChannel channel; float strength; };
struct DegradeEvent { int cell; ColonyId colony; MarkerChannel channel; };
enum class ContactKind : std::uint8_t { Food, Nest };
struct ContactEvent { std::uint32_t ant_index; ContactKind kind; int target; };   // food index or colony id
struct ChunkEvents { std::vector<DepositEvent> deposits; std::vector<DegradeEvent> degrades;
                     std::vector<ContactEvent> contacts; void clear(); };

// sim/sensing.hpp, sim/steering.hpp                                 [M1]; walls in sensing [M2]
struct SensorSample { float angle_offset; float distance; };
std::span<const SensorSample> follower_pattern();   // 25 = 5 angles x 5 distances
std::span<const SensorSample> explorer_pattern();   // 4
struct SenseResult { bool found = false; float target_heading = 0; float best_signal = 0; float best_food_signal = 0; };
SenseResult sense_markers(const World&, std::size_t ant, MarkerChannel, std::span<const SensorSample>);
std::optional<float> direct_sight_heading(const World&, std::size_t ant);
float fallback_heading(const World&, std::size_t ant, float wander_heading);                     // [M2]
float turn_toward(float heading, float target, float max_turn);
void update_wander(World&, std::size_t ant, float dt);

// sim/tick.hpp                                                      [M1] phase bodies used by step_world
void think_chunk(World&, std::size_t begin, std::size_t end, ChunkEvents& out);
void apply_events(World&, std::span<ChunkEvents>);
void remove_dead(World&);
void update_stats(World&);

// sim/scenarios.hpp                                                 [M1] sandbox, [M2] maze, [M3] war, [M4] stress
std::span<const std::string_view> scenario_names();
bool load_scenario(World&, std::string_view name, std::uint64_t seed, std::string* error);

// sim/checksum.hpp                                                  [M1]
std::uint64_t world_checksum(const World&);   // hashes ant state + marker grid; used by determinism tests

// sim/obstacle_grid.hpp                                             [M2]
struct ObstacleGrid { int width = 0, height = 0; float cell = 4.f;
                      std::vector<std::uint8_t> solid, border;
                      void resize(core::Vec2 world_size, float cell_size);
                      bool is_solid_at(core::Vec2 world_pos) const; };
void paint_circle(ObstacleGrid&, core::Vec2 center, float radius, bool solid);   // also refreshes border flags locally
float free_distance(const ObstacleGrid&, core::Vec2 origin, float angle, float max_distance);
bool midpoint_clear(const ObstacleGrid&, core::Vec2 a, core::Vec2 b);
core::Vec2 push_out_of_walls(const ObstacleGrid&, core::Vec2 pos, float radius);
std::optional<core::Vec2> nearest_free_point(const ObstacleGrid&, core::Vec2 pos, int max_cells);

// sim/spatial_hash.hpp                                              [M2] (moved from M4: the stuck rule needs it)
struct SpatialHash { float cell = 6.f; int width = 0, height = 0;
                     std::vector<std::uint32_t> cell_start, items;
                     void build(std::span<const float> xs, std::span<const float> ys, core::Vec2 world_size, float cell_size);
                     template <class Fn> void for_each_near(core::Vec2 pos, float radius, Fn&& fn) const; };   // fn(std::uint32_t)

// sim/stuck.hpp                                                     [M2]
struct StuckDecision { bool stuck = false; bool degrade = false; };
StuckDecision evaluate_stuck(float time_since_last_marker, bool in_zone, int nearby_ants, const SimParams&);

// sim/edits.hpp                                                     [M2]; AddColony [M3]
enum class EditKind : std::uint8_t { PaintWall, EraseWall, AddFood, RemoveFood, AddColony, BreachShortcut };
struct Edit { EditKind kind; core::Vec2 pos; float radius = 0; float amount = 0; };
void queue_edit(World&, const Edit&);   // applied at the start of the next tick
void apply_pending_edits(World&);

// sim/collisions.hpp                                                [M2] walls, [M4] ants
void resolve_wall_collisions(World&, core::ThreadPool&);
void resolve_ant_overlaps(World&, core::ThreadPool&);   // Jacobi PBD, params.pbd_iterations

// sim/avoidance.hpp                                                 [M4]
std::optional<float> time_to_collision(core::Vec2 dp, core::Vec2 dv, float radius_sum);
core::Vec2 avoidance_velocity(const World&, std::size_t ant);

// sim/legs.hpp, sim/picking.hpp, sim/names.hpp                      [M5]
inline constexpr std::array<int, 3> kTripodA{0, 4, 2}, kTripodB{3, 1, 5};
void update_legs(World&, const core::Rect& visible_world, float dt);
core::Vec2 solve_knee(core::Vec2 hip, core::Vec2 foot, float femur, float tibia, bool bend_left);
std::optional<std::uint32_t> pick_ant(const World&, core::Vec2 world_pos, float max_distance);
std::string_view ant_name(std::uint32_t uid);
```

**How `step_world` uses these, in order** (spec §5.2):
1. `apply_pending_edits` [M2]
2. `SpatialHash::build` [M2]
3. Think: `pool.parallel_for(..., think_chunk)` [M1]
4. `apply_events` [M1]
5. Collisions: `resolve_wall_collisions` [M2], then `resolve_ant_overlaps` [M4]
6. `remove_dead` [M1]
7. `decay_markers` [M1]
8. `update_stats` [M1]

Each phase is timed into `World::timings`. Legs are **not** part of `step_world`; the app updates them once per frame.

### 4.3 `render`: drawing (SDL3)

```cpp
// render/camera.hpp                                                 [M0]
class Camera {
public:
    static constexpr float kMinScale = 0.05f, kMaxScale = 16.f;   // physical pixels per world unit
    void set_viewport(core::Vec2 size_px);  core::Vec2 viewport() const;
    void fit(core::Vec2 world_size);
    core::Vec2 world_to_screen(core::Vec2) const;  core::Vec2 screen_to_world(core::Vec2) const;
    void zoom_at(core::Vec2 screen_px, float factor);  void pan_by_screen(core::Vec2 delta_px);
    void center_on(core::Vec2 world_pos);
    float scale() const;  core::Vec2 center() const;  core::Rect visible_world_rect() const;
};

// render/theme.hpp                                                  [M0]; night_theme [M5]
struct Theme { core::Rgba8 outside, ground, grid, border; };
Theme sand_theme();
core::Rgba8 colony_color(sim::ColonyId id);   // Red, Yellow, Blue, Green, Purple, Orange, Teal, Pink

// render/batch.hpp                                                  [M0]
class GeometryBatch {   // screen-space triangles; one SDL_RenderGeometry call per draw()
public:
    void clear();
    void add_triangle(core::Vec2, core::Vec2, core::Vec2, core::Rgba8);
    void add_quad(core::Vec2 a, core::Vec2 b, core::Vec2 c, core::Vec2 d, core::Rgba8);
    void add_rect(core::Vec2 min, core::Vec2 max, core::Rgba8);
    void add_line(core::Vec2 a, core::Vec2 b, float width_px, core::Rgba8);
    void add_circle(core::Vec2 center, float radius_px, core::Rgba8, int segments = 24);
    std::span<const SDL_Vertex> vertices() const;  std::span<const int> indices() const;
    void draw(SDL_Renderer*, SDL_Texture* texture = nullptr) const;
};

// render/png_writer.hpp                                             [M0]
bool write_png(const std::filesystem::path&, int width, int height, const std::uint8_t* rgba, int stride_bytes, std::string* error);

// render/renderer.hpp                                               [M0]
class Renderer {
public:
    bool init(SDL_Window*, bool vsync, std::string* error);   // direct3d11, then direct3d12, then SDL's default
    void shutdown();
    SDL_Renderer* sdl() const;  std::string_view driver_name() const;  core::Vec2 output_size() const;
    void clear(core::Rgba8);  void present();
    bool begin_offscreen(int width, int height, std::string* error);
    bool save_offscreen_png(const std::filesystem::path&, std::string* error);
};

// render/test_pattern.hpp                                           [M0]; kept later as the "World grid" overlay
void build_test_pattern(GeometryBatch&, const Camera&, core::Vec2 world_size, const Theme&, double sim_seconds);
core::Vec2 test_pattern_dot(core::Vec2 world_size, double sim_seconds);

// [M1] render/view_settings.hpp, heatmap.hpp, sprites.hpp, ant_layer.hpp, world_view.hpp
enum class HeatmapMode : std::uint8_t { Off, DualChannel, ColonyColor };   // ColonyColor [M3]
struct ViewSettings { HeatmapMode heatmap = HeatmapMode::DualChannel; bool show_ants = true;
                      bool show_grid = false; bool show_hash = false; bool show_colliders = false; };
void fill_heatmap_rgba(const sim::MarkerGrid&, HeatmapMode, const Theme&, std::span<std::uint8_t> rgba_out);   // pure, testable
SDL_Texture* create_ant_sprite(SDL_Renderer*, int length_px);
void build_ants(GeometryBatch&, const sim::World&, const Camera&, float alpha, const Theme&);
struct WorldRenderCache;   // heatmap texture, obstacle texture [M2], ant sprite, batches
void draw_world(Renderer&, WorldRenderCache&, const sim::World&, const Camera&, const ViewSettings&, const Theme&, float alpha);
// [M2] render/obstacle_layer.hpp, render/overlays.hpp;  [M5] shadows and legs in ant_layer
```

### 4.4 `ui`: Dear ImGui

```cpp
// ui/imgui_layer.hpp                                                [M0]
class ImGuiLayer {
public:
    bool init(SDL_Window*, SDL_Renderer*, float display_scale);
    void set_display_scale(float display_scale);
    void process_event(const SDL_Event&);
    void new_frame();
    void render(SDL_Renderer*);
    void shutdown();
    bool wants_mouse() const;  bool wants_keyboard() const;
};

// ui/debug_panel.hpp                                                [M0]; replaced by telemetry_panel [M5]
struct DebugInfo { float fps = 0; float frame_ms = 0; std::string_view renderer; float display_scale = 1;
                   int width_px = 0, height_px = 0; std::uint64_t tick = 0; int steps_this_frame = 0;
                   bool paused = false; float camera_scale = 1; core::Vec2 camera_center;
                   unsigned threads = 1; double alpha = 0; };
void draw_debug_panel(const DebugInfo&);

// [M2] ui/ui_state.hpp, ui/tools.hpp, ui/toolbar.hpp
enum class Tool : std::uint8_t { SelectPan, WallBrush, EraseBrush, Food, NewColony };
struct UiState { Tool tool = Tool::SelectPan; float brush_radius = 24; float food_capacity = 500;
                 std::optional<std::uint32_t> selected_uid; bool follow = false; bool zen = false;
                 bool paused = false; int speed = 1; bool max_speed = false; };
std::optional<sim::Edit> edit_for_click(const UiState&, core::Vec2 world_pos);
// [M3] ui/colonies_panel;  [M5] ui/inspector_panel, telemetry_panel, params_panel
```

### 4.5 `app`: entry point and modes

```cpp
// app/options.hpp                                                   [M0]
enum class Mode { Interactive, Headless, Bench, Help, Version };
struct AppOptions;   // exact fields in the M0 plan, Task 7
struct ParseResult { AppOptions options; std::string error; bool ok() const; };
ParseResult parse_options(std::span<const std::string_view> args);
int effective_ticks(const AppOptions&);
std::string usage_text();

// app/bench.hpp                                                     [M0]
struct BenchReport;   // exact fields in the M0 plan, Task 8
std::string format_bench_report(const BenchReport&);
int run_bench(const AppOptions&);

// app/sdl_session.hpp, app/headless.hpp, app/interactive.hpp        [M0]
struct SdlSessionConfig { bool hidden = false; int width = 1600; int height = 900; bool maximized = true; bool vsync = true; };
class SdlSession;   // opens SDL, the window and the Renderer; closes everything in its destructor
int run_headless(const AppOptions&);
int run_interactive(const AppOptions&);
```

**Command line** (final form; M0 implements the parsing and all three modes):

| Option | Meaning |
|---|---|
| `--scenario <name>` | starting scenario (default `sandbox`) |
| `--seed <n>` | random seed (default 1) |
| `--headless --screenshot <file.png> [--ticks N] [--size WxH]` | run N ticks without a visible window and save a PNG (default 1920x1080) |
| `--bench <scenario> [--ticks N] [--threads T]` | timing table; no window (default 1200 ticks) |
| `--threads <1-64>` | worker count (default: one per hardware thread) |
| `--no-vsync` | uncapped frame rate |
| `--help`, `--version` | |

---

## 5. Who writes what in each phase

| Phase | Runs | Reads | Writes |
|---|---|---|---|
| Edits | serial | `pending_edits` | obstacles, markers, food, colonies, trapped ants |
| Spatial hash | serial | ant positions | `hash` |
| Think | parallel, chunks of `chunk_size` | anything | only its own ants' fields, and its own `chunk_events[chunk]` |
| Events | serial, in chunk order | `chunk_events` | markers, food, colonies, contacted ants, new ants (appended) |
| Collisions | parallel (Jacobi into scratch), then apply | positions, hash, obstacles | own ants' `pos`/`vel` |
| Removals | serial, descending index | `energy` | ants (swap-and-pop), uid map, populations |
| Decay | parallel by grid rows | markers | own rows of markers |
| Stats | serial | colonies | colony stats |
| Legs (per frame, outside `step_world`) | parallel | ants, camera view | leg fields of visible ants |

Determinism follows from this table. If something has to write outside its own slot, it emits an event instead.

---

## 6. Milestone map

| # | Creates or extends | Detailed plan |
|---|---|---|
| M0 Skeleton | build system; `core/*`; `sim/{types,params,phases,world}`; `render/{camera,theme,batch,png_writer,renderer,test_pattern}`; `ui/{imgui_layer,debug_panel}`; `app/*` | [plans/2026-10-25-m0-skeleton.md](../plans/2026-10-25-m0-skeleton.md) |
| M1 Core foraging | `core/ring_buffer`; `sim/{ants,marker_grid,food,colony,events,sensing,steering,tick,scenarios,checksum}`; `render/{view_settings,heatmap,sprites,ant_layer,world_view}` | written when M0 is done |
| M2 Walls and adaptation | `sim/{obstacle_grid,spatial_hash,stuck,edits,collisions}` (walls); maze scenario; `render/{obstacle_layer,overlays}`; `ui/{ui_state,tools,toolbar}` | later |
| M3 Colonies | territory rule in `marker_grid`; multi-colony `colony`/`world`; war scenario; colony-colour heatmap; `ui/colonies_panel` | later |
| M4 Crowds and scale | `sim/avoidance`; ant-to-ant `collisions`; all phases on the pool; stress scenario; determinism test with 1 and 8 threads | later |
| M5 Looks and UI | `sim/{legs,picking,names}`; shadows and legs in `ant_layer`; night theme; `ui/{inspector_panel,telemetry_panel,params_panel}`; full toolbar | later |
| M6 Tuning and hardening | parameter tuning, performance passes, edge cases, README | later |

### Task outlines for M1–M6
Each milestone gets a full, step-by-step plan before work on it starts. Writing them later lets each plan build on the code that actually exists.

**M1 — Core foraging, one colony**
1. Add the `RandStream` values and `RingBuffer`, with tests.
2. Ants SoA: spawn, swap-remove and the uid map. Tests keep the uid map consistent across 1,000 random spawns and removals.
3. MarkerGrid: deposit (own-cell rule), emission, decay factor and the decay pass. Tests:
   - the factor at dt = 1/60 equals 0.9985 ± 2e-5;
   - values below `marker_eps` reset the owner.
4. Food sources and colony: radius, `take_one`, nest radius and the spawn cost. Tests.
5. Sensing patterns, best-point choice, direct sight, wander and `turn_toward`. Tests.
6. The think chunk: timers, exhaustion rule, sensing, steering, moving and emitting events. Tests on a tiny world.
7. Apply events, removals, decay and stats; `step_world` with phase timings. Tests:
   - exhausted ants never deposit `to_food`;
   - a pickup flips heading, state and mass;
   - when food runs out mid-tick, events resolve in chunk order.
8. The sandbox scenario, `load_scenario` and `world_checksum`. Test: the same seed run twice gives the same checksum.
9. Rendering: the world view (ground, dual-channel heatmap, food, nest, ants with carried food). Headless mode draws the world. Test: `fill_heatmap_rgba` colours.
10. Wiring: M cycles the heatmap, A toggles ants, S is max speed, and bench reports per-phase times. Acceptance: a headless screenshot after 7,200 ticks shows a trail between nest and food.

**M2 — Walls and adaptation**
1. ObstacleGrid: solid and border flags, circle paint and erase, `free_distance`, `midpoint_clear`. Tests.
2. SpatialHash. Test: neighbour results equal a brute-force search on 2,000 random ants.
3. Wall collisions and moving trapped ants out. Tests.
4. Sensing respects walls; fallback rays with the tie-break. Tests.
5. Stuck detection and degrading, with the zone and crowd exemptions. Tests.
6. The edit queue: wall, erase, food and breach edits; painting clears markers. Tests.
7. The maze scenario: serpentine lanes, breach segments, energy override, and a metric for deliveries that use the shortcut. Tests.
8. Obstacle texture layer, hash and collider overlays, a minimal toolbar (wall, erase and food tools, brush radius), W and E keys, and a "Breach shortcut" button. Acceptance: screenshots before and after the breach.

**M3 — Colonies**
1. Territory rule: foreign erasure, flip then deposit, and the toggle. Tests.
2. Several colonies: `add_colony`, per-colony stats, extinction, own-colony sensing. Tests.
3. New colony edit and tool, and the colonies panel.
4. The four-colony war scenario. Test: symmetric placement.
5. Colony-colour heatmap and greyed-out extinct nests. Test: `fill_heatmap_rgba` in ColonyColor mode.

**M4 — Crowds and scale**
1. Run every parallel phase on the pool. Determinism test: 1 thread and 8 threads give equal checksums after 600 ticks.
2. PBD between ants. Tests: a packed cluster ends with no overlaps; a heavier ant moves less.
3. PBMAD: time to collision, tangential correction, urgency and mass weighting, right-hand rule, uid-parity slicing. Tests.
4. The 20,000-ant stress scenario. Test: the ant count stays fixed.
5. Bench numbers for stress, recorded in docs and measured plugged in. Acceptance: within the 60 Hz budget, or a list of hot spots.

**M5 — Looks and UI**
1. Legs: rig, tripod groups, step trigger and lock, smoothstep, knee IK, starting feet for ants that come into view. Tests: the tripod invariant over 10,000 ticks; IK reach.
2. Shadows with grounded feet, sprite level of detail, the night theme. Screenshots reviewed.
3. Inspector: pick, follow, names, drawing the sensors. Tests: pick returns the nearest ant; names are deterministic.
4. Telemetry (phase timings and sparklines), the colonies panel, and the parameters panel (every §12 value plus reset).
5. Full toolbar, the complete key table, Zen mode. Manual checklist.

**M6 — Tuning and hardening**
1. Tune toward the videos: how long trails take to form, how often explorers leave a highway.
2. Performance pass, with bench numbers before and after.
3. Edge cases: painting over nests or food, extinct colonies, the ant cap, zero food, the world edges.
4. README with controls; final CLAUDE.md status.

---

## 7. Changes against the design spec

- The spatial hash moves from M4 to **M2**, because M2's stuck rule needs neighbour counts. Spec §15 is updated.
- **Home** refits the camera to the world; it was added to the key table in spec §9.
- Bench prints both ticks per second and ant updates per second, as spec §11 says.
