// Pure geometry for the colony sparklines, so it can be tested without a DOM.
// Returns an SVG path "M x y L x y ..." scaled into width x height with `pad`
// pixels of padding. An empty series gives ""; a flat series (including one
// point) draws a line at mid height; otherwise min and max come from the data.
export function sparklinePath(values: ArrayLike<number>, width: number, height: number, pad = 2): string {
  const n = values.length;
  if (n === 0) return "";
  const left = pad;
  const right = width - pad;
  const top = pad;
  const bottom = height - pad;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (n === 1 || max === min) {
    const y = round((top + bottom) / 2);
    return `M ${round(left)} ${y} L ${round(right)} ${y}`;
  }
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = left + (i * (right - left)) / (n - 1);
    const y = bottom - ((values[i] - min) / (max - min)) * (bottom - top);
    parts.push(`${i === 0 ? "M" : "L"} ${round(x)} ${round(y)}`);
  }
  return parts.join(" ");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
