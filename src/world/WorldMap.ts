// ------------------------------------------------------------------
// WorldMap – game world structure and region management
// ------------------------------------------------------------------
//
// Defines the layout of 5 game regions, their connections, towns,
// dungeons, and points of interest.  The WorldMap class provides
// lookup methods used by the overworld scene, minimap, and fast-travel
// systems.
//
// Region layout (conceptual):
//
//               Frostpeak (N)
//                    |
//   Scorched (E) -- Elderwood (C) -- (roads)
//                    |
//              Shadowmire (S)
//                    |
//              Cinder Core (hidden, unlocked after 4 bosses)
//
// ------------------------------------------------------------------

import type { RegionPreset } from '@/procedural/TerrainGenerator';

// ==================================================================
// Data types
// ==================================================================

/** A named point in 2D tile space. */
export interface TilePosition {
  x: number;
  y: number;
}

/** Describes a connection (road, pass, etc.) between two regions. */
export interface RegionConnection {
  /** Region this connection leads to. */
  targetRegionId: string;
  /** Exit position in the source region (tile coords). */
  exitPosition: TilePosition;
  /** Entry position in the target region (tile coords). */
  entryPosition: TilePosition;
  /** Human-readable name for the passage. */
  name: string;
}

/** Basic town reference stored in region data. */
export interface TownRef {
  id: string;
  name: string;
  position: TilePosition;
  type: 'village' | 'outpost' | 'fortress';
}

/** Dungeon reference stored in region data. */
export interface DungeonRef {
  id: string;
  name: string;
  position: TilePosition;
  /** Inclusive min/max player level range for the dungeon. */
  levelRange: [number, number];
}

/** Generic point of interest (shrine, landmark, NPC camp, etc.). */
export interface PointOfInterest {
  id: string;
  name: string;
  position: TilePosition;
  type: string;
  description: string;
}

/** Full data blob for a single region. */
export interface RegionData {
  /** Unique identifier (matches the RegionPreset key). */
  id: string;
  /** Display name shown on the world map. */
  name: string;
  /** Position of this region's top-left corner on the world grid (tile coords). */
  position: TilePosition;
  /** Grid dimensions in tiles. */
  size: { width: number; height: number };
  /** Biome preset used for terrain generation. */
  biomePreset: RegionPreset;
  /** Connections to other regions. */
  connections: RegionConnection[];
  /** Towns in this region. */
  towns: TownRef[];
  /** Dungeons in this region. */
  dungeons: DungeonRef[];
  /** Miscellaneous points of interest. */
  pointsOfInterest: PointOfInterest[];
  /** Whether the player must unlock this region (default false). */
  locked: boolean;
}

// ==================================================================
// Region definitions
// ==================================================================

const REGION_TILE_SIZE = 200;

