// ------------------------------------------------------------------
// TownSystem – town, building, NPC, and service management
// ------------------------------------------------------------------
//
// Defines the data model for towns and their contents (buildings,
// NPCs, services) and provides a lookup API for the UI, dialogue,
// and quest systems.
//
// The three Elderwood towns (Oakhollow, Fernvale, Thornwick) are
// fully defined with buildings and NPC references.  Other region
// towns provide placeholder structures that can be fleshed out
// in later sprints.
//
// Usage:
//   const towns = new TownSystem();
//   const oakhollow = towns.getTown('oakhollow');
//   const buildings = towns.getBuildings('oakhollow');
//   const services = towns.getServices('oakhollow');
// ------------------------------------------------------------------

// ==================================================================
// Enums & data types
// ==================================================================

/** The type of building (determines behaviour and icons). */
export type BuildingType =
  | 'inn'
  | 'shop'
  | 'blacksmith'
  | 'guild'
  | 'temple'
  | 'arena'
  | 'house'
  | 'training_ground'
  | 'barracks'
  | 'bounty_board';

/** Services offered by buildings. */
export type ServiceType =
  | 'rest'
  | 'buy'
  | 'sell'
  | 'repair'
  | 'identify'
  | 'heal'
  | 'train'
  | 'bounty_board';

/** Describes a single building within a town. */
export interface BuildingData {
  /** Unique identifier (scoped to the town). */
  id: string;
  /** Display name. */
  name: string;
  /** Building category. */
  type: BuildingType;
  /** Position within the town map (local tile coords). */
  position: { x: number; y: number };
  /** ID of the NPC found inside this building (if any). */
  npcId?: string;
  /** Services available at this building. */
  services: ServiceType[];
}

/** Describes an NPC that resides in a town. */
export interface NPCData {
  /** Unique identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Role / title shown in dialogue UI. */
  title: string;
  /** ID of the building this NPC occupies. */
  buildingId: string;
  /** One-liner greeting. */
  greeting: string;
}

/** Full data blob for a single town. */
export interface TownData {
  /** Unique identifier (matches TownRef.id from WorldMap). */
  id: string;
  /** Display name. */
  name: string;
  /** Region this town belongs to. */
  region: string;
  /** Position on the overworld (tile coords). */
  position: { x: number; y: number };
  /** Classification. */
  type: 'village' | 'outpost' | 'fortress';
  /** All buildings in this town. */
  buildings: BuildingData[];
  /** All NPCs in this town. */
  npcs: NPCData[];
  /** Aggregate set of services available across all buildings. */
  services: ServiceType[];
}

// ==================================================================
// Town definitions
// ==================================================================

