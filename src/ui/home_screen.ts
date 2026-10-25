import { button, clearChildren, el } from "./dom.js";
import { formatClock, formatInteger } from "./view_models.js";
import type { RunSummary } from "../app/session.js";

export interface HomeScreenHooks {
  onQuickStart(): void;
  onNewWorld(): void;
}

export class HomeScreen {
  readonly root: HTMLElement;

  private readonly lastCard: HTMLElement;
  private readonly lastBody: HTMLElement;

  constructor(root: HTMLElement, hooks: HomeScreenHooks) {
    const screen = el("div", "screen screen--home home");
    screen.append(el("div", "home__scrim"));

    const bar = el("header", "home__bar");
    const score = el("div", "home__score");
    score.append(el("span", "wordmark", "Ant Simulator"), el("span", "home__tag", "M1.5"));
    bar.append(score, el("span", "home__edition", "Presentation preview"));

    const main = el("main", "home__main");
    const hero = el("section", "home__hero");
    hero.append(
      el("p", "home__eyebrow", "A living colony"),
      el("h1", "home__headline", "Build a world."),
      el("p", "home__headline home__headline--accent", "Let it crawl."),
      el(
        "p",
        "home__lede",
        "Paint terrain, place food and set a colony loose. The ants leave trails, find their way home and feed the nest.",
      ),
    );

    const actions = el("div", "home__actions");
    actions.append(
      button({
        label: "Quick start",
        icon: "play",
        variant: "primary",
        title: "Start the meadow with a new seed",
        onClick: () => hooks.onQuickStart(),
      }),
      button({
        label: "New world",
        icon: "edit",
        variant: "secondary",
        title: "Open the world builder",
        onClick: () => hooks.onNewWorld(),
      }),
    );
    hero.append(actions, el("p", "home__hint", "WASD-free. Everything grows from what each ant can sense."));
    main.append(hero);

    this.lastCard = el("aside", "home__last home__card glass");
    this.lastCard.hidden = true;
    this.lastBody = el("div", "home__last-body");
    this.lastCard.append(el("span", "field__label", "Last run"), this.lastBody);
    main.append(this.lastCard);

    screen.append(bar, main);
    root.append(screen);
    this.root = screen;
  }

  update(lastRun: RunSummary | null): void {
    clearChildren(this.lastBody);
    this.lastCard.hidden = lastRun === null;
    if (lastRun === null) return;

    const head = el("div", "home__last-head");
    head.append(
      el("span", "home__last-preset", lastRun.presetName),
      el("span", "home__last-seed", `seed ${lastRun.seed}`),
    );
    this.lastBody.append(head);

    const rows = el("dl", "home__rows");
    const row = (label: string, value: string): void => {
      rows.append(el("dt", "home__row-label", label), el("dd", "home__row-value", value));
    };
    row("Elapsed", formatClock(lastRun.seconds, 1));
    row("Delivered", formatInteger(lastRun.delivered));
    row("Ants", formatInteger(lastRun.ants));
    row("Colonies", formatInteger(lastRun.colonies));
    this.lastBody.append(rows);
  }
}
