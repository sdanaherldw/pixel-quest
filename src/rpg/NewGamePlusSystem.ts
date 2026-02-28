// ---------------------------------------------------------------------------
// NewGamePlusSystem.ts — NG+ with Awakened forms and Ascension
// ---------------------------------------------------------------------------
// Handles multiple NG+ cycles (up to NG+5), enemy scaling, item ascension,
// character awakening, and carry-over logic for Realms of Conquest.
// ---------------------------------------------------------------------------

export interface NGPlusState {
  level: number; // 0 = first playthrough, 1 = NG+, … , 5 = NG+5
  maxLevel: number; // cap at 5
  enemyScaling: {
    hpMultiplier: number;
    damageMultiplier: number;
    xpMultiplier: number;
  };
  unlockedFeatures: string[];
  ascendedItems: Map<string, number>; // itemId → ascension level (1-3)
  awakenedCharacters: Set<string>; // character IDs with awakened forms
}

export interface AscendedItemBonus {
  level: number;
  statMultiplier: number; // 1.15 per level
  newEffect?: string;
  visualTier: string; // 'golden', 'crystalline', 'ethereal'
}

export interface AwakenedForm {
  characterId: string;
  name: string;
  statBonuses: Record<string, number>;
  newAbility: {
    name: string;
    description: string;
    damage?: number;
    cooldown?: number;
  };
  visualChanges: string[];
}

// ---- internal types -------------------------------------------------------

interface SerializedNGPlusData {
  level: number;
  maxLevel: number;
  ascendedItems: Array<[string, number]>;
  awakenedCharacters: string[];
  finalBossDefeated: boolean;
}

// ---- pre-defined mechanics per NG+ level ----------------------------------

const NG_PLUS_MECHANICS: Record<number, string[]> = {
  1: [
    'Elite modifiers on all enemies',
    'Boss rage timers halved',
  ],
  2: [
    'New attack patterns for all bosses',
    'Environmental hazards deal double damage',
  ],
  3: [
    'Enemy groups +50% size',
    'Mini-bosses appear in regular rooms',
  ],
  4: [
    'Cursed equipment drops (high stats with drawbacks)',
  ],
  5: [
    'Legendary difficulty — one-shot mechanics',
    'Permadeath mode available',
  ],
};

// ---- pre-defined awakened forms -------------------------------------------

const AWAKENED_FORMS: Map<string, AwakenedForm> = new Map<string, AwakenedForm>([
  [
    'crag_hack',
    {
      characterId: 'crag_hack',
      name: 'Awakened Crag Hack',
      statBonuses: { STR: 5, DEX: 5, CON: 5, INT: 5, WIS: 5 },
      newAbility: {
        name: 'Primordial Rage',
        description:
          '3x damage AoE for 5 seconds. Berserker Blood multiplier x1.5.',
        damage: 3.0,
        cooldown: 60,
      },
      visualChanges: ['Flame aura surrounds body', 'Glowing red eyes'],
    },
  ],
  [
    'knight',
    {
      characterId: 'knight',
      name: 'Awakened Knight',
      statBonuses: { STR: 3, CON: 3 },
      newAbility: {
        name: 'Aegis of Light',
        description: 'Party invulnerability for 3 seconds.',
        cooldown: 90,
      },
      visualChanges: [
        'Radiant golden armor glow',
        'Floating shield runes around body',
      ],
    },
  ],
  [
    'sorcerer',
    {
      characterId: 'sorcerer',
      name: 'Awakened Sorcerer',
      statBonuses: { INT: 5 },
      newAbility: {
        name: 'Arcane Singularity',
        description:
          'Creates a black hole that pulls and damages all enemies in range.',
        damage: 4.0,
        cooldown: 75,
      },
      visualChanges: [
        'Arcane runes orbit the caster',
        'Eyes glow with violet energy',
      ],
    },
  ],
  [
    'cleric',
    {
      characterId: 'cleric',
      name: 'Awakened Cleric',
      statBonuses: { WIS: 5 },
      newAbility: {
        name: 'Divine Resurrection',
        description: 'Full party heal and revive all fallen allies.',
        cooldown: 120,
      },
      visualChanges: [
        'Holy halo above head',
        'Ethereal wings of light',
      ],
    },
  ],
]);

