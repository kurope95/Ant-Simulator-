export class FixedStepClock {
  private readonly step: number;
  private readonly maxSteps: number;
  private acc = 0;

  constructor(stepSeconds: number, maxStepsPerFrame: number) {
    this.step = stepSeconds;
    this.maxSteps = Math.max(1, Math.floor(maxStepsPerFrame));
  }

  advance(frameSeconds: number, speed: number): number {
    if (speed <= 0) return 0;
    this.acc += Math.max(frameSeconds, 0) * speed;
    let steps = 0;
    while (this.acc + 1e-9 >= this.step && steps < this.maxSteps) {
      this.acc -= this.step;
      steps += 1;
    }
    if (steps === this.maxSteps && this.acc >= this.step) {
      this.acc = this.acc % this.step;
    }
    this.acc = Math.max(this.acc, 0);
    return steps;
  }

  alpha(): number {
    return Math.min(this.acc / this.step, 0.999999);
  }

  stepSeconds(): number {
    return this.step;
  }

  reset(): void {
    this.acc = 0;
  }
}
