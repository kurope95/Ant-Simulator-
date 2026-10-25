import type { Vec2 } from "../core/vec2.js";

export interface DebugInfo {
  fps: number;
  frameMs: number;
  renderer: string;
  displayScale: number;
  widthPx: number;
  heightPx: number;
  tick: number;
  stepsThisFrame: number;
  paused: boolean;
  cameraScale: number;
  cameraCenter: Vec2;
  alpha: number;
}

const kRows = ["fps", "renderer", "display", "output", "tick", "camera", "step"] as const;

export class DebugPanel {
  private readonly panel: HTMLDivElement;
  private readonly rows = new Map<string, HTMLDivElement>();
  private visible = true;

  constructor(root: HTMLElement) {
    root.replaceChildren();
    const panel = document.createElement("div");
    panel.className = "panel";

    const title = document.createElement("h2");
    title.textContent = "Debug";
    panel.appendChild(title);

    for (const key of kRows) {
      const row = document.createElement("div");
      row.className = "row";
      this.rows.set(key, row);
      panel.appendChild(row);
    }

    const hint = document.createElement("div");
    hint.className = "row hint";
    hint.textContent = "Wheel zoom | Right/middle drag pan | Home fit | P pause | Space step | H hide UI";
    panel.appendChild(hint);

    root.appendChild(panel);
    this.panel = panel;
  }

  update(info: DebugInfo): void {
    this.rows.get("fps")!.textContent = `FPS ${info.fps.toFixed(1)} (${info.frameMs.toFixed(2)} ms)`;
    this.rows.get("renderer")!.textContent = `Renderer ${info.renderer}`;
    this.rows.get("display")!.textContent = `Display scale ${info.displayScale.toFixed(2)}`;
    this.rows.get("output")!.textContent = `Output ${info.widthPx} x ${info.heightPx} px`;
    this.rows.get("tick")!.textContent =
      `Tick ${info.tick} (+${info.stepsThisFrame} this frame)${info.paused ? " paused" : ""}`;
    this.rows.get("camera")!.textContent =
      `Camera ${info.cameraScale.toFixed(2)} px/u at (${info.cameraCenter.x.toFixed(0)}, ${info.cameraCenter.y.toFixed(0)})`;
    this.rows.get("step")!.textContent = `Step ${info.alpha.toFixed(2)}`;
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.panel.style.display = visible ? "" : "none";
  }
}
