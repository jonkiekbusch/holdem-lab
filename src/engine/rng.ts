// Seedable random numbers, so any shuffle (and so any hand) can be replayed exactly.
// Not cryptographic; that's fine for play money.

export interface Rng {
  /** Random 32-bit unsigned integer. */
  uint32(): number;
  /** Random float in [0, 1). */
  float(): number;
  /** Random integer in [0, n) with no modulo bias. */
  int(n: number): number;
}

function hashSeed(str: string): [number, number, number, number] {
  // cyrb128: turns any string into four 32-bit numbers.
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

export function createRng(seed: string): Rng {
  let [a, b, c, d] = hashSeed(seed);
  // sfc32
  const uint32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 15; i++) uint32(); // warm up
  return {
    uint32,
    float: () => uint32() / 4294967296,
    int(n: number) {
      if (!Number.isInteger(n) || n <= 0 || n > 4294967296) throw new Error(`Bad range: ${n}`);
      const limit = 4294967296 - (4294967296 % n);
      let x = uint32();
      while (x >= limit) x = uint32();
      return x % n;
    },
  };
}

/** Fisher-Yates shuffle. Returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
