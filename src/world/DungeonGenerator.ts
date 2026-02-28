// ============================================================================
// DungeonGenerator.ts — Procedural side-scrolling dungeon layout generator
// Uses BSP (Binary Space Partition) with seeded RNG for deterministic results.
// ============================================================================

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum DungeonTileType {
  EMPTY = 0,
  FLOOR = 1,
  WALL = 2,
  PLATFORM = 3,
  LADDER = 4,
  SPIKE = 5,
  ENTRANCE = 6,
  EXIT = 7,
  BOSS_DOOR = 8,
  BREAKABLE = 9,
}

export enum RoomType {
  ENTRANCE = 'entrance',
  COMBAT = 'combat',
  TREASURE = 'treasure',
  PUZZLE = 'puzzle',
  VERTICAL = 'vertical',
  CORRIDOR = 'corridor',
  BOSS = 'boss',
  SECRET = 'secret',
}

export enum DungeonTheme {
  CAVE = 'cave',
  RUINS = 'ruins',
  TOWER = 'tower',
  TEMPLE = 'temple',
  VOLCANIC = 'volcanic',
  FROZEN = 'frozen',
  SWAMP = 'swamp',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface DungeonTile {
  type: DungeonTileType;
  variant: number;
  metadata?: Record<string, unknown>;
}

export interface SpawnPoint {
  x: number;
  y: number;
  enemyType: string;
  level: number;
}

export interface ChestPoint {
  x: number;
  y: number;
  rarity: string;
  lootTableId?: string;
}

export interface PlatformDef {
  x: number;
  y: number;
  width: number;
  type: 'static' | 'moving' | 'crumbling' | 'spring';
  moveRange?: number;
  moveSpeed?: number;
}

export interface DungeonRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: RoomType;
  connections: string[];
  spawnPoints: SpawnPoint[];
  chests: ChestPoint[];
  platforms: PlatformDef[];
}

export interface DungeonConfig {
  dungeonId: string;
  name: string;
  region: string;
  minLevel: number;
  maxLevel: number;
  roomCount: number;
  width: number;
  height: number;
  tileSize: number;
  hasBoss: boolean;
  bossId?: string;
  theme: DungeonTheme;
  seed?: number;
}

export interface DungeonLayout {
  config: DungeonConfig;
  tiles: DungeonTile[][];
  rooms: DungeonRoom[];
  playerStart: { x: number; y: number };
  bossRoom?: DungeonRoom;
}

// ---------------------------------------------------------------------------
// Seeded RNG — Linear Congruential Generator
// ---------------------------------------------------------------------------

class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Advance the state and return a value in [0, 1). */
  next(): number {
    this.state = ((this.state * 1664525 + 1013904223) & 0xFFFFFFFF) >>> 0;
    return this.state / 0x100000000;
  }

  /** Return an integer in [min, max] (inclusive). */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Return a float in [min, max). */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** Pick a random element from an array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }

  /** Shuffle an array in-place (Fisher-Yates). */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }
}

// ---------------------------------------------------------------------------
// BSP Node for space partitioning
// ---------------------------------------------------------------------------

interface BSPNode {
  x: number;
  y: number;
  width: number;
  height: number;
  left?: BSPNode;
  right?: BSPNode;
  room?: { x: number; y: number; width: number; height: number };
}

// ---------------------------------------------------------------------------
// Theme-specific enemy tables
// ---------------------------------------------------------------------------

const THEME_ENEMIES: Record<DungeonTheme, string[]> = {
  [DungeonTheme.CAVE]: ['bat', 'spider', 'slime', 'cave-rat', 'mushroom-spore'],
  [DungeonTheme.RUINS]: ['skeleton', 'ghost', 'shadow-wraith', 'stone-golem', 'cursed-armor'],
  [DungeonTheme.TOWER]: ['gargoyle', 'imp', 'arcane-sentry', 'animated-book', 'dark-mage'],
  [DungeonTheme.TEMPLE]: ['treant', 'nature-spirit', 'vine-crawler', 'moss-golem', 'corrupted-druid'],
  [DungeonTheme.VOLCANIC]: ['fire-elemental', 'magma-slime', 'hell-bat', 'ember-imp', 'lava-golem'],
  [DungeonTheme.FROZEN]: ['ice-elemental', 'frost-wolf', 'yeti', 'frozen-wraith', 'snow-spider'],
  [DungeonTheme.SWAMP]: ['bog-creature', 'poison-toad', 'swamp-lurker', 'muck-slime', 'will-o-wisp'],
};

