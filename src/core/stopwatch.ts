export interface Stopwatch {
  restart(): void;
  elapsedMs(): number;
  elapsedSeconds(): number;
}

export function stopwatch(): Stopwatch {
  let start = performance.now();
  return {
    restart() {
      start = performance.now();
    },
    elapsedMs() {
      return performance.now() - start;
    },
    elapsedSeconds() {
      return (performance.now() - start) / 1000;
    },
  };
}