/** Build all five region data objects. */
function buildRegions(): RegionData[] {
  return [
    // ----------------------------------------------------------
    // Elderwood Forest (centre)
    // ----------------------------------------------------------
    {
      id: 'elderwood',
      name: 'Elderwood Forest',
      position: { x: 200, y: 200 },
      size: { width: REGION_TILE_SIZE, height: REGION_TILE_SIZE },
      biomePreset: 'elderwood',
      locked: false,
      connections: [
        {
          targetRegionId: 'frostpeak',
          exitPosition: { x: 100, y: 0 },
          entryPosition: { x: 100, y: 195 },
          name: 'Northwind Pass',
        },
        {
          targetRegionId: 'scorched-wastes',
          exitPosition: { x: 199, y: 100 },
          entryPosition: { x: 5, y: 100 },
          name: 'Dustwall Gate',
        },
        {
          targetRegionId: 'shadowmire',
          exitPosition: { x: 100, y: 199 },
          entryPosition: { x: 100, y: 5 },
          name: 'Bogbridge Crossing',
        },
      ],
      towns: [
        { id: 'oakhollow', name: 'Oakhollow', position: { x: 60, y: 80 }, type: 'village' },
        { id: 'fernvale', name: 'Fernvale', position: { x: 140, y: 50 }, type: 'outpost' },
        { id: 'thornwick', name: 'Thornwick', position: { x: 110, y: 150 }, type: 'fortress' },
      ],
      dungeons: [
        { id: 'hollow-oak-crypt', name: 'Hollow Oak Crypt', position: { x: 30, y: 40 }, levelRange: [1, 5] },
        { id: 'spider-nest', name: 'Webmother\'s Nest', position: { x: 170, y: 90 }, levelRange: [4, 8] },
        { id: 'elder-sanctum', name: 'Elder Sanctum', position: { x: 100, y: 180 }, levelRange: [8, 12] },
      ],
      pointsOfInterest: [
        { id: 'moonpetal-grove', name: 'Moonpetal Grove', position: { x: 80, y: 30 }, type: 'gathering', description: 'Rare Moonpetal flowers bloom here only at night.' },
        { id: 'ancient-waystone', name: 'Ancient Waystone', position: { x: 100, y: 100 }, type: 'waystone', description: 'A crumbling stone circle that hums with residual magic.' },
        { id: 'hermit-hut', name: 'Hermit\'s Hut', position: { x: 20, y: 160 }, type: 'npc', description: 'Home of the reclusive sage Alden.' },
      ],
    },

    // ----------------------------------------------------------
    // Frostpeak Mountains (north)
    // ----------------------------------------------------------
    {
      id: 'frostpeak',
      name: 'Frostpeak Mountains',
      position: { x: 200, y: 0 },
      size: { width: REGION_TILE_SIZE, height: REGION_TILE_SIZE },
      biomePreset: 'frostpeak',
      locked: false,
      connections: [
        {
          targetRegionId: 'elderwood',
          exitPosition: { x: 100, y: 199 },
          entryPosition: { x: 100, y: 5 },
          name: 'Northwind Pass',
        },
      ],
      towns: [
        { id: 'glacierhaven', name: 'Glacierhaven', position: { x: 90, y: 120 }, type: 'village' },
        { id: 'ironhold', name: 'Ironhold', position: { x: 50, y: 60 }, type: 'fortress' },
      ],
      dungeons: [
        { id: 'frozen-caverns', name: 'Frozen Caverns', position: { x: 30, y: 30 }, levelRange: [10, 14] },
        { id: 'wyrmrest-peak', name: 'Wyrmrest Peak', position: { x: 160, y: 40 }, levelRange: [14, 18] },
        { id: 'crystal-mines', name: 'Crystal Mines', position: { x: 100, y: 170 }, levelRange: [12, 16] },
      ],
      pointsOfInterest: [
        { id: 'frozen-lake', name: 'Mirror Lake', position: { x: 140, y: 100 }, type: 'landmark', description: 'A perfectly frozen lake said to show visions of the future.' },
        { id: 'summit-shrine', name: 'Summit Shrine', position: { x: 100, y: 10 }, type: 'shrine', description: 'An ancient shrine to the wind god, perched on the highest peak.' },
      ],
    },

    // ----------------------------------------------------------
    // Scorched Wastes (east)
    // ----------------------------------------------------------
    {
      id: 'scorched-wastes',
      name: 'Scorched Wastes',
      position: { x: 400, y: 200 },
      size: { width: REGION_TILE_SIZE, height: REGION_TILE_SIZE },
      biomePreset: 'scorched-wastes',
      locked: false,
      connections: [
        {
          targetRegionId: 'elderwood',
          exitPosition: { x: 0, y: 100 },
          entryPosition: { x: 195, y: 100 },
          name: 'Dustwall Gate',
        },
      ],
      towns: [
        { id: 'sun-haven', name: 'Sun Haven', position: { x: 80, y: 100 }, type: 'outpost' },
        { id: 'oasis-rest', name: 'Oasis Rest', position: { x: 150, y: 60 }, type: 'village' },
      ],
      dungeons: [
        { id: 'sand-serpent-den', name: 'Sand Serpent Den', position: { x: 40, y: 40 }, levelRange: [10, 14] },
        { id: 'sunken-temple', name: 'Sunken Temple', position: { x: 160, y: 140 }, levelRange: [14, 18] },
        { id: 'fire-chasm', name: 'Fire Chasm', position: { x: 100, y: 180 }, levelRange: [16, 20] },
      ],
      pointsOfInterest: [
        { id: 'mirage-oasis', name: 'Mirage Oasis', position: { x: 120, y: 30 }, type: 'gathering', description: 'A shimmering oasis that vanishes by midday.' },
        { id: 'bone-field', name: 'Bone Field', position: { x: 60, y: 160 }, type: 'landmark', description: 'Bleached bones of colossal beasts litter the sands.' },
      ],
    },

    // ----------------------------------------------------------
    // Shadowmire Swamp (south)
    // ----------------------------------------------------------
    {
      id: 'shadowmire',
      name: 'Shadowmire Swamp',
      position: { x: 200, y: 400 },
      size: { width: REGION_TILE_SIZE, height: REGION_TILE_SIZE },
      biomePreset: 'shadowmire',
      locked: false,
      connections: [
        {
          targetRegionId: 'elderwood',
          exitPosition: { x: 100, y: 0 },
          entryPosition: { x: 100, y: 195 },
          name: 'Bogbridge Crossing',
        },
        {
          targetRegionId: 'cinder-core',
          exitPosition: { x: 100, y: 199 },
          entryPosition: { x: 100, y: 5 },
          name: 'Abyssal Descent',
        },
      ],
      towns: [
        { id: 'murkwater', name: 'Murkwater', position: { x: 70, y: 80 }, type: 'village' },
        { id: 'stilton', name: 'Stilton', position: { x: 140, y: 130 }, type: 'outpost' },
        { id: 'dreadfort', name: 'Dreadfort', position: { x: 50, y: 170 }, type: 'fortress' },
      ],
      dungeons: [
        { id: 'drowned-ruins', name: 'Drowned Ruins', position: { x: 30, y: 50 }, levelRange: [10, 14] },
        { id: 'hag-hollow', name: 'Hag\'s Hollow', position: { x: 160, y: 60 }, levelRange: [14, 18] },
        { id: 'shadow-nexus', name: 'Shadow Nexus', position: { x: 100, y: 190 }, levelRange: [18, 22] },
      ],
      pointsOfInterest: [
        { id: 'dead-grove', name: 'Dead Grove', position: { x: 90, y: 40 }, type: 'landmark', description: 'Petrified trees claw at a perpetually overcast sky.' },
        { id: 'will-o-wisp-marsh', name: 'Will-o\'-Wisp Marsh', position: { x: 170, y: 170 }, type: 'gathering', description: 'Eerie lights dance over the murky water at dusk.' },
      ],
    },

    // ----------------------------------------------------------
    // Cinder Core (hidden centre-below, unlocked after 4 bosses)
    // ----------------------------------------------------------
    {
      id: 'cinder-core',
      name: 'Cinder Core',
      position: { x: 200, y: 600 },
      size: { width: REGION_TILE_SIZE, height: REGION_TILE_SIZE },
      biomePreset: 'cinder-core',
      locked: true,
      connections: [
        {
          targetRegionId: 'shadowmire',
          exitPosition: { x: 100, y: 0 },
          entryPosition: { x: 100, y: 195 },
          name: 'Abyssal Descent',
        },
      ],
      towns: [
        { id: 'ember-rest', name: 'Ember Rest', position: { x: 100, y: 80 }, type: 'outpost' },
      ],
      dungeons: [
        { id: 'obsidian-spire', name: 'Obsidian Spire', position: { x: 50, y: 50 }, levelRange: [22, 26] },
        { id: 'molten-heart', name: 'Molten Heart', position: { x: 150, y: 100 }, levelRange: [26, 30] },
        { id: 'throne-of-embers', name: 'Throne of Embers', position: { x: 100, y: 170 }, levelRange: [28, 32] },
      ],
      pointsOfInterest: [
        { id: 'lava-falls', name: 'Lava Falls', position: { x: 60, y: 120 }, type: 'landmark', description: 'A cascade of molten rock that never cools.' },
        { id: 'ashen-waystone', name: 'Ashen Waystone', position: { x: 100, y: 30 }, type: 'waystone', description: 'A blackened waystone pulsing with fiery runes.' },
      ],
    },
  ];
}

