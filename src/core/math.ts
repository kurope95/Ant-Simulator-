export const kPi = Math.PI;
export const kTwoPi = 2 * Math.PI;

export function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

export function wrapAngle(angle: number): number {
  let wrapped = angle - Math.round(angle / kTwoPi) * kTwoPi;
  if (wrapped <= -kPi) wrapped += kTwoPi;
  return wrapped;
}

export function angleDiff(from: number, to: number): number {
  return wrapAngle(to - from);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}
