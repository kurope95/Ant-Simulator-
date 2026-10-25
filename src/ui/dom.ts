export type IconName =
  | "play"
  | "pause"
  | "step"
  | "reset"
  | "edit"
  | "finish"
  | "menu"
  | "close"
  | "plus"
  | "trash"
  | "dice"
  | "chevron"
  | "palette"
  | "colonies"
  | "settings";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "icon";

export interface ButtonOptions {
  label: string;
  icon?: IconName;
  variant?: ButtonVariant;
  title?: string;
  onClick?: () => void;
}

const kSvgNamespace = "http://www.w3.org/2000/svg";

const kIcons: Record<IconName, string> = {
  play: '<path d="M8 5.5 18.5 12 8 18.5Z"/>',
  pause: '<path d="M9 5.5v13M15 5.5v13"/>',
  step: '<path d="M6 5.5v13"/><path d="M9.5 12 18.5 6.2v11.6Z"/>',
  reset:
    '<path d="M3.5 3.5v5h5"/><path d="M3.7 13.2a8.6 8.6 0 1 0 2.4-7.3L3.5 8.5"/>',
  edit: '<path d="m4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z"/><path d="m14 7 3 3"/>',
  finish: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10.5V20h11v-9.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash:
    '<path d="M4.5 7h15"/><path d="M9.5 7V4.8h5V7"/><path d="M6.5 7l.9 12.2h9.2L17.5 7"/><path d="M10 10.5v5.5M14 10.5v5.5"/>',
  dice:
    '<rect x="4" y="4" width="16" height="16" rx="3.5"/>' +
    '<circle cx="9" cy="9" r="1.15" fill="currentColor" stroke="none"/>' +
    '<circle cx="15" cy="9" r="1.15" fill="currentColor" stroke="none"/>' +
    '<circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/>' +
    '<circle cx="9" cy="15" r="1.15" fill="currentColor" stroke="none"/>' +
    '<circle cx="15" cy="15" r="1.15" fill="currentColor" stroke="none"/>',
  chevron: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
  palette:
    '<path d="M12 3.2a8.8 8.8 0 1 0 0 17.6c1.3 0 2-1 2-2.1 0-1.2-1-1.9-1-2.9 0-1 .8-1.7 1.9-1.7h1.6a3.9 3.9 0 0 0 3.9-3.9c0-4.2-3.8-7-8.4-7Z"/>' +
    '<circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="10" cy="7.2" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="14.5" cy="7" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="17" cy="10.5" r="1.1" fill="currentColor" stroke="none"/>',
  colonies:
    '<circle cx="7" cy="8.5" r="2.1"/><circle cx="16.5" cy="7" r="1.7"/>' +
    '<circle cx="12.5" cy="16" r="2.1"/><path d="M8.8 10.1 11.4 14M15.4 8.2l-2 5.6"/>',
  settings:
    '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/>' +
    '<circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined && className.length > 0) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function icon(name: IconName): SVGElement {
  const svg = document.createElementNS(kSvgNamespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("icon");
  svg.innerHTML = kIcons[name];
  return svg;
}

export function button(options: ButtonOptions): HTMLButtonElement {
  const variant = options.variant ?? "secondary";
  const node = el("button", variant === "icon" ? "icon-button" : `button button--${variant}`);
  node.type = "button";
  if (options.icon !== undefined) node.append(icon(options.icon));
  if (options.label.length > 0) node.append(el("span", undefined, options.label));
  if (options.title !== undefined) {
    node.title = options.title;
    if (options.label.length === 0) node.setAttribute("aria-label", options.title);
  }
  if (options.onClick !== undefined) node.addEventListener("click", options.onClick);
  return node;
}

export function clearChildren(node: HTMLElement): void {
  node.replaceChildren();
}
