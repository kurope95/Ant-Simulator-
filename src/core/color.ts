export interface Rgba8 {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function rgba(r: number, g: number, b: number, a = 255): Rgba8 {
  return { r, g, b, a };
}

// Mixes two 0xRRGGBB colours: t = 0 gives a, t = 1 gives b.
export function mixHex(a: number, b: number, t: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const from = (a >> shift) & 0xff;
    const to = (b >> shift) & 0xff;
    out = (out << 8) | Math.round(from + (to - from) * t);
  }
  return out;
}

export function rgb(hex: number): Rgba8 {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
    a: 255,
  };
}