function buildElderwood(): TownData[] {
  return [
    // ----------------------------------------------------------
    // Oakhollow – cozy village, the player's starting area
    // ----------------------------------------------------------
    {
      id: 'oakhollow',
      name: 'Oakhollow',
      region: 'elderwood',
      position: { x: 60, y: 80 },
      type: 'village',
      buildings: [
        {
          id: 'oakhollow-inn',
          name: 'The Mossy Barrel',
          type: 'inn',
          position: { x: 5, y: 3 },
          npcId: 'npc-barkeep-greta',
          services: ['rest'],
        },
        {
          id: 'oakhollow-shop',
          name: 'Bramble\'s General Goods',
          type: 'shop',
          position: { x: 10, y: 3 },
          npcId: 'npc-bramble',
          services: ['buy', 'sell'],
        },
        {
          id: 'oakhollow-healer',
          name: 'Healer\'s Hut',
          type: 'temple',
          position: { x: 3, y: 8 },
          npcId: 'npc-healer-miriel',
          services: ['heal', 'identify'],
        },
        {
          id: 'oakhollow-elder',
          name: 'Elder\'s House',
          type: 'house',
          position: { x: 8, y: 8 },
          npcId: 'npc-elder-orin',
          services: [],
        },
        {
          id: 'oakhollow-bounty',
          name: 'Bounty Board',
          type: 'bounty_board',
          position: { x: 7, y: 2 },
          services: ['bounty_board'],
        },
        {
          id: 'oakhollow-bramble-house',
          name: 'Farmer Bramble\'s House',
          type: 'house',
          position: { x: 13, y: 7 },
          npcId: 'npc-farmer-bramble',
          services: [],
        },
      ],
      npcs: [
        {
          id: 'npc-barkeep-greta',
          name: 'Greta',
          title: 'Innkeeper',
          buildingId: 'oakhollow-inn',
          greeting: 'Welcome to The Mossy Barrel! Rest your weary bones.',
        },
        {
          id: 'npc-bramble',
          name: 'Bramble',
          title: 'Shopkeeper',
          buildingId: 'oakhollow-shop',
          greeting: 'Need supplies? I\'ve got a bit of everything.',
        },
        {
          id: 'npc-healer-miriel',
          name: 'Miriel',
          title: 'Healer',
          buildingId: 'oakhollow-healer',
          greeting: 'The forest provides all we need to mend wounds.',
        },
        {
          id: 'npc-elder-orin',
          name: 'Elder Orin',
          title: 'Village Elder',
          buildingId: 'oakhollow-elder',
          greeting: 'Ah, young one. The forest stirs with dark tidings...',
        },
        {
          id: 'npc-farmer-bramble',
          name: 'Farmer Bramble',
          title: 'Farmer',
          buildingId: 'oakhollow-bramble-house',
          greeting: 'Blasted wolves got into the crops again!',
        },
      ],
      services: ['rest', 'buy', 'sell', 'heal', 'identify', 'bounty_board'],
    },

    // ----------------------------------------------------------
    // Fernvale – ranger outpost in the northern forest
    // ----------------------------------------------------------
    {
      id: 'fernvale',
      name: 'Fernvale',
      region: 'elderwood',
      position: { x: 140, y: 50 },
      type: 'outpost',
      buildings: [
        {
          id: 'fernvale-guild',
          name: 'Ranger\'s Lodge',
          type: 'guild',
          position: { x: 5, y: 5 },
          npcId: 'npc-ranger-captain-kael',
          services: ['train', 'bounty_board'],
        },
        {
          id: 'fernvale-fletcher',
          name: 'Whisperwind Fletcher',
          type: 'shop',
          position: { x: 10, y: 4 },
          npcId: 'npc-fletcher-lira',
          services: ['buy', 'sell'],
        },
        {
          id: 'fernvale-inn',
          name: 'The Verdant Rest',
          type: 'inn',
          position: { x: 3, y: 3 },
          npcId: 'npc-innkeeper-tom',
          services: ['rest'],
        },
        {
          id: 'fernvale-training',
          name: 'Training Ground',
          type: 'training_ground',
          position: { x: 8, y: 9 },
          npcId: 'npc-trainer-sira',
          services: ['train'],
        },
      ],
      npcs: [
        {
          id: 'npc-ranger-captain-kael',
          name: 'Captain Kael',
          title: 'Ranger Captain',
          buildingId: 'fernvale-guild',
          greeting: 'The forest is our charge. Report any disturbances.',
        },
        {
          id: 'npc-fletcher-lira',
          name: 'Lira',
          title: 'Fletcher',
          buildingId: 'fernvale-fletcher',
          greeting: 'Finest arrows in the Elderwood, right here.',
        },
        {
          id: 'npc-innkeeper-tom',
          name: 'Tom',
          title: 'Innkeeper',
          buildingId: 'fernvale-inn',
          greeting: 'Come in, come in. Warm stew on the fire.',
        },
        {
          id: 'npc-trainer-sira',
          name: 'Sira',
          title: 'Combat Trainer',
          buildingId: 'fernvale-training',
          greeting: 'Ready to sharpen your skills? Let\'s begin.',
        },
      ],
      services: ['rest', 'buy', 'sell', 'train', 'bounty_board'],
    },

    // ----------------------------------------------------------
    // Thornwick – fortified town in the southern forest
    // ----------------------------------------------------------
    {
      id: 'thornwick',
      name: 'Thornwick',
      region: 'elderwood',
      position: { x: 110, y: 150 },
      type: 'fortress',
      buildings: [
        {
          id: 'thornwick-arena',
          name: 'Thornwick Arena',
          type: 'arena',
          position: { x: 8, y: 4 },
          npcId: 'npc-arena-master-vex',
          services: ['train'],
        },
        {
          id: 'thornwick-blacksmith',
          name: 'Iron Thorn Forge',
          type: 'blacksmith',
          position: { x: 4, y: 6 },
          npcId: 'npc-blacksmith-duran',
          services: ['buy', 'sell', 'repair'],
        },
        {
          id: 'thornwick-thieves-guild',
          name: 'The Hollow Stump',
          type: 'guild',
          position: { x: 13, y: 10 },
          npcId: 'npc-guild-master-shade',
          services: ['buy', 'sell', 'identify'],
        },
        {
          id: 'thornwick-barracks',
          name: 'Guard Barracks',
          type: 'barracks',
          position: { x: 2, y: 2 },
          npcId: 'npc-guard-captain-marta',
          services: ['bounty_board'],
        },
      ],
      npcs: [
        {
          id: 'npc-arena-master-vex',
          name: 'Vex',
          title: 'Arena Master',
          buildingId: 'thornwick-arena',
          greeting: 'Think you\'re tough? Prove it in the ring.',
        },
        {
          id: 'npc-blacksmith-duran',
          name: 'Duran',
          title: 'Blacksmith',
          buildingId: 'thornwick-blacksmith',
          greeting: 'Iron and fire, that\'s all I need. What do you need?',
        },
        {
          id: 'npc-guild-master-shade',
          name: 'Shade',
          title: 'Guild Master',
          buildingId: 'thornwick-thieves-guild',
          greeting: '...you didn\'t find this place by accident, did you?',
        },
        {
          id: 'npc-guard-captain-marta',
          name: 'Captain Marta',
          title: 'Guard Captain',
          buildingId: 'thornwick-barracks',
          greeting: 'Thornwick stands strong. Check the board for bounties.',
        },
      ],
      services: ['buy', 'sell', 'repair', 'identify', 'train', 'bounty_board'],
    },
  ];
}