const RARITY_WEIGHTS: { rarity: string; weight: number }[] = [
  { rarity: 'common', weight: 50 },
  { rarity: 'uncommon', weight: 30 },
  { rarity: 'rare', weight: 14 },
  { rarity: 'epic', weight: 5 },
  { rarity: 'legendary', weight: 1 },
];

// ---------------------------------------------------------------------------
// Preset Dungeon Configs
// ---------------------------------------------------------------------------

export const PRESET_DUNGEONS: Record<string, DungeonConfig> = {
  'hollow-oak-caves': {
    dungeonId: 'hollow-oak-caves',
    name: 'Hollow Oak Caves',
    region: 'elderwood',
    minLevel: 1,
    maxLevel: 3,
    roomCount: 6,
    width: 120,
    height: 40,
    tileSize: 32,
    hasBoss: true,
    bossId: 'spider-queen',
    theme: DungeonTheme.CAVE,
  },
  'ruined-watchtower': {
    dungeonId: 'ruined-watchtower',
    name: 'Ruined Watchtower',
    region: 'elderwood',
    minLevel: 3,
    maxLevel: 5,
    roomCount: 8,
    width: 160,
    height: 50,
    tileSize: 32,
    hasBoss: true,
    bossId: 'shadow-knight',
    theme: DungeonTheme.RUINS,
  },
  'ancient-elven-ruins': {
    dungeonId: 'ancient-elven-ruins',
    name: 'Ancient Elven Ruins',
    region: 'elderwood',
    minLevel: 5,
    maxLevel: 8,
    roomCount: 10,
    width: 200,
    height: 60,
    tileSize: 32,
    hasBoss: true,
    bossId: 'forest-guardian',
    theme: DungeonTheme.TEMPLE,
  },
  'crystal-caverns': {
    dungeonId: 'crystal-caverns',
    name: 'Crystal Caverns',
    region: 'frostpeak',
    minLevel: 8,
    maxLevel: 12,
    roomCount: 8,
    width: 160,
    height: 50,
    tileSize: 32,
    hasBoss: true,
    bossId: 'frost-wyrm',
    theme: DungeonTheme.FROZEN,
  },
  'volcanic-depths': {
    dungeonId: 'volcanic-depths',
    name: 'Volcanic Depths',
    region: 'cinder',
    minLevel: 18,
    maxLevel: 22,
    roomCount: 12,
    width: 240,
    height: 70,
    tileSize: 32,
    hasBoss: true,
    bossId: 'pyraxis',
    theme: DungeonTheme.VOLCANIC,
  },
};

// ---------------------------------------------------------------------------
// DungeonGenerator
// ---------------------------------------------------------------------------

export class DungeonGenerator {
  /**
   * Generate a complete dungeon layout from the given configuration.
   * The result is deterministic for a given seed.
   */
  generate(config: DungeonConfig): DungeonLayout {
    const seed = config.seed ?? Date.now();
    const rng = new SeededRNG(seed);

    // Initialize an empty tile grid
    const tiles = this.createEmptyGrid(config.width, config.height);

    // 1. BSP partitioning to create room regions
    const bspRoot = this.buildBSP(
      rng,
      { x: 1, y: 1, width: config.width - 2, height: config.height - 2 },
      config.roomCount,
    );

    // 2. Extract leaf rooms from BSP
    const leafRegions = this.getLeaves(bspRoot);

    // Limit to the requested room count
    while (leafRegions.length > config.roomCount) {
      leafRegions.pop();
    }

    // 3. Place rooms within their BSP regions
    const rooms = this.placeRooms(rng, leafRegions, config);

    // 4. Sort rooms left-to-right so connections flow naturally
    rooms.sort((a, b) => a.x - b.x);

    // 5. Assign room types
    this.assignRoomTypes(rng, rooms, config);

    // 6. Connect adjacent rooms with corridors
    const corridors = this.connectRooms(rng, rooms);

    // 7. Carve rooms into the tile grid
    for (const room of rooms) {
      this.carveRoom(tiles, room);
    }

    // 8. Carve corridors into the tile grid
    for (const corridor of corridors) {
      this.carveCorridor(tiles, corridor);
    }

    // 9. Place platforms inside rooms
    for (const room of rooms) {
      this.placePlatforms(rng, tiles, room, config);
    }

    // 10. Place enemies
    for (const room of rooms) {
      this.placeEnemies(rng, room, config);
    }

    // 11. Place chests in treasure rooms
    for (const room of rooms) {
      this.placeChests(rng, room, config);
    }

    // 12. Place entrance and exit tiles
    const entranceRoom = rooms.find((r) => r.type === RoomType.ENTRANCE)!;
    const playerStart = this.placeEntrance(tiles, entranceRoom);

    const bossRoom = rooms.find((r) => r.type === RoomType.BOSS);
    if (bossRoom) {
      this.placeExit(tiles, bossRoom, config.hasBoss);
    } else {
      const exitRoom = rooms[rooms.length - 1];
      this.placeExit(tiles, exitRoom, false);
    }

    // 13. Fill surrounding walls
    this.fillWalls(tiles, config.width, config.height);

    // 14. Add tile variants based on theme
    this.applyVariants(rng, tiles, config);

    return {
      config: { ...config, seed },
      tiles,
      rooms,
      playerStart,
      bossRoom,
    };
  }

