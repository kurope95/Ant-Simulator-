import { HeatmapMode } from "../render/view_settings.js";
import type { SimParams } from "../sim/params.js";
import { colonyHex, colonyName } from "../sim/palette.js";
import type { World } from "../sim/world.js";
import { button, el, icon } from "./dom.js";
import {
  formatClock,
  formatInteger,
  speedLabel,
  type SpeedSetting,
  colonyRows,
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
  // Aggression of all colonies, % (fight branch).
  aggression?: number;
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
  // The right rail's aggression dial (display value, %); absent hides it.
  onAggression?(percent: number): void;
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

function makeColonyLegendItem(name: string, hex: number): HTMLElement {
  const item = el("span", "legend");
  const css = `#${hex.toString(16).padStart(6, "0")}`;
  const dot = el("span", "legend__dot");
  dot.style.background = css;
  dot.style.boxShadow = `0 0 10px ${css}8c`;
  item.append(dot, el("span", undefined, name));
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
  private readonly chipSpeed: HTMLSpanElement;
  private readonly speedChip: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly pauseLabel: HTMLSpanElement;
  private readonly speedButtons: SpeedOption[] = [];
  private readonly coloniesButton: HTMLButtonElement;
  private readonly settingsButton: HTMLButtonElement;
  private readonly breachButton: HTMLButtonElement;
  private readonly aggressionInput: HTMLInputElement | null = null;
  private readonly aggressionValue: HTMLSpanElement | null = null;
  private readonly legend: HTMLElement;
  private readonly trailLegend: HTMLElement;
  private readonly colonyLegend: HTMLElement;
  private colonyLegendKey = "";
  // One line per colony with its ant count, so the colonies' strength reads at a glance.
  private readonly colonyCounts: HTMLElement;
  private colonyCountKey = "";
  private colonyCountRows: { count: HTMLSpanElement; detail: HTMLSpanElement }[] = [];

  constructor(root: HTMLElement, params: SimParams, hooks: RunHudHooks) {
    this.simHz = params.simHz;

    const hud = el("div", "hud");
    hud.dataset.paused = "false";
    hud.append(el("div", "screen__vignette"));

    // Two slim rails down the sides keep the full height for the map; each
    // slides open over the map while the pointer is on it (rail--open in CSS).
    const bar = el("nav", "hud__rail hud__rail--left glass");
    bar.setAttribute("aria-label", "Run status");
    const brand = el("div", "hud__brand rail__wide");
    this.presetName = el("span", "hud__preset");
    this.seedLabel = el("span", "hud__seed");
    const meta = el("div", "hud__meta");
    meta.append(this.presetName, this.seedLabel);
    brand.append(el("span", "wordmark", "Ant Simulator"), meta);

    const chips = el("div", "hud__chips");
    const ants = makeChip("Ants");
    const delivered = makeChip("Delivered");
    const clock = makeChip("Elapsed");
    // Shown only when the world is too big to run at the chosen speed.
    const actual = makeChip("Actual speed");
    actual.chip.classList.add("chip--slow");
    actual.chip.title = "The colony is too big to run at the chosen speed on this computer";
    this.chipSpeed = actual.value;
    this.speedChip = actual.chip;
    const fps = makeChip("FPS");
    fps.chip.classList.add("chip--fps");
    this.chipAnts = ants.value;
    this.chipDelivered = delivered.value;
    this.chipClock = clock.value;
    this.chipFps = fps.value;
    chips.append(ants.chip, delivered.chip, clock.chip, fps.chip, actual.chip);

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
    // Each panel's button sits on the side where the panel opens.
    const tools = el("div", "hud__tools");
    tools.append(this.coloniesButton);
    const rightTools = el("div", "hud__tools hud__tools--end");
    rightTools.append(this.settingsButton);

    this.pauseLabel = el("span", "rail__wide", "Pause");
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
    this.trailLegend = el("span", "hud__legend-group");
    this.trailLegend.append(makeLegendItem("home", "Home"), makeLegendItem("food", "Food"));
    this.colonyLegend = el("span", "hud__legend-group");
    this.legend.append(this.trailLegend, this.colonyLegend);

    this.colonyCounts = el("div", "hud__counts");
    this.colonyCounts.setAttribute("aria-label", "Ants per colony");
    bar.append(brand, chips, this.colonyCounts, tools, this.legend);
    const dock = el("nav", "hud__rail hud__rail--right glass");
    dock.setAttribute("aria-label", "Run controls");
    dock.append(this.pauseButton, speeds, makeDivider());
    if (hooks.onAggression !== undefined) {
      // Aggression of all colonies, live: a vertical dial on the rail.
      const onAggression = hooks.onAggression;
      const box = el("div", "hud__dial");
      box.title = "Aggression of all colonies: 100% as tuned, 0% nobody starts fights, 300% three times as bold";
      const input = el("input", "hud__dial-input");
      input.type = "range";
      input.min = "0";
      input.max = "300";
      input.step = "10";
      input.setAttribute("aria-label", "Aggression of all colonies");
      const value = el("span", "hud__dial-value");
      input.addEventListener("input", () => {
        if (!Number.isFinite(input.valueAsNumber)) return;
        onAggression(input.valueAsNumber);
        setText(value, `${Math.round(input.valueAsNumber)}%`);
      });
      box.append(icon("breach"), input, value);
      dock.append(box, makeDivider());
      this.aggressionInput = input;
      this.aggressionValue = value;
    }
    dock.append(reset, edit, this.breachButton, finish, rightTools);

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

  update(world: World, fps: number, state: HudState, achievedSpeed = 0): void {
    setText(this.presetName, state.presetName);
    setText(this.seedLabel, `seed ${state.seed}`);

    setText(this.chipAnts, formatInteger(world.ants.size()));
    let delivered = 0;
    for (const colony of world.colonies) delivered += colony.deliveredTotal;
    setText(this.chipDelivered, formatInteger(delivered));
    setText(this.chipClock, formatClock(world.tick, this.simHz));
    setText(this.chipFps, formatInteger(fps));
    this.setColonyCounts(world);
    const chosen = state.speed === "max" ? Infinity : state.speed;
    const slow = !state.paused && achievedSpeed > 0 && achievedSpeed < 0.9 * chosen && state.speed !== "max";
    this.speedChip.hidden = !slow;
    if (slow) setText(this.chipSpeed, `${achievedSpeed < 1 ? achievedSpeed.toFixed(2) : achievedSpeed.toFixed(1)}×`);

    this.root.dataset.paused = String(state.paused);
    setText(this.pauseLabel, state.paused ? "Play" : "Pause");
    this.pauseButton.setAttribute("aria-pressed", String(state.paused));

    for (const option of this.speedButtons) {
      option.node.setAttribute("aria-pressed", String(option.value === state.speed));
    }

    if (this.aggressionInput !== null && this.aggressionValue !== null && state.aggression !== undefined) {
      if (document.activeElement !== this.aggressionInput) this.aggressionInput.value = String(state.aggression);
      setText(this.aggressionValue, `${Math.round(Number(this.aggressionInput.value))}%`);
    }
    this.coloniesButton.setAttribute("aria-pressed", String(state.coloniesOpen));
    this.settingsButton.setAttribute("aria-pressed", String(state.settingsOpen));
    this.breachButton.hidden = !state.breachAvailable;
    this.legend.hidden = state.heatmap === HeatmapMode.Off;
    this.trailLegend.hidden = state.heatmap !== HeatmapMode.DualChannel;
    this.colonyLegend.hidden = state.heatmap !== HeatmapMode.ColonyColor;
    if (state.heatmap === HeatmapMode.ColonyColor) this.setColonyLegend(world);

    this.setZen(state.zen);
  }

  // Ant count per colony; the open rail adds the name and how many are home.
  private setColonyCounts(world: World): void {
    const rows = colonyRows(world);
    const key = rows.map((row) => row.colorIndex).join(",");
    if (key !== this.colonyCountKey) {
      this.colonyCountKey = key;
      this.colonyCountRows = [];
      const lines = rows.map((row) => {
        const line = el("div", "hud__count");
        const css = `#${row.hex.toString(16).padStart(6, "0")}`;
        const dot = el("span", "legend__dot");
        dot.style.background = css;
        dot.style.boxShadow = `0 0 10px ${css}8c`;
        const count = el("span", "hud__count-value");
        const detail = el("span", "hud__count-detail rail__wide");
        line.title = row.name;
        line.append(dot, count, detail);
        this.colonyCountRows.push({ count, detail });
        return line;
      });
      this.colonyCounts.replaceChildren(...lines);
    }
    rows.forEach((row, i) => {
      const parts = this.colonyCountRows[i];
      setText(parts.count, row.extinct ? "–" : formatInteger(row.population));
      setText(parts.detail, `${row.name} · ${formatInteger(row.resting)} home`);
    });
  }

  // Lists every colony, extinct ones too, so a faded trail still has a name.
  private setColonyLegend(world: World): void {
    const key = world.colonies.map((colony) => colony.color).join(",");
    if (key === this.colonyLegendKey) return;
    this.colonyLegendKey = key;
    const items = world.colonies.map((colony) =>
      makeColonyLegendItem(colonyName(colony.color), colonyHex(colony.color)),
    );
    const note = el("span", "hud__legend-note", "bright = way to food · dim = way home");
    this.colonyLegend.replaceChildren(...items, note);
  }

  setZen(on: boolean): void {
    this.root.classList.toggle("hud--zen", on);
  }
}