// ------------------------------------------------------------------
// Placeholder towns for other regions
// ------------------------------------------------------------------

function buildFrostpeak(): TownData[] {
  return [
    {
      id: 'glacierhaven',
      name: 'Glacierhaven',
      region: 'frostpeak',
      position: { x: 90, y: 120 },
      type: 'village',
      buildings: [
        { id: 'glacierhaven-inn', name: 'Frostfire Tavern', type: 'inn', position: { x: 5, y: 4 }, npcId: 'npc-gh-innkeeper', services: ['rest'] },
        { id: 'glacierhaven-shop', name: 'Winterhorn Supplies', type: 'shop', position: { x: 9, y: 4 }, npcId: 'npc-gh-shopkeeper', services: ['buy', 'sell'] },
        { id: 'glacierhaven-healer', name: 'Ice Sage\'s Sanctum', type: 'temple', position: { x: 4, y: 8 }, npcId: 'npc-gh-healer', services: ['heal'] },
      ],
      npcs: [
        { id: 'npc-gh-innkeeper', name: 'Bjorn', title: 'Innkeeper', buildingId: 'glacierhaven-inn', greeting: 'Warm yourself by the fire, traveller.' },
        { id: 'npc-gh-shopkeeper', name: 'Helga', title: 'Shopkeeper', buildingId: 'glacierhaven-shop', greeting: 'Stock up before heading into the peaks.' },
        { id: 'npc-gh-healer', name: 'Sage Ymir', title: 'Ice Sage', buildingId: 'glacierhaven-healer', greeting: 'The cold numbs pain, but I can do better.' },
      ],
      services: ['rest', 'buy', 'sell', 'heal'],
    },
    {
      id: 'ironhold',
      name: 'Ironhold',
      region: 'frostpeak',
      position: { x: 50, y: 60 },
      type: 'fortress',
      buildings: [
        { id: 'ironhold-blacksmith', name: 'Runeforge', type: 'blacksmith', position: { x: 5, y: 5 }, npcId: 'npc-ih-blacksmith', services: ['buy', 'sell', 'repair'] },
        { id: 'ironhold-guild', name: 'Mountain Guard Hall', type: 'guild', position: { x: 10, y: 3 }, npcId: 'npc-ih-commander', services: ['train', 'bounty_board'] },
      ],
      npcs: [
        { id: 'npc-ih-blacksmith', name: 'Tormund', title: 'Master Smith', buildingId: 'ironhold-blacksmith', greeting: 'Runeforged steel — strongest in the realm.' },
        { id: 'npc-ih-commander', name: 'Commander Astrid', title: 'Mountain Guard', buildingId: 'ironhold-guild', greeting: 'The peaks are dangerous. Prepare well.' },
      ],
      services: ['buy', 'sell', 'repair', 'train', 'bounty_board'],
    },
  ];
}