  // =========================================================================
  // Grid helpers
  // =========================================================================

  private createEmptyGrid(width: number, height: number): DungeonTile[][] {
    const tiles: DungeonTile[][] = [];
    for (let y = 0; y < height; y++) {
      const row: DungeonTile[] = [];
      for (let x = 0; x < width; x++) {
        row.push({ type: DungeonTileType.EMPTY, variant: 0 });
      }
      tiles.push(row);
    }
    return tiles;
  }

  private setTile(
    tiles: DungeonTile[][],
    x: number,
    y: number,
    type: DungeonTileType,
    variant = 0,
    metadata?: Record<string, unknown>,
  ): void {
    if (y >= 0 && y < tiles.length && x >= 0 && x < tiles[0].length) {
      tiles[y][x] = { type, variant, ...(metadata ? { metadata } : {}) };
    }
  }

  private getTile(tiles: DungeonTile[][], x: number, y: number): DungeonTile | null {
    if (y >= 0 && y < tiles.length && x >= 0 && x < tiles[0].length) {
      return tiles[y][x];
    }
    return null;
  }

  // =========================================================================
  // BSP — Binary Space Partition
  // =========================================================================

  private buildBSP(
    rng: SeededRNG,
    region: { x: number; y: number; width: number; height: number },
    targetRoomCount: number,
  ): BSPNode {
    const node: BSPNode = { ...region };

    // The number of splits needed is roughly log2(targetRoomCount), but we
    // recurse until regions are small enough for a single room.
    const MIN_REGION_W = 14;
    const MIN_REGION_H = 10;

    const canSplitH = region.width >= MIN_REGION_W * 2;
    const canSplitV = region.height >= MIN_REGION_H * 2;

    if (!canSplitH && !canSplitV) {
      return node; // leaf
    }

    // Prefer to split the longer axis with some randomness
    let splitHorizontally: boolean;
    if (!canSplitH) {
      splitHorizontally = false;
    } else if (!canSplitV) {
      splitHorizontally = true;
    } else {
      splitHorizontally =
        region.width > region.height ? rng.next() > 0.3 : rng.next() > 0.7;
    }

    if (splitHorizontally) {
      const splitMin = Math.floor(region.width * 0.35);
      const splitMax = Math.floor(region.width * 0.65);
      const splitAt = rng.nextInt(
        Math.max(MIN_REGION_W, splitMin),
        Math.min(region.width - MIN_REGION_W, splitMax),
      );

      node.left = this.buildBSP(
        rng,
        { x: region.x, y: region.y, width: splitAt, height: region.height },
        Math.ceil(targetRoomCount / 2),
      );
      node.right = this.buildBSP(
        rng,
        {
          x: region.x + splitAt,
          y: region.y,
          width: region.width - splitAt,
          height: region.height,
        },
        Math.floor(targetRoomCount / 2),
      );
    } else {
      const splitMin = Math.floor(region.height * 0.35);
      const splitMax = Math.floor(region.height * 0.65);
      const splitAt = rng.nextInt(
        Math.max(MIN_REGION_H, splitMin),
        Math.min(region.height - MIN_REGION_H, splitMax),
      );

      node.left = this.buildBSP(
        rng,
        { x: region.x, y: region.y, width: region.width, height: splitAt },
        Math.ceil(targetRoomCount / 2),
      );
      node.right = this.buildBSP(
        rng,
        {
          x: region.x,
          y: region.y + splitAt,
          width: region.width,
          height: region.height - splitAt,
        },
        Math.floor(targetRoomCount / 2),
      );
    }

    return node;
  }

  /** Collect every leaf node (no children) in the BSP tree. */
  private getLeaves(node: BSPNode): BSPNode[] {
    if (!node.left && !node.right) {
      return [node];
    }
    const leaves: BSPNode[] = [];
    if (node.left) leaves.push(...this.getLeaves(node.left));
    if (node.right) leaves.push(...this.getLeaves(node.right));
    return leaves;
  }

