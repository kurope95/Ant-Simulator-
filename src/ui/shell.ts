import type { SimParams } from "../sim/params.js";
import { HeatmapMode } from "../render/view_settings.js";
import {
  applySpecValue,
  formatSpecValue,
  paramSpecs,
  specValue,
  type ParamGroup,
  type ParamKey,
  type ParamSpec,
} from "./param_specs.js";

export type SpeedSetting = 1 | 2 | 4 | "max";

export interface ShellHooks {
  onPause(): void;
  onStep(): void;
  onSpeed(speed: SpeedSetting): void;
  onHeatmap(): void;
  onAnts(): void;
  onGrid(): void;
  onResetParams(): void;
  onResetCamera(): void;
  onParam(key: ParamKey, value: number): void;
}

export interface ShellFrame {
  fps: number;
  frameMs: number;
  tick: number;
  ants: number;
  delivered: number;
  paused: boolean;
  speed: SpeedSetting;
  heatmap: HeatmapMode;
  showAnts: boolean;
  showGrid: boolean;
  stepsThisFrame: number;
}

interface SliderBinding {
  spec: ParamSpec;
  input: HTMLInputElement;
  readout: HTMLSpanElement;
}

const kGroupTitles: Record<ParamGroup, string> = {
  movement: "Movement",
  trails: "Trails",
  colony: "Colony",
};

const kSpeedOptions: readonly { value: SpeedSetting; label: string }[] = [
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
  { value: 4, label: "4×" },
  { value: "max", label: "Max" },
];

const kShortcuts: readonly { key: string; action: string }[] = [
  { key: "P", action: "Pause / resume" },
  { key: "Space", action: "Single step" },
  { key: "H", action: "Hide interface" },
  { key: "M", action: "Cycle trails" },
  { key: "A", action: "Show ants" },
  { key: "G", action: "Show grid" },
  { key: "S", action: "Max speed" },
  { key: "Home", action: "Fit world" },
  { key: "Drag", action: "Pan camera" },
  { key: "Wheel", action: "Zoom camera" },
];

export class AppShell {
  private readonly hooks: ShellHooks;
  private params: SimParams;
  private readonly shell: HTMLDivElement;
  private readonly drawer: HTMLElement;
  private readonly drawerButton: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly stepButton: HTMLButtonElement;
  private readonly heatmapButton: HTMLButtonElement;
  private readonly antsSwitch: HTMLButtonElement;
  private readonly gridSwitch: HTMLButtonElement;
  private readonly speedButtons: { value: SpeedSetting; button: HTMLButtonElement }[] = [];
  private readonly sliders: SliderBinding[] = [];
  private readonly chipTick: HTMLSpanElement;
  private readonly chipAnts: HTMLSpanElement;
  private readonly chipDelivered: HTMLSpanElement;
  private readonly chipFps: HTMLSpanElement;

  constructor(root: HTMLElement, params: SimParams, hooks: ShellHooks) {
    this.params = params;
    this.hooks = hooks;

    this.shell = element("div", "shell");
    this.shell.dataset.visible = "true";

    const bar = element("header", "bar");
    const brand = element("div", "brand");
    const brandName = element("span", "brand-name");
    brandName.textContent = "Ant Colony";
    brand.append(element("span", "pulse"), brandName);

    const chips = element("div", "chips");
    const tickChip = makeChip("Tick", "tick");
    const antsChip = makeChip("Ants", "ants");
    const deliveredChip = makeChip("Delivered", "delivered");
    const fpsChip = makeChip("FPS", "fps");
    this.chipTick = tickChip.value;
    this.chipAnts = antsChip.value;
    this.chipDelivered = deliveredChip.value;
    this.chipFps = fpsChip.value;
    chips.append(tickChip.chip, antsChip.chip, deliveredChip.chip, fpsChip.chip);

    const actions = element("div", "bar-actions");
    this.pauseButton = makeButton("btn", "Pause");
    this.pauseButton.dataset.action = "pause";
    this.pauseButton.setAttribute("aria-pressed", "false");
    this.pauseButton.addEventListener("click", () => this.hooks.onPause());

    this.stepButton = makeButton("btn", "Step");
    this.stepButton.dataset.action = "step";
    this.stepButton.disabled = true;
    this.stepButton.addEventListener("click", () => this.hooks.onStep());

    const segmented = element("div", "segmented");
    for (const option of kSpeedOptions) {
      const button = makeButton("", option.label);
      button.dataset.speed = String(option.value);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => this.hooks.onSpeed(option.value));
      this.speedButtons.push({ value: option.value, button });
      segmented.append(button);
    }

