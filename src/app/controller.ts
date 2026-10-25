import { FixedStepClock } from "../core/fixed_step.js";
import type { Vec2 } from "../core/vec2.js";
import { Camera } from "../render/camera.js";
import { GlRenderer } from "../render/gl_renderer.js";
import { themeForPreset, type Theme } from "../render/theme.js";
import { cycleHeatmap, defaultViewSettings, type ViewSettings } from "../render/view_settings.js";
import {
  createWorldRenderCache,
  disposeWorldRenderCache,
  drawWorld,
  refreshTerrain,
  type WorldRenderCache,
} from "../render/world_view.js";
import { obstacleGridFromCells } from "../sim/obstacles.js";
import { defaultParams, type SimParams } from "../sim/params.js";
import { loadPreset, presetInfo, quickStartSetup } from "../sim/presets.js";
import { cloneSetup, type WorldSetup } from "../sim/setup.js";
import { worldFromSetup } from "../sim/setup_apply.js";
import { stepWorld, type World } from "../sim/world.js";
import { BuilderModel, BuilderTool, paintStepReached } from "../ui/builder_model.js";
import { BuilderScreen, type BuilderHooks } from "../ui/builder_screen.js";
import { ColonyPanel } from "../ui/colony_panel.js";
import { el } from "../ui/dom.js";
import { FinishDialog } from "../ui/finish_dialog.js";
import { HomeScreen } from "../ui/home_screen.js";
import { applySpecValue, paramSpecs, type ParamKey } from "../ui/param_specs.js";
import { PauseMenu, type PauseMenuHooks } from "../ui/pause_menu.js";
import { RunHud, type HudState, type RunHudHooks } from "../ui/run_hud.js";
import { SettingsDrawer, type SettingsHooks } from "../ui/settings_drawer.js";
import { formatClock, type SpeedSetting } from "../ui/view_models.js";
import { makeAttractWorld, seedFromNow } from "./attract.js";
import { effectiveTicks, type AppOptions } from "./options.js";
import {
  Screen,
  editRun,
  finishRun,
  newSession,
  restartRun,
  resumeRun,
  startRun,
  summarizeRun,
  togglePause,
  type SessionState,
} from "./session.js";

const kMaxFrameSeconds = 0.25;
const kZoomStep = 1.15;
const kSelectionRadiusPx = 24;

function isBrushTool(tool: BuilderTool): boolean {
  return (
    tool === BuilderTool.Rock ||
    tool === BuilderTool.Water ||
    tool === BuilderTool.Sand ||
    tool === BuilderTool.Mud ||
    tool === BuilderTool.Erase
  );
}

function resetLiveParams(target: SimParams, defaults: SimParams): void {
  const worldW = target.worldW;
  const worldH = target.worldH;
  Object.assign(target, defaults);
  target.worldW = worldW;
  target.worldH = worldH;
}

export class AppController {
  private readonly options: AppOptions;
  private readonly canvas: HTMLCanvasElement;
  private readonly uiRoot: HTMLElement;
  private readonly log: (line: string) => void;
  private readonly params: SimParams = defaultParams();
  private readonly camera = new Camera();
  private readonly clock = new FixedStepClock(1 / defaultParams().simHz, 16);
  private readonly view: ViewSettings = defaultViewSettings();

  private renderer: GlRenderer | null = null;
  private session: SessionState = newSession();
  private setup: WorldSetup;
  private runTheme: Theme;
  private runWorld: World | null = null;
  private previewWorld: World | null = null;
  private activeWorld: World | null = null;
  private activeTheme: Theme;
  private cache: WorldRenderCache | null = null;
  private homeScreen: HomeScreen | null = null;
  private builderScreen: BuilderScreen | null = null;
  private builderModel: BuilderModel | null = null;
  private runHud: RunHud | null = null;
  private pauseMenu: PauseMenu | null = null;
  private finishDialog: FinishDialog | null = null;
  private colonyPanel: ColonyPanel | null = null;
  private settingsDrawer: SettingsDrawer | null = null;
  private coloniesOpen = false;
  private settingsOpen = false;
  private finishOpen = false;
  private brushRing: HTMLElement | null = null;
  private attractWorld: World | null = null;
  private previewPresetId = "";

