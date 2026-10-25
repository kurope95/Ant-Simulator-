import { COLONY_PALETTE, colonyName } from "../sim/palette.js";
import { kPresetIds, presetInfo } from "../sim/presets.js";
import {
  FoodKind,
  kFoodAmountStep,
  kMaxBrushRadius,
  kMaxFoodAmount,
  kMaxStartingAnts,
  kMinBrushRadius,
  kMinFoodAmount,
  kMinStartingAnts,
  kStartingAntsStep,
  validateSetup,
  type ColonySetup,
  type FoodSetup,
  type WorldSetup,
} from "../sim/setup.js";
import { BuilderTool, type BuilderModel } from "./builder_model.js";
import { button, clearChildren, el, icon, type IconName } from "./dom.js";
import { formatInteger } from "./view_models.js";

export interface BuilderHooks {
  onBack(): void;
  onStart(): void;
  onChanged(): void;
  onRollSeed(): void;
  onFit(): void;
}

interface ToolSpec {
  tool: BuilderTool;
  label: string;
  icon: IconName;
  hint: string;
}

const kTools: readonly ToolSpec[] = [
  {
    tool: BuilderTool.Select,
    label: "Select",
    icon: "select",
    hint: "Click a nest or food pile to select it. Drag to move it, Delete to remove it.",
  },
  {
    tool: BuilderTool.Colony,
    label: "Colony",
    icon: "colonies",
    hint: "Click free ground to add a colony. Up to eight colonies.",
  },
  {
    tool: BuilderTool.Food,
    label: "Food",
    icon: "food",
    hint: "Click the map to drop a food pile of the chosen kind and amount.",
  },
  {
    tool: BuilderTool.Rock,
    label: "Rock",
    icon: "rock",
    hint: "Drag on the map to paint rock. Ants cannot cross it.",
  },
  {
    tool: BuilderTool.Water,
    label: "Water",
    icon: "water",
    hint: "Drag on the map to paint water. Ants cannot cross it.",
  },
  {
    tool: BuilderTool.Sand,
    label: "Sand",
    icon: "sand",
    hint: "Drag on the map to paint sand. Ants cross it more slowly.",
  },
  {
    tool: BuilderTool.Mud,
    label: "Mud",
    icon: "mud",
    hint: "Drag on the map to paint mud. Ants cross it more slowly.",
  },
  {
    tool: BuilderTool.Erase,
    label: "Erase",
    icon: "erase",
    hint: "Drag on the map to erase obstacles back to open ground.",
  },
];

const kFoodKindNames: Record<FoodKind, string> = {
  [FoodKind.Seeds]: "Seeds",
  [FoodKind.Berries]: "Berries",
  [FoodKind.Leaves]: "Leaves",
};

const kFoodKinds: readonly FoodKind[] = [FoodKind.Seeds, FoodKind.Berries, FoodKind.Leaves];

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

function fillPercent(value: number, min: number, max: number): string {
  const span = max - min;
  const fraction = span > 0 ? (value - min) / span : 0;
  return `${Math.min(100, Math.max(0, fraction * 100))}%`;
}

function isBrushTool(tool: BuilderTool): boolean {
  return (
    tool === BuilderTool.Rock ||
    tool === BuilderTool.Water ||
    tool === BuilderTool.Sand ||
    tool === BuilderTool.Mud ||
    tool === BuilderTool.Erase
  );
}

function colonyFor(setup: WorldSetup, id: number): ColonySetup | null {
  return setup.colonies.find((colony) => colony.id === id) ?? null;
}

function foodFor(setup: WorldSetup, uid: number): FoodSetup | null {
  return setup.food.find((source) => source.uid === uid) ?? null;
}

function toolSpec(tool: BuilderTool): ToolSpec {
  return kTools.find((spec) => spec.tool === tool) ?? kTools[0];
}

export class BuilderScreen {
  readonly root: HTMLElement;

  private readonly model: BuilderModel;
  private readonly hooks: BuilderHooks;
  private readonly seedInput: HTMLInputElement;
  private readonly startButton: HTMLButtonElement;
  private readonly validationText: HTMLSpanElement;
  private readonly brushText: HTMLSpanElement;
  private readonly confirmStrip: HTMLElement;
  private readonly inspectorBody: HTMLElement;
  private readonly presetButtons = new Map<string, HTMLButtonElement>();
  private readonly toolButtons = new Map<BuilderTool, HTMLButtonElement>();
  private inspectorKey = "";
  private inspectorName: HTMLSpanElement | null = null;
  private swatches: HTMLButtonElement[] = [];
  private antsSlider: HTMLInputElement | null = null;
  private antsValue: HTMLSpanElement | null = null;
  private foodKindButtons: { kind: FoodKind; node: HTMLButtonElement }[] = [];
  private foodAmountSlider: HTMLInputElement | null = null;
  private foodAmountValue: HTMLSpanElement | null = null;
  private brushSlider: HTMLInputElement | null = null;
  private brushValue: HTMLSpanElement | null = null;