    this.heatmapButton = makeButton("btn", "Trails");
    this.heatmapButton.dataset.action = "heatmap";
    this.heatmapButton.setAttribute("aria-pressed", "true");
    this.heatmapButton.addEventListener("click", () => this.hooks.onHeatmap());

    this.drawerButton = makeButton("btn", "Menu");
    this.drawerButton.dataset.action = "drawer";
    this.drawerButton.setAttribute("aria-expanded", "true");

    actions.append(
      this.pauseButton,
      this.stepButton,
      segmented,
      this.heatmapButton,
      this.drawerButton,
    );
    bar.append(brand, chips, actions);

    this.drawer = element("aside", "drawer");
    this.drawer.dataset.open = "true";

    for (const group of ["movement", "trails", "colony"] as const) {
      const section = this.makeSection(kGroupTitles[group], true, group);
      for (const spec of paramSpecs()) {
        if (spec.group === group) this.addSlider(section.body, spec);
      }
      this.drawer.append(section.section);
    }

    const overlays = this.makeSection("Overlays", true);
    const antsRow = element("div", "row");
    const antsLabel = element("span", "row-label");
    antsLabel.textContent = "Ants";
    const ants = makeSwitch("ants");
    this.antsSwitch = ants.button;
    this.antsSwitch.setAttribute("aria-checked", "true");
    this.antsSwitch.addEventListener("click", () => this.hooks.onAnts());
    antsRow.append(antsLabel, this.antsSwitch);

    const gridRow = element("div", "row");
    const gridLabel = element("span", "row-label");
    gridLabel.textContent = "Grid";
    const grid = makeSwitch("grid");
    this.gridSwitch = grid.button;
    this.gridSwitch.setAttribute("aria-checked", "true");
    this.gridSwitch.addEventListener("click", () => this.hooks.onGrid());
    gridRow.append(gridLabel, this.gridSwitch);

    const fitButton = makeButton("btn btn-wide", "Fit world");
    fitButton.dataset.action = "camera";
    fitButton.addEventListener("click", () => this.hooks.onResetCamera());

    overlays.body.append(antsRow, gridRow, fitButton);
    this.drawer.append(overlays.section);

    const shortcuts = this.makeSection("Shortcuts", false);
    const keys = element("div", "keys");
    for (const shortcut of kShortcuts) {
      const key = element("span", "key");
      key.textContent = shortcut.key;
      const action = element("span");
      action.textContent = shortcut.action;
      keys.append(key, action);
    }
    shortcuts.body.append(keys);
    this.drawer.append(shortcuts.section);

    const resetParams = makeButton("btn btn-wide btn-reset", "Reset parameters");
    resetParams.dataset.action = "reset-params";
    resetParams.addEventListener("click", () => {
      this.hooks.onResetParams();
      this.setParams(this.params);
    });
    this.drawer.append(resetParams);

    this.drawerButton.addEventListener("click", () => {
      const open = this.drawer.dataset.open !== "true";
      this.drawer.dataset.open = String(open);
      this.drawerButton.setAttribute("aria-expanded", String(open));
    });