// ==================================================================
// WorldMap class
// ==================================================================

export class WorldMap {
  // ----------------------------------------------------------------
  // Internal data
  // ----------------------------------------------------------------

  private readonly _regions: Map<string, RegionData> = new Map();

  /** Set of region IDs the player has unlocked. */
  private readonly _unlockedRegions: Set<string> = new Set();

  /** IDs of region bosses that have been defeated. */
  private readonly _defeatedBosses: Set<string> = new Set();

  // ----------------------------------------------------------------
  // Constructor
  // ----------------------------------------------------------------

  constructor() {
    const regions = buildRegions();
    for (const region of regions) {
      this._regions.set(region.id, region);
      // Unlock all non-locked regions by default.
      if (!region.locked) {
        this._unlockedRegions.add(region.id);
      }
    }
  }

  // ----------------------------------------------------------------
  // Region queries
  // ----------------------------------------------------------------

  /** Retrieve a region by its unique ID. */
  getRegion(id: string): RegionData | undefined {
    return this._regions.get(id);
  }

  /** Get all regions (both locked and unlocked). */
  getAllRegions(): RegionData[] {
    return Array.from(this._regions.values());
  }

  /**
   * Find which region contains a world-grid tile position.
   *
   * Returns `undefined` if the position is outside all regions.
   */
  getRegionAtPosition(tileX: number, tileY: number): RegionData | undefined {
    for (const region of this._regions.values()) {
      const { x, y } = region.position;
      const { width, height } = region.size;
      if (tileX >= x && tileX < x + width && tileY >= y && tileY < y + height) {
        return region;
      }
    }
    return undefined;
  }

