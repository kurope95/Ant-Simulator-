export interface SampleSummary {
  avg: number;
  p95: number;
}

export function summarize(samples: readonly number[]): SampleSummary {
  if (samples.length === 0) return { avg: 0, p95: 0 };
  let sum = 0;
  for (const sample of samples) sum += sample;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(0.95 * sorted.length) - 1);
  return { avg: sum / samples.length, p95: sorted[index] };
}