    this.shell.append(bar, this.drawer);
    root.append(this.shell);
  }

  update(frame: ShellFrame): void {
    setText(this.chipTick, String(Math.round(frame.tick)));
    setText(this.chipAnts, String(Math.round(frame.ants)));
    setText(this.chipDelivered, String(Math.round(frame.delivered)));
    setText(this.chipFps, String(Math.round(frame.fps)));
    this.chipFps.title = `${frame.frameMs.toFixed(1)} ms`;
    this.chipTick.title = `${frame.stepsThisFrame} steps/frame`;

    setText(this.pauseButton, frame.paused ? "Resume" : "Pause");
    this.pauseButton.setAttribute("aria-pressed", String(frame.paused));
    this.stepButton.disabled = !frame.paused;

    for (const { value, button } of this.speedButtons) {
      button.setAttribute("aria-pressed", String(frame.speed === value));
    }

    setText(this.heatmapButton, heatmapLabel(frame.heatmap));
    this.heatmapButton.setAttribute("aria-pressed", String(frame.heatmap !== HeatmapMode.Off));
    this.antsSwitch.setAttribute("aria-checked", String(frame.showAnts));
    this.gridSwitch.setAttribute("aria-checked", String(frame.showGrid));
  }

  setParams(params: SimParams): void {
    this.params = params;
    for (const binding of this.sliders) this.refreshSlider(binding, true);
  }

  setVisible(visible: boolean): void {
    this.shell.dataset.visible = visible ? "true" : "false";
  }

  private makeSection(
    title: string,
    open: boolean,
    group?: ParamGroup,
  ): { section: HTMLElement; body: HTMLElement } {
    const section = element("section", "section");
    if (group !== undefined) section.dataset.group = group;
    section.dataset.open = String(open);

    const head = makeButton("section-head", "");
    head.setAttribute("aria-expanded", String(open));
    const label = element("span");
    label.textContent = title;
    const chevron = element("span", "chevron");
    head.append(label, chevron);

    const outer = element("div", "section-body");
    const inner = element("div", "section-inner");
    outer.append(inner);
    section.append(head, outer);

    head.addEventListener("click", () => {
      const next = section.dataset.open !== "true";
      section.dataset.open = String(next);
      head.setAttribute("aria-expanded", String(next));
    });

    return { section, body: inner };
  }

  private addSlider(container: HTMLElement, spec: ParamSpec): void {
    const row = element("label", "slider-row");
    const head = element("div", "slider-head");
    const label = element("span", "slider-label");
    label.textContent = spec.label;
    const readout = element("span", "slider-value");
    readout.dataset.value = spec.key;
    head.append(label, readout);

    const input = element("input", "slider");
    input.type = "range";
    input.dataset.param = spec.key;
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    row.append(head, input);
    container.append(row);

    const binding: SliderBinding = { spec, input, readout };
    this.sliders.push(binding);
    input.addEventListener("input", () => {
      const stored = applySpecValue(spec, this.params, input.valueAsNumber);
      this.refreshSlider(binding, false);
      this.hooks.onParam(spec.key, stored);
    });
    this.refreshSlider(binding, true);
  }

  private refreshSlider(binding: SliderBinding, syncValue: boolean): void {
    const display = specValue(binding.spec, this.params);
    if (syncValue && document.activeElement !== binding.input) {
      binding.input.value = String(display);
    }
    const span = binding.spec.max - binding.spec.min;
    const fill = Math.min(100, Math.max(0, ((display - binding.spec.min) / span) * 100));
    binding.input.style.setProperty("--fill", `${fill}%`);
    setText(binding.readout, formatSpecValue(binding.spec, display));
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined && className.length > 0) node.className = className;
  return node;
}

function makeButton(className: string, text: string): HTMLButtonElement {
  const button = element("button", className);
  button.type = "button";
  button.textContent = text;
  return button;
}

function makeChip(labelText: string, stat: string): { chip: HTMLDivElement; value: HTMLSpanElement } {
  const chip = element("div", "chip");
  const label = element("span", "chip-label");
  label.textContent = labelText;
  const value = element("span", "chip-value");
  value.dataset.stat = stat;
  chip.append(label, value);
  return { chip, value };
}

function makeSwitch(name: string): { button: HTMLButtonElement; thumb: HTMLSpanElement } {
  const button = makeButton("switch", "");
  button.dataset.switch = name;
  button.setAttribute("role", "switch");
  button.setAttribute("aria-checked", "false");
  const thumb = element("span", "thumb");
  button.append(thumb);
  return { button, thumb };
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

function heatmapLabel(mode: HeatmapMode): string {
  if (mode === HeatmapMode.DualChannel) return "Trails";
  if (mode === HeatmapMode.ColonyColor) return "Colony";
  return "Off";
}
