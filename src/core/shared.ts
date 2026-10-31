// Typed arrays the simulation shares with its worker threads (M4.5). When a
// SharedArrayBuffer is available (Node always; a browser page only when it is
// cross-origin isolated, which tools/serve.mjs arranges) the arrays live on
// one, so workers can read and write the same memory; otherwise they are
// ordinary arrays and the simulation runs on one thread as before. Either way
// they behave and perform the same.

const kShared =
  typeof SharedArrayBuffer !== "undefined" &&
  (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated !== false;

export function sharedMemory(): boolean {
  return kShared;
}

function buffer(bytes: number): ArrayBuffer | SharedArrayBuffer {
  return kShared ? new SharedArrayBuffer(bytes) : new ArrayBuffer(bytes);
}

export function f32(length: number): Float32Array {
  return new Float32Array(buffer(length * 4));
}

export function i32(length: number): Int32Array {
  return new Int32Array(buffer(length * 4));
}

export function u32(length: number): Uint32Array {
  return new Uint32Array(buffer(length * 4));
}

export function u8(length: number): Uint8Array {
  return new Uint8Array(buffer(length));
}

export function i8(length: number): Int8Array {
  return new Int8Array(buffer(length));
}

type SharedKind = Float32Array | Int32Array | Uint32Array | Uint8Array | Int8Array;

// A new, zeroed array of the same kind as `array`, `length` long, shared like the rest.
export function sameKind<T extends SharedKind>(array: T, length: number): T {
  const Ctor = array.constructor as { new (memory: ArrayBuffer | SharedArrayBuffer): T; BYTES_PER_ELEMENT: number };
  return new Ctor(buffer(length * Ctor.BYTES_PER_ELEMENT));
}
