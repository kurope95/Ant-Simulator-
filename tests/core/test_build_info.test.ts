import test from "node:test";
import assert from "node:assert/strict";

import { buildInfo } from "../../src/core/build_info.js";

test("build_info: names the version and the browser stack", () => {
  const info = buildInfo();
  assert.ok(info.includes("AntSim 0.1.0"), info);
  assert.ok(info.includes("TypeScript"), info);
  assert.ok(info.includes("WebGL2"), info);
});
