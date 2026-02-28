// ---------------------------------------------------------------------------
// CodexSystem.ts — Comprehensive in-game encyclopedia for Realms of Conquest
// ---------------------------------------------------------------------------
// Tracks everything the player has discovered: enemies, lore, items, spells,
// regions, and characters.  Bestiary entries grow with kill counts.  Milestone
// rewards are granted at 25 / 50 / 75 / 100 % completion.
// ---------------------------------------------------------------------------

export enum CodexCategory {
  BESTIARY = 'bestiary',
  LORE = 'lore',
  ITEMS = 'items',
  SPELLS = 'spells',
  REGIONS = 'regions',
  CHARACTERS = 'characters',
}

export interface CodexSubEntry {
  label: string;
  value: string;
  revealed: boolean;
  requiredLevel: number; // 1, 2, or 3
}

export interface CodexEntry {
  id: string;
  category: CodexCategory;
  name: string;
  description: string;
  discovered: boolean;
  discoveredAt?: number;
  completionLevel: number; // 0-3: unknown, basic, detailed, complete
  imageId?: string;
  tags: string[];
  subEntries?: CodexSubEntry[];
}

export interface BestiaryEntry extends CodexEntry {
  enemyId: string;
  killCount: number;
  weaknesses: string[];
  resistances: string[];
  drops: string[];
  locations: string[];
  killsToComplete: number;
}

export interface CodexProgress {
  totalEntries: number;
  discovered: number;
  completed: number;
  percentage: number;
}

// ---- internal serialisation shapes ----------------------------------------

interface CompletionMilestone {
  threshold: number;
  reward: string;
  claimed: boolean;
}

interface SerializedCodexData {
  entries: Array<[string, CodexEntry]>;
  bestiaryEntries: Array<[string, BestiaryEntry]>;
  milestones: CompletionMilestone[];
}

// ---------------------------------------------------------------------------
// CodexSystem
// ---------------------------------------------------------------------------

export class CodexSystem {
  private entries: Map<string, CodexEntry>;
  private bestiaryEntries: Map<string, BestiaryEntry>;
  private milestones: CompletionMilestone[];

  constructor() {
    this.entries = new Map<string, CodexEntry>();
    this.bestiaryEntries = new Map<string, BestiaryEntry>();
    this.milestones = [
      { threshold: 25, reward: "Scholar's Ring", claimed: false },
      { threshold: 50, reward: "Loremaster's Tome", claimed: false },
      { threshold: 75, reward: "Cartographer's Compass", claimed: false },
      { threshold: 100, reward: "Omniscient Crown", claimed: false },
    ];
  }

  // ---- Discovery ----------------------------------------------------------

  discoverEntry(
    id: string,
    category: CodexCategory,
    name: string,
    description: string,
    tags: string[] = [],
  ): void {
    const existing = this.entries.get(id);
    if (existing && existing.discovered) {
      return; // already discovered — do nothing
    }

    const entry: CodexEntry = {
      id,
      category,
      name,
      description,
      discovered: true,
      discoveredAt: Date.now(),
      completionLevel: 1,
      tags,
      subEntries: [],
    };

    this.entries.set(id, entry);
  }

  recordKill(enemyId: string): void {
    const entry = this.bestiaryEntries.get(enemyId);
    if (!entry) {
      return;
    }

    entry.killCount += 1;
    entry.discovered = true;

    if (entry.discoveredAt === undefined) {
      entry.discoveredAt = Date.now();
    }

    // Completion level thresholds:
    //   0 kills → 0 (unknown — just name)
    //   1 kill  → 1 (basic — description + type)
    //   5 kills → 2 (detailed — weaknesses + resistances)
    //  10 kills → 3 (complete — all drops + locations)
    if (entry.killCount >= entry.killsToComplete) {
      entry.completionLevel = 3;
    } else if (entry.killCount >= 5) {
      entry.completionLevel = 2;
    } else if (entry.killCount >= 1) {
      entry.completionLevel = 1;
    }

    // Reveal sub-entries whose requirement is met
    if (entry.subEntries) {
      for (const sub of entry.subEntries) {
        if (sub.requiredLevel <= entry.completionLevel) {
          sub.revealed = true;
        }
      }
    }

    // Keep general map in sync
    this.entries.set(entry.id, entry);
  }

