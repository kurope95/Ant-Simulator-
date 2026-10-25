import { colonyHex, colonyName } from "../sim/palette.js";
import type { World } from "../sim/world.js";
import { el } from "./dom.js";
import { colonyRows, formatInteger } from "./view_models.js";

interface RowParts {
  row: HTMLButtonElement;
  swatch: HTMLElement;
  name: HTMLElement;
  tag: HTMLElement;
  stats: HTMLElement;
}

function hexCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

export class ColonyPanel {
  readonly root: HTMLElement;

  private readonly list: HTMLElement;
  private readonly count: HTMLElement;
  private readonly empty: HTMLElement;
  private rows = new Map<number, RowParts>();
  private rowKey = "";

  constructor(root: HTMLElement, onFocus: (id: number) => void) {
    this.root = root;
    const card = el("div", "panel-card colony-panel");
    const head = el("header", "panel-card__head");
    this.count = el("span", "panel-card__meta", "0 colonies");
    head.append(el("h2", "panel-card__title", "Colonies"), this.count);
    this.list = el("div", "colony-panel__list");
    this.empty = el("p", "panel-card__empty", "No colonies in this world.");
    card.append(head, this.list, this.empty);
    root.append(card);

    this.list.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const row = target.closest<HTMLButtonElement>(".colony-row");
      if (row === null || row.dataset.colonyId === undefined) return;
      onFocus(Number(row.dataset.colonyId));
    });

    this.setOpen(false);
  }

  update(world: World): void {
    const rows = colonyRows(world);
    const key = rows.map((row) => String(row.id)).join(",");
    if (key !== this.rowKey) {
      this.rebuild(rows);
      this.rowKey = key;
    }
    this.count.textContent = `${formatInteger(rows.length)} ${rows.length === 1 ? "colony" : "colonies"}`;
    this.empty.hidden = rows.length > 0;
    this.list.hidden = rows.length === 0;

    for (const row of rows) {
      const parts = this.rows.get(row.id);
      if (parts === undefined) continue;
      parts.swatch.style.background = hexCss(row.hex);
      parts.name.textContent = row.name;
      parts.tag.hidden = !row.extinct;
      parts.stats.textContent =
        `${formatInteger(row.population)} ants · ` +
        `${formatInteger(row.delivered)} delivered · ` +
        `${formatInteger(row.foodPool)} food`;
      parts.row.dataset.extinct = String(row.extinct);
      parts.row.title = `Focus ${row.name}${row.extinct ? " (extinct)" : ""}`;
      parts.row.setAttribute("aria-label", `Focus ${row.name}`);
    }
  }

  setOpen(open: boolean): void {
    this.root.hidden = !open;
    this.root.setAttribute("aria-hidden", String(!open));
  }

  private rebuild(rows: ReturnType<typeof colonyRows>): void {
    this.list.replaceChildren();
    this.rows.clear();
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const node = el("button", "colony-row");
      node.type = "button";
      node.dataset.colonyId = String(row.id);
      const swatch = el("span", "colony-row__swatch");
      swatch.style.background = hexCss(colonyHex(row.colorIndex));
      const body = el("span", "colony-row__body");
      const top = el("span", "colony-row__top");
      const name = el("span", "colony-row__name", colonyName(row.colorIndex));
      const tag = el("span", "colony-row__tag", "extinct");
      const stats = el("span", "colony-row__stats");
      top.append(name, tag);
      body.append(top, stats);
      node.append(swatch, body);
      fragment.append(node);
      this.rows.set(row.id, { row: node, swatch, name, tag, stats });
    }
    this.list.append(fragment);
  }
}
