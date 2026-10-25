import { button, el } from "./dom.js";

export interface PauseMenuHooks {
  onResume(): void;
  onRestart(): void;
  onEdit(): void;
  onFinish(): void;
}

let nextId = 0;

export class PauseMenu {
  readonly root: HTMLElement;

  private readonly subtitle: HTMLElement;
  private readonly resumeButton: HTMLButtonElement;
  private previousFocus: HTMLElement | null = null;
  private openState = false;

  constructor(root: HTMLElement, hooks: PauseMenuHooks) {
    const modal = el("div", "modal modal--pause");
    modal.hidden = true;
    modal.setAttribute("role", "presentation");

    const scrim = el("div", "modal__scrim");
    scrim.addEventListener("click", () => hooks.onResume());

    const card = el("div", "modal__card pause-menu");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    const titleId = `pause-title-${nextId++}`;
    card.setAttribute("aria-labelledby", titleId);

    const head = el("div", "modal__head");
    const title = el("h2", "modal__title", "Paused");
    title.id = titleId;
    this.subtitle = el("p", "modal__subtitle", "The colony is holding still.");
    head.append(title, this.subtitle);

    this.resumeButton = button({
      label: "Resume",
      icon: "play",
      variant: "primary",
      title: "Resume the run (P or Escape)",
      onClick: () => hooks.onResume(),
    });
    this.resumeButton.classList.add("modal__wide");

    const actions = el("div", "pause-menu__actions");
    actions.append(
      this.resumeButton,
      button({
        label: "Restart",
        icon: "reset",
        variant: "secondary",
        title: "Restart this run from the same world",
        onClick: () => hooks.onRestart(),
      }),
      button({
        label: "Edit world",
        icon: "edit",
        variant: "secondary",
        title: "Open this world in the builder",
        onClick: () => hooks.onEdit(),
      }),
      button({
        label: "Finish run",
        icon: "finish",
        variant: "danger",
        title: "Finish and return home",
        onClick: () => hooks.onFinish(),
      }),
    );

    card.append(head, actions);
    modal.append(scrim, card);
    root.append(modal);
    this.root = modal;
  }

  open(): void {
    if (this.openState) return;
    this.openState = true;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.hidden = false;
    this.resumeButton.focus();
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

  setContext(presetName: string, clock: string): void {
    const text = `${presetName} · ${clock}`;
    if (this.subtitle.textContent !== text) this.subtitle.textContent = text;
  }
}
