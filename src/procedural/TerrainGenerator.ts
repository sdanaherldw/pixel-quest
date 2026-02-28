// ------------------------------------------------------------------
// TerrainGenerator – procedural biome map using layered simplex noise
// ------------------------------------------------------------------
//
// Generates a 2D grid of BiomeType values for each game region.
// Three noise layers (elevation, moisture, temperature) are combined
// to produce natural-looking terrain with biome diversity.
//
// Usage:
//   const grid = TerrainGenerator.generate({ seed: 42, width: 200, height: 200 });
//   const region = TerrainGenerator.generateRegion('elderwood', 42);
// ------------------------------------------------------------------

import { SimplexNoise } from '@/procedural/SimplexNoise';

// ==================================================================
// Biome types
// ==================================================================

/** All possible terrain biome types in the game world. */
export enum BiomeType {
  PLAINS = 'plains',
  FOREST = 'forest',
  DENSE_FOREST = 'dense_forest',
  MOUNTAIN = 'mountain',
  WATER = 'water',
  DEEP_WATER = 'deep_water',
  SAND = 'sand',
  SWAMP = 'swamp',
  SNOW = 'snow',
  VOLCANIC = 'volcanic',
  RUINS = 'ruins',
}

// ==================================================================
// Configuration
// ==================================================================

/** Parameters that control terrain generation. */
export interface TerrainConfig {
  /** PRNG seed – same seed always produces the same map. */
  seed: number;

  /** Grid width in tiles. */
  width: number;

  /** Grid height in tiles. */
  height: number;

  /** Noise sampling scale (lower = smoother terrain). @default 0.005 */
  scale: number;

  /** Elevation threshold below which tiles become water. @default 0.35 */
  oceanLevel: number;

  /** Elevation threshold above which tiles become mountain / snow. @default 0.72 */
  mountainLevel: number;

  /** Probability multiplier for forest placement (0–1). @default 0.5 */
  forestDensity: number;
}

/** Tile size in pixels used for world-space calculations. */
export const TILE_SIZE = 32;

/** Default region grid size (200x200 tiles = 6400x6400 px). */
const REGION_SIZE = 200;

// ==================================================================
// Region presets
// ==================================================================

/** Valid region preset identifiers. */
export type RegionPreset =
  | 'elderwood'
  | 'frostpeak'
  | 'scorched-wastes'
  | 'shadowmire'
  | 'cinder-core';

/** Internal preset overrides applied on top of default config. */
interface PresetOverrides {
  scale: number;
  oceanLevel: number;
  mountainLevel: number;
  forestDensity: number;
  /** Optional post-processing step applied after base generation. */
  postProcess?: (grid: BiomeType[][], noise: SimplexNoise, config: TerrainConfig) => void;
}

// ------------------------------------------------------------------
// Preset definitions
// ------------------------------------------------------------------

