import { rgb, type Rgba8 } from "../core/color.js";

export interface Theme {
  outside: Rgba8;
  ground: Rgba8;
  grid: Rgba8;
  border: Rgba8;
}

export function sandTheme(): Theme {
  return {
    outside: rgb(0x2b2b2b),
    ground: rgb(0xe8dcc2),
    grid: rgb(0xd6c7a8),
    border: rgb(0x8c7a5b),
  };
}

const kColonyColors = [
  0xe04b3a,
  0xf2c12e,
  0x3a7be0,
  0x3daa5c,
  0x9b59b6,
  0xe67e22,
  0x1abc9c,
  0xe84393,
];

export function colonyColor(id: number): Rgba8 {
  const index = ((id % kColonyColors.length) + kColonyColors.length) % kColonyColors.length;
  return rgb(kColonyColors[index]);
}
