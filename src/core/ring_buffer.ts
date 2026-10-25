export class RingBuffer<T> {
  private readonly data: (T | undefined)[];
  private count = 0;
  private head = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`RingBuffer capacity must be an integer >= 1, got ${capacity}`);
    }
    this.data = new Array<T | undefined>(capacity);
  }

  push(value: T): void {
    if (this.count < this.data.length) {
      this.data[(this.head + this.count) % this.data.length] = value;
      this.count += 1;
      return;
    }
    this.data[this.head] = value;
    this.head = (this.head + 1) % this.data.length;
  }

  size(): number {
    return this.count;
  }

  get(index: number): T {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) {
      throw new RangeError(`RingBuffer index ${index} outside 0..${this.count - 1}`);
    }
    return this.data[(this.head + index) % this.data.length]!;
  }
}
