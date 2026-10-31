import { existsSync } from "node:fs";
import { join } from "node:path";

// Chrome is the only browser this project targets, and Smart App Control blocks
// unsigned binaries, so the trusted system install is the only acceptable source.
export function chromePath() {
  const candidates = [process.env.CHROME_PATH];
  if (process.platform === "win32") {
    candidates.push("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    if (process.env.LOCALAPPDATA) {
      candidates.push(join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"));
    }
  }
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error("Chrome not found; set CHROME_PATH");
  return found;
}

// The game window: Chrome when it is installed, otherwise Edge, which ships with
// Windows and runs the same engine (some PCs this project runs on have no Chrome).
export function browserPath() {
  try {
    return chromePath();
  } catch {
    const edge = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ].find((path) => existsSync(path));
    if (!edge) throw new Error("neither Chrome nor Edge found; set CHROME_PATH");
    return edge;
  }
}
