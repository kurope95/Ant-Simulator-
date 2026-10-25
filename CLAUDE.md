# Ant Simulator

A real-time 2D ant colony / stigmergy simulator inspired by Pezzza's Work "Ant Simulator 2". C++20, SDL3, Dear ImGui, built natively for Windows ARM64.

**Design spec:** [docs/superpowers/specs/2026-10-25-ant-simulator-design.md](docs/superpowers/specs/2026-10-25-ant-simulator-design.md). Read it before changing simulation behaviour. Keep it in sync when a decision changes.

**Structure and names:** [docs/superpowers/specs/2026-10-25-ant-simulator-structure.md](docs/superpowers/specs/2026-10-25-ant-simulator-structure.md). Every file, build target and public name is listed there. Update it in the same commit when one changes.

**Plans:** one per milestone, in `docs/superpowers/plans/`. Carry them out task by task, and don't run ahead into the next milestone.

## Status
- Current milestone: **M0 (skeleton), not started.** Update this line as each milestone lands. The milestone list is in spec §15.

## This machine
- **Windows 11 ARM64.** Snapdragon X Plus, 8 equal cores, 16 GB shared RAM, Adreno X1-45 GPU.
- **No native OpenGL.** Only D3D11/D3D12/Vulkan. Never add OpenGL-only libraries (SFML, raylib, GLFW-based UIs).
- **Build native ARM64 with MSVC** (VS Build Tools 2026). Never link prebuilt x64 libraries. Every dependency comes from source via CMake FetchContent, pinned to a tag:
  - SDL3 `release-3.4.18`
  - Dear ImGui `v1.93.0`
  - doctest `v2.5.3`
  - stb `003501f6d7a8668ce8b6d875e34dd97ad0d5d5b5`
- **Screen:** 2880×1620 at 120 Hz with 200% scaling. The app must be DPI-aware and scale ImGui by the display scale.
- **Laptop:** performance numbers only count from `--bench` runs while plugged in.
- **Verified 2026-10-25** with a smoke build: MSVC 19.51 (toolset 14.51) produces native ARM64 binaries; SDL3 3.4.18 picks the `direct3d11` renderer; `SDL_RenderGeometry` draws and reads back correctly.
- **SDL3 on Windows:** window coordinates are physical pixels (`SDL_GetWindowPixelDensity` = 1.0), while `SDL_GetWindowDisplayScale` = 2.0. Size the UI with the display scale.
- **Never put an MSBuild build folder under `%TEMP%`,** including Claude's scratchpad. Builds there fail with MSB8029/MSB6003 (`.tlog` path not found). Use this project's `build/` folder, even for throwaway builds.

## Build and run
M0 sets these commands up; fix them here if they turn out different.

```powershell
cmake --preset arm64
cmake --build --preset release
.\build\Release\AntSim.exe
ctest --preset release
.\build\Release\AntSim.exe --headless --scenario maze --ticks 3600 --screenshot captures\maze.png
.\build\Release\AntSim.exe --bench stress --ticks 1200
```

If `cmake` isn't found in a shell that was started before the install, refresh PATH:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
```

## Architecture rules
- **Ant data is Structure-of-Arrays.** Refer to an ant across frames by `uid`, never by array index; indices change on swap-and-pop removal.
- **Fixed 60 Hz simulation step.** Rates are per second, never per tick. Rendering interpolates between steps.
- **Tick phases** (spec §5.2):
  - parallel phases write only their own ant slots and their own chunk's event list;
  - grid writes, food pickups, spawns and removals happen in serial phases, in chunk order.
- **All simulation randomness** comes from the counter-based `rand(seed, uid, tick, stream)`. Never use `rand()`, `std::random_device` or a shared engine.
- **Determinism:** the same seed and inputs must give bit-identical results with 1 or 8 threads. A test guards this.
- **Ants only use local information:** their sensing cone and their own memory. No pathfinding, no global knowledge.
- **`src/sim` and `src/core` must not include SDL or ImGui.**
- **Draw in a few batched `SDL_RenderGeometry` calls.** Never one draw call per ant or per leg.

## Verification
- Run the unit tests after any simulation change.
- Check behaviour by rendering a headless screenshot and looking at it. Don't infer it from the code.
- Back performance claims with a `--bench` run, and state whether the laptop was plugged in.

## Scope
- **Inter-colony hostilities/combat is an open topic.** Don't implement it until the user asks. In v1 the territory (foreign-marker erasure) rule is the only cross-colony interaction.
