import type { Rgba8 } from "../core/color.js";
import type { Vec2 } from "../core/vec2.js";
import type { GeometryBatch } from "./batch.js";

const kVertexShader = `#version 300 es
in vec2 a_pos;
in vec4 a_color;
uniform vec2 u_resolution;
out vec4 v_color;
void main() {
  vec2 clip = vec2(a_pos.x / u_resolution.x * 2.0 - 1.0, 1.0 - a_pos.y / u_resolution.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
}`;

const kFragmentShader = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 out_color;
void main() {
  out_color = v_color;
}`;

const kFloatsPerVertex = 6;

export type GlRendererResult = { renderer: GlRenderer } | { error: string };

export class GlRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly indexBuffer: WebGLBuffer;
  private readonly resolution: WebGLUniformLocation;

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    vertexBuffer: WebGLBuffer,
    indexBuffer: WebGLBuffer,
    resolution: WebGLUniformLocation,
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.program = program;
    this.vertexBuffer = vertexBuffer;
    this.indexBuffer = indexBuffer;
    this.resolution = resolution;
  }

  static create(canvas: HTMLCanvasElement): GlRendererResult {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
    if (gl === null) return { error: "WebGL2 is not available in this browser" };

    try {
      const program = linkProgram(gl);
      const vertexBuffer = gl.createBuffer();
      const indexBuffer = gl.createBuffer();
      if (vertexBuffer === null || indexBuffer === null) {
        return { error: "could not create WebGL buffers" };
      }
      const resolution = gl.getUniformLocation(program, "u_resolution");
      if (resolution === null) return { error: "shader is missing u_resolution" };

      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      const posLocation = gl.getAttribLocation(program, "a_pos");
      const colorLocation = gl.getAttribLocation(program, "a_color");
      const stride = kFloatsPerVertex * 4;
      gl.enableVertexAttribArray(posLocation);
      gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(colorLocation);
      gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, stride, 8);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

      gl.useProgram(program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      return {
        renderer: new GlRenderer(canvas, gl, program, vertexBuffer, indexBuffer, resolution),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  setBackingSize(width: number, height: number): void {
    this.canvas.width = Math.max(0, Math.round(width));
    this.canvas.height = Math.max(0, Math.round(height));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  resizeToDisplaySize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(this.canvas.clientWidth * dpr);
    const height = Math.round(this.canvas.clientHeight * dpr);
    if (width !== this.canvas.width || height !== this.canvas.height) {
      this.setBackingSize(width, height);
    }
  }

  sizePx(): Vec2 {
    return { x: this.canvas.width, y: this.canvas.height };
  }

  clear(color: Rgba8): void {
    this.gl.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a / 255);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  drawBatch(batch: GeometryBatch): void {
    const indexCount = batch.indexCount();
    if (indexCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform2f(this.resolution, this.canvas.width, this.canvas.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, batch.vertexData(), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, batch.indices(), gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
  }

  present(): void {
    // The default framebuffer is presented by the browser at the end of the frame.
  }
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error("could not create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown shader error";
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${log}`);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, kVertexShader);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, kFragmentShader);
  const program = gl.createProgram();
  if (program === null) throw new Error("could not create program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "unknown link error";
    gl.deleteProgram(program);
    throw new Error(`program link failed: ${log}`);
  }
  return program;
}
