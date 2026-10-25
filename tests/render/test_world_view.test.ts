import test from "node:test";
import assert from "node:assert/strict";

import { disposeWorldRenderCache } from "../../src/render/world_view.js";

test("world view: disposing a cache deletes its owned textures and nulls them", () => {
  const terrain = {} as WebGLTexture;
  const heatmap = {} as WebGLTexture;
  const cache = { terrainTexture: terrain, heatmapTexture: heatmap };
  const deleted: (WebGLTexture | null)[] = [];
  const renderer = {
    deleteTexture(texture: WebGLTexture | null): void {
      deleted.push(texture);
    },
  };

  disposeWorldRenderCache(renderer, cache);

  assert.deepEqual(deleted, [terrain, heatmap]);
  assert.equal(cache.terrainTexture, null);
  assert.equal(cache.heatmapTexture, null);
});
