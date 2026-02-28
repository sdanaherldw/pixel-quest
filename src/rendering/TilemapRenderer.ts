import { Container, Graphics } from 'pixi.js';

import { Engine } from '@/engine/Engine';

// ------------------------------------------------------------------
// Tile types
// ------------------------------------------------------------------

/**
 * Enumeration of supported tile types.
 *
 * Each type maps to a visual appearance (base colour + variation
 * range) for the procedural placeholder renderer.
 */
export enum TileType {
  GRASS = 0,
  DIRT = 1,
  STONE = 2,
  WATER = 3,
  SAND = 4,
  FOREST = 5,
  MOUNTAIN = 6,
  VOID = 7,
}

// ------------------------------------------------------------------
// Tile colour definitions
// ------------------------------------------------------------------

/**
 * Visual configuration for a tile type.
 *
 * `baseColor` is a 24-bit hex value.  `variation` is the maximum
 * per-channel offset (0–255 range) applied randomly to each tile
 * instance so that the terrain does not look perfectly uniform.
 */
interface TileColorDef {
  baseColor: number;
  variation: number;
}

/** Colour palette for each TileType. */
const TILE_COLORS: Record<TileType, TileColorDef> = {
  [TileType.GRASS]:    { baseColor: 0x4a8c3f, variation: 20 },
  [TileType.DIRT]:     { baseColor: 0x8b6b3d, variation: 15 },
  [TileType.STONE]:    { baseColor: 0x808080, variation: 12 },
  [TileType.WATER]:    { baseColor: 0x3366aa, variation: 18 },
  [TileType.SAND]:     { baseColor: 0xc2b280, variation: 10 },
  [TileType.FOREST]:   { baseColor: 0x2d6b30, variation: 25 },
  [TileType.MOUNTAIN]: { baseColor: 0x6b6b6b, variation: 15 },
  [TileType.VOID]:     { baseColor: 0x111111, variation: 0 },
};

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

/** Size of a single tile in world pixels. */
export const TILE_SIZE = 32;

/** Number of tiles per chunk along each axis. */
export const CHUNK_SIZE = 16;

/** Size of a chunk in world pixels. */
const CHUNK_PIXEL_SIZE = TILE_SIZE * CHUNK_SIZE;

// ------------------------------------------------------------------
// Chunk
// ------------------------------------------------------------------

/**
 * A chunk is a pre-rendered 16x16 block of tiles stored as a single
 * PixiJS Graphics object for efficient batch drawing.
 */
interface Chunk {
  /** Chunk grid coordinate X. */
  cx: number;
  /** Chunk grid coordinate Y. */
  cy: number;
  /** The pre-rendered graphics object. */
  graphics: Graphics;
  /** Whether the chunk needs to be redrawn. */
  dirty: boolean;
}

// ------------------------------------------------------------------
// TilemapRenderer
// ------------------------------------------------------------------

/**
 * Efficient tilemap renderer for the overworld.
 *
 * The world is described by a 2-D grid of {@link TileType} values.
 * Tiles are rendered as coloured rectangles (32x32 px each) with
 * slight procedural colour variation to break up visual uniformity.
 *
 * ### Chunk system
 *
 * The world is divided into 16x16-tile chunks.  Only chunks that
 * overlap the camera viewport are rendered (frustum culling).  Each
 * chunk is drawn into a single {@link Graphics} object and cached
 * until a tile within it changes.
 *
 * ### Coordinate systems
 *
 * * **Tile coords** — integer grid indices `(tx, ty)`.
 * * **World coords** — pixel positions `(wx, wy)` where
 *   `wx = tx * TILE_SIZE`.
 * * **Chunk coords** — integer chunk indices `(cx, cy)` where
 *   `cx = floor(tx / CHUNK_SIZE)`.
 *
 * ### Usage
 *
 * ```ts
 * const tileData: TileType[][] = buildWorldGrid(128, 128);
 * const tilemap = new TilemapRenderer(tileData);
 * scene.container.addChild(tilemap.container);
 *
 * // Each frame:
 * tilemap.updateVisibility();
 * ```
 */
export class TilemapRenderer {
  // ------------------------------------------------------------------
  // Public
  // ------------------------------------------------------------------

  /** Container that holds all chunk graphics. Add to your scene. */
  public readonly container: Container;

  // ------------------------------------------------------------------
  // Private
  // ------------------------------------------------------------------