  private runShowGrid = false;
  private stepRequests = 0;
  private zoomApplied = false;
  private needsFit = true;
  private frameMs = 1000 / 60;
  private lastTime = 0;
  private rafId = 0;
  private viewportW = 0;
  private viewportH = 0;
  private pointerCss: Vec2 | null = null;
  private pointerInside = false;
  private panning = false;
  private painting = false;
  private movingSelection = false;
  private lastPaintWorld: Vec2 | null = null;
  private lastCursor = "";
  private activePointer = -1;
  private disposed = false;

  constructor(
    options: AppOptions,
    canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
    log: (line: string) => void = (line) => console.log(line),
  ) {
    this.options = options;
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.log = log;

    const loaded = loadPreset(options.preset, options.seed);
    if (loaded === null) {
      this.log(`error: unknown preset: ${options.preset}`);
      this.log("falling back to meadow");
    }
    this.setup = loaded ?? loadPreset("meadow", options.seed) ?? quickStartSetup(options.seed);
    this.runTheme = themeForPreset(this.setup.presetId);
    this.activeTheme = this.runTheme;

    const created = GlRenderer.create(canvas);
    if ("error" in created) {
      this.log(`error: ${created.error}`);
      return;
    }
    this.renderer = created.renderer;
    this.renderer.resizeToDisplaySize();

    this.uiRoot.replaceChildren();
    this.homeScreen = new HomeScreen(this.uiRoot, {
      onQuickStart: () => this.quickStart(),
      onNewWorld: () => this.openBuilderFromHome(),
    });
    this.runHud = new RunHud(this.uiRoot, this.params, this.hudHooks());
    this.runHud.root.hidden = true;
    this.colonyPanel = new ColonyPanel(this.runHud.colonyPanelHost, (id) => {
      this.focusColony(id);
    });
    this.settingsDrawer = new SettingsDrawer(
      this.runHud.settingsHost,
      this.params,
      this.settingsHooks(),
    );
    this.settingsDrawer.sync(this.view);
    this.brushRing = el("div", "brush-ring");
    this.brushRing.hidden = true;
    this.uiRoot.append(this.brushRing);
    this.pauseMenu = new PauseMenu(this.uiRoot, this.pauseHooks());
    this.finishDialog = new FinishDialog(this.uiRoot, {
      onKeepWatching: () => this.keepWatching(),
      onFinish: () => this.finishCurrentRun(),
    });

    this.startScreen();
  }

  start(): void {
    if (this.renderer === null || this.disposed) return;
    this.addListeners();
    this.lastTime = performance.now();
    this.log("renderer: webgl2");
    this.log(`display scale: ${this.dpr().toFixed(2)}`);
    this.rafId = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.removeListeners();
  }

  private startScreen(): void {
    switch (this.options.screen) {
      case "home":
        this.showHome(this.attract(), themeForPreset("meadow"));
        break;
      case "builder":
        this.showBuilder(new BuilderModel(cloneSetup(this.setup)));
        break;
      case "run": {
        const started = startRun(this.session, this.setup);
        if (started.error !== null) {
          this.log(`error: ${started.error}`);
          this.showBuilder(new BuilderModel(cloneSetup(this.setup)));
          break;
        }
        const world = worldFromSetup(this.setup, this.params);
        const warmup = Math.max(0, effectiveTicks(this.options));
        for (let i = 0; i < warmup; i++) stepWorld(world);
        this.session = started.state;
        this.showRun(world, started.state, true);
        break;
      }
      default:
        this.showHome(this.attract(), themeForPreset("meadow"));
        break;
    }
  }

  private attract(): World {
    if (this.attractWorld === null) this.attractWorld = makeAttractWorld(this.params);
    return this.attractWorld;
  }

  private quickStart(): void {
    this.setup = quickStartSetup(seedFromNow(performance.now()));
    this.runTheme = themeForPreset(this.setup.presetId);
    const started = startRun(this.session, this.setup);
    if (started.error !== null) {
      this.log(`error: ${started.error}`);
      return;
    }
    this.runWorld = worldFromSetup(this.setup, this.params);
    this.session = started.state;
    this.showRun(this.runWorld, this.session, true);
  }

  private openBuilderFromHome(): void {
    this.setup = loadPreset("meadow", seedFromNow(performance.now())) ?? this.setup;
    this.runTheme = themeForPreset(this.setup.presetId);
    this.showBuilder(new BuilderModel(cloneSetup(this.setup)));
  }

