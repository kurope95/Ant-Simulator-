import { HeatmapMode, type ViewSettings } from "../render/view_settings.js";
import type { SimParams } from "../sim/params.js";
import { el } from "./dom.js";
import {
  formatSpecValue,
  paramSpecs,
  specValue,
  type ParamGroup,
  type ParamKey,
  type ParamSpec,
} from "./param_specs.js";
import { trailModeLabel } from "./view_models.js";

export interface SettingsHooks {
  onHeatmap(mode: HeatmapMode): void;
  onAnts(): void;
  onGrid(): void;
  onParam(key: ParamKey, value: number): void;
  onResetParams(): void;
  onHoming(): void;
  onAntCollisions(): void;
  onFit(): void;
}

interface ControlParts {
  spec: ParamSpec;
  input: HTMLInputElement;
  value: HTMLSpanElement;
}

interface GroupParts {
  key: ParamGroup;
  title: string;
}

const kGroups: readonly GroupParts[] = [
  { key: "movement", title: "Movement" },
  { key: "trails", title: "Trails" },
  { key: "colony", title: "Colony" },
];

const kTrailModes: readonly HeatmapMode[] = [
  HeatmapMode.Off,
  HeatmapMode.DualChannel,
  HeatmapMode.ColonyColor,
];

const kShortcuts: readonly [string, string][] = [
  ["P", "Pause"],
  ["Space", "Step"],
  ["1–4", "Speed"],
  ["M", "Trails"],
  ["A", "Ants"],
  ["G", "Grid"],
  ["H", "Zen"],
  ["Home", "Fit"],
];

let fieldId = 0;

export class SettingsDrawer {
  readonly root: HTMLElement;

  private readonly params: SimParams;
  private readonly hooks: SettingsHooks;
  private readonly controls: ControlParts[] = [];
  private readonly antsSwitch: HTMLButtonElement;
  private readonly gridSwitch: HTMLButtonElement;
  private readonly homingSwitch: HTMLButtonElement;
  private readonly antCollisionsSwitch: HTMLButtonElement;
  private readonly trailButtons = new Map<HeatmapMode, HTMLButtonElement>();
  private lastView: ViewSettings | null = null;

  constructor(root: HTMLElement, params: SimParams, hooks: SettingsHooks) {
    this.root = root;
    this.params = params;
    this.hooks = hooks;

    const card = el("div", "panel-card settings-drawer");
    const head = el("header", "panel-card__head");
    head.append(
      el("h2", "panel-card__title", "Settings"),
      el("span", "panel-card__meta", "live"),
    );

    const view = el("section", "drawer__section");
    view.append(el("h3", "drawer__title", "View"));
    this.antsSwitch = this.makeSwitch("Ants", "Toggle rendered ants (A)", () => hooks.onAnts());
    this.gridSwitch = this.makeSwitch("Grid", "Toggle the world grid (G)", () => hooks.onGrid());
    const switches = el("div", "drawer__switches");
    switches.append(this.antsSwitch, this.gridSwitch);

    const trails = el("div", "drawer__field");
    const trailHead = el("div", "drawer__field-head");
    trailHead.append(
      el("span", "drawer__label", "Trail overlay"),
      el("span", "drawer__value", "M"),
    );
    const trailRow = el("div", "segmented drawer__trails");
    trailRow.setAttribute("role", "group");
    trailRow.setAttribute("aria-label", "Trail overlay");
    for (const mode of kTrailModes) {
      const node = el("button", "segmented__option", trailModeLabel(mode));
      node.type = "button";
      node.setAttribute("aria-pressed", "false");
      node.addEventListener("click", () => {
        hooks.onHeatmap(mode);
        this.setTrailMode(mode);
      });
      this.trailButtons.set(mode, node);
      trailRow.append(node);
    }
    trails.append(trailHead, trailRow);
    view.append(switches, trails);

    const rules = el("section", "drawer__section");
    rules.append(el("h3", "drawer__title", "Rules"));
    this.homingSwitch = this.makeSwitch(
      "Homing memory",
      "Ants steer home from their own path estimate when no trail is in range",
      () => hooks.onHoming(),
    );
    this.antCollisionsSwitch = this.makeSwitch(
      "Ant collisions",
      "Ants push apart and step aside before bumping; off restores the ghost ants",
      () => hooks.onAntCollisions(),
    );
    const ruleSwitches = el("div", "drawer__switches");
    ruleSwitches.append(this.homingSwitch, this.antCollisionsSwitch);
    rules.append(ruleSwitches);

    const groups = new Map<ParamGroup, { section: HTMLElement; grid: HTMLElement }>();
    for (const group of kGroups) {
      const section = el("section", "drawer__section");
      section.append(el("h3", "drawer__title", group.title));
      const grid = el("div", "drawer__grid");
      section.append(grid);
      groups.set(group.key, { section, grid });
    }
    for (const spec of paramSpecs()) {
      const group = groups.get(spec.group);
      if (group === undefined) continue;
      group.grid.append(this.makeRange(spec));
    }

    const actions = el("div", "drawer__actions");
    const fit = el("button", "button button--secondary", "Fit world");
    fit.type = "button";
    fit.addEventListener("click", () => hooks.onFit());
    const reset = el("button", "button button--ghost", "Reset parameters");
    reset.type = "button";
    reset.addEventListener("click", () => {
      hooks.onResetParams();
      this.update();
    });
    actions.append(fit, reset);

    const shortcuts = el("section", "drawer__section drawer__section--shortcuts");
    shortcuts.append(el("h3", "drawer__title", "Shortcuts"));
    const list = el("dl", "shortcuts");
    for (const [key, label] of kShortcuts) {
      const item = el("div", "shortcuts__item");
      item.append(el("dt", "shortcuts__key", key), el("dd", "shortcuts__label", label));
      list.append(item);
    }
    shortcuts.append(list);

    card.append(
      head,
      view,
      rules,
      ...[...groups.values()].map((group) => group.section),
      actions,
      shortcuts,
    );
    root.append(card);
    this.setOpen(false);
  }

