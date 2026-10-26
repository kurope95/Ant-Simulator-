import { HeatmapMode } from "../render/view_settings.js";
import type { SimParams } from "../sim/params.js";
import type { World } from "../sim/world.js";
import { button, el, icon } from "./dom.js";
import {
  formatClock,
  formatInteger,
  speedLabel,
  type SpeedSetting,
} from "./view_models.js";

export interface HudState {
  presetName: string;
  seed: number;
  paused: boolean;
  speed: SpeedSetting;
  heatmap: HeatmapMode;
  showAnts: boolean;
  showGrid: boolean;
  zen: boolean;
  coloniesOpen: boolean;
  settingsOpen: boolean;
  breachAvailable: boolean;
}

export interface RunHudHooks {
  onPause(): void;
  onSpeed(speed: SpeedSetting): void;
  onReset(): void;
  onEdit(): void;
  onFinish(): void;
  onColonies(): void;
  onSettings(): void;
  onFit(): void;
  onBreach(): void;
}

interface SpeedOption {
  value: SpeedSetting;
  node: HTMLButtonElement;
}

interface ChipParts {
  chip: HTMLElement;
  value: HTMLSpanElement;
}

const kSpeedOptions: readonly SpeedSetting[] = [1, 2, 4, "max"];

function makeChip(label: string): ChipParts {
  const chip = el("div", "chip");
  const value = el("span", "chip__value");
  chip.append(el("span", "chip__label", label), value);
  return { chip, value };
}

function makeLegendItem(kind: "home" | "food", label: string): HTMLElement {
  const item = el("span", "legend");
  item.append(el("span", `legend__dot legend__dot--${kind}`), el("span", undefined, label));
  return item;
}