function buildScorchedWastes(): TownData[] {
  return [
    {
      id: 'sun-haven',
      name: 'Sun Haven',
      region: 'scorched-wastes',
      position: { x: 80, y: 100 },
      type: 'outpost',
      buildings: [
        { id: 'sunhaven-inn', name: 'Sandstone Refuge', type: 'inn', position: { x: 4, y: 4 }, npcId: 'npc-sh-innkeeper', services: ['rest'] },
        { id: 'sunhaven-shop', name: 'Desert Trader', type: 'shop', position: { x: 9, y: 4 }, npcId: 'npc-sh-trader', services: ['buy', 'sell'] },
      ],
      npcs: [
        { id: 'npc-sh-innkeeper', name: 'Rashid', title: 'Innkeeper', buildingId: 'sunhaven-inn', greeting: 'Water is life out here. Drink freely.' },
        { id: 'npc-sh-trader', name: 'Zara', title: 'Trader', buildingId: 'sunhaven-shop', greeting: 'Rare goods from across the wastes.' },
      ],
      services: ['rest', 'buy', 'sell'],
    },
    {
      id: 'oasis-rest',
      name: 'Oasis Rest',
      region: 'scorched-wastes',
      position: { x: 150, y: 60 },
      type: 'village',
      buildings: [
        { id: 'oasis-healer', name: 'Palm Healer', type: 'temple', position: { x: 5, y: 5 }, npcId: 'npc-or-healer', services: ['heal'] },
        { id: 'oasis-shop', name: 'Oasis Market', type: 'shop', position: { x: 9, y: 5 }, npcId: 'npc-or-merchant', services: ['buy', 'sell'] },
      ],
      npcs: [
        { id: 'npc-or-healer', name: 'Amira', title: 'Healer', buildingId: 'oasis-healer', greeting: 'The desert sun is cruel. Let me tend your burns.' },
        { id: 'npc-or-merchant', name: 'Farid', title: 'Merchant', buildingId: 'oasis-shop', greeting: 'Fresh water and dried meats, always in stock.' },
      ],
      services: ['heal', 'buy', 'sell'],
    },
  ];
}