  // =========================================================================
  // Room placement
  // =========================================================================

  private placeRooms(
    rng: SeededRNG,
    leaves: BSPNode[],
    config: DungeonConfig,
  ): DungeonRoom[] {
    const rooms: DungeonRoom[] = [];
    let roomIdx = 0;

    for (const leaf of leaves) {
      // Room is smaller than its BSP region, with some random padding
      const padX = rng.nextInt(1, Math.max(1, Math.floor(leaf.width * 0.15)));
      const padY = rng.nextInt(1, Math.max(1, Math.floor(leaf.height * 0.15)));

      const roomW = Math.max(10, leaf.width - padX * 2);
      const roomH = Math.max(8, leaf.height - padY * 2);
      const roomX = leaf.x + padX;
      const roomY = leaf.y + padY;

      // Clamp to grid
      const clampedW = Math.min(roomW, config.width - roomX - 1);
      const clampedH = Math.min(roomH, config.height - roomY - 1);

      if (clampedW < 8 || clampedH < 6) continue;

      rooms.push({
        id: `room-${roomIdx}`,
        x: roomX,
        y: roomY,
        width: clampedW,
        height: clampedH,
        type: RoomType.COMBAT, // will be assigned later
        connections: [],
        spawnPoints: [],
        chests: [],
        platforms: [],
      });

      leaf.room = { x: roomX, y: roomY, width: clampedW, height: clampedH };
      roomIdx++;
    }

    return rooms;
  }

  // =========================================================================
  // Room type assignment
  // =========================================================================

  private assignRoomTypes(
    rng: SeededRNG,
    rooms: DungeonRoom[],
    config: DungeonConfig,
  ): void {
    if (rooms.length === 0) return;

    // First room is always the entrance
    rooms[0].type = RoomType.ENTRANCE;

    // Last room is the boss room (if boss present) or exit
    if (config.hasBoss && rooms.length > 1) {
      rooms[rooms.length - 1].type = RoomType.BOSS;
    }

    // Assign the rest from a weighted pool
    const typePool: RoomType[] = [
      RoomType.COMBAT,
      RoomType.COMBAT,
      RoomType.COMBAT,
      RoomType.TREASURE,
      RoomType.VERTICAL,
      RoomType.PUZZLE,
      RoomType.SECRET,
    ];

    for (let i = 1; i < rooms.length - (config.hasBoss ? 1 : 0); i++) {
      rooms[i].type = rng.pick(typePool);
    }

    // Guarantee at least one treasure room exists (if enough rooms)
    if (rooms.length > 3) {
      const hasTreasure = rooms.some((r) => r.type === RoomType.TREASURE);
      if (!hasTreasure) {
        // Pick a middle-ish room
        const mid = rng.nextInt(1, rooms.length - 2);
        rooms[mid].type = RoomType.TREASURE;
      }
    }
  }

  // =========================================================================
  // Room connectivity
  // =========================================================================

  private connectRooms(
    rng: SeededRNG,
    rooms: DungeonRoom[],
  ): { from: DungeonRoom; to: DungeonRoom }[] {
    const corridors: { from: DungeonRoom; to: DungeonRoom }[] = [];

    // Connect each room to the next one in sorted order (linear chain)
    for (let i = 0; i < rooms.length - 1; i++) {
      rooms[i].connections.push(rooms[i + 1].id);
      rooms[i + 1].connections.push(rooms[i].id);
      corridors.push({ from: rooms[i], to: rooms[i + 1] });
    }

    // Optionally add a shortcut connection for longer dungeons
    if (rooms.length >= 6) {
      const skip = rng.nextInt(2, Math.min(4, rooms.length - 3));
      const from = rng.nextInt(0, rooms.length - skip - 1);
      const to = from + skip;
      if (!rooms[from].connections.includes(rooms[to].id)) {
        rooms[from].connections.push(rooms[to].id);
        rooms[to].connections.push(rooms[from].id);
        corridors.push({ from: rooms[from], to: rooms[to] });
      }
    }

    return corridors;
  }

  // =========================================================================
  // Carving
  // =========================================================================