  constructor(root: HTMLElement, model: BuilderModel, hooks: BuilderHooks) {
    this.model = model;
    this.hooks = hooks;

    const screen = el("div", "screen screen--builder");
    screen.append(el("div", "screen__vignette"));

    const bar = el("header", "builder__bar glass");
    const back = button({
      label: "Back",
      icon: "chevron",
      variant: "ghost",
      title: "Back (Esc)",
      onClick: () => hooks.onBack(),
    });
    back.classList.add("builder__back");

    const title = el("div", "builder__title");
    title.append(
      el("span", "wordmark", "Ant Simulator"),
      el("span", "builder__subtitle", "World builder"),
    );

    const presets = el("div", "segmented builder__presets");
    presets.setAttribute("role", "group");
    presets.setAttribute("aria-label", "Map presets");
    for (const id of kPresetIds) {
      const name = presetInfo(id)?.name ?? id;
      const node = button({
        label: name,
        variant: "ghost",
        title: `Load the ${name} map`,
        onClick: () => this.choosePreset(id),
      });
      node.dataset.preset = id;
      node.setAttribute("aria-pressed", "false");
      this.presetButtons.set(id, node);
      presets.append(node);
    }

    const seed = el("div", "builder__seed");
    this.seedInput = el("input", "builder__seed-input");
    this.seedInput.type = "number";
    this.seedInput.min = "0";
    this.seedInput.max = "4294967295";
    this.seedInput.step = "1";
    this.seedInput.value = String(model.setup.seed);
    this.seedInput.setAttribute("aria-label", "World seed");
    const seedRow = el("div", "builder__seed-row");
    seedRow.append(
      this.seedInput,
      button({
        label: "",
        icon: "dice",
        variant: "icon",
        title: "Roll a new seed",
        onClick: () => hooks.onRollSeed(),
      }),
    );
    seed.append(el("span", "field__label", "Seed"), seedRow);
    this.seedInput.addEventListener("change", () => {
      const text = this.seedInput.value.trim();
      if (text !== "" && this.model.setSeed(Number(text))) {
        this.update();
        this.hooks.onChanged();
      } else {
        this.seedInput.value = String(this.model.setup.seed);
      }
    });

    const launch = el("div", "builder__launch");
    const status = el("div", "builder__status");
    this.validationText = el("span", "builder__validation");
    this.brushText = el("span", "builder__brush");
    status.append(this.validationText, this.brushText);
    this.startButton = button({
      label: "Start",
      icon: "play",
      variant: "primary",
      title: "Start this world",
      onClick: () => hooks.onStart(),
    });
    launch.append(status, this.startButton);

    bar.append(back, title, presets, seed, launch);

    const rail = el("nav", "builder__rail glass");
    rail.setAttribute("aria-label", "Builder tools");
    kTools.forEach((spec, index) => {
      const node = el("button", "builder__tool");
      node.type = "button";
      node.title = `${spec.label} (${index + 1})`;
      node.setAttribute("aria-pressed", "false");
      node.append(icon(spec.icon), el("span", "builder__tool-label", spec.label));
      node.addEventListener("click", () => {
        this.model.setTool(spec.tool);
        this.update();
      });
      this.toolButtons.set(spec.tool, node);
      rail.append(node);
    });

    const inspector = el("aside", "builder__inspector glass");
    inspector.setAttribute("aria-label", "Builder inspector");
    this.inspectorBody = el("div", "builder__inspector-body");
    inspector.append(this.inspectorBody);

    this.confirmStrip = el("div", "confirm-strip glass");
    this.confirmStrip.hidden = true;
    this.confirmStrip.append(
      el("span", "confirm-strip__text", "Replace your map?"),
      button({
        label: "Replace",
        variant: "primary",
        onClick: () => {
          if (this.model.confirmPreset()) {
            this.update();
            this.hooks.onChanged();
          }
        },
      }),
      button({
        label: "Cancel",
        variant: "ghost",
        onClick: () => {
          this.model.cancelPreset();
          this.update();
        },
      }),
    );

    screen.append(bar, rail, inspector, this.confirmStrip);
    root.append(screen);
    this.root = screen;
    this.update();
  }

