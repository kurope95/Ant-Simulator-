import type { Rgba8 } from "../core/color.js";
import type { Vec2 } from "../core/vec2.js";
import type { Theme } from "./theme.js";

// Ground, rocks, water, sand and mud, drawn per screen pixel from the obstacle mask.
// It runs behind the textured-quad vertex shader: v_uv goes 0..1 across the world, row 0 at the top.
export const kTerrainFragmentShader = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_mask;      // R rock, G water, B sand, A mud
uniform vec2 u_world;          // world size (u)
uniform float u_cell;          // mask texel (u)
uniform float u_time;          // seconds
uniform vec3 u_groundA, u_groundB, u_rockDark, u_rockLight, u_waterShallow, u_waterDeep, u_sand, u_mud;
out vec4 out_color;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);   // quintic fade: no creases on lattice lines
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm3(vec2 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 17.1) + 0.125 * vnoise(p * 4.11 + 31.7); }
float cover(float m, float soft) { return smoothstep(0.5 - soft, 0.5 + soft, m); }

void main() {
  vec2 w = v_uv * u_world;                                   // world position
  float px = max(fwidth(w.x), fwidth(w.y));                  // world units per screen pixel
  float soft = clamp(px / (2.0 * u_cell), 0.01, 0.35);       // ~1 px anti-aliased edges
  float detail = 1.0 - smoothstep(0.25, 1.2, px);            // fine grain only when zoomed in
  float lod = max(0.0, log2(px / u_cell));                   // mask mip level for one screen pixel

  vec3 col = mix(u_groundA, u_groundB, smoothstep(0.3, 0.7, fbm3(w * 0.0035)));
  col *= 0.93 + 0.14 * mix(0.5, vnoise(w * 0.8), detail);

  // Open ground: the coarse mip is empty, so no obstacle lies within about 16 u and the edge work below cannot change this pixel.
  if (dot(textureLod(u_mask, v_uv, 3.0), vec4(1.0)) == 0.0) {
    out_color = vec4(col, 1.0);
    return;
  }

  vec2 warp = (vec2(fbm3(w * 0.05), fbm3(w * 0.05 + 23.0)) - 0.4375) * 3.4;   // organic edges, ±1.5 u
  vec2 muv = (w + warp) / u_world;
  // Four taps half a texel apart, averaged, so shores round off instead of stepping at cell edges.
  vec2 halfTexel = 0.5 * u_cell / u_world;
  vec4 m = 0.25 * (textureLod(u_mask, muv + vec2(-halfTexel.x, -halfTexel.y), lod) + textureLod(u_mask, muv + vec2(halfTexel.x, -halfTexel.y), lod)
                 + textureLod(u_mask, muv + vec2(-halfTexel.x, halfTexel.y), lod) + textureLod(u_mask, muv + vec2(halfTexel.x, halfTexel.y), lod));
  float rock = cover(m.r, soft), water = cover(m.g, soft), sand = cover(m.b, soft), mud = cover(m.a, soft);

  if (sand > 0.0) {
    float ripple = 0.5 + 0.5 * sin(w.x * 0.45 + w.y * 0.12 + fbm3(w * 0.04) * 7.0);
    col = mix(col, u_sand * (1.0 + 0.15 * (ripple - 0.5) * detail), sand * 0.8);
  }
  if (mud > 0.0) col = mix(col, u_mud * (0.8 + 0.35 * fbm3(w * 0.15)), mud * 0.85);

  vec2 toLight = vec2(-0.7071, -0.7071);                     // light from the top-left
  float shade = cover(textureLod(u_mask, muv + toLight * 6.0 / u_world, 1.5).r, 0.3);
  col *= 1.0 - 0.38 * shade * (1.0 - rock) * (1.0 - water); // rock shadows fall bottom-right

  if (water > 0.0) {
    float depth = smoothstep(0.5, 1.0, textureLod(u_mask, muv, 2.5).g);
    vec3 wc = mix(u_waterShallow, u_waterDeep, depth);
    wc += vec3(0.05, 0.07, 0.07) * smoothstep(0.55, 0.75, fbm3(w * 0.07 + vec2(u_time * 0.12, u_time * 0.08)));
    float foam = smoothstep(0.38, 0.5, m.g) * (1.0 - smoothstep(0.5, 0.66, m.g));
    col = mix(col, mix(wc, vec3(0.78, 0.88, 0.86), foam * 0.4), water);
  }

  if (rock > 0.0) {
    vec2 t = vec2(u_cell) / u_world;                         // one cell in uv
    // textureLod, not texture: implicit derivatives are undefined inside this branch
    float gx = textureLod(u_mask, muv + vec2(t.x, 0), 0.0).r - textureLod(u_mask, muv - vec2(t.x, 0), 0.0).r;
    float gy = textureLod(u_mask, muv + vec2(0, t.y), 0.0).r - textureLod(u_mask, muv - vec2(0, t.y), 0.0).r;
    vec3 n = normalize(vec3(-gx, -gy, 0.55));                // edges tilt outward
    float lit = clamp(dot(n, normalize(vec3(toLight, 0.9))), 0.0, 1.0);
    float stone = 0.65 * fbm3(w * 0.22) + 0.35 * mix(0.5, vnoise(w * 1.1), detail);
    vec3 rc = mix(u_rockDark, u_rockLight, 0.25 + 0.75 * lit) * (0.82 + 0.3 * stone);
    rc *= 1.0 - 0.22 * smoothstep(0.6, 0.68, vnoise(w * 0.3));                  // cracks
    col = mix(col, rc, rock);
  }
  out_color = vec4(col, 1.0);
}`;

export interface TerrainLook {
  world: Vec2;
  cell: number;
  time: number;
  groundA: Rgba8;
  groundB: Rgba8;
  rockDark: Rgba8;
  rockLight: Rgba8;
  waterShallow: Rgba8;
  waterDeep: Rgba8;
  sand: Rgba8;
  mud: Rgba8;
}

export function terrainLook(theme: Theme, world: Vec2, cell: number, time: number): TerrainLook {
  return {
    world,
    cell,
    time,
    groundA: theme.groundA,
    groundB: theme.groundB,
    rockDark: theme.rockDark,
    rockLight: theme.rockLight,
    waterShallow: theme.waterShallow,
    waterDeep: theme.waterDeep,
    sand: theme.sand,
    mud: theme.mud,
  };
}

type TerrainUniformName =
  | "u_mask"
  | "u_world"
  | "u_cell"
  | "u_time"
  | "u_groundA"
  | "u_groundB"
  | "u_rockDark"
  | "u_rockLight"
  | "u_waterShallow"
  | "u_waterDeep"
  | "u_sand"
  | "u_mud";

export type TerrainUniforms = Record<TerrainUniformName, WebGLUniformLocation>;

const kTerrainUniformNames: readonly TerrainUniformName[] = [
  "u_mask",
  "u_world",
  "u_cell",
  "u_time",
  "u_groundA",
  "u_groundB",
  "u_rockDark",
  "u_rockLight",
  "u_waterShallow",
  "u_waterDeep",
  "u_sand",
  "u_mud",
];

export function terrainUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): TerrainUniforms | null {
  const found: Partial<TerrainUniforms> = {};
  for (const name of kTerrainUniformNames) {
    const location = gl.getUniformLocation(program, name);
    if (location === null) return null;
    found[name] = location;
  }
  return found as TerrainUniforms;
}

function setColor(gl: WebGL2RenderingContext, location: WebGLUniformLocation, color: Rgba8): void {
  gl.uniform3f(location, color.r / 255, color.g / 255, color.b / 255);
}

export function setTerrainUniforms(gl: WebGL2RenderingContext, u: TerrainUniforms, look: TerrainLook): void {
  gl.uniform1i(u.u_mask, 0);
  gl.uniform2f(u.u_world, look.world.x, look.world.y);
  gl.uniform1f(u.u_cell, look.cell);
  gl.uniform1f(u.u_time, look.time);
  setColor(gl, u.u_groundA, look.groundA);
  setColor(gl, u.u_groundB, look.groundB);
  setColor(gl, u.u_rockDark, look.rockDark);
  setColor(gl, u.u_rockLight, look.rockLight);
  setColor(gl, u.u_waterShallow, look.waterShallow);
  setColor(gl, u.u_waterDeep, look.waterDeep);
  setColor(gl, u.u_sand, look.sand);
  setColor(gl, u.u_mud, look.mud);
}
