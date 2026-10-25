export interface ColonyPaletteEntry {
  readonly name: string;
  readonly hex: number;
}

export const COLONY_PALETTE: readonly ColonyPaletteEntry[] = [
  { name: "Ember", hex: 0xe2603f },
  { name: "Gold", hex: 0xd9a441 },
  { name: "Azure", hex: 0x4c8dde },
  { name: "Fern", hex: 0x5fae6b },
  { name: "Orchid", hex: 0xa26bd8 },
  { name: "Rose", hex: 0xdf7590 },
  { name: "Lagoon", hex: 0x34b3a0 },
  { name: "Chalk", hex: 0xcfc6b4 },
];

function wrapIndex(index: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.trunc(index) % COLONY_PALETTE.length;
}

export function colonyHex(index: number): number {
  return COLONY_PALETTE[wrapIndex(index)].hex;
}

export function colonyName(index: number): string {
  return COLONY_PALETTE[wrapIndex(index)].name;
}

export function firstFreeColor(used: readonly number[]): number {
  for (let i = 0; i < COLONY_PALETTE.length; i++) {
    if (!used.includes(i)) return i;
  }
  return 0;
}