function makeDivider(): HTMLElement {
  return el("span", "hud__divider");
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export class RunHud {
  readonly root: HTMLElement;
  readonly colonyPanelHost: HTMLElement;
  readonly settingsHost: HTMLElement;
  // Shares the right-hand slot with the settings drawer; the controller shows one at a time.
  readonly inspectorHost: HTMLElement;

  private readonly simHz: number;
  private readonly presetName: HTMLSpanElement;
  private readonly seedLabel: HTMLSpanElement;
  private readonly chipAnts: HTMLSpanElement;
  private readonly chipDelivered: HTMLSpanElement;
  private readonly chipClock: HTMLSpanElement;
  private readonly chipFps: HTMLSpanElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly pauseLabel: HTMLSpanElement;
  private readonly speedButtons: SpeedOption[] = [];
  private readonly coloniesButton: HTMLButtonElement;
  private readonly settingsButton: HTMLButtonElement;
  private readonly breachButton: HTMLButtonElement;
  private readonly legend: HTMLElement;

  constructor(root: HTMLElement, params: SimParams, hooks: RunHudHooks) {
    this.simHz = params.simHz;

    const hud = el("div", "hud");
    hud.dataset.paused = "false";
    hud.append(el("div", "screen__vignette"));

    const bar = el("header", "hud__bar glass");
    const brand = el("div", "hud__brand");
    this.presetName = el("span", "hud__preset");
    this.seedLabel = el("span", "hud__seed");
    const meta = el("div", "hud__meta");
    meta.append(this.presetName, this.seedLabel);
    brand.append(el("span", "wordmark", "Ant Simulator"), meta);

    const chips = el("div", "hud__chips");
    const ants = makeChip("Ants");
    const delivered = makeChip("Delivered");
    const clock = makeChip("Elapsed");
    const fps = makeChip("FPS");
    fps.chip.classList.add("chip--fps");
    this.chipAnts = ants.value;
    this.chipDelivered = delivered.value;
    this.chipClock = clock.value;
    this.chipFps = fps.value;
    chips.append(ants.chip, delivered.chip, clock.chip, fps.chip);

    this.coloniesButton = button({
      label: "",
      icon: "colonies",
      variant: "icon",
      title: "Colonies",
      onClick: () => hooks.onColonies(),
    });
    this.coloniesButton.setAttribute("aria-pressed", "false");
    this.settingsButton = button({
      label: "",
      icon: "settings",
      variant: "icon",
      title: "Settings",
      onClick: () => hooks.onSettings(),
    });
    this.settingsButton.setAttribute("aria-pressed", "false");
    const tools = el("div", "hud__tools");
    tools.append(this.coloniesButton, this.settingsButton);
    bar.append(brand, chips, tools);

    this.pauseLabel = el("span", undefined, "Pause");
    this.pauseButton = button({
      label: "",
      icon: "pause",
      variant: "primary",
      title: "Pause or resume (P)",
      onClick: () => hooks.onPause(),
    });
    const pauseIcon = this.pauseButton.querySelector(".icon");
    if (pauseIcon !== null) pauseIcon.classList.add("icon-pause");
    const playIcon = icon("play");
    playIcon.classList.add("icon-play");
    this.pauseButton.prepend(playIcon);
    this.pauseButton.append(this.pauseLabel);
    this.pauseButton.setAttribute("aria-pressed", "false");

    const speeds = el("div", "segmented");
    speeds.setAttribute("role", "group");
    speeds.setAttribute("aria-label", "Simulation speed");
    for (const value of kSpeedOptions) {
      const node = button({
        label: speedLabel(value),
        variant: "ghost",
        onClick: () => hooks.onSpeed(value),
      });
      node.dataset.speed = String(value);
      node.setAttribute("aria-pressed", "false");
      this.speedButtons.push({ value, node });
      speeds.append(node);
    }

    const reset = button({
      label: "Reset",
      icon: "reset",
      title: "Restart this run from the same setup",
      onClick: () => hooks.onReset(),
    });
    const edit = button({
      label: "Edit",
      icon: "edit",
      title: "Edit this world",
      onClick: () => hooks.onEdit(),
    });
    const finish = button({
      label: "Finish",
      icon: "finish",
      title: "Finish and return home",
      onClick: () => hooks.onFinish(),
    });
    this.breachButton = button({
      label: "Breach",
      icon: "breach",
      title: "Open the breach shortcut",
      onClick: () => hooks.onBreach(),
    });
    this.breachButton.hidden = true;

    this.legend = el("div", "hud__legend");
    this.legend.append(makeLegendItem("home", "Home"), makeLegendItem("food", "Food"));

    const dock = el("div", "hud__dock glass");
    dock.append(
      this.legend,
      makeDivider(),
      this.pauseButton,
      speeds,
      makeDivider(),
      reset,
      edit,
      this.breachButton,
      finish,
    );

    this.colonyPanelHost = el("aside", "hud__panel hud__panel--left");
    this.colonyPanelHost.setAttribute("aria-label", "Colonies");
    this.colonyPanelHost.hidden = true;
    this.settingsHost = el("aside", "hud__panel hud__panel--right");
    this.settingsHost.setAttribute("aria-label", "Settings");
    this.settingsHost.hidden = true;

    this.inspectorHost = el("aside", "hud__panel hud__panel--right");
    this.inspectorHost.setAttribute("aria-label", "Ant inspector");
    this.inspectorHost.hidden = true;

    hud.append(bar, this.colonyPanelHost, this.settingsHost, this.inspectorHost, dock);
    root.append(hud);
    this.root = hud;
  }

  update(world: World, fps: number, state: HudState): void {
    setText(this.presetName, state.presetName);
    setText(this.seedLabel, `seed ${state.seed}`);

    setText(this.chipAnts, formatInteger(world.ants.size()));
    let delivered = 0;
    for (const colony of world.colonies) delivered += colony.deliveredTotal;
    setText(this.chipDelivered, formatInteger(delivered));
    setText(this.chipClock, formatClock(world.tick, this.simHz));
    setText(this.chipFps, formatInteger(fps));

    this.root.dataset.paused = String(state.paused);
    setText(this.pauseLabel, state.paused ? "Play" : "Pause");
    this.pauseButton.setAttribute("aria-pressed", String(state.paused));

    for (const option of this.speedButtons) {
      option.node.setAttribute("aria-pressed", String(option.value === state.speed));
    }

    this.coloniesButton.setAttribute("aria-pressed", String(state.coloniesOpen));
    this.settingsButton.setAttribute("aria-pressed", String(state.settingsOpen));
    this.breachButton.hidden = !state.breachAvailable;
    this.legend.hidden = state.heatmap !== HeatmapMode.DualChannel;

    this.setZen(state.zen);
  }

  setZen(on: boolean): void {
    this.root.classList.toggle("hud--zen", on);
  }
}