  update(): void {
    for (const [tool, node] of this.toolButtons) {
      node.setAttribute("aria-pressed", String(tool === this.model.tool));
    }
    for (const [id, node] of this.presetButtons) {
      node.setAttribute("aria-pressed", String(id === this.model.setup.presetId));
    }
    if (document.activeElement !== this.seedInput) {
      this.seedInput.value = String(this.model.setup.seed);
    }

    const error = validateSetup(this.model.setup);
    setText(this.validationText, error ?? "Ready to start.");
    this.validationText.dataset.state = error === null ? "ready" : "error";
    setText(this.brushText, `Brush ${this.model.brushRadius} u`);
    this.startButton.disabled = error !== null;
    this.confirmStrip.hidden = this.model.pendingPreset() === null;

    const selection = this.model.selection;
    const key = `${this.model.tool}:${selection?.kind ?? "none"}:${selection?.id ?? -1}`;
    if (key !== this.inspectorKey) {
      this.inspectorKey = key;
      this.buildInspector();
    } else {
      this.refreshInspector();
    }
  }

  private choosePreset(id: string): void {
    const result = this.model.requestPreset(id);
    this.update();
    if (result === "loaded") this.hooks.onChanged();
  }

  private buildInspector(): void {
    clearChildren(this.inspectorBody);
    this.inspectorName = null;
    this.swatches = [];
    this.antsSlider = null;
    this.antsValue = null;
    this.foodKindButtons = [];
    this.foodAmountSlider = null;
    this.foodAmountValue = null;
    this.brushSlider = null;
    this.brushValue = null;

    const selection = this.model.selection;
    const colony = selection?.kind === "colony" ? colonyFor(this.model.setup, selection.id) : null;
    const food = selection?.kind === "food" ? foodFor(this.model.setup, selection.id) : null;

    if (colony !== null) {
      this.buildColony(colony, true);
    } else if (food !== null) {
      this.buildFood(food, true);
    } else if (this.model.tool === BuilderTool.Colony) {
      this.buildColony(null, false);
    } else if (this.model.tool === BuilderTool.Food) {
      this.buildFood(null, false);
    } else {
      this.buildHint();
    }
    if (isBrushTool(this.model.tool)) this.buildBrush();
    this.refreshInspector();
  }

  private buildColony(colony: ColonySetup | null, selected: boolean): void {
    const head = el("div", "builder__inspector-head");
    head.append(el("span", "field__label", selected ? "Colony" : "New colony"));
    this.inspectorName = el("span", "builder__inspector-title");
    head.append(this.inspectorName);
    this.inspectorBody.append(head);

    this.inspectorBody.append(el("span", "field__label", "Colour"));
    const grid = el("div", "swatch-grid");
    COLONY_PALETTE.forEach((entry, index) => {
      const swatch = el("button", "swatch");
      swatch.type = "button";
      swatch.title = entry.name;
      swatch.setAttribute("aria-label", entry.name);
      swatch.setAttribute("aria-pressed", "false");
      swatch.style.backgroundColor = `#${entry.hex.toString(16).padStart(6, "0")}`;
      swatch.addEventListener("click", () => {
        if (selected) {
          if (this.model.setSelectionColor(index)) this.hooks.onChanged();
        } else {
          this.model.setStartingColor(index);
        }
        this.update();
      });
      this.swatches.push(swatch);
      grid.append(swatch);
    });
    this.inspectorBody.append(grid);

    const slider = this.addSliderRow(
      "Starting ants",
      kMinStartingAnts,
      kMaxStartingAnts,
      kStartingAntsStep,
      colony?.startingAnts ?? this.model.startingAnts,
      (value) => formatInteger(value),
      (value) => {
        if (selected) {
          if (this.model.setSelectionStartingAnts(value)) this.hooks.onChanged();
        } else {
          this.model.setStartingAnts(value);
        }
        this.update();
      },
    );
    this.antsSlider = slider.input;
    this.antsValue = slider.readout;

    if (selected) this.inspectorBody.append(this.deleteButton("Delete colony"));
  }

  private buildFood(food: FoodSetup | null, selected: boolean): void {
    const head = el("div", "builder__inspector-head");
    head.append(el("span", "field__label", selected ? "Food" : "New food pile"));
    this.inspectorName = el("span", "builder__inspector-title");
    head.append(this.inspectorName);
    this.inspectorBody.append(head);

    this.inspectorBody.append(el("span", "field__label", "Kind"));
    const kinds = el("div", "segmented builder__kinds");
    kinds.setAttribute("role", "group");
    kinds.setAttribute("aria-label", "Food kind");
    for (const kind of kFoodKinds) {
      const node = button({
        label: kFoodKindNames[kind],
        variant: "ghost",
        onClick: () => {
          if (selected) {
            if (this.model.setSelectionFoodKind(kind)) this.hooks.onChanged();
          } else {
            this.model.setFoodKind(kind);
          }
          this.update();
        },
      });
      node.setAttribute("aria-pressed", "false");
      this.foodKindButtons.push({ kind, node });
      kinds.append(node);
    }
    this.inspectorBody.append(kinds);

    const slider = this.addSliderRow(
      "Amount",
      kMinFoodAmount,
      kMaxFoodAmount,
      kFoodAmountStep,
      food?.amount ?? this.model.foodAmount,
      (value) => `${formatInteger(value)} food`,
      (value) => {
        if (selected) {
          if (this.model.setSelectionFoodAmount(value)) this.hooks.onChanged();
        } else {
          this.model.setFoodAmount(value);
        }
        this.update();
      },
    );
    this.foodAmountSlider = slider.input;
    this.foodAmountValue = slider.readout;

    if (selected) this.inspectorBody.append(this.deleteButton("Delete food"));
  }