function buildShadowmire(): TownData[] {
  return [
    {
      id: 'murkwater',
      name: 'Murkwater',
      region: 'shadowmire',
      position: { x: 70, y: 80 },
      type: 'village',
      buildings: [
        { id: 'murkwater-inn', name: 'The Dripping Lantern', type: 'inn', position: { x: 4, y: 4 }, npcId: 'npc-mw-innkeeper', services: ['rest'] },
        { id: 'murkwater-shop', name: 'Bog Provisions', type: 'shop', position: { x: 9, y: 4 }, npcId: 'npc-mw-shopkeeper', services: ['buy', 'sell'] },
        { id: 'murkwater-healer', name: 'Swamp Witch\'s Hut', type: 'temple', position: { x: 3, y: 8 }, npcId: 'npc-mw-witch', services: ['heal', 'identify'] },
      ],
      npcs: [
        { id: 'npc-mw-innkeeper', name: 'Grog', title: 'Innkeeper', buildingId: 'murkwater-inn', greeting: 'Don\'t mind the damp. The beds are mostly dry.' },
        { id: 'npc-mw-shopkeeper', name: 'Nessa', title: 'Shopkeeper', buildingId: 'murkwater-shop', greeting: 'Everything\'s imported. Prices reflect the danger.' },
        { id: 'npc-mw-witch', name: 'Old Agatha', title: 'Swamp Witch', buildingId: 'murkwater-healer', greeting: 'Heh heh... what ails you, dearie?' },
      ],
      services: ['rest', 'buy', 'sell', 'heal', 'identify'],
    },
    {
      id: 'stilton',
      name: 'Stilton',
      region: 'shadowmire',
      position: { x: 140, y: 130 },
      type: 'outpost',
      buildings: [
        { id: 'stilton-bounty', name: 'Hunter\'s Post', type: 'bounty_board', position: { x: 5, y: 4 }, services: ['bounty_board'] },
        { id: 'stilton-shop', name: 'Stilton Supply', type: 'shop', position: { x: 9, y: 4 }, npcId: 'npc-st-shopkeeper', services: ['buy', 'sell'] },
      ],
      npcs: [
        { id: 'npc-st-shopkeeper', name: 'Fennick', title: 'Outpost Trader', buildingId: 'stilton-shop', greeting: 'Quick trades only. This place isn\'t safe after dark.' },
      ],
      services: ['buy', 'sell', 'bounty_board'],
    },
    {
      id: 'dreadfort',
      name: 'Dreadfort',
      region: 'shadowmire',
      position: { x: 50, y: 170 },
      type: 'fortress',
      buildings: [
        { id: 'dreadfort-blacksmith', name: 'Dread Anvil', type: 'blacksmith', position: { x: 5, y: 5 }, npcId: 'npc-df-blacksmith', services: ['buy', 'sell', 'repair'] },
        { id: 'dreadfort-guild', name: 'Shadow Watch HQ', type: 'guild', position: { x: 10, y: 3 }, npcId: 'npc-df-commander', services: ['train', 'bounty_board'] },
      ],
      npcs: [
        { id: 'npc-df-blacksmith', name: 'Korr', title: 'Blacksmith', buildingId: 'dreadfort-blacksmith', greeting: 'Acid-resistant gear, a necessity down here.' },
        { id: 'npc-df-commander', name: 'Commander Voss', title: 'Shadow Watch', buildingId: 'dreadfort-guild', greeting: 'The swamp breeds horrors. Stay vigilant.' },
      ],
      services: ['buy', 'sell', 'repair', 'train', 'bounty_board'],
    },
  ];
}

function buildCinderCore(): TownData[] {
  return [
    {
      id: 'ember-rest',
      name: 'Ember Rest',
      region: 'cinder-core',
      position: { x: 100, y: 80 },
      type: 'outpost',
      buildings: [
        { id: 'ember-inn', name: 'Molten Hearth', type: 'inn', position: { x: 5, y: 4 }, npcId: 'npc-er-innkeeper', services: ['rest'] },
        { id: 'ember-blacksmith', name: 'Cinderforge', type: 'blacksmith', position: { x: 10, y: 4 }, npcId: 'npc-er-blacksmith', services: ['buy', 'sell', 'repair'] },
        { id: 'ember-healer', name: 'Flame Warden\'s Altar', type: 'temple', position: { x: 4, y: 8 }, npcId: 'npc-er-healer', services: ['heal'] },
      ],
      npcs: [
        { id: 'npc-er-innkeeper', name: 'Cinder', title: 'Innkeeper', buildingId: 'ember-inn', greeting: 'Rest while you can. The core doesn\'t forgive weakness.' },
        { id: 'npc-er-blacksmith', name: 'Vulkan', title: 'Master Forger', buildingId: 'ember-blacksmith', greeting: 'Obsidian-folded steel. Nothing finer exists.' },
        { id: 'npc-er-healer', name: 'Flame Warden Pyra', title: 'Flame Warden', buildingId: 'ember-healer', greeting: 'The eternal flame cleanses all corruption.' },
      ],
      services: ['rest', 'buy', 'sell', 'repair', 'heal'],
    },
  ];
}

