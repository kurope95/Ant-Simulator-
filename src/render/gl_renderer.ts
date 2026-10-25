import type { Rgba8 } from "../core/color.js";
import type { Rect } from "../core/rect.js";
import type { Vec2 } from "../core/vec2.js";
import type { GeometryBatch } from "./batch.js";
import type { SpriteBatch } from "./sprite_batch.js";

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

const kTextureVertexShader = `#version 300 es
in vec2 a_quad;
uniform vec2 u_resolution;
uniform vec4 u_rect;
out vec2 v_uv;
void main() {
  v_uv = a_quad;
  vec2 pos = u_rect.xy + a_quad * u_rect.zw;
  vec2 clip = vec2(pos.x / u_resolution.x * 2.0 - 1.0, 1.0 - pos.y / u_resolution.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const kTextureFragmentShader = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 out_color;
void main() {
  out_color = texture(u_texture, v_uv);
}`;

const kFloatsPerVertex = 6;

const kSpriteVertexShader = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
in vec4 a_color;
uniform vec2 u_resolution;
out vec2 v_uv;
out vec4 v_color;
void main() {
  vec2 clip = vec2(a_pos.x / u_resolution.x * 2.0 - 1.0, 1.0 - a_pos.y / u_resolution.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}`;

const kSpriteFragmentShader = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_color;
uniform sampler2D u_texture;
out vec4 out_color;
void main() {
  out_color = texture(u_texture, v_uv) * v_color;
}`;

export type GlRendererResult = { renderer: GlRenderer } | { error: string };

export class GlRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly indexBuffer: WebGLBuffer;
  private readonly resolution: WebGLUniformLocation;
  private readonly batchVao: WebGLVertexArrayObject;
  private readonly textureProgram: WebGLProgram;
  private readonly quadBuffer: WebGLBuffer;
  private readonly quadVao: WebGLVertexArrayObject;
  private readonly textureResolution: WebGLUniformLocation;
  private readonly textureRect: WebGLUniformLocation;
  private readonly spriteProgram: WebGLProgram;
  private readonly spriteVertexBuffer: WebGLBuffer;
  private readonly spriteIndexBuffer: WebGLBuffer;
  private readonly spriteVao: WebGLVertexArrayObject;
  private readonly spriteResolution: WebGLUniformLocation;

  private constructor(init: {
    canvas: HTMLCanvasElement;
    gl: WebGL2RenderingContext;
    program: WebGLProgram;
    vertexBuffer: WebGLBuffer;
    indexBuffer: WebGLBuffer;
    resolution: WebGLUniformLocation;
    batchVao: WebGLVertexArrayObject;
    textureProgram: WebGLProgram;
    quadBuffer: WebGLBuffer;
    quadVao: WebGLVertexArrayObject;
    textureResolution: WebGLUniformLocation;
    textureRect: WebGLUniformLocation;
    spriteProgram: WebGLProgram;
    spriteVertexBuffer: WebGLBuffer;
    spriteIndexBuffer: WebGLBuffer;
    spriteVao: WebGLVertexArrayObject;
    spriteResolution: WebGLUniformLocation;
  }) {
    this.canvas = init.canvas;
    this.gl = init.gl;
    this.program = init.program;
    this.vertexBuffer = init.vertexBuffer;
    this.indexBuffer = init.indexBuffer;
    this.resolution = init.resolution;
    this.batchVao = init.batchVao;
    this.textureProgram = init.textureProgram;
    this.quadBuffer = init.quadBuffer;
    this.quadVao = init.quadVao;
    this.textureResolution = init.textureResolution;
    this.textureRect = init.textureRect;
    this.spriteProgram = init.spriteProgram;
    this.spriteVertexBuffer = init.spriteVertexBuffer;
    this.spriteIndexBuffer = init.spriteIndexBuffer;
    this.spriteVao = init.spriteVao;
    this.spriteResolution = init.spriteResolution;
  }

  static create(canvas: HTMLCanvasElement): GlRendererResult {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
    if (gl === null) return { error: "WebGL2 is not available in this browser" };

    try {
      const program = linkProgram(gl, kVertexShader, kFragmentShader);
      const vertexBuffer = gl.createBuffer();
      const indexBuffer = gl.createBuffer();
      const batchVao = gl.createVertexArray();
      if (vertexBuffer === null || indexBuffer === null || batchVao === null) {
        return { error: "could not create WebGL buffers" };
      }
      const resolution = gl.getUniformLocation(program, "u_resolution");
      if (resolution === null) return { error: "shader is missing u_resolution" };

      gl.bindVertexArray(batchVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      const posLocation = gl.getAttribLocation(program, "a_pos");
      const colorLocation = gl.getAttribLocation(program, "a_color");
      const stride = kFloatsPerVertex * 4;
      gl.enableVertexAttribArray(posLocation);
      gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(colorLocation);
      gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, stride, 8);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bindVertexArray(null);

      const textureProgram = linkProgram(gl, kTextureVertexShader, kTextureFragmentShader);
      const quadBuffer = gl.createBuffer();
      const quadVao = gl.createVertexArray();
      if (quadBuffer === null || quadVao === null) {
        return { error: "could not create the texture quad buffers" };
      }
      const textureResolution = gl.getUniformLocation(textureProgram, "u_resolution");
      const textureRect = gl.getUniformLocation(textureProgram, "u_rect");
      if (textureResolution === null || textureRect === null) {
        return { error: "texture shader is missing its uniforms" };
      }

      gl.bindVertexArray(quadVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const quadLocation = gl.getAttribLocation(textureProgram, "a_quad");
      gl.enableVertexAttribArray(quadLocation);
      gl.vertexAttribPointer(quadLocation, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      gl.useProgram(textureProgram);
      gl.uniform1i(gl.getUniformLocation(textureProgram, "u_texture"), 0);

      const spriteProgram = linkProgram(gl, kSpriteVertexShader, kSpriteFragmentShader);
      const spriteVertexBuffer = gl.createBuffer();
      const spriteIndexBuffer = gl.createBuffer();
      const spriteVao = gl.createVertexArray();
      if (spriteVertexBuffer === null || spriteIndexBuffer === null || spriteVao === null) {
        return { error: "could not create the sprite buffers" };
      }
      const spriteResolution = gl.getUniformLocation(spriteProgram, "u_resolution");
      if (spriteResolution === null) return { error: "sprite shader is missing u_resolution" };

      gl.bindVertexArray(spriteVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, spriteVertexBuffer);
      const spritePosLocation = gl.getAttribLocation(spriteProgram, "a_pos");
      const spriteUvLocation = gl.getAttribLocation(spriteProgram, "a_uv");
      const spriteColorLocation = gl.getAttribLocation(spriteProgram, "a_color");
      const spriteStride = 8 * 4;
      gl.enableVertexAttribArray(spritePosLocation);
      gl.vertexAttribPointer(spritePosLocation, 2, gl.FLOAT, false, spriteStride, 0);
      gl.enableVertexAttribArray(spriteUvLocation);
      gl.vertexAttribPointer(spriteUvLocation, 2, gl.FLOAT, false, spriteStride, 8);
      gl.enableVertexAttribArray(spriteColorLocation);
      gl.vertexAttribPointer(spriteColorLocation, 4, gl.FLOAT, false, spriteStride, 16);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spriteIndexBuffer);
      gl.bindVertexArray(null);

      gl.useProgram(spriteProgram);
      gl.uniform1i(gl.getUniformLocation(spriteProgram, "u_texture"), 0);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      return {
        renderer: new GlRenderer({
          canvas,
          gl,
          program,
          vertexBuffer,
          indexBuffer,
          resolution,
          batchVao,
          textureProgram,
          quadBuffer,
          quadVao,
          textureResolution,
          textureRect,
          spriteProgram,
          spriteVertexBuffer,
          spriteIndexBuffer,
          spriteVao,
          spriteResolution,
        }),
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
    gl.bindVertexArray(this.batchVao);
    gl.useProgram(this.program);
    gl.uniform2f(this.resolution, this.canvas.width, this.canvas.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, batch.vertexData(), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, batch.indices(), gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  drawSprites(texture: WebGLTexture, batch: SpriteBatch): void {
    const indexCount = batch.indexCount();
    if (indexCount === 0) return;
    const gl = this.gl;
    gl.bindVertexArray(this.spriteVao);
    gl.useProgram(this.spriteProgram);
    gl.uniform2f(this.spriteResolution, this.canvas.width, this.canvas.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, batch.vertexData(), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.spriteIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, batch.indices(), gl.DYNAMIC_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  createTexture(): WebGLTexture | null {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (texture === null) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  updateTexture(texture: WebGLTexture, width: number, height: number, rgba: Uint8Array): void {
    const gl = this.gl;
    // GL's first data row is texture v = 0, and the quad maps v = 0 to the
    // rect's top edge, so row 0 lands at the top without a flip. (Plan Task 9
    // prescribed UNPACK_FLIP_Y_WEBGL = true, which would turn the heatmap
    // upside down; ruled against — see the M1 ledger.)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }

  drawTexture(texture: WebGLTexture, rect: Rect): void {
    const width = rect.max.x - rect.min.x;
    const height = rect.max.y - rect.min.y;
    if (width <= 0 || height <= 0) return;
    const gl = this.gl;
    gl.bindVertexArray(this.quadVao);
    gl.useProgram(this.textureProgram);
    gl.uniform2f(this.textureResolution, this.canvas.width, this.canvas.height);
    gl.uniform4f(this.textureRect, rect.min.x, rect.min.y, width, height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
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

function linkProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
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
