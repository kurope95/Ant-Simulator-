import { rgb, type Rgba8 } from "../core/color.js";

export interface Theme {
  outside: Rgba8;
  ground: Rgba8;
  grid: Rgba8;
  border: Rgba8;
  food: Rgba8;
  heatHome: Rgba8;
  heatFood: Rgba8;
}

export function sandTheme(): Theme {
  return {
    outside: rgb(0x2b2b2b),
    ground: rgb(0xe8dcc2),
    grid: rgb(0xd6c7a8),
    border: rgb(0x8c7a5b),
    food: rgb(0x6b8f3a),
    heatHome: rgb(0x3a7be0),
    heatFood: rgb(0xe04b3a),
  };
}

export function nightTheme(): Theme {
  return {
    outside: rgb(0x05070a),
    ground: rgb(0x0b0f14),
    grid: rgb(0x111823),
    border: rgb(0x1c2733),
    food: rgb(0x7fe08a),
    heatHome: rgb(0x2f7dff),
    heatFood: rgb(0xff8a3d),
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