  private buildHint(): void {
    const spec = toolSpec(this.model.tool);
    const head = el("div", "builder__inspector-head");
    head.append(el("span", "field__label", "Tool"));
    head.append(el("span", "builder__inspector-title", spec.label));
    this.inspectorBody.append(head, el("p", "builder__hint", spec.hint));
  }

  private buildBrush(): void {
    this.inspectorBody.append(el("div", "builder__separator"));
    const slider = this.addSliderRow(
      "Brush radius",
      kMinBrushRadius,
      kMaxBrushRadius,
      1,
      this.model.brushRadius,
      (value) => `${value} u`,
      (value) => {
        this.model.setBrushRadius(value);
        this.update();
      },
    );
    this.brushSlider = slider.input;
    this.brushValue = slider.readout;
  }

  private addSliderRow(
    labelText: string,
    min: number,
    max: number,
    step: number,
    value: number,
    format: (value: number) => string,
    onInput: (value: number) => void,
  ): { input: HTMLInputElement; readout: HTMLSpanElement } {
    const field = el("label", "builder__field");
    const head = el("div", "builder__field-head");
    const readout = el("span", "builder__readout");
    head.append(el("span", "field__label", labelText), readout);
    const input = el("input", "slider");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute("aria-label", labelText);
    field.append(head, input);
    this.inspectorBody.append(field);

    setText(readout, format(value));
    input.style.setProperty("--fill", fillPercent(value, min, max));
    input.addEventListener("input", () => onInput(input.valueAsNumber));
    return { input, readout };
  }

  private deleteButton(label: string): HTMLButtonElement {
    const node = button({
      label,
      icon: "trash",
      variant: "danger",
      onClick: () => {
        if (this.model.deleteSelection()) {
          this.update();
          this.hooks.onChanged();
        }
      },
    });
    node.classList.add("builder__delete");
    return node;
  }

  private refreshInspector(): void {
    const selection = this.model.selection;
    const colony = selection?.kind === "colony" ? colonyFor(this.model.setup, selection.id) : null;
    const food = selection?.kind === "food" ? foodFor(this.model.setup, selection.id) : null;

    let color: number | null = null;
    if (colony !== null) color = colony.color;
    else if (selection === null && this.model.tool === BuilderTool.Colony) color = this.model.startingColor;
    for (let i = 0; i < this.swatches.length; i++) {
      this.swatches[i].setAttribute("aria-pressed", String(color === i));
    }

    if (this.inspectorName !== null) {
      if (colony !== null) {
        setText(this.inspectorName, colonyName(colony.color));
      } else if (food !== null) {
        setText(this.inspectorName, kFoodKindNames[food.kind]);
      } else if (selection === null && this.model.tool === BuilderTool.Colony) {
        setText(
          this.inspectorName,
          this.model.startingColor === null ? "First free colour" : colonyName(this.model.startingColor),
        );
      }
    }

    syncSlider(
      this.antsSlider,
      this.antsValue,
      colony?.startingAnts ?? this.model.startingAnts,
      kMinStartingAnts,
      kMaxStartingAnts,
      (value) => formatInteger(value),
    );

    let activeKind: FoodKind | null = null;
    if (food !== null) activeKind = food.kind;
    else if (selection === null && this.model.tool === BuilderTool.Food) activeKind = this.model.foodKind;
    for (const { kind, node } of this.foodKindButtons) {
      node.setAttribute("aria-pressed", String(activeKind === kind));
    }

    syncSlider(
      this.foodAmountSlider,
      this.foodAmountValue,
      food?.amount ?? this.model.foodAmount,
      kMinFoodAmount,
      kMaxFoodAmount,
      (value) => `${formatInteger(value)} food`,
    );

    syncSlider(
      this.brushSlider,
      this.brushValue,
      this.model.brushRadius,
      kMinBrushRadius,
      kMaxBrushRadius,
      (value) => `${value} u`,
    );
  }
}

function syncSlider(
  input: HTMLInputElement | null,
  readout: HTMLSpanElement | null,
  value: number,
  min: number,
  max: number,
  format: (value: number) => string,
): void {
  if (input === null) return;
  if (document.activeElement !== input) input.value = String(value);
  input.style.setProperty("--fill", fillPercent(value, min, max));
  if (readout !== null) setText(readout, format(value));
}