const PRESETS: Record<RegionPreset, PresetOverrides> = {
  // Elderwood Forest: dense forests, rivers, gentle hills, occasional ruins
  elderwood: {
    scale: 0.006,
    oceanLevel: 0.30,
    mountainLevel: 0.78,
    forestDensity: 0.70,
    postProcess: (grid, noise, config) => {
      // Carve rivers through the terrain
      _carveRivers(grid, noise, config, 3);
      // Scatter ruins markers in forest areas
      _scatterBiome(grid, noise, config, BiomeType.RUINS, 0.003, BiomeType.FOREST);
      _scatterBiome(grid, noise, config, BiomeType.RUINS, 0.002, BiomeType.DENSE_FOREST);
    },
  },

  // Frostpeak Mountains: mountains, snow, ice lakes, narrow valleys
  frostpeak: {
    scale: 0.005,
    oceanLevel: 0.25,
    mountainLevel: 0.55,
    forestDensity: 0.15,
    postProcess: (grid, _noise, config) => {
      // Convert water to ice (still WATER biome visually), and
      // shift most plains / forests to snow at higher latitudes.
      for (let y = 0; y < config.height; y++) {
        const latFactor = 1 - y / config.height; // colder towards top
        for (let x = 0; x < config.width; x++) {
          const tile = grid[y][x];
          if (latFactor > 0.3 && tile === BiomeType.PLAINS) {
            grid[y][x] = BiomeType.SNOW;
          }
          if (latFactor > 0.5 && tile === BiomeType.FOREST) {
            grid[y][x] = BiomeType.SNOW;
          }
        }
      }
    },
  },

  // Scorched Wastes: desert, sand dunes, volcanic vents, oases
  'scorched-wastes': {
    scale: 0.004,
    oceanLevel: 0.15,
    mountainLevel: 0.80,
    forestDensity: 0.02,
    postProcess: (grid, noise, config) => {
      // Replace most biomes with sand, keep low water as oases
      for (let y = 0; y < config.height; y++) {
        for (let x = 0; x < config.width; x++) {
          const tile = grid[y][x];
          if (tile === BiomeType.PLAINS || tile === BiomeType.FOREST || tile === BiomeType.DENSE_FOREST) {
            grid[y][x] = BiomeType.SAND;
          }
          if (tile === BiomeType.MOUNTAIN) {
            // Some mountains become volcanic vents
            const v = noise.noise2D(x * 0.05 + 500, y * 0.05 + 500);
            grid[y][x] = v > 0.3 ? BiomeType.VOLCANIC : BiomeType.MOUNTAIN;
          }
          if (tile === BiomeType.SNOW) {
            grid[y][x] = BiomeType.SAND;
          }
        }
      }
    },
  },

  // Shadowmire Swamp: swamp, dark water, dead trees, fog-heavy
  shadowmire: {
    scale: 0.007,
    oceanLevel: 0.40,
    mountainLevel: 0.85,
    forestDensity: 0.35,
    postProcess: (grid, noise, config) => {
      // Convert plains near water to swamp, darken forests
      for (let y = 0; y < config.height; y++) {
        for (let x = 0; x < config.width; x++) {
          const tile = grid[y][x];
          const moisture = (noise.fractal2D(
            x * config.scale + 1000,
            y * config.scale + 1000,
            4,
          ) + 1) / 2;

          if (tile === BiomeType.PLAINS && moisture > 0.45) {
            grid[y][x] = BiomeType.SWAMP;
          }
          if (tile === BiomeType.FOREST && moisture > 0.5) {
            grid[y][x] = BiomeType.SWAMP;
          }
          // Make water darker (DEEP_WATER) in high-moisture areas
          if (tile === BiomeType.WATER && moisture > 0.6) {
            grid[y][x] = BiomeType.DEEP_WATER;
          }
          if (tile === BiomeType.SNOW) {
            grid[y][x] = BiomeType.SWAMP;
          }
        }
      }
    },
  },

  // Cinder Core: volcanic, lava rivers, obsidian plains, fire geysers
  'cinder-core': {
    scale: 0.005,
    oceanLevel: 0.28,
    mountainLevel: 0.60,
    forestDensity: 0.0,
    postProcess: (grid, noise, config) => {
      for (let y = 0; y < config.height; y++) {
        for (let x = 0; x < config.width; x++) {
          const tile = grid[y][x];
          // Water becomes lava (rendered differently but uses DEEP_WATER for flow)
          if (tile === BiomeType.WATER || tile === BiomeType.DEEP_WATER) {
            grid[y][x] = BiomeType.VOLCANIC;
          }
          // Plains become obsidian plains (PLAINS with volcanic tint)
          if (tile === BiomeType.FOREST || tile === BiomeType.DENSE_FOREST) {
            grid[y][x] = BiomeType.PLAINS;
          }
          if (tile === BiomeType.SNOW) {
            grid[y][x] = BiomeType.MOUNTAIN;
          }
          if (tile === BiomeType.SAND || tile === BiomeType.SWAMP) {
            grid[y][x] = BiomeType.PLAINS;
          }
          // Mountains stay; scatter volcanic vents
          if (tile === BiomeType.MOUNTAIN) {
            const v = noise.noise2D(x * 0.08 + 300, y * 0.08 + 300);
            if (v > 0.2) {
              grid[y][x] = BiomeType.VOLCANIC;
            }
          }
        }
      }
      // Carve lava rivers
      _carveRivers(grid, noise, config, 4, BiomeType.VOLCANIC);
    },
  },
};

// ==================================================================
// TerrainGenerator
// ==================================================================

export class TerrainGenerator {
  // ----------------------------------------------------------------
  // Main generation entry point
  // ----------------------------------------------------------------

  /**
   * Generate a 2D grid of biome types.
   *
   * The grid is indexed as `grid[y][x]` and uses three layered noise
   * fields to determine the biome at each tile:
   *
   * 1. **Elevation** (fractal2D, 6 octaves) – water / land / mountain.
   * 2. **Moisture** (fractal2D, 4 octaves, offset seed) – biome within
   *    the elevation band.
   * 3. **Temperature** (linear gradient + noise) – modifies biome
   *    selection for snow, desert, etc.
   */
  static generate(config: TerrainConfig): BiomeType[][] {
    const noise = SimplexNoise.create(config.seed);

    const grid: BiomeType[][] = [];

    for (let y = 0; y < config.height; y++) {
      const row: BiomeType[] = [];
      for (let x = 0; x < config.width; x++) {
        row.push(TerrainGenerator._sampleBiome(x, y, noise, config));
      }
      grid.push(row);
    }

    return grid;
  }

  // ----------------------------------------------------------------
  // Region-based generation with presets
  // ----------------------------------------------------------------

  /**
   * Generate a 200x200 tile grid for a named region using built-in
   * presets.  The `seed` is combined with the region name to produce
   * a unique but deterministic noise field per region.
   */
  static generateRegion(regionId: RegionPreset, seed: number): BiomeType[][] {
    const preset = PRESETS[regionId];
    if (!preset) {
      throw new Error(`[TerrainGenerator] Unknown region preset: ${regionId}`);
    }

    // Derive a unique seed per region so the same world seed produces
    // different terrain for each region.
    const regionSeed = seed ^ TerrainGenerator._hashString(regionId);

    const config: TerrainConfig = {
      seed: regionSeed,
      width: REGION_SIZE,
      height: REGION_SIZE,
      scale: preset.scale,
      oceanLevel: preset.oceanLevel,
      mountainLevel: preset.mountainLevel,
      forestDensity: preset.forestDensity,
    };

    const grid = TerrainGenerator.generate(config);

    // Apply region-specific post-processing.
    if (preset.postProcess) {
      const noise = SimplexNoise.create(regionSeed);
      preset.postProcess(grid, noise, config);
    }

    return grid;
  }