// ==================================================================
// TownSystem
// ==================================================================

export class TownSystem {
  // ----------------------------------------------------------------
  // Internal data
  // ----------------------------------------------------------------

  private readonly _towns: Map<string, TownData> = new Map();

  // ----------------------------------------------------------------
  // Constructor
  // ----------------------------------------------------------------

  constructor() {
    const allTowns = [
      ...buildElderwood(),
      ...buildFrostpeak(),
      ...buildScorchedWastes(),
      ...buildShadowmire(),
      ...buildCinderCore(),
    ];

    for (const town of allTowns) {
      this._towns.set(town.id, town);
    }
  }

  // ----------------------------------------------------------------
  // Town queries
  // ----------------------------------------------------------------

  /** Retrieve a town by its unique ID. */
  getTown(id: string): TownData | undefined {
    return this._towns.get(id);
  }

  /** Get all towns. */
  getAllTowns(): TownData[] {
    return Array.from(this._towns.values());
  }

  /** Get all towns within a specific region. */
  getTownsByRegion(regionId: string): TownData[] {
    return this.getAllTowns().filter((t) => t.region === regionId);
  }

  // ----------------------------------------------------------------
  // Building queries
  // ----------------------------------------------------------------

  /** Get all buildings in a town. */
  getBuildings(townId: string): BuildingData[] {
    return this._towns.get(townId)?.buildings ?? [];
  }

  /** Find a specific building by id within a town. */
  getBuilding(townId: string, buildingId: string): BuildingData | undefined {
    return this.getBuildings(townId).find((b) => b.id === buildingId);
  }

  /** Get all buildings of a specific type across a town. */
  getBuildingsByType(townId: string, type: BuildingType): BuildingData[] {
    return this.getBuildings(townId).filter((b) => b.type === type);
  }

  // ----------------------------------------------------------------
  // NPC queries
  // ----------------------------------------------------------------

  /** Get all NPCs in a town. */
  getNPCs(townId: string): NPCData[] {
    return this._towns.get(townId)?.npcs ?? [];
  }

  /** Find a specific NPC by id within a town. */
  getNPC(townId: string, npcId: string): NPCData | undefined {
    return this.getNPCs(townId).find((n) => n.id === npcId);
  }

  /** Find an NPC by id across all towns. */
  findNPC(npcId: string): { npc: NPCData; town: TownData } | undefined {
    for (const town of this._towns.values()) {
      const npc = town.npcs.find((n) => n.id === npcId);
      if (npc) return { npc, town };
    }
    return undefined;
  }

  // ----------------------------------------------------------------
  // Service queries
  // ----------------------------------------------------------------

  /** Get all services available in a town (aggregate from all buildings). */
  getServices(townId: string): ServiceType[] {
    return this._towns.get(townId)?.services ?? [];
  }

  /** Check whether a town offers a specific service. */
  hasService(townId: string, service: ServiceType): boolean {
    return this.getServices(townId).includes(service);
  }

  /** Get all buildings in a town that offer a specific service. */
  getBuildingsWithService(townId: string, service: ServiceType): BuildingData[] {
    return this.getBuildings(townId).filter((b) => b.services.includes(service));
  }
}