  private showHome(world: World, theme: Theme): void {
    this.closeOverlays();
    this.session = { ...this.session, screen: Screen.Home, zen: false };
    this.activeWorld = world;
    this.activeTheme = theme;
    this.cache = this.makeCache(world, theme);
    this.view.showGrid = false;
    this.setScreenRoots(Screen.Home);
    this.homeScreen?.update(this.session.lastRun);
    this.requestFit();
  }

  private showBuilder(model: BuilderModel): void {
    this.closeOverlays();
    if (this.builderScreen !== null && this.builderModel !== model) {
      this.builderScreen.root.remove();
      this.builderScreen = null;
    }
    this.builderModel = model;
    if (this.builderScreen === null) {
      this.builderScreen = new BuilderScreen(this.uiRoot, model, this.builderHooks());
    }

    this.session = {
      ...this.session,
      screen: Screen.Builder,
      zen: false,
      paused: this.runWorld !== null ? true : this.session.paused,
    };
    this.previewWorld = worldFromSetup(model.setup, this.params, { spawnAnts: false });
    this.previewPresetId = model.setup.presetId;
    this.activeWorld = this.previewWorld;
    this.activeTheme = themeForPreset(model.setup.presetId);
    this.cache = this.makeCache(this.previewWorld, this.activeTheme);
    this.view.showGrid = true;
    this.setScreenRoots(Screen.Builder);
    this.builderScreen.update();
    this.requestFit();
  }

  private showRun(world: World, session: SessionState, resetZoom = false): void {
    this.closeOverlays();
    this.runWorld = world;
    this.session = session;
    this.activeWorld = world;
    this.activeTheme = this.runTheme;
    this.cache = this.makeCache(world, this.runTheme);
    this.clock.reset();
    this.stepRequests = 0;
    this.view.showGrid = this.runShowGrid;
    if (resetZoom) this.zoomApplied = false;
    this.setScreenRoots(Screen.Run);
    this.requestFit();
  }

  private makeCache(world: World, theme: Theme): WorldRenderCache | null {
    if (this.renderer === null) return null;
    if (this.cache !== null) disposeWorldRenderCache(this.renderer, this.cache);
    return createWorldRenderCache(this.renderer, world, theme);
  }

  private setScreenRoots(screen: Screen): void {
    this.homeScreen?.root.classList.toggle("screen--active", screen === Screen.Home);
    this.builderScreen?.root.classList.toggle("screen--active", screen === Screen.Builder);
    if (this.runHud !== null) this.runHud.root.hidden = screen !== Screen.Run;
    if (this.brushRing !== null) this.brushRing.hidden = true;
    this.focusPrimary(screen);
  }

  private focusPrimary(screen: Screen): void {
    let root: HTMLElement | null = null;
    if (screen === Screen.Home) root = this.homeScreen?.root ?? null;
    else if (screen === Screen.Builder) root = this.builderScreen?.root ?? null;
    else root = this.runHud?.root ?? null;
    if (root === null) return;
    const primary = root.querySelector<HTMLButtonElement>(".button--primary");
    const target =
      primary !== null && !primary.disabled
        ? primary
        : root.querySelector<HTMLButtonElement>(".button:not(:disabled)");
    target?.focus({ preventScroll: true });
  }

  private closeOverlays(): void {
    this.coloniesOpen = false;
    this.settingsOpen = false;
    this.colonyPanel?.setOpen(false);
    this.settingsDrawer?.setOpen(false);
    this.pauseMenu?.close();
    this.finishOpen = false;
    this.finishDialog?.close();
  }

  private requestFit(): void {
    if (this.viewportW > 0 && this.viewportH > 0) {
      this.applyFit();
    } else {
      this.needsFit = true;
    }
  }

  private applyFit(): void {
    const world = this.activeWorld;
    if (world === null) return;
    this.camera.fit(world.size);
    if (this.session.screen === Screen.Run && !this.zoomApplied) {
      this.zoomApplied = true;
      if (this.options.zoom !== 1) {
        this.camera.zoomAt(
          { x: this.viewportW / 2, y: this.viewportH / 2 },
          this.options.zoom,
        );
      }
    }
    this.needsFit = false;
  }

  private presetName(): string {
    return presetInfo(this.setup.presetId)?.name ?? this.setup.presetId;
  }

