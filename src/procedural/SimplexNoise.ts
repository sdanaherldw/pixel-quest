// ------------------------------------------------------------------
// SimplexNoise – seeded 2D / 3D simplex noise
// ------------------------------------------------------------------
//
// A clean TypeScript implementation of the simplex noise algorithm
// using the standard skew / unskew approach with gradient tables.
//
// Used for terrain generation (overworld), shader noise textures,
// procedural decoration placement, and weather effects.
//
// Usage:
//   const noise = SimplexNoise.create(42);
//   const value = noise.noise2D(x, y);          // [-1, 1]
//   const anim  = noise.noise3D(x, y, time);    // [-1, 1]
//   const fbm   = noise.fractal2D(x, y, 6);     // layered noise
// ------------------------------------------------------------------

// ==================================================================
// Gradient tables
// ==================================================================

/** 2D gradient vectors (12 directions). */
const GRAD2: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [0.5, 1], [-0.5, 1], [0.5, -1], [-0.5, -1],
];

/** 3D gradient vectors (12 edge midpoints of a cube). */
const GRAD3: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

// ==================================================================
// Skew constants
// ==================================================================

// 2D
const F2 = 0.5 * (Math.sqrt(3) - 1);   // skew factor
const G2 = (3 - Math.sqrt(3)) / 6;      // unskew factor

// 3D
const F3 = 1 / 3;
const G3 = 1 / 6;

// ==================================================================
// SimplexNoise class
// ==================================================================

export class SimplexNoise {
  // ----------------------------------------------------------------
  // Permutation table (seeded)
  // ----------------------------------------------------------------

  private readonly _perm: Uint8Array;     // 512 entries (doubled for wrapping)
  private readonly _permMod12: Uint8Array; // _perm[i] % 12

  // ----------------------------------------------------------------
  // Constructor
  // ----------------------------------------------------------------

  /**
   * Create a new SimplexNoise instance.
   *
   * @param seed  An integer seed for the internal permutation table.
   *              The same seed always produces the same noise field.
   */
  constructor(seed: number = 0) {
    // Build a permutation table from a seeded PRNG.
    const perm = new Uint8Array(512);
    const permMod12 = new Uint8Array(512);

    // Start with the identity permutation 0..255.
    const source = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      source[i] = i;
    }

    // Use a simple but effective hash-based seeded shuffle (xorshift32).
    let s = SimplexNoise._hashSeed(seed);

    // Fisher-Yates shuffle driven by the seeded PRNG.
    for (let i = 255; i > 0; i--) {
      s = SimplexNoise._xorshift32(s);
      const j = (s >>> 0) % (i + 1);
      // Swap
      const tmp = source[i];
      source[i] = source[j];
      source[j] = tmp;
    }

    // Double the table to avoid index wrapping.
    for (let i = 0; i < 256; i++) {
      perm[i] = source[i];
      perm[i + 256] = source[i];
      permMod12[i] = source[i] % 12;
      permMod12[i + 256] = source[i] % 12;
    }

