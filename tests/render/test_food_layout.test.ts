import test from "node:test";
import assert from "node:assert/strict";
import { foodPieceCount, foodPieces, kMaxFoodPieces } from "../../src/render/food_layout.js";

test("food pieces: one per 100 units, capped at 48, infinite always full", () => {
  assert.equal(foodPieceCount(0, false), 0);
  assert.equal(foodPieceCount(1, false), 1);
  assert.equal(foodPieceCount(100, false), 1);
  assert.equal(foodPieceCount(101, false), 2);
  assert.equal(foodPieceCount(100000, false), kMaxFoodPieces);
  assert.equal(foodPieceCount(0, true), kMaxFoodPieces);
});

test("food pieces: shrinking a pile removes only the outermost pieces", () => {
  const all = foodPieces(42, { x: 100, y: 100 }, 40, 4800, false);
  const less = foodPieces(42, { x: 100, y: 100 }, 40, 800, false);
  assert.equal(all.length, 48);
  assert.equal(less.length, 8);
  assert.deepEqual(less, all.slice(0, 8));
});

test("food pieces: zero draws nothing and every piece is inside the radius", () => {
  assert.deepEqual(foodPieces(7, { x: 0, y: 0 }, 20, 0, false), []);
  const pieces = foodPieces(7, { x: 100, y: 100 }, 40, 4800, false);
  for (const piece of pieces) {
    assert.ok(Math.hypot(piece.x - 100, piece.y - 100) <= 40);
    assert.ok(piece.rotation >= 0 && piece.rotation < Math.PI * 2);
    assert.ok(Number.isInteger(piece.variant) && piece.variant >= 0 && piece.variant < 4);
    assert.ok(Number.isFinite(piece.x) && Number.isFinite(piece.y));
  }
});

test("food pieces: layout is deterministic per uid", () => {
  assert.deepEqual(foodPieces(9, { x: 1, y: 2 }, 30, 2000, false), foodPieces(9, { x: 1, y: 2 }, 30, 2000, false));
  assert.notDeepEqual(foodPieces(9, { x: 1, y: 2 }, 30, 2000, false), foodPieces(10, { x: 1, y: 2 }, 30, 2000, false));
});