  private hudHooks(): RunHudHooks {
    return {
      onPause: () => {
        this.session = togglePause(this.session);
      },
      onSpeed: (value: SpeedSetting) => {
        this.session = { ...this.session, speed: value };
      },
      onReset: () => {
        this.restartCurrent();
      },
      onEdit: () => {
        this.editCurrent();
      },
      onFinish: () => {
        this.requestFinish();
      },
      onColonies: () => {
        this.coloniesOpen = !this.coloniesOpen;
        this.settingsOpen = false;
        this.colonyPanel?.setOpen(this.coloniesOpen);
        this.settingsDrawer?.setOpen(false);
      },
      onSettings: () => {
        this.settingsOpen = !this.settingsOpen;
        this.coloniesOpen = false;
        this.settingsDrawer?.setOpen(this.settingsOpen);
        this.colonyPanel?.setOpen(false);
      },
      onFit: () => {
        this.requestFit();
      },
    };
  }

  private pauseHooks(): PauseMenuHooks {
    return {
      onResume: () => {
        this.resume();
      },
      onStep: () => {
        if (this.session.paused) this.stepRequests += 1;
      },
      onRestart: () => {
        this.restartCurrent();
      },
      onEdit: () => {
        this.editCurrent();
      },
      onFinish: () => {
        this.requestFinish();
      },
    };
  }

  private settingsHooks(): SettingsHooks {
    return {
      onHeatmap: (mode) => {
        this.view.heatmap = mode;
      },
      onAnts: () => {
        this.view.showAnts = !this.view.showAnts;
      },
      onGrid: () => {
        this.view.showGrid = !this.view.showGrid;
        this.runShowGrid = this.view.showGrid;
      },
      onParam: (key, value) => {
        this.applyParam(key, value);
      },
      onResetParams: () => {
        this.resetParams();
      },
      onFit: () => {
        this.requestFit();
      },
    };
  }

  private resume(): void {
    this.finishOpen = false;
    this.finishDialog?.close();
    this.pauseMenu?.close();
    this.session = resumeRun(this.session);
  }

  private keepWatching(): void {
    this.resume();
  }

  private restartCurrent(): void {
    if (this.runWorld === null) return;
    this.closeOverlays();
    const world = worldFromSetup(this.setup, this.params);
    this.session = restartRun({ ...this.session, screen: Screen.Run });
    this.zoomApplied = true;
    this.showRun(world, this.session);
  }

  private editCurrent(): void {
    if (this.runWorld === null) return;
    this.closeOverlays();
    this.session = editRun(this.session);
    this.showBuilder(new BuilderModel(cloneSetup(this.setup)));
  }

  private requestFinish(): void {
    if (this.runWorld === null || this.finishDialog === null) return;
    this.finishOpen = true;
    this.coloniesOpen = false;
    this.settingsOpen = false;
    this.colonyPanel?.setOpen(false);
    this.settingsDrawer?.setOpen(false);
    this.pauseMenu?.close();
    this.session = { ...this.session, paused: true };
    this.finishDialog.open(summarizeRun(this.runWorld, this.setup));
  }

  private finishCurrentRun(): void {
    const finished = this.runWorld;
    if (finished === null) return;
    const summary = summarizeRun(finished, this.setup);
    this.finishOpen = false;
    this.finishDialog?.close();
    this.session = finishRun(this.session, summary);
    this.runWorld = null;
    this.showHome(finished, this.runTheme);
  }

  private focusColony(id: number): void {
    const colony = this.runWorld?.colonies.find((candidate) => candidate.id === id);
    if (colony === undefined) return;
    this.camera.centerOn(colony.nest);
  }

  private applyParam(key: ParamKey, value: number): void {
    const spec = paramSpecs().find((candidate) => candidate.key === key);
    if (spec === undefined) return;
    applySpecValue(spec, this.params, value);
    if (this.runWorld !== null) applySpecValue(spec, this.runWorld.params, value);
    this.settingsDrawer?.update(this.view);
  }

  private resetParams(): void {
    const defaults = defaultParams();
    resetLiveParams(this.params, defaults);
    if (this.runWorld !== null) resetLiveParams(this.runWorld.params, defaults);
    this.settingsDrawer?.update(this.view);
  }

