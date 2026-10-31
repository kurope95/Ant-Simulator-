import { colonyHex, colonyName } from "../sim/palette.js";
import type { World } from "../sim/world.js";
import { el } from "./dom.js";
import { sparklinePath } from "./sparkline.js";
import { colonyRows, formatInteger } from "./view_models.js";

interface RowParts {
  row: HTMLButtonElement;
  swatch: HTMLElement;
  name: HTMLElement;
  tag: HTMLElement;
  stats: HTMLElement;
  deliveredLine: SVGPathElement;
  populationLine: SVGPathElement;
}

const kSparkWidth = 120;
const kSparkHeight = 22;
// The sparklines redraw this often; the history only changes once a second.
const kSparkMs = 500;

function hexCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

function sparkline(label: string, line: SVGPathElement): HTMLElement {
  const box = el("span", "colony-row__spark");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${kSparkWidth} ${kSparkHeight}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.append(line);
  box.append(el("span", "colony-row__spark-label", label), svg);
  return box;
}

function linePath(): SVGPathElement {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("vector-effect", "non-scaling-stroke");
  return path;
}

function history(buffer: { size(): number; get(index: number): number }): number[] {
  const values: number[] = [];
  for (let i = 0; i < buffer.size(); i++) values.push(buffer.get(i));
  return values;
}

export class ColonyPanel {
  readonly root: HTMLElement;

  private readonly list: HTMLElement;
  private readonly count: HTMLElement;
  private readonly empty: HTMLElement;
  private rows = new Map<number, RowParts>();
  private rowKey = "";
  private lastSparkMs = -Infinity;

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
      this.lastSparkMs = -Infinity;
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

    const now = performance.now();
    if (now - this.lastSparkMs >= kSparkMs) {
      this.lastSparkMs = now;
      this.drawSparklines(world);
    }
  }

  setOpen(open: boolean): void {
    this.root.hidden = !open;
    this.root.setAttribute("aria-hidden", String(!open));
  }

  private drawSparklines(world: World): void {
    for (const colony of world.colonies) {
      const parts = this.rows.get(colony.id);
      if (parts === undefined) continue;
      const delivered = sparklinePath(history(colony.deliveredPerSecond), kSparkWidth, kSparkHeight);
      const population = sparklinePath(history(colony.populationPerSecond), kSparkWidth, kSparkHeight);
      parts.deliveredLine.setAttribute("d", delivered);
      parts.populationLine.setAttribute("d", population);
    }
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
      const deliveredLine = linePath();
      const populationLine = linePath();
      deliveredLine.setAttribute("stroke", hexCss(colonyHex(row.colorIndex)));
      populationLine.setAttribute("stroke", hexCss(colonyHex(row.colorIndex)));
      const sparks = el("span", "colony-row__sparks");
      sparks.append(
        sparkline("delivered/s", deliveredLine),
        sparkline("ants", populationLine),
      );
      body.append(top, stats, sparks);
      node.append(swatch, body);
      fragment.append(node);
      this.rows.set(row.id, { row: node, swatch, name, tag, stats, deliveredLine, populationLine });
    }
    this.list.append(fragment);
  }
}