  update(view?: ViewSettings): void {
    if (view !== undefined) this.lastView = view;
    for (const control of this.controls) {
      if (document.activeElement !== control.input) {
        control.input.value = String(specValue(control.spec, this.params));
      }
      const display = Number(control.input.value);
      control.value.textContent = formatSpecValue(control.spec, Number.isFinite(display) ? display : 0);
      control.input.style.setProperty("--fill", this.fillPercent(control));
    }
    this.homingSwitch.setAttribute("aria-checked", String(this.params.homingEnabled));
    this.antCollisionsSwitch.setAttribute("aria-checked", String(this.params.antCollisions));
    if (this.lastView !== null) {
      this.antsSwitch.setAttribute("aria-checked", String(this.lastView.showAnts));
      this.gridSwitch.setAttribute("aria-checked", String(this.lastView.showGrid));
      this.setTrailMode(this.lastView.heatmap);
    }
  }

  sync(view: ViewSettings): void {
    this.update(view);
  }

  setOpen(open: boolean): void {
    this.root.hidden = !open;
    this.root.setAttribute("aria-hidden", String(!open));
    if (open) this.update();
  }

  private makeSwitch(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const node = el("button", "switch-row");
    node.type = "button";
    node.setAttribute("role", "switch");
    node.setAttribute("aria-checked", "true");
    node.title = title;
    const track = el("span", "switch");
    track.append(el("span", "switch__thumb"));
    node.append(el("span", "switch-row__label", label), track);
    node.addEventListener("click", () => {
      onClick();
      this.update(this.lastView ?? undefined);
    });
    return node;
  }

  private makeRange(spec: ParamSpec): HTMLElement {
    const id = `param-${fieldId++}`;
    const field = el("div", "drawer__field");
    const head = el("div", "drawer__field-head");
    const label = el("label", "drawer__label", spec.label);
    label.htmlFor = id;
    const value = el("span", "drawer__value");
    head.append(label, value);

    const input = el("input", "slider");
    input.type = "range";
    input.id = id;
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(specValue(spec, this.params));
    input.addEventListener("input", () => {
      if (!Number.isFinite(input.valueAsNumber)) return;
      this.hooks.onParam(spec.key, input.valueAsNumber);
      value.textContent = formatSpecValue(spec, input.valueAsNumber);
      input.style.setProperty("--fill", this.fillPercent({ spec, input, value }));
    });

    value.textContent = formatSpecValue(spec, specValue(spec, this.params));
    input.style.setProperty("--fill", this.fillPercent({ spec, input, value }));
    field.append(head, input);
    this.controls.push({ spec, input, value });
    return field;
  }

  private fillPercent(control: ControlParts): string {
    const value = Number(control.input.value);
    const span = control.spec.max - control.spec.min;
    const fraction = span > 0 ? (value - control.spec.min) / span : 0;
    return `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  }

  private setTrailMode(mode: HeatmapMode): void {
    for (const [value, node] of this.trailButtons) {
      node.setAttribute("aria-pressed", String(value === mode));
    }
  }
}
