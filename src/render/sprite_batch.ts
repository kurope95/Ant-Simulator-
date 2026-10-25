import type { Rgba8 } from "../core/color.js";
import { kAtlasHeight, kAtlasWidth, type AtlasFrame } from "./atlas.js";

const kFloatsPerVertex = 8;
const kVerticesPerQuad = 4;
const kIndicesPerQuad = 6;
const kInitialQuads = 1024;

export class SpriteBatch {
  private vertices = new Float32Array(kInitialQuads * kVerticesPerQuad * kFloatsPerVertex);
  private vertexIndices = new Uint32Array(kInitialQuads * kIndicesPerQuad);
  private quads = 0;

  clear(): void {
    this.quads = 0;
  }

  quadCount(): number {
    return this.quads;
  }

  vertexCount(): number {
    return this.quads * kVerticesPerQuad;
  }

  indexCount(): number {
    return this.quads * kIndicesPerQuad;
  }

  vertexData(): Float32Array {
    return this.vertices.subarray(0, this.vertexCount() * kFloatsPerVertex);
  }

  indices(): Uint32Array {
    return this.vertexIndices.subarray(0, this.indexCount());
  }

  addFrame(
    frame: AtlasFrame,
    cx: number,
    cy: number,
    w: number,
    h: number,
    rotation: number,
    tint: Rgba8,
  ): void {
    const u0 = frame.x / kAtlasWidth;
    const v0 = frame.y / kAtlasHeight;
    const u1 = (frame.x + frame.w) / kAtlasWidth;
    const v1 = (frame.y + frame.h) / kAtlasHeight;
    this.addQuad(cx, cy, w, h, u0, v0, u1, v1, rotation, tint);
  }

  addQuad(
    x: number,
    y: number,
    w: number,
    h: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    rotation: number,
    tint: Rgba8,
  ): void {
    this.reserve(this.quads + 1);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const halfW = w / 2;
    const halfH = h / 2;
    const r = tint.r / 255;
    const g = tint.g / 255;
    const b = tint.b / 255;
    const a = tint.a / 255;

    const corners = [
      { x: -halfW, y: -halfH, u: u0, v: v0 },
      { x: halfW, y: -halfH, u: u1, v: v0 },
      { x: halfW, y: halfH, u: u1, v: v1 },
      { x: -halfW, y: halfH, u: u0, v: v1 },
    ];

    const vertexBase = this.quads * kVerticesPerQuad;
    let at = vertexBase * kFloatsPerVertex;
    for (const corner of corners) {
      this.vertices[at++] = x + corner.x * cos - corner.y * sin;
      this.vertices[at++] = y + corner.x * sin + corner.y * cos;
      this.vertices[at++] = corner.u;
      this.vertices[at++] = corner.v;
      this.vertices[at++] = r;
      this.vertices[at++] = g;
      this.vertices[at++] = b;
      this.vertices[at++] = a;
    }

    const indexBase = this.quads * kIndicesPerQuad;
    this.vertexIndices[indexBase] = vertexBase;
    this.vertexIndices[indexBase + 1] = vertexBase + 1;
    this.vertexIndices[indexBase + 2] = vertexBase + 2;
    this.vertexIndices[indexBase + 3] = vertexBase;
    this.vertexIndices[indexBase + 4] = vertexBase + 2;
    this.vertexIndices[indexBase + 5] = vertexBase + 3;
    this.quads += 1;
  }

  private reserve(quads: number): void {
    if (quads * kVerticesPerQuad * kFloatsPerVertex <= this.vertices.length) return;
    let capacity = Math.max(kInitialQuads, this.quads * 2);
    while (capacity < quads) capacity *= 2;
    const vertices = new Float32Array(capacity * kVerticesPerQuad * kFloatsPerVertex);
    vertices.set(this.vertices);
    this.vertices = vertices;
    const indices = new Uint32Array(capacity * kIndicesPerQuad);
    indices.set(this.vertexIndices);
    this.vertexIndices = indices;
  }
}