  /** Carve a room out of the tile grid with floor and surrounding walls. */
  private carveRoom(tiles: DungeonTile[][], room: DungeonRoom): void {
    const { x, y, width, height } = room;

    // Carve interior as EMPTY (air)
    for (let ry = y; ry < y + height; ry++) {
      for (let rx = x; rx < x + width; rx++) {
        this.setTile(tiles, rx, ry, DungeonTileType.EMPTY);
      }
    }

    // Floor along the bottom row
    for (let rx = x; rx < x + width; rx++) {
      this.setTile(tiles, rx, y + height - 1, DungeonTileType.FLOOR);
    }

    // Walls on left and right edges
    for (let ry = y; ry < y + height; ry++) {
      this.setTile(tiles, x, ry, DungeonTileType.WALL);
      this.setTile(tiles, x + width - 1, ry, DungeonTileType.WALL);
    }

    // Ceiling along the top row
    for (let rx = x; rx < x + width; rx++) {
      this.setTile(tiles, rx, y, DungeonTileType.WALL);
    }
  }

  /** Carve a corridor between two rooms (horizontal then vertical). */
  private carveCorridor(
    tiles: DungeonTile[][],
    corridor: { from: DungeonRoom; to: DungeonRoom },
  ): void {
    const { from, to } = corridor;

    // Center points
    const fromCx = Math.floor(from.x + from.width / 2);
    const fromCy = Math.floor(from.y + from.height - 2); // near floor level
    const toCx = Math.floor(to.x + to.width / 2);
    const toCy = Math.floor(to.y + to.height - 2);

    const corridorHeight = 4; // 4 tiles tall

    // Horizontal segment
    const xStart = Math.min(fromCx, toCx);
    const xEnd = Math.max(fromCx, toCx);
    const yHoriz = fromCy;

    for (let cx = xStart; cx <= xEnd; cx++) {
      for (let dy = -1; dy < corridorHeight - 1; dy++) {
        const ty = yHoriz - dy;
        const existing = this.getTile(tiles, cx, ty);
        if (existing && existing.type !== DungeonTileType.FLOOR) {
          this.setTile(tiles, cx, ty, DungeonTileType.EMPTY);
        }
      }
      // Floor
      this.setTile(tiles, cx, yHoriz + 1, DungeonTileType.FLOOR);
    }

    // Vertical segment (if rooms are at different heights)
    if (Math.abs(fromCy - toCy) > 1) {
      const yStart = Math.min(fromCy, toCy);
      const yEnd = Math.max(fromCy, toCy);
      const xVert = toCx;

      for (let cy = yStart; cy <= yEnd; cy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const existing = this.getTile(tiles, xVert + dx, cy);
          if (existing && existing.type !== DungeonTileType.FLOOR) {
            this.setTile(tiles, xVert + dx, cy, DungeonTileType.EMPTY);
          }
        }
      }
      // Floor at the bottom of the vertical segment
      this.setTile(tiles, xVert - 1, yEnd + 1, DungeonTileType.FLOOR);
      this.setTile(tiles, xVert, yEnd + 1, DungeonTileType.FLOOR);
      this.setTile(tiles, xVert + 1, yEnd + 1, DungeonTileType.FLOOR);

      // Ladder in the vertical segment
      for (let cy = yStart; cy <= yEnd; cy++) {
        this.setTile(tiles, xVert, cy, DungeonTileType.LADDER);
      }
    }
  }

  // =========================================================================
  // Platform placement
  // =========================================================================

  private placePlatforms(
    rng: SeededRNG,
    tiles: DungeonTile[][],
    room: DungeonRoom,
    _config: DungeonConfig,
  ): void {
    const innerX = room.x + 2;
    const innerW = room.width - 4;
    const floorY = room.y + room.height - 2; // one above the floor row

    switch (room.type) {
      case RoomType.COMBAT:
        this.placeCombatPlatforms(rng, tiles, room, innerX, innerW, floorY);
        break;
      case RoomType.VERTICAL:
        this.placeVerticalPlatforms(rng, tiles, room, innerX, innerW, floorY);
        break;
      case RoomType.TREASURE:
        this.placeTreasurePlatforms(rng, tiles, room, innerX, innerW, floorY);
        break;
      case RoomType.BOSS:
        this.placeBossPlatforms(rng, tiles, room, innerX, innerW, floorY);
        break;
      case RoomType.PUZZLE:
        this.placePuzzlePlatforms(rng, tiles, room, innerX, innerW, floorY);
        break;
      default:
        break;
    }
  }

  /** COMBAT: 2-4 platforms at varying heights */
  private placeCombatPlatforms(
    rng: SeededRNG,
    tiles: DungeonTile[][],
    room: DungeonRoom,
    innerX: number,
    innerW: number,
    floorY: number,
  ): void {
    const count = rng.nextInt(2, 4);
    for (let i = 0; i < count; i++) {
      const platW = rng.nextInt(3, Math.min(6, innerW - 2));
      const platX = rng.nextInt(innerX, innerX + innerW - platW);
      const platY = floorY - rng.nextInt(2, Math.min(5, room.height - 4));

      const platType = rng.next() < 0.15 ? 'crumbling' : 'static';
      this.carvePlatform(tiles, platX, platY, platW);

      room.platforms.push({
        x: platX,
        y: platY,
        width: platW,
        type: platType as 'static' | 'crumbling',
      });
    }
  }

  /** VERTICAL: ladder + ascending platforms */
  private placeVerticalPlatforms(
    rng: SeededRNG,
    tiles: DungeonTile[][],
    room: DungeonRoom,
    innerX: number,
    innerW: number,
    floorY: number,
  ): void {
    // Central ladder
    const ladderX = innerX + Math.floor(innerW / 2);
    for (let ly = room.y + 2; ly <= floorY; ly++) {
      this.setTile(tiles, ladderX, ly, DungeonTileType.LADDER);
    }

    // Platforms staggered left/right ascending
    const platformCount = Math.max(3, Math.floor((room.height - 4) / 3));
    let leftSide = rng.next() > 0.5;

    for (let i = 0; i < platformCount; i++) {
      const platY = floorY - (i + 1) * 3;
      if (platY <= room.y + 1) break;

      const platW = rng.nextInt(3, 5);
      const platX = leftSide
        ? rng.nextInt(innerX, ladderX - platW)
        : rng.nextInt(ladderX + 1, innerX + innerW - platW);

      if (platX < innerX || platX + platW > innerX + innerW) continue;

      this.carvePlatform(tiles, platX, platY, platW);

      const type = rng.next() < 0.1 ? 'spring' : 'static';
      room.platforms.push({ x: platX, y: platY, width: platW, type: type as 'static' | 'spring' });

      leftSide = !leftSide;
    }
  }

  /** TREASURE: platform puzzle leading up to a chest */
  private placeTreasurePlatforms(
    rng: SeededRNG,
    tiles: DungeonTile[][],
    room: DungeonRoom,
    innerX: number,
    innerW: number,
    floorY: number,
  ): void {
    // Ascending platforms leading to a high chest position
    const steps = rng.nextInt(2, 4);
    for (let i = 0; i < steps; i++) {
      const platW = rng.nextInt(3, 5);
      const stepFraction = (i + 1) / (steps + 1);
      const platX = innerX + Math.floor(stepFraction * (innerW - platW));
      const platY = floorY - (i + 1) * 3;

      if (platY <= room.y + 1) break;

      const type = rng.next() < 0.2 ? 'moving' : 'static';
      this.carvePlatform(tiles, platX, platY, platW);

      room.platforms.push({
        x: platX,
        y: platY,
        width: platW,
        type: type as 'static' | 'moving',
        ...(type === 'moving'
          ? { moveRange: rng.nextInt(2, 4), moveSpeed: rng.nextFloat(0.5, 1.5) }
          : {}),
      });
    }
  }

  /** BOSS: wide flat arena with 2-3 platforms */
  private placeBossPlatforms(
    rng: SeededRNG,
    tiles: DungeonTile[][],
    room: DungeonRoom,
    innerX: number,
    innerW: number,
    floorY: number,
  ): void {
    const count = rng.nextInt(2, 3);
    const spacing = Math.floor(innerW / (count + 1));

    for (let i = 0; i < count; i++) {
      const platW = rng.nextInt(4, 6);
      const platX = innerX + spacing * (i + 1) - Math.floor(platW / 2);
      const platY = floorY - rng.nextInt(3, 5);

      this.carvePlatform(tiles, platX, platY, platW);
      room.platforms.push({ x: platX, y: platY, width: platW, type: 'static' });
    }
  }

  /** PUZZLE: mix of platform types with some spikes */
  private placePuzzlePlatforms(
    rng: SeededRNG,
    tiles: DungeonTile[][],
    room: DungeonRoom,
    innerX: number,
    innerW: number,
    floorY: number,
  ): void {
    const count = rng.nextInt(3, 5);
    for (let i = 0; i < count; i++) {
      const platW = rng.nextInt(2, 4);
      const platX = rng.nextInt(innerX, innerX + innerW - platW);
      const platY = floorY - rng.nextInt(2, Math.min(6, room.height - 4));

      this.carvePlatform(tiles, platX, platY, platW);

      const types: Array<'static' | 'moving' | 'crumbling' | 'spring'> = [
        'static',
        'moving',
        'crumbling',
        'spring',
      ];
      const type = rng.pick(types);

      room.platforms.push({
        x: platX,
        y: platY,
        width: platW,
        type,
        ...(type === 'moving'
          ? { moveRange: rng.nextInt(2, 5), moveSpeed: rng.nextFloat(0.5, 2.0) }
          : {}),
      });
    }

    // Place some spikes on the floor
    const spikeCount = rng.nextInt(1, 3);
    for (let i = 0; i < spikeCount; i++) {
      const sx = rng.nextInt(innerX + 1, innerX + innerW - 2);
      this.setTile(tiles, sx, floorY, DungeonTileType.SPIKE);
    }
  }

  /** Write PLATFORM tiles into the grid. */
  private carvePlatform(
    tiles: DungeonTile[][],
    x: number,
    y: number,
    width: number,
  ): void {
    for (let px = x; px < x + width; px++) {
      this.setTile(tiles, px, y, DungeonTileType.PLATFORM);
    }
  }

  // =========================================================================
  // Enemy placement
  // =========================================================================

  private placeEnemies(
    rng: SeededRNG,
    room: DungeonRoom,
    config: DungeonConfig,
  ): void {
    if (room.type === RoomType.ENTRANCE) return; // no enemies in entrance

    const enemies = THEME_ENEMIES[config.theme];
    const floorY = room.y + room.height - 2;
    let enemyCount: number;

    switch (room.type) {
      case RoomType.COMBAT:
        enemyCount = rng.nextInt(2, 5);
        break;
      case RoomType.BOSS:
        enemyCount = rng.nextInt(1, 2); // boss + maybe a minion
        break;
      case RoomType.VERTICAL:
        enemyCount = rng.nextInt(1, 3);
        break;
      case RoomType.TREASURE:
        enemyCount = rng.nextInt(1, 2); // guards
        break;
      case RoomType.PUZZLE:
        enemyCount = rng.nextInt(0, 2);
        break;
      case RoomType.SECRET:
        enemyCount = rng.nextInt(0, 1);
        break;
      default:
        enemyCount = rng.nextInt(0, 2);
        break;
    }

    for (let i = 0; i < enemyCount; i++) {
      const spawnX = rng.nextInt(room.x + 2, room.x + room.width - 3);
      let spawnY = floorY;

      // Some enemies can spawn on platforms
      if (room.platforms.length > 0 && rng.next() > 0.5) {
        const plat = rng.pick(room.platforms);
        spawnY = plat.y - 1;
      }

      const level = rng.nextInt(config.minLevel, config.maxLevel);
      let enemyType: string;

      if (room.type === RoomType.BOSS && i === 0 && config.bossId) {
        enemyType = config.bossId;
      } else {
        enemyType = rng.pick(enemies);
      }

      room.spawnPoints.push({
        x: spawnX,
        y: spawnY,
        enemyType,
        level,
      });
    }
  }

  // =========================================================================
  // Chest placement
  // =========================================================================

  private placeChests(
    rng: SeededRNG,
    room: DungeonRoom,
    config: DungeonConfig,
  ): void {
    let chestCount: number;

    switch (room.type) {
      case RoomType.TREASURE:
        chestCount = rng.nextInt(1, 3);
        break;
      case RoomType.SECRET:
        chestCount = 1;
        break;
      case RoomType.BOSS:
        chestCount = 1; // boss reward
        break;
      default:
        chestCount = rng.next() < 0.15 ? 1 : 0;
        break;
    }

    for (let i = 0; i < chestCount; i++) {
      const floorY = room.y + room.height - 2;
      let cx: number;
      let cy: number;

      // Place on highest platform if available (treasure rooms)
      if (room.type === RoomType.TREASURE && room.platforms.length > 0) {
        const highestPlat = room.platforms.reduce((a, b) => (a.y < b.y ? a : b));
        cx = highestPlat.x + Math.floor(highestPlat.width / 2);
        cy = highestPlat.y - 1;
      } else {
        cx = rng.nextInt(room.x + 2, room.x + room.width - 3);
        cy = floorY;
      }

      const rarity = this.rollRarity(rng, config, room.type === RoomType.BOSS);

      room.chests.push({
        x: cx,
        y: cy,
        rarity,
        lootTableId: `${config.region}-${config.theme}-loot`,
      });
    }
  }

  private rollRarity(rng: SeededRNG, config: DungeonConfig, isBoss: boolean): string {
    if (isBoss) {
      // Boss chests are always at least rare
      const roll = rng.next() * 100;
      if (roll < 5) return 'legendary';
      if (roll < 25) return 'epic';
      return 'rare';
    }

    // Level scaling: higher-level dungeons shift rarity upward
    const levelBonus = Math.floor(config.minLevel / 5);
    const totalWeight = RARITY_WEIGHTS.reduce((sum, r) => sum + r.weight, 0);
    let roll = rng.next() * totalWeight;

    // Apply a small level-based shift
    roll = Math.max(0, roll - levelBonus * 5);

    for (const entry of RARITY_WEIGHTS) {
      roll -= entry.weight;
      if (roll <= 0) {
        return entry.rarity;
      }
    }

    return 'common';
  }

  // =========================================================================
  // Entrance & Exit
  // =========================================================================

  private placeEntrance(tiles: DungeonTile[][], room: DungeonRoom): { x: number; y: number } {
    const ex = room.x + 2;
    const ey = room.y + room.height - 2;

    this.setTile(tiles, ex, ey, DungeonTileType.ENTRANCE, 0, {
      spawnPoint: true,
    });

    return { x: ex, y: ey };
  }

  private placeExit(tiles: DungeonTile[][], room: DungeonRoom, isBoss: boolean): void {
    const ex = room.x + room.width - 3;
    const ey = room.y + room.height - 2;

    if (isBoss) {
      // Boss door at the entrance of the boss room
      this.setTile(tiles, room.x + 1, ey, DungeonTileType.BOSS_DOOR, 0, {
        bossRoom: room.id,
      });
      // Exit behind the boss area
      this.setTile(tiles, ex, ey, DungeonTileType.EXIT, 0, {
        requiresBossDefeat: true,
      });
    } else {
      this.setTile(tiles, ex, ey, DungeonTileType.EXIT);
    }
  }

  // =========================================================================
  // Wall filling — surround carved areas with walls
  // =========================================================================

  private fillWalls(tiles: DungeonTile[][], width: number, height: number): void {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x].type !== DungeonTileType.EMPTY) continue;

        // Check if this EMPTY tile is adjacent to any carved tile
        let adjacentToCarved = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const neighbor = tiles[ny][nx].type;
              if (
                neighbor === DungeonTileType.FLOOR ||
                neighbor === DungeonTileType.PLATFORM ||
                neighbor === DungeonTileType.LADDER ||
                neighbor === DungeonTileType.ENTRANCE ||
                neighbor === DungeonTileType.EXIT ||
                neighbor === DungeonTileType.BOSS_DOOR
              ) {
                adjacentToCarved = true;
                break;
              }
            }
          }
          if (adjacentToCarved) break;
        }

        // We don't convert air-adjacent-to-floor into wall here; walls were
        // already placed by carveRoom. Instead we fill the outer boundary.
      }
    }

    // Outer boundary walls
    for (let x = 0; x < width; x++) {
      this.setTile(tiles, x, 0, DungeonTileType.WALL);
      this.setTile(tiles, x, height - 1, DungeonTileType.WALL);
    }
    for (let y = 0; y < height; y++) {
      this.setTile(tiles, 0, y, DungeonTileType.WALL);
      this.setTile(tiles, width - 1, y, DungeonTileType.WALL);
    }
  }

  // =========================================================================
  // Visual variants
  // =========================================================================

  private applyVariants(
    rng: SeededRNG,
    tiles: DungeonTile[][],
    config: DungeonConfig,
  ): void {
    const variantCounts: Record<DungeonTileType, number> = {
      [DungeonTileType.EMPTY]: 1,
      [DungeonTileType.FLOOR]: 4,
      [DungeonTileType.WALL]: 4,
      [DungeonTileType.PLATFORM]: 3,
      [DungeonTileType.LADDER]: 2,
      [DungeonTileType.SPIKE]: 2,
      [DungeonTileType.ENTRANCE]: 1,
      [DungeonTileType.EXIT]: 1,
      [DungeonTileType.BOSS_DOOR]: 1,
      [DungeonTileType.BREAKABLE]: 3,
    };

    // Theme offset: each theme gets a variant offset so the same variant index
    // looks different per theme (the renderer maps variant + theme -> sprite).
    const themeOffsets: Record<DungeonTheme, number> = {
      [DungeonTheme.CAVE]: 0,
      [DungeonTheme.RUINS]: 100,
      [DungeonTheme.TOWER]: 200,
      [DungeonTheme.TEMPLE]: 300,
      [DungeonTheme.VOLCANIC]: 400,
      [DungeonTheme.FROZEN]: 500,
      [DungeonTheme.SWAMP]: 600,
    };

    const offset = themeOffsets[config.theme];

    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < tiles[y].length; x++) {
        const tile = tiles[y][x];
        const maxVariant = variantCounts[tile.type] ?? 1;
        tile.variant = offset + rng.nextInt(0, maxVariant - 1);
      }
    }
  }
}