  /** The authoritative tile data. Row-major: `_tiles[y][x]`. */
  private readonly _tiles: TileType[][];

  /** World dimensions in tiles. */
  private readonly _widthInTiles: number;
  private readonly _heightInTiles: number;

  /** Chunk dimensions. */
  private readonly _chunksX: number;
  private readonly _chunksY: number;

  /** Chunk cache keyed by `"cx,cy"`. */
  private readonly _chunks: Map<string, Chunk> = new Map();

  /**
   * Per-tile colour cache so colour variation is consistent across
   * redraws.  Keyed by `"tx,ty"` -> hex colour.
   */
  private readonly _tileColorCache: Map<string, number> = new Map();

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  /**
   * Create a new TilemapRenderer from a 2-D tile grid.
   *
   * @param tiles  Row-major 2-D array of {@link TileType} values.
   *   `tiles[y][x]` — the first index is the row (Y), the second is
   *   the column (X).
   */
  constructor(tiles: TileType[][]) {
    this._tiles = tiles;
    this._heightInTiles = tiles.length;
    this._widthInTiles = tiles.length > 0 ? tiles[0].length : 0;

    this._chunksX = Math.ceil(this._widthInTiles / CHUNK_SIZE);
    this._chunksY = Math.ceil(this._heightInTiles / CHUNK_SIZE);

    this.container = new Container();
    this.container.label = 'tilemap';
    this.container.sortableChildren = false;
  }

  // ------------------------------------------------------------------
  // Tile accessors
  // ------------------------------------------------------------------

  /** World width in tiles. */
  public get widthInTiles(): number {
    return this._widthInTiles;
  }

  /** World height in tiles. */
  public get heightInTiles(): number {
    return this._heightInTiles;
  }

  /**
   * Get the tile type at grid position `(x, y)`.
   *
   * @returns The tile type, or `TileType.VOID` if out of bounds.
   */
  public getTile(x: number, y: number): TileType {
    if (x < 0 || y < 0 || x >= this._widthInTiles || y >= this._heightInTiles) {
      return TileType.VOID;
    }
    return this._tiles[y][x];
  }

  /**
   * Set the tile type at grid position `(x, y)`.
   *
   * Marks the containing chunk as dirty so it will be redrawn on the
   * next visibility update.
   */
  public setTile(x: number, y: number, type: TileType): void {
    if (x < 0 || y < 0 || x >= this._widthInTiles || y >= this._heightInTiles) {
      return;
    }

    this._tiles[y][x] = type;

    // Invalidate cached colour so a new variation is generated.
    this._tileColorCache.delete(`${x},${y}`);

    // Mark the chunk as dirty.
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const key = `${cx},${cy}`;
    const chunk = this._chunks.get(key);
    if (chunk) {
      chunk.dirty = true;
    }
  }

  // ------------------------------------------------------------------
  // Coordinate conversion
  // ------------------------------------------------------------------

  /**
   * Convert world pixel coordinates to tile grid coordinates.
   *
   * @param wx World X in pixels.
   * @param wy World Y in pixels.
   * @returns `{ tx, ty }` tile grid position (floored).
   */
  public worldToTile(wx: number, wy: number): { tx: number; ty: number } {
    return {
      tx: Math.floor(wx / TILE_SIZE),
      ty: Math.floor(wy / TILE_SIZE),
    };
  }

  /**
   * Convert tile grid coordinates to world pixel coordinates
   * (top-left corner of the tile).
   *
   * @param tx Tile X index.
   * @param ty Tile Y index.
   * @returns `{ wx, wy }` world pixel position.
   */
  public tileToWorld(tx: number, ty: number): { wx: number; wy: number } {
    return {
      wx: tx * TILE_SIZE,
      wy: ty * TILE_SIZE,
    };
  }

  // ------------------------------------------------------------------
  // Visibility / culling
  // ------------------------------------------------------------------