// ---- ascension tiers ------------------------------------------------------

const ASCENSION_EFFECTS: Record<number, { effect: string; visualTier: string }> = {
  1: { effect: 'Bonus elemental proc on hit (10%)', visualTier: 'golden' },
  2: { effect: 'Auto-heal 2% HP per kill', visualTier: 'crystalline' },
  3: { effect: 'Chance to negate incoming damage (5%)', visualTier: 'ethereal' },
};

// ---------------------------------------------------------------------------
// NewGamePlusSystem
// ---------------------------------------------------------------------------

export class NewGamePlusSystem {
  private state: NGPlusState;
  private finalBossDefeated: boolean;

  constructor() {
    this.finalBossDefeated = false;
    this.state = {
      level: 0,
      maxLevel: 5,
      enemyScaling: {
        hpMultiplier: 1.0,
        damageMultiplier: 1.0,
        xpMultiplier: 1.0,
      },
      unlockedFeatures: [],
      ascendedItems: new Map<string, number>(),
      awakenedCharacters: new Set<string>(),
    };
  }

  // ---- NG+ Management -----------------------------------------------------

  /** Mark the final boss as defeated so NG+ can be started. */
  markFinalBossDefeated(): void {
    this.finalBossDefeated = true;
  }

  canStartNGPlus(): boolean {
    return this.finalBossDefeated && this.state.level < this.state.maxLevel;
  }

  startNewGamePlus(): NGPlusState {
    if (!this.canStartNGPlus()) {
      return this.state;
    }

    this.state.level += 1;
    this.finalBossDefeated = false;

    // Recalculate scaling
    const lvl = this.state.level;
    this.state.enemyScaling = {
      hpMultiplier: 2.0 * lvl,
      damageMultiplier: 1.5 * lvl,
      xpMultiplier: 1.5 * lvl,
    };

    // Unlock features for the new level and all previous levels
    const features: string[] = [];
    for (let i = 1; i <= lvl; i++) {
      const mechanics = NG_PLUS_MECHANICS[i];
      if (mechanics) {
        features.push(...mechanics);
      }
    }
    this.state.unlockedFeatures = features;

    return { ...this.state, ascendedItems: new Map(this.state.ascendedItems), awakenedCharacters: new Set(this.state.awakenedCharacters) };
  }

  getNGPlusLevel(): number {
    return this.state.level;
  }

  // ---- Enemy Scaling ------------------------------------------------------

  getEnemyHPMultiplier(): number {
    return this.state.level === 0 ? 1.0 : 2.0 * this.state.level;
  }

  getEnemyDamageMultiplier(): number {
    return this.state.level === 0 ? 1.0 : 1.5 * this.state.level;
  }

  getXPMultiplier(): number {
    return this.state.level === 0 ? 1.0 : 1.5 * this.state.level;
  }

  getNewMechanics(): string[] {
    const mechanics = NG_PLUS_MECHANICS[this.state.level];
    return mechanics ? [...mechanics] : [];
  }

  // ---- Ascension ----------------------------------------------------------

  canAscendItem(itemId: string, itemRarity: string): boolean {
    if (itemRarity !== 'legendary' && itemRarity !== 'epic') {
      return false;
    }
    const currentLevel = this.state.ascendedItems.get(itemId) ?? 0;
    return currentLevel < this.getMaxAscension();
  }

  ascendItem(itemId: string): AscendedItemBonus | null {
    const currentLevel = this.state.ascendedItems.get(itemId) ?? 0;
    if (currentLevel >= this.getMaxAscension()) {
      return null;
    }

    const newLevel = currentLevel + 1;
    this.state.ascendedItems.set(itemId, newLevel);

    return this.buildAscensionBonus(newLevel);
  }

  getAscensionLevel(itemId: string): number {
    return this.state.ascendedItems.get(itemId) ?? 0;
  }

  getAscensionBonus(itemId: string): AscendedItemBonus | null {
    const level = this.state.ascendedItems.get(itemId);
    if (level === undefined || level === 0) {
      return null;
    }
    return this.buildAscensionBonus(level);
  }

