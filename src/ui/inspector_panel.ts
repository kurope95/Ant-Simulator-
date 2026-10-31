import type { AntSnapshot } from "../sim/inspect.js";
import { button, el } from "./dom.js";
import { energyFraction, headingLabel, roleLabel, stateLabel } from "./view_models.js";

export interface InspectorHooks {
  onFollow(on: boolean): void;
  onClose(): void;
  onSensors(on: boolean): void;
}

function hexCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

function field(label: string): { row: HTMLElement; value: HTMLElement } {
  const row = el("div", "inspector__row");
  const value = el("span", "inspector__value");
  row.append(el("span", "inspector__label", label), value);
  return { row, value };
}

// The selected ant: who it is and what it is doing. Plain DOM text; the
// overlay on the canvas draws the ring and the sensors.
export class InspectorPanel {
  readonly root: HTMLElement;

  private readonly title: HTMLElement;
  private readonly swatch: HTMLElement;
  private readonly colony: HTMLElement;
  private readonly role = field("Role");
  private readonly state = field("Doing");
  private readonly carrying = field("Carrying");
  private readonly speed = field("Speed");
  private readonly heading = field("Heading");
  private readonly anchor = field("Since anchor");
  private readonly energyFill: HTMLElement;
  private readonly energyValue: HTMLElement;
  private readonly details: HTMLElement;
  private readonly gone: HTMLElement;
  private readonly followButton: HTMLButtonElement;
  private readonly sensorsButton: HTMLButtonElement;
  private readonly actions: HTMLElement;
  private following = false;
  private sensors = false;

  constructor(root: HTMLElement, hooks: InspectorHooks) {
    this.root = root;
    const card = el("div", "panel-card inspector-panel");
    const head = el("header", "panel-card__head");
    this.title = el("h2", "panel-card__title");
    const close = button({ label: "", icon: "close", variant: "icon", title: "Close inspector", onClick: () => hooks.onClose() });
    head.append(this.title, close);

    const who = el("div", "inspector__who");
    this.swatch = el("span", "inspector__swatch");
    this.colony = el("span", "inspector__colony");
    who.append(this.swatch, this.colony);

    const energy = el("div", "inspector__energy");
    const energyHead = el("div", "inspector__energy-head");
    energyHead.append(el("span", "inspector__label", "Health"));
    this.energyValue = el("span", "inspector__value");
    energyHead.append(this.energyValue);
    const track = el("div", "inspector__energy-track");
    this.energyFill = el("div", "inspector__energy-fill");
    track.append(this.energyFill);
    energy.append(energyHead, track);

    this.details = el("div", "inspector__details");
    this.details.append(
      this.role.row,
      this.state.row,
      this.carrying.row,
      this.speed.row,
      this.heading.row,
      this.anchor.row,
    );

    this.gone = el("p", "panel-card__empty");
    this.gone.hidden = true;

    this.followButton = button({
      label: "Follow",
      icon: "select",
      variant: "secondary",
      title: "Follow this ant (F)",
      onClick: () => hooks.onFollow(!this.following),
    });
    this.followButton.setAttribute("aria-pressed", "false");
    this.sensorsButton = button({
      label: "Sensors",
      icon: "food",
      variant: "secondary",
      title: "Show what it senses (V)",
      onClick: () => hooks.onSensors(!this.sensors),
    });
    this.sensorsButton.setAttribute("aria-pressed", "false");
    this.actions = el("div", "inspector__actions");
    this.actions.append(this.followButton, this.sensorsButton);

    card.append(head, who, energy, this.details, this.gone, this.actions);
    root.replaceChildren(card);
    root.setAttribute("aria-hidden", "true");
    this.root.hidden = true;
  }

  show(snapshot: AntSnapshot, colonyName: string, colonyHex: number, following: boolean, sensors: boolean): void {
    this.root.hidden = false;
    this.root.setAttribute("aria-hidden", "false");
    this.following = following;
    this.sensors = sensors;
    this.title.textContent = snapshot.name;
    this.swatch.style.background = hexCss(colonyHex);
    this.colony.textContent = colonyName;

    const fraction = energyFraction(snapshot.energy);
    this.energyFill.style.width = `${(fraction * 100).toFixed(1)}%`;
    this.energyValue.textContent = `${Math.round(fraction * 100)}%`;

    this.role.value.textContent = roleLabel(snapshot.role);
    this.state.value.textContent = stateLabel(snapshot.state);
    this.carrying.value.textContent = snapshot.carrying ? "Yes" : "No";
    this.speed.value.textContent = `${Math.round(snapshot.speed)} u/s`;
    this.heading.value.textContent = headingLabel(snapshot.heading);
    this.anchor.value.textContent = `${snapshot.timeSinceAnchor.toFixed(1)} s`;

    this.details.hidden = false;
    this.gone.hidden = true;
    this.actions.hidden = false;
    this.followButton.setAttribute("aria-pressed", String(following));
    this.followButton.classList.toggle("is-on", following);
    this.sensorsButton.setAttribute("aria-pressed", String(sensors));
    this.sensorsButton.classList.toggle("is-on", sensors);
  }

  showGone(name: string): void {
    this.root.hidden = false;
    this.root.setAttribute("aria-hidden", "false");
    this.title.textContent = name;
    this.swatch.style.background = "transparent";
    this.colony.textContent = "";
    this.details.hidden = true;
    this.actions.hidden = true;
    this.gone.textContent = `${name} is no longer alive`;
    this.gone.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.root.setAttribute("aria-hidden", "true");
  }
}