  /**
   * Update which chunks are visible based on the current camera
   * viewport.  Call this once per frame.
   *
   * * Chunks inside the viewport are created (if new) or redrawn (if
   *   dirty).
   * * Chunks outside the viewport are hidden (but kept in cache for
   *   quick reuse when the camera moves back).
   */
  public updateVisibility(): void {
    const camera = Engine.instance.camera;
    const bounds = camera.getBounds();

    // Determine the range of chunks that overlap the viewport,
    // with a 1-chunk margin to avoid pop-in.
    const minCX = Math.max(0, Math.floor(bounds.x / CHUNK_PIXEL_SIZE) - 1);
    const minCY = Math.max(0, Math.floor(bounds.y / CHUNK_PIXEL_SIZE) - 1);
    const maxCX = Math.min(this._chunksX - 1, Math.floor((bounds.x + bounds.width) / CHUNK_PIXEL_SIZE) + 1);
    const maxCY = Math.min(this._chunksY - 1, Math.floor((bounds.y + bounds.height) / CHUNK_PIXEL_SIZE) + 1);

    // Hide all chunks, then show/create visible ones.
    for (const [, chunk] of this._chunks) {
      chunk.graphics.visible = false;
    }

    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const key = `${cx},${cy}`;
        let chunk = this._chunks.get(key);

        if (!chunk) {
          chunk = this._createChunk(cx, cy);
          this._chunks.set(key, chunk);
        }

        if (chunk.dirty) {
          this._drawChunk(chunk);
          chunk.dirty = false;
        }

        chunk.graphics.visible = true;
      }
    }
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  /**
   * Destroy all chunk graphics and clear caches.
   */
  public destroy(): void {
    for (const [, chunk] of this._chunks) {
      chunk.graphics.destroy();
    }
    this._chunks.clear();
    this._tileColorCache.clear();
    this.container.destroy({ children: true });
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Create a new empty chunk at the given chunk coordinates.
   */
  private _createChunk(cx: number, cy: number): Chunk {
    const graphics = new Graphics();
    graphics.label = `chunk:${cx},${cy}`;
    graphics.position.set(cx * CHUNK_PIXEL_SIZE, cy * CHUNK_PIXEL_SIZE);

    this.container.addChild(graphics);

    const chunk: Chunk = { cx, cy, graphics, dirty: true };
    return chunk;
  }

  /**
   * Redraw all tiles within a chunk.
   */
  private _drawChunk(chunk: Chunk): void {
    const g = chunk.graphics;
    g.clear();

    const startTX = chunk.cx * CHUNK_SIZE;
    const startTY = chunk.cy * CHUNK_SIZE;

    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      const ty = startTY + ly;
      if (ty >= this._heightInTiles) break;

      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const tx = startTX + lx;
        if (tx >= this._widthInTiles) break;

        const tileType = this._tiles[ty][tx];
        const color = this._getTileColor(tx, ty, tileType);

        // Draw the tile as a filled rectangle within the chunk's
        // local coordinate space.
        g.rect(lx * TILE_SIZE, ly * TILE_SIZE, TILE_SIZE, TILE_SIZE)
          .fill(color);
      }
    }
  }

  /**
   * Get (or generate and cache) the varied colour for a specific tile.
   */
  private _getTileColor(tx: number, ty: number, tileType: TileType): number {
    const key = `${tx},${ty}`;
    const cached = this._tileColorCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const def = TILE_COLORS[tileType];
    const color = this._varyColor(def.baseColor, def.variation, tx, ty);
    this._tileColorCache.set(key, color);
    return color;
  }

  /**
   * Apply a deterministic pseudo-random colour variation to a base
   * colour.  Uses a simple hash of the tile coordinates so the
   * variation is consistent across redraws.
   */
  private _varyColor(
    baseColor: number,
    variation: number,
    tx: number,
    ty: number,
  ): number {
    if (variation === 0) return baseColor;

    // Simple deterministic hash from tile position.
    const hash = this._hash(tx, ty);

    const r = (baseColor >> 16) & 0xff;
    const g = (baseColor >> 8) & 0xff;
    const b = baseColor & 0xff;

    // Generate three independent offsets from the hash.
    const dr = ((hash & 0xff) / 255) * variation * 2 - variation;
    const dg = (((hash >> 8) & 0xff) / 255) * variation * 2 - variation;
    const db = (((hash >> 16) & 0xff) / 255) * variation * 2 - variation;

    const nr = Math.max(0, Math.min(255, Math.round(r + dr)));
    const ng = Math.max(0, Math.min(255, Math.round(g + dg)));
    const nb = Math.max(0, Math.min(255, Math.round(b + db)));

    return (nr << 16) | (ng << 8) | nb;
  }

  /**
   * Simple integer hash for two tile coordinates.
   * Returns a 24-bit pseudo-random value.
   */
  private _hash(x: number, y: number): number {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    h = h ^ (h >> 16);
    return h & 0xffffff;
  }
}