  /** Get all connections leading out of a region. */
  getConnections(regionId: string): RegionConnection[] {
    return this._regions.get(regionId)?.connections ?? [];
  }

  // ----------------------------------------------------------------
  // Unlock / lock queries
  // ----------------------------------------------------------------

  /** Check whether a region is accessible to the player. */
  isRegionUnlocked(id: string): boolean {
    return this._unlockedRegions.has(id);
  }

  /** Manually unlock a region (e.g. after a story event). */
  unlockRegion(id: string): void {
    this._unlockedRegions.add(id);
  }

  /**
   * Record a region boss defeat.  When all 4 outer-region bosses are
   * defeated, the Cinder Core region is automatically unlocked.
   */
  defeatRegionBoss(regionId: string): void {
    this._defeatedBosses.add(regionId);

    const requiredBosses = ['elderwood', 'frostpeak', 'scorched-wastes', 'shadowmire'];
    const allDefeated = requiredBosses.every((id) => this._defeatedBosses.has(id));

    if (allDefeated) {
      this.unlockRegion('cinder-core');
    }
  }

  /** Check whether a specific region boss has been defeated. */
  isBossDefeated(regionId: string): boolean {
    return this._defeatedBosses.has(regionId);
  }

  // ----------------------------------------------------------------
  // Town / dungeon convenience accessors
  // ----------------------------------------------------------------

  /** Find a town across all regions by its ID. */
  findTown(townId: string): { town: TownRef; region: RegionData } | undefined {
    for (const region of this._regions.values()) {
      const town = region.towns.find((t) => t.id === townId);
      if (town) return { town, region };
    }
    return undefined;
  }

  /** Find a dungeon across all regions by its ID. */
  findDungeon(dungeonId: string): { dungeon: DungeonRef; region: RegionData } | undefined {
    for (const region of this._regions.values()) {
      const dungeon = region.dungeons.find((d) => d.id === dungeonId);
      if (dungeon) return { dungeon, region };
    }
    return undefined;
  }
}