  discoverItem(
    itemId: string,
    name: string,
    description: string,
    rarity: string,
  ): void {
    const id = `item_${itemId}`;
    const entry: CodexEntry = {
      id,
      category: CodexCategory.ITEMS,
      name,
      description,
      discovered: true,
      discoveredAt: Date.now(),
      completionLevel: 3, // items are always fully known once found
      tags: ['item', rarity],
      subEntries: [
        { label: 'Rarity', value: rarity, revealed: true, requiredLevel: 1 },
      ],
    };
    this.entries.set(id, entry);
  }

  discoverSpell(
    spellId: string,
    name: string,
    school: string,
    description: string,
  ): void {
    const id = `spell_${spellId}`;
    const entry: CodexEntry = {
      id,
      category: CodexCategory.SPELLS,
      name,
      description,
      discovered: true,
      discoveredAt: Date.now(),
      completionLevel: 3,
      tags: ['spell', school],
      subEntries: [
        { label: 'School', value: school, revealed: true, requiredLevel: 1 },
      ],
    };
    this.entries.set(id, entry);
  }

  discoverRegion(regionId: string, name: string, description: string): void {
    const id = `region_${regionId}`;
    const entry: CodexEntry = {
      id,
      category: CodexCategory.REGIONS,
      name,
      description,
      discovered: true,
      discoveredAt: Date.now(),
      completionLevel: 1, // region completion grows as sub-areas are explored
      tags: ['region'],
      subEntries: [],
    };
    this.entries.set(id, entry);
  }

  discoverCharacter(charId: string, name: string, description: string): void {
    const id = `char_${charId}`;
    const entry: CodexEntry = {
      id,
      category: CodexCategory.CHARACTERS,
      name,
      description,
      discovered: true,
      discoveredAt: Date.now(),
      completionLevel: 1,
      tags: ['character'],
      subEntries: [],
    };
    this.entries.set(id, entry);
  }

  // ---- Bestiary -----------------------------------------------------------

  registerEnemy(
    enemyId: string,
    name: string,
    description: string,
    weaknesses: string[],
    resistances: string[],
    drops: string[],
    locations: string[],
  ): void {
    const id = `bestiary_${enemyId}`;

    const subEntries: CodexSubEntry[] = [
      { label: 'Description', value: description, revealed: false, requiredLevel: 1 },
      ...weaknesses.map((w): CodexSubEntry => ({
        label: 'Weakness',
        value: w,
        revealed: false,
        requiredLevel: 2,
      })),
      ...resistances.map((r): CodexSubEntry => ({
        label: 'Resistance',
        value: r,
        revealed: false,
        requiredLevel: 2,
      })),
      ...drops.map((d): CodexSubEntry => ({
        label: 'Drop',
        value: d,
        revealed: false,
        requiredLevel: 3,
      })),
      ...locations.map((l): CodexSubEntry => ({
        label: 'Location',
        value: l,
        revealed: false,
        requiredLevel: 3,
      })),
    ];

    const entry: BestiaryEntry = {
      id,
      category: CodexCategory.BESTIARY,
      name,
      description,
      discovered: false,
      completionLevel: 0,
      tags: ['enemy', 'bestiary'],
      subEntries,
      enemyId,
      killCount: 0,
      weaknesses,
      resistances,
      drops,
      locations,
      killsToComplete: 10,
    };

    this.bestiaryEntries.set(enemyId, entry);
    this.entries.set(id, entry);
  }

  getBestiaryEntry(enemyId: string): BestiaryEntry | undefined {
    return this.bestiaryEntries.get(enemyId);
  }

  // ---- Queries ------------------------------------------------------------