  getMaxAscension(): number {
    return 3;
  }

  private buildAscensionBonus(level: number): AscendedItemBonus {
    const tierInfo = ASCENSION_EFFECTS[level] ?? ASCENSION_EFFECTS[1]!;
    return {
      level,
      statMultiplier: Math.pow(1.15, level),
      newEffect: tierInfo.effect,
      visualTier: tierInfo.visualTier,
    };
  }

  // ---- Awakened Characters ------------------------------------------------

  canAwaken(characterId: string): boolean {
    if (this.state.awakenedCharacters.has(characterId)) {
      return false;
    }
    return AWAKENED_FORMS.has(characterId);
  }

  awakenCharacter(characterId: string): AwakenedForm | null {
    if (!this.canAwaken(characterId)) {
      return null;
    }
    const form = AWAKENED_FORMS.get(characterId);
    if (!form) {
      return null;
    }

    this.state.awakenedCharacters.add(characterId);
    return { ...form, statBonuses: { ...form.statBonuses }, newAbility: { ...form.newAbility }, visualChanges: [...form.visualChanges] };
  }

  isAwakened(characterId: string): boolean {
    return this.state.awakenedCharacters.has(characterId);
  }

  getAwakenedForm(characterId: string): AwakenedForm | null {
    if (!this.state.awakenedCharacters.has(characterId)) {
      return null;
    }
    const form = AWAKENED_FORMS.get(characterId);
    if (!form) {
      return null;
    }
    return { ...form, statBonuses: { ...form.statBonuses }, newAbility: { ...form.newAbility }, visualChanges: [...form.visualChanges] };
  }

  // ---- Carry-Over ---------------------------------------------------------

  getCarryOverData(): {
    levels: boolean;
    equipment: boolean;
    gold: boolean;
    goldPercentage: number;
    spells: boolean;
    codex: boolean;
    questProgress: boolean;
    worldState: boolean;
    skillPoints: boolean;
  } {
    return {
      levels: true,
      equipment: true,
      gold: true,
      goldPercentage: 50,
      spells: true,
      codex: true,
      questProgress: false,
      worldState: false,
      skillPoints: true,
    };
  }

  // ---- Serialization ------------------------------------------------------

  serialize(): object {
    const ascendedArr: Array<[string, number]> = [];
    for (const [key, value] of this.state.ascendedItems) {
      ascendedArr.push([key, value]);
    }

    const data: SerializedNGPlusData = {
      level: this.state.level,
      maxLevel: this.state.maxLevel,
      ascendedItems: ascendedArr,
      awakenedCharacters: Array.from(this.state.awakenedCharacters),
      finalBossDefeated: this.finalBossDefeated,
    };

    return data;
  }

  deserialize(data: object): void {
    const parsed = data as SerializedNGPlusData;

    this.state.level = parsed.level ?? 0;
    this.state.maxLevel = parsed.maxLevel ?? 5;
    this.finalBossDefeated = parsed.finalBossDefeated ?? false;

    // Recalculate scaling from level
    const lvl = this.state.level;
    if (lvl > 0) {
      this.state.enemyScaling = {
        hpMultiplier: 2.0 * lvl,
        damageMultiplier: 1.5 * lvl,
        xpMultiplier: 1.5 * lvl,
      };
    } else {
      this.state.enemyScaling = {
        hpMultiplier: 1.0,
        damageMultiplier: 1.0,
        xpMultiplier: 1.0,
      };
    }

    // Rebuild unlocked features
    const features: string[] = [];
    for (let i = 1; i <= lvl; i++) {
      const mechanics = NG_PLUS_MECHANICS[i];
      if (mechanics) {
        features.push(...mechanics);
      }
    }
    this.state.unlockedFeatures = features;

    // Ascended items
    this.state.ascendedItems.clear();
    if (parsed.ascendedItems) {
      for (const [key, value] of parsed.ascendedItems) {
        this.state.ascendedItems.set(key, value);
      }
    }

    // Awakened characters
    this.state.awakenedCharacters.clear();
    if (parsed.awakenedCharacters) {
      for (const id of parsed.awakenedCharacters) {
        this.state.awakenedCharacters.add(id);
      }
    }
  }
}