  private builderHooks(): BuilderHooks {
    return {
      onBack: () => {
        if (this.runWorld !== null) {
          this.session = { ...this.session, screen: Screen.Run, paused: true, zen: false };
          this.showRun(this.runWorld, this.session);
        } else {
          this.showHome(this.attract(), themeForPreset("meadow"));
        }
      },
      onStart: () => {
        const model = this.builderModel;
        if (model === null) return;
        const started = startRun(this.session, model.setup);
        if (started.error !== null) {
          this.log(`builder: ${started.error}`);
          this.builderScreen?.update();
          return;
        }
        this.setup = cloneSetup(model.setup);
        this.runTheme = themeForPreset(this.setup.presetId);
        this.session = started.state;
        this.runWorld = worldFromSetup(this.setup, this.params);
        this.showRun(this.runWorld, this.session, true);
      },
      onChanged: () => {
        this.rebuildPreview(false);
      },
      onRollSeed: () => {
        if (this.builderModel === null) return;
        this.builderModel.setSeed(seedFromNow(performance.now()));
        this.builderScreen?.update();
        this.rebuildPreview(false);
      },
      onFit: () => {
        this.requestFit();
      },
    };
  }

  private rebuildPreview(fit: boolean): void {
    const model = this.builderModel;
    if (model === null || this.renderer === null) return;
    const presetChanged = this.previewPresetId !== model.setup.presetId;
    const world = worldFromSetup(model.setup, this.params, { spawnAnts: false });
    this.previewWorld = world;
    this.previewPresetId = model.setup.presetId;
    this.activeWorld = world;
    this.activeTheme = themeForPreset(model.setup.presetId);
    this.cache = this.makeCache(world, this.activeTheme);
    if (fit || presetChanged) this.requestFit();
  }

  private syncPreviewTerrain(): void {
    const model = this.builderModel;
    const world = this.previewWorld;
    if (model === null || world === null || this.renderer === null || this.cache === null) return;
    world.obstacles = obstacleGridFromCells(model.setup.obstacles);
    refreshTerrain(this.renderer, this.cache, world, this.activeTheme);
  }

  private addListeners(): void {
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("pagehide", this.onPageHide);
  }

  private removeListeners(): void {
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("pagehide", this.onPageHide);
  }

  private dpr(): number {
    return window.devicePixelRatio || 1;
  }