    this._perm = perm;
    this._permMod12 = permMod12;
  }

  // ----------------------------------------------------------------
  // Factory
  // ----------------------------------------------------------------

  /**
   * Create a new SimplexNoise instance with an optional seed.
   * If no seed is provided a pseudo-random one is generated.
   */
  static create(seed?: number): SimplexNoise {
    if (seed === undefined) {
      seed = (Math.random() * 0x7fffffff) | 0;
    }
    return new SimplexNoise(seed);
  }

  // ----------------------------------------------------------------
  // 2D Simplex Noise
  // ----------------------------------------------------------------

  /**
   * Evaluate 2D simplex noise at the given coordinates.
   *
   * @returns A value in the range [-1, 1].
   */
  noise2D(x: number, y: number): number {
    const perm = this._perm;
    const permMod12 = this._permMod12;

    // Skew input space to determine which simplex cell we are in.
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);

    const t = (i + j) * G2;

    // Unskew back to (x,y) space.
    const X0 = i - t;
    const Y0 = j - t;

    // Distances from cell origin.
    const x0 = x - X0;
    const y0 = y - Y0;

    // Determine which simplex we are in (upper or lower triangle).
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    // Offsets for middle and last corners in unskewed coords.
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    // Hash coordinates of the three simplex corners.
    const ii = i & 255;
    const jj = j & 255;

    // Calculate contribution from the three corners.
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;

    // Corner 0
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi0 = permMod12[ii + perm[jj]];
      t0 *= t0;
      n0 = t0 * t0 * (GRAD2[gi0][0] * x0 + GRAD2[gi0][1] * y0);
    }

    // Corner 1
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi1 = permMod12[ii + i1 + perm[jj + j1]];
      t1 *= t1;
      n1 = t1 * t1 * (GRAD2[gi1][0] * x1 + GRAD2[gi1][1] * y1);
    }

    // Corner 2
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi2 = permMod12[ii + 1 + perm[jj + 1]];
      t2 *= t2;
      n2 = t2 * t2 * (GRAD2[gi2][0] * x2 + GRAD2[gi2][1] * y2);
    }

    // Scale to [-1, 1]. The maximum value of the sum of three
    // contributions is ~0.022 with the 0.5-based kernel; the
    // traditional scaling factor is 70.
    return 70.0 * (n0 + n1 + n2);
  }

  // ----------------------------------------------------------------
  // 3D Simplex Noise
  // ----------------------------------------------------------------

  /**
   * Evaluate 3D simplex noise at the given coordinates.
   *
   * Useful for animated 2D noise by passing time as the z coordinate.
   *
   * @returns A value in the range [-1, 1].
   */
  noise3D(x: number, y: number, z: number): number {
    const perm = this._perm;
    const permMod12 = this._permMod12;

    // Skew the input space.
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);

    const t = (i + j + k) * G3;

    // Unskew.
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;

    const x0 = x - X0;
    const y0 = y - Y0;
    const z0 = z - Z0;

    // Determine which simplex we are in.
    let i1: number, j1: number, k1: number;
    let i2: number, j2: number, k2: number;

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }

    // Offsets for the four corners.
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;

    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;

    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;

    // Hash coordinates.
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    // Contributions from the four corners.
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let n3 = 0;

    // Corner 0
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) {
      const gi = permMod12[ii + perm[jj + perm[kk]]];
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi][0] * x0 + GRAD3[gi][1] * y0 + GRAD3[gi][2] * z0);
    }

    // Corner 1
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) {
      const gi = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi][0] * x1 + GRAD3[gi][1] * y1 + GRAD3[gi][2] * z1);
    }

    // Corner 2
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) {
      const gi = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi][0] * x2 + GRAD3[gi][1] * y2 + GRAD3[gi][2] * z2);
    }

    // Corner 3
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) {
      const gi = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]];
      t3 *= t3;
      n3 = t3 * t3 * (GRAD3[gi][0] * x3 + GRAD3[gi][1] * y3 + GRAD3[gi][2] * z3);
    }

    // Scale to [-1, 1].
    return 32.0 * (n0 + n1 + n2 + n3);
  }

  // ----------------------------------------------------------------
  // Fractal Brownian Motion (fBm)
  // ----------------------------------------------------------------

  /**
   * Layered 2D simplex noise using fractal Brownian motion.
   *
   * Combines multiple octaves of noise at increasing frequencies
   * and decreasing amplitudes to produce natural-looking terrain
   * and texture patterns.
   *
   * @param x            Sample x coordinate.
   * @param y            Sample y coordinate.
   * @param octaves      Number of noise layers (default 4).
   * @param lacunarity   Frequency multiplier per octave (default 2.0).
   * @param persistence  Amplitude multiplier per octave (default 0.5).
   * @returns A value roughly in [-1, 1] (normalised by total amplitude).
   */
  fractal2D(
    x: number,
    y: number,
    octaves: number = 4,
    lacunarity: number = 2.0,
    persistence: number = 0.5,
  ): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxAmplitude += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    // Normalise so the result stays in [-1, 1].
    return total / maxAmplitude;
  }

  // ----------------------------------------------------------------
  // Seeded PRNG helpers (static, internal)
  // ----------------------------------------------------------------

  /**
   * Mix a seed integer into a non-zero state for xorshift.
   * Ensures that seed 0 does not produce a degenerate sequence.
   */
  private static _hashSeed(seed: number): number {
    // Simple integer hash (similar to splitmix32 finaliser).
    let h = (seed | 0) + 0x9e3779b9;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    // xorshift32 requires a non-zero state.
    return h === 0 ? 1 : h;
  }

  /** Basic xorshift32 PRNG step. */
  private static _xorshift32(state: number): number {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state;
  }
}
