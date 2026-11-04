/**
 * 可序列化的种子随机数（mulberry32）。
 * 状态存进存档，读档后随机序列可以接着走，单元测试和批量模拟也能复现。
 */
export class Rng {
  constructor(public state: number) {}

  static fromSeed(seed: number): Rng {
    return new Rng(seed >>> 0);
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] 闭区间整数 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pickWeighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
    const total = items.reduce((sum, it) => sum + Math.max(0, weight(it)), 0);
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }
}