  private screenPoint(event: MouseEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * this.dpr(),
      y: (event.clientY - rect.top) * this.dpr(),
    };
  }

  private worldPoint(event: MouseEvent): Vec2 {
    return this.camera.screenToWorld(this.screenPoint(event));
  }

  private speedSteps(setting: SpeedSetting): number {
    return setting === "max" ? 1000 : setting;
  }

  private readonly frame = (now: number): void => {
    const renderer = this.renderer;
    if (this.disposed || renderer === null) return;
    this.rafId = requestAnimationFrame(this.frame);

    const frameSeconds = Math.min(Math.max((now - this.lastTime) / 1000, 0), kMaxFrameSeconds);
    this.lastTime = now;
    this.frameMs = this.frameMs * 0.9 + frameSeconds * 1000 * 0.1;

    renderer.resizeToDisplaySize();
    const size = renderer.sizePx();
    if (size.x === 0 || size.y === 0) return;
    if (size.x !== this.viewportW || size.y !== this.viewportH) {
      this.viewportW = size.x;
      this.viewportH = size.y;
      this.camera.setViewport(size);
    }
    if (this.needsFit) this.applyFit();

    const world = this.activeWorld;
    const cache = this.cache;
    if (world === null || cache === null) return;

    let alpha = 1;
    if (this.session.screen === Screen.Run && this.runWorld !== null) {
      let steps = this.clock.advance(
        frameSeconds,
        this.session.paused ? 0 : this.speedSteps(this.session.speed),
      );
      if (this.stepRequests > 0) {
        steps += this.stepRequests;
        this.stepRequests = 0;
      }
      for (let i = 0; i < steps; i++) stepWorld(this.runWorld);
      alpha = this.session.paused ? 1 : this.clock.alpha();
    }

    drawWorld(renderer, cache, world, this.camera, this.view, this.activeTheme, alpha);
    this.updateBrushRing();
    this.updateCursor();
    renderer.present();
    this.updateOverlays();

    if (
      this.session.screen === Screen.Run &&
      this.runWorld !== null &&
      this.runHud !== null
    ) {
      const state: HudState = {
        presetName: this.presetName(),
        seed: this.setup.seed,
        paused: this.session.paused,
        speed: this.session.speed,
        heatmap: this.view.heatmap,
        showAnts: this.view.showAnts,
        showGrid: this.view.showGrid,
        zen: this.session.zen,
        coloniesOpen: this.coloniesOpen,
        settingsOpen: this.settingsOpen,
      };
      this.runHud.update(this.runWorld, 1000 / Math.max(this.frameMs, 0.001), state);
    }
  };

  private updateOverlays(): void {
    const running = this.session.screen === Screen.Run && this.runWorld !== null;
    if (!running) {
      if (this.coloniesOpen || this.settingsOpen) {
        this.coloniesOpen = false;
        this.settingsOpen = false;
        this.colonyPanel?.setOpen(false);
        this.settingsDrawer?.setOpen(false);
      }
      this.pauseMenu?.close();
      if (this.finishOpen) {
        this.finishOpen = false;
        this.finishDialog?.close();
      }
      return;
    }

    if (this.session.zen) {
      this.coloniesOpen = false;
      this.settingsOpen = false;
    }
    this.colonyPanel?.setOpen(this.coloniesOpen);
    this.settingsDrawer?.setOpen(this.settingsOpen);
    if (this.coloniesOpen && this.runWorld !== null) this.colonyPanel?.update(this.runWorld);
    if (this.settingsOpen) this.settingsDrawer?.sync(this.view);

    const wantPause = this.session.paused && !this.finishOpen;
    if (wantPause && this.runWorld !== null) {
      this.pauseMenu?.setContext(
        this.presetName(),
        formatClock(this.runWorld.tick, this.runWorld.params.simHz),
      );
      if (this.pauseMenu !== null && !this.pauseMenu.isOpen()) this.pauseMenu.open();
    } else if (this.pauseMenu?.isOpen() === true) {
      this.pauseMenu.close();
    }
  }

  private updateBrushRing(): void {
    const ring = this.brushRing;
    if (ring === null) return;
    const model = this.builderModel;
    const visible =
      this.session.screen === Screen.Builder &&
      model !== null &&
      isBrushTool(model.tool) &&
      this.pointerInside &&
      this.pointerCss !== null;
    if (!visible || model === null || this.pointerCss === null) {
      ring.hidden = true;
      return;
    }
    const diameter = Math.max(6, model.brushRadius * 2 * (this.camera.scale() / this.dpr()));
    ring.hidden = false;
    ring.style.width = `${diameter}px`;
    ring.style.height = `${diameter}px`;
    ring.style.left = `${this.pointerCss.x - diameter / 2}px`;
    ring.style.top = `${this.pointerCss.y - diameter / 2}px`;
  }

  private updateCursor(): void {
    let cursor = "";
    if (this.panning && this.session.screen !== Screen.Home) {
      cursor = "grabbing";
    } else if (this.session.screen === Screen.Builder && this.builderModel !== null) {
      cursor = this.builderModel.tool === BuilderTool.Select ? "default" : "crosshair";
    }
    if (cursor === this.lastCursor) return;
    this.lastCursor = cursor;
    this.canvas.style.cursor = cursor;
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.session.screen === Screen.Home) return;
    event.preventDefault();
    this.camera.zoomAt(
      this.screenPoint(event),
      Math.pow(kZoomStep, -event.deltaY / 100),
    );
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button === 0 && this.session.screen === Screen.Builder) {
      this.pointerCss = { x: event.clientX, y: event.clientY };
      this.pointerInside = true;
      this.builderDown(event);
      return;
    }
    if (event.button !== 1 && event.button !== 2) return;
    if (this.session.screen === Screen.Home) return;
    event.preventDefault();
    this.panning = true;
    this.activePointer = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private builderDown(event: PointerEvent): void {
    const model = this.builderModel;
    if (model === null) return;
    const point = this.worldPoint(event);
    event.preventDefault();
    this.activePointer = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);

    if (model.tool === BuilderTool.Select) {
      const hit = this.selectionRadiusWorld();
      this.movingSelection = model.selectAt(point, hit) !== null;
      this.builderScreen?.update();
      return;
    }
    if (model.tool === BuilderTool.Colony || model.tool === BuilderTool.Food) {
      if (model.applyAt(point)) {
        this.builderScreen?.update();
        this.rebuildPreview(false);
      }
      return;
    }
    this.painting = true;
    this.lastPaintWorld = point;
    if (model.paintAt(point)) {
      this.builderScreen?.update();
      this.syncPreviewTerrain();
    }
  }

  private selectionRadiusWorld(): number {
    const scale = this.camera.scale() / this.dpr();
    return kSelectionRadiusPx / Math.max(scale, 0.001);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.pointerCss = { x: event.clientX, y: event.clientY };
    this.pointerInside = true;

    if (this.panning) {
      this.camera.panByScreen({
        x: event.movementX * this.dpr(),
        y: event.movementY * this.dpr(),
      });
      return;
    }
    if (this.session.screen !== Screen.Builder) return;
    const model = this.builderModel;
    if (model === null) return;

    if (this.painting && (event.buttons & 1) !== 0) {
      const point = this.worldPoint(event);
      if (this.lastPaintWorld !== null && !paintStepReached(this.lastPaintWorld, point, model.brushRadius)) {
        return;
      }
      this.lastPaintWorld = point;
      if (model.paintAt(point)) {
        this.builderScreen?.update();
        this.syncPreviewTerrain();
      }
      return;
    }
    if (this.movingSelection && (event.buttons & 1) !== 0) {
      if (model.moveSelection(this.worldPoint(event))) {
        this.builderScreen?.update();
        this.rebuildPreview(false);
      }
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointer) return;
    this.activePointer = -1;
    this.panning = false;
    this.painting = false;
    this.movingSelection = false;
    this.lastPaintWorld = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    if (this.session.screen === Screen.Builder) this.builderScreen?.update();
  };

  private readonly onPointerLeave = (): void => {
    this.pointerInside = false;
  };

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    ) {
      return;
    }
    const screen = this.session.screen;

    if (
      screen === Screen.Run &&
      (this.finishDialog?.isOpen() === true || this.pauseMenu?.isOpen() === true)
    ) {
      if (event.code === "Escape" || event.code === "KeyP") {
        event.preventDefault();
        if (this.finishDialog?.isOpen() === true) {
          this.keepWatching();
        } else {
          this.resume();
        }
      } else if (
        event.code === "Space" &&
        this.pauseMenu?.isOpen() === true &&
        this.session.paused
      ) {
        event.preventDefault();
        this.stepRequests += 1;
      }
      return;
    }

    if (screen === Screen.Builder) {
      if (this.builderKey(event)) event.preventDefault();
      return;
    }
    if (screen !== Screen.Run) return;

    switch (event.code) {
      case "KeyP":
        this.session = togglePause(this.session);
        break;
      case "Space":
        if (this.session.paused) this.stepRequests += 1;
        event.preventDefault();
        break;
      case "KeyH":
        this.session = { ...this.session, zen: !this.session.zen };
        break;
      case "Escape":
        if (this.session.zen) {
          this.session = { ...this.session, zen: false };
        } else {
          this.session = togglePause(this.session);
        }
        event.preventDefault();
        break;
      case "KeyM":
        this.view.heatmap = cycleHeatmap(this.view.heatmap);
        break;
      case "KeyA":
        this.view.showAnts = !this.view.showAnts;
        break;
      case "KeyG":
        this.view.showGrid = !this.view.showGrid;
        this.runShowGrid = this.view.showGrid;
        break;
      case "Digit1":
        this.session = { ...this.session, speed: 1 };
        break;
      case "Digit2":
        this.session = { ...this.session, speed: 2 };
        break;
      case "Digit3":
        this.session = { ...this.session, speed: 4 };
        break;
      case "Digit4":
        this.session = { ...this.session, speed: "max" };
        break;
      case "Home":
        this.requestFit();
        break;
      default:
        break;
    }
  };

  private builderKey(event: KeyboardEvent): boolean {
    const model = this.builderModel;
    if (model === null) return false;
    const digit = /^Digit([1-8])$/.exec(event.code);
    if (digit !== null) {
      model.setTool((Number(digit[1]) - 1) as BuilderTool);
      this.builderScreen?.update();
      return true;
    }
    if (event.code === "Delete" || event.code === "Backspace") {
      if (model.deleteSelection()) {
        this.builderScreen?.update();
        this.rebuildPreview(false);
      }
      return true;
    }
    if (event.code === "Escape") {
      if (model.pendingPreset() !== null) {
        model.cancelPreset();
      } else {
        model.clearSelection();
      }
      this.builderScreen?.update();
      return true;
    }
    return false;
  }

  private readonly onPageHide = (): void => {
    this.dispose();
  };
}
