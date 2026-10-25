export function mix32(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

export function randU32(seed: number, uid: number, tick: number, stream: number): number {
  let h = mix32((seed ^ 0x9e3779b9) >>> 0);
  h = mix32((h ^ uid) >>> 0);
  h = mix32((h ^ (tick >>> 0)) >>> 0);
  h = mix32((h ^ stream) >>> 0);
  return h >>> 0;
}

export function randUnit(seed: number, uid: number, tick: number, stream: number): number {
  return randU32(seed, uid, tick, stream) / 4294967296;
}

export function randRange(
  seed: number,
  uid: number,
  tick: number,
  stream: number,
  lo: number,
  hi: number,
): number {
  return lo + (hi - lo) * randUnit(seed, uid, tick, stream);
}