  // ----------------------------------------------------------------
  // Private – biome sampling
  // ----------------------------------------------------------------

  /**
   * Determine the biome for a single tile using the three noise layers.
   */
  private static _sampleBiome(
    x: number,
    y: number,
    noise: SimplexNoise,
    config: TerrainConfig,
  ): BiomeType {
    const { scale, oceanLevel, mountainLevel, forestDensity, height } = config;

    // --- Layer 1: Elevation ---
    // 6-octave fractal noise normalised to [0, 1].
    const elevation = (noise.fractal2D(x * scale, y * scale, 6, 2.0, 0.5) + 1) / 2;

    // --- Layer 2: Moisture ---
    // 4-octave fractal noise at a different seed offset.
    const moisture = (noise.fractal2D(
      x * scale + 500,
      y * scale + 500,
      4,
      2.0,
      0.5,
    ) + 1) / 2;

    // --- Layer 3: Temperature ---
    // Simple north-south gradient (cooler at top) plus some noise.
    const latGradient = y / height; // 0 (top / cold) → 1 (bottom / warm)
    const tempNoise = (noise.noise2D(x * scale * 0.5 + 1000, y * scale * 0.5 + 1000) + 1) / 2;
    const temperature = latGradient * 0.7 + tempNoise * 0.3;

    // --- Biome selection ---

    // Deep water
    if (elevation < oceanLevel * 0.6) {
      return BiomeType.DEEP_WATER;
    }

    // Shallow water
    if (elevation < oceanLevel) {
      return BiomeType.WATER;
    }

    // Beach / sand – narrow band just above water
    if (elevation < oceanLevel + 0.05) {
      return BiomeType.SAND;
    }

    // Snow – high elevation OR cold temperature
    if (elevation > mountainLevel + 0.1 || (elevation > mountainLevel && temperature < 0.25)) {
      return BiomeType.SNOW;
    }

    // Mountain
    if (elevation > mountainLevel) {
      return BiomeType.MOUNTAIN;
    }

    // Swamp – warm + very wet lowlands
    if (temperature > 0.55 && moisture > 0.65 && elevation < oceanLevel + 0.2) {
      return BiomeType.SWAMP;
    }

    // Forest / dense forest
    if (moisture > (1 - forestDensity) * 0.8) {
      if (moisture > (1 - forestDensity * 0.5) * 0.9 && temperature > 0.3) {
        return BiomeType.DENSE_FOREST;
      }
      return BiomeType.FOREST;
    }

    // Default: plains
    return BiomeType.PLAINS;
  }

  // ----------------------------------------------------------------
  // Private – helpers
  // ----------------------------------------------------------------

  /** Simple string hash to derive unique seeds per region name. */
  private static _hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash;
  }
}

// ==================================================================
// Post-processing helpers (module-private)
// ==================================================================

/**
 * Carve pseudo-river channels through the terrain grid.
 *
 * Uses a low-frequency noise field to define river paths. Tiles whose
 * noise value falls within a narrow band are set to the specified biome
 * (default WATER).
 */
function _carveRivers(
  grid: BiomeType[][],
  noise: SimplexNoise,
  config: TerrainConfig,
  count: number,
  riverBiome: BiomeType = BiomeType.WATER,
): void {
  for (let r = 0; r < count; r++) {
    const offsetX = r * 137 + 2000;
    const offsetY = r * 251 + 3000;

    for (let y = 0; y < config.height; y++) {
      for (let x = 0; x < config.width; x++) {
        // Use a narrow band of a low-frequency noise field as the river path.
        const n = noise.noise2D(
          x * 0.015 + offsetX,
          y * 0.015 + offsetY,
        );

        // River width: values very close to zero form the channel.
        if (Math.abs(n) < 0.03) {
          const current = grid[y][x];
          // Don't overwrite mountains or existing deep water.
          if (current !== BiomeType.MOUNTAIN && current !== BiomeType.DEEP_WATER) {
            grid[y][x] = riverBiome;
          }
        }
      }
    }
  }
}

/**
 * Scatter a biome type into cells that already contain a specific
 * source biome, using noise to determine placement.
 */
function _scatterBiome(
  grid: BiomeType[][],
  noise: SimplexNoise,
  config: TerrainConfig,
  targetBiome: BiomeType,
  probability: number,
  sourceBiome: BiomeType,
): void {
  for (let y = 0; y < config.height; y++) {
    for (let x = 0; x < config.width; x++) {
      if (grid[y][x] !== sourceBiome) continue;
      const n = (noise.noise2D(x * 0.1 + 7000, y * 0.1 + 7000) + 1) / 2;
      if (n < probability) {
        grid[y][x] = targetBiome;
      }
    }
  }
}