  getEntry(id: string): CodexEntry | undefined {
    return this.entries.get(id);
  }

  getEntriesByCategory(category: CodexCategory): CodexEntry[] {
    const result: CodexEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.category === category) {
        result.push(entry);
      }
    }
    return result;
  }

  getDiscoveredEntries(): CodexEntry[] {
    const result: CodexEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.discovered) {
        result.push(entry);
      }
    }
    return result;
  }

  getProgress(): CodexProgress {
    const totalEntries = this.entries.size;
    let discovered = 0;
    let completed = 0;

    for (const entry of this.entries.values()) {
      if (entry.discovered) {
        discovered++;
      }
      if (entry.completionLevel >= 3) {
        completed++;
      }
    }

    const percentage =
      totalEntries > 0 ? Math.floor((discovered / totalEntries) * 100) : 0;

    return { totalEntries, discovered, completed, percentage };
  }

  getCategoryProgress(category: CodexCategory): CodexProgress {
    let totalEntries = 0;
    let discovered = 0;
    let completed = 0;

    for (const entry of this.entries.values()) {
      if (entry.category !== category) {
        continue;
      }
      totalEntries++;
      if (entry.discovered) {
        discovered++;
      }
      if (entry.completionLevel >= 3) {
        completed++;
      }
    }

    const percentage =
      totalEntries > 0 ? Math.floor((discovered / totalEntries) * 100) : 0;

    return { totalEntries, discovered, completed, percentage };
  }

  searchEntries(query: string): CodexEntry[] {
    const lowerQuery = query.toLowerCase();
    const results: CodexEntry[] = [];

    for (const entry of this.entries.values()) {
      if (!entry.discovered) {
        continue;
      }

      const nameMatch = entry.name.toLowerCase().includes(lowerQuery);
      const descMatch = entry.description.toLowerCase().includes(lowerQuery);
      const tagMatch = entry.tags.some((t) =>
        t.toLowerCase().includes(lowerQuery),
      );

      if (nameMatch || descMatch || tagMatch) {
        results.push(entry);
      }
    }

    return results;
  }

  // ---- Serialization ------------------------------------------------------

  serialize(): object {
    const entriesArr: Array<[string, CodexEntry]> = [];
    for (const [key, value] of this.entries) {
      entriesArr.push([key, { ...value }]);
    }

    const bestiaryArr: Array<[string, BestiaryEntry]> = [];
    for (const [key, value] of this.bestiaryEntries) {
      bestiaryArr.push([key, { ...value }]);
    }

    const data: SerializedCodexData = {
      entries: entriesArr,
      bestiaryEntries: bestiaryArr,
      milestones: this.milestones.map((m) => ({ ...m })),
    };

    return data;
  }

  deserialize(data: object): void {
    const parsed = data as SerializedCodexData;

    this.entries.clear();
    this.bestiaryEntries.clear();

    if (parsed.entries) {
      for (const [key, value] of parsed.entries) {
        this.entries.set(key, value);
      }
    }

    if (parsed.bestiaryEntries) {
      for (const [key, value] of parsed.bestiaryEntries) {
        this.bestiaryEntries.set(key, value);
      }
    }

    if (parsed.milestones) {
      this.milestones = parsed.milestones.map((m) => ({ ...m }));
    }
  }

  // ---- Completion Rewards -------------------------------------------------

  getCompletionRewards(): {
    threshold: number;
    reward: string;
    claimed: boolean;
  }[] {
    return this.milestones.map((m) => ({
      threshold: m.threshold,
      reward: m.reward,
      claimed: m.claimed,
    }));
  }

  /**
   * Check if a new milestone has been reached.
   * Returns the reward description for the first unclaimed milestone that has
   * been hit, or `null` if no new milestone was reached.
   */
  checkMilestone(): string | null {
    const progress = this.getProgress();

    for (const milestone of this.milestones) {
      if (!milestone.claimed && progress.percentage >= milestone.threshold) {
        milestone.claimed = true;
        return milestone.reward;
      }
    }

    return null;
  }
}
