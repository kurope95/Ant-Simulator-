export interface Rgba8 {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function rgba(r: number, g: number, b: number, a = 255): Rgba8 {
  return { r, g, b, a };
}

export function rgb(hex: number): Rgba8 {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
    a: 255,
  };
}
