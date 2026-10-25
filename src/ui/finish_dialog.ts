import type { RunSummary } from "../app/session.js";
import { button, el } from "./dom.js";
import { formatClock, formatInteger } from "./view_models.js";

export interface FinishDialogHooks {
  onKeepWatching(): void;
  onFinish(): void;
}

let nextId = 0;

interface StatParts {
  cell: HTMLElement;
  value: HTMLSpanElement;
}

function makeStat(label: string): StatParts {
  const cell = el("div", "finish-dialog__stat");
  const value = el("span", "finish-dialog__value");
  cell.append(value, el("span", "finish-dialog__label", label));
  return { cell, value };
}

export class FinishDialog {
  readonly root: HTMLElement;

  private readonly elapsed: HTMLSpanElement;
  private readonly ants: HTMLSpanElement;
  private readonly delivered: HTMLSpanElement;
  private readonly colonies: HTMLSpanElement;
  private readonly keepWatchingButton: HTMLButtonElement;
  private previousFocus: HTMLElement | null = null;
  private openState = false;

  constructor(root: HTMLElement, hooks: FinishDialogHooks) {
    const modal = el("div", "modal modal--finish");
    modal.hidden = true;
    modal.setAttribute("role", "presentation");

    const scrim = el("div", "modal__scrim");
    scrim.addEventListener("click", () => hooks.onKeepWatching());

    const card = el("div", "modal__card finish-dialog");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    const titleId = `finish-title-${nextId++}`;
    card.setAttribute("aria-labelledby", titleId);

    const head = el("div", "modal__head");
    const title = el("h2", "modal__title", "Finish this run?");
    title.id = titleId;
    head.append(
      title,
      el("p", "modal__subtitle", "The colony keeps its history. This run's numbers go home with you."),
    );

    const stats = el("div", "finish-dialog__stats");
    const elapsed = makeStat("elapsed");
    const ants = makeStat("ants");
    const delivered = makeStat("delivered");
    const colonies = makeStat("colonies");
    this.elapsed = elapsed.value;
    this.ants = ants.value;
    this.delivered = delivered.value;
    this.colonies = colonies.value;
    stats.append(elapsed.cell, ants.cell, delivered.cell, colonies.cell);

    this.keepWatchingButton = button({
      label: "Keep watching",
      variant: "secondary",
      title: "Return to the running colony (Escape)",
      onClick: () => hooks.onKeepWatching(),
    });
    const finish = button({
      label: "Finish & home",
      icon: "finish",
      variant: "danger",
      title: "Finish this run and return home",
      onClick: () => hooks.onFinish(),
    });
    const actions = el("div", "finish-dialog__actions");
    actions.append(this.keepWatchingButton, finish);

    card.append(head, stats, actions);
    modal.append(scrim, card);
    root.append(modal);
    this.root = modal;
  }

  open(summary: RunSummary): void {
    this.elapsed.textContent = formatClock(summary.seconds, 1);
    this.ants.textContent = formatInteger(summary.ants);
    this.delivered.textContent = formatInteger(summary.delivered);
    this.colonies.textContent = formatInteger(summary.colonies);
    if (this.openState) return;
    this.openState = true;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.hidden = false;
    this.keepWatchingButton.focus();
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.root.hidden = true;
    if (this.previousFocus !== null && this.previousFocus.isConnected) this.previousFocus.focus();
    this.previousFocus = null;
  }

  isOpen(): boolean {
    return this.openState;
  }
}
