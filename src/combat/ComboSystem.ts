// ---------------------------------------------------------------------------
// ComboSystem.ts — Class-specific combat technique chains
// ---------------------------------------------------------------------------
// Players chain inputs (attack, special, spell, dodge, jump) within tight
// timing windows to execute combo techniques.  Perfect-timing inputs grant a
// stacking damage bonus.  Each combo has a per-class cooldown after use.
// ---------------------------------------------------------------------------

export interface ComboInput {
  action: string; // 'attack', 'special', 'spell', 'dodge', 'jump'
  timing: 'early' | 'perfect' | 'late';
}

export interface ComboEffect {
  type: 'damage' | 'stun' | 'knockback' | 'heal' | 'buff' | 'debuff' | 'aoe';
  value: number;
  duration?: number;
  radius?: number;
}

export interface ComboDefinition {
  id: string;
  name: string;
  classId: string;
  inputs: ComboInput[];
  damage: number; // multiplier (e.g., 2.5 = 250 % damage)
  effects: ComboEffect[];
  cooldown: number; // seconds
  description: string;
  unlockLevel: number;
}

export interface ActiveCombo {
  definition: ComboDefinition;
  currentStep: number;
  timer: number; // time remaining to input the next step (seconds)
  perfectCount: number;
}

export interface ComboResult {
  type: 'started' | 'continued' | 'completed' | 'failed';
  comboId?: string;
  comboName?: string;
  step?: number;
  totalSteps?: number;
  timing?: 'early' | 'perfect' | 'late';
  damage?: number;
  effects?: ComboEffect[];
  perfectBonus?: number; // 1.0 + 0.1 per perfect timing
}

// ---------------------------------------------------------------------------
// Pre-defined combo data
// ---------------------------------------------------------------------------

function buildDefaultCombos(): ComboDefinition[] {
  return [
    // ---- Knight ----
    {
      id: 'knight_shield_bash',
      name: 'Shield Bash Combo',
      classId: 'knight',
      inputs: [
        { action: 'attack', timing: 'perfect' },
        { action: 'attack', timing: 'perfect' },
        { action: 'special', timing: 'perfect' },
      ],
      damage: 2.0,
      effects: [{ type: 'stun', value: 1, duration: 2 }],
      cooldown: 8,
      description: 'Two swift slashes followed by a shield bash that stuns the target.',
      unlockLevel: 3,
    },
    {
      id: 'knight_whirlwind',
      name: 'Whirlwind',
      classId: 'knight',
      inputs: [
        { action: 'special', timing: 'perfect' },
        { action: 'attack', timing: 'perfect' },
        { action: 'attack', timing: 'perfect' },
        { action: 'attack', timing: 'perfect' },
      ],
      damage: 3.0,
      effects: [{ type: 'aoe', value: 1.5, radius: 3 }],
      cooldown: 12,
      description: 'A spinning attack that hits all surrounding enemies.',
      unlockLevel: 8,
    },

    // ---- Barbarian ----
    {
      id: 'barbarian_berserker_chain',
      name: 'Berserker Chain',
      classId: 'barbarian',
      inputs: [
        { action: 'attack', timing: 'perfect' },
        { action: 'attack', timing: 'perfect' },
        { action: 'attack', timing: 'perfect' },
        { action: 'attack', timing: 'perfect' },
        { action: 'special', timing: 'perfect' },
      ],
      damage: 5.0,
      effects: [{ type: 'damage', value: 5.0 }],
      cooldown: 15,
      description: 'A relentless chain of blows culminating in a devastating finisher.',
      unlockLevel: 5,
    },
    {
      id: 'barbarian_ground_slam',
      name: 'Ground Slam',
      classId: 'barbarian',
      inputs: [
        { action: 'jump', timing: 'perfect' },
        { action: 'special', timing: 'perfect' },
      ],
      damage: 2.5,
      effects: [
        { type: 'aoe', value: 2.0, radius: 4 },
        { type: 'knockback', value: 3 },
      ],
      cooldown: 10,
      description: 'Leap into the air and slam the ground, knocking back all nearby foes.',
      unlockLevel: 4,
    },

    // ---- Rogue ----
    {
      id: 'rogue_shadowstrike',
      name: 'Shadowstrike',
      classId: 'rogue',
      inputs: [
        { action: 'dodge', timing: 'perfect' },
        { action: 'attack', timing: 'perfect' },
        { action: 'special', timing: 'perfect' },
      ],
      damage: 3.5,
      effects: [{ type: 'damage', value: 3.5 }],
      cooldown: 10,
      description: 'Dodge behind the enemy and deliver a devastating backstab critical.',
      unlockLevel: 4,
    },
    {
      id: 'rogue_fan_of_knives',
      name: 'Fan of Knives',
      classId: 'rogue',
      inputs: [
        { action: 'special', timing: 'perfect' },
        { action: 'special', timing: 'perfect' },
        { action: 'attack', timing: 'perfect' },
      ],
      damage: 2.0,
      effects: [{ type: 'aoe', value: 1.0, radius: 5 }],
      cooldown: 8,
      description: 'Throw a flurry of knives hitting multiple targets.',
      unlockLevel: 6,
    },

    // ---- Ranger ----
    {
      id: 'ranger_triple_shot',
      name: 'Triple Shot',
      classId: 'ranger',
      inputs: [
        { action: 'attack', timing: 'perfect' },
        { action: 'attack', timing: 'perfect' },
        { action: 'attack', timing: 'perfect' },
      ],
      damage: 2.5,
      effects: [{ type: 'damage', value: 2.5 }],
      cooldown: 6,
      description: 'Fire three arrows in rapid succession at the target.',
      unlockLevel: 3,
    },
    {
      id: 'ranger_rain_of_arrows',
      name: 'Rain of Arrows',
      classId: 'ranger',
      inputs: [
        { action: 'special', timing: 'perfect' },
        { action: 'attack', timing: 'perfect' },
        { action: 'special', timing: 'perfect' },
      ],
      damage: 3.0,
      effects: [{ type: 'aoe', value: 2.0, radius: 6 }],
      cooldown: 14,
      description: 'Launch arrows high into the sky to rain down on an area.',
      unlockLevel: 8,
    },

    // ---- Sorcerer ----
    {
      id: 'sorcerer_elemental_burst',
      name: 'Elemental Burst',
      classId: 'sorcerer',
      inputs: [
        { action: 'spell', timing: 'perfect' },
        { action: 'spell', timing: 'perfect' },
        { action: 'special', timing: 'perfect' },
      ],
      damage: 4.0,
      effects: [{ type: 'damage', value: 4.0 }],
      cooldown: 10,
      description: 'Channel two spells and release a massive burst of elemental energy.',
      unlockLevel: 5,
    },
    {
      id: 'sorcerer_arcane_barrage',
      name: 'Arcane Barrage',
      classId: 'sorcerer',
      inputs: [
        { action: 'spell', timing: 'perfect' },
        { action: 'spell', timing: 'perfect' },
        { action: 'spell', timing: 'perfect' },
        { action: 'spell', timing: 'perfect' },
      ],
      damage: 3.5,
      effects: [
        { type: 'damage', value: 3.5 },
        { type: 'aoe', value: 1.0, radius: 4 },
      ],
      cooldown: 16,
      description: 'Rapid-fire four arcane bolts that chain to nearby enemies.',
      unlockLevel: 10,
    },

    // ---- Cleric ----
    {
      id: 'cleric_holy_smite',
      name: 'Holy Smite Combo',
      classId: 'cleric',
      inputs: [
        { action: 'attack', timing: 'perfect' },
        { action: 'spell', timing: 'perfect' },
        { action: 'special', timing: 'perfect' },
      ],
      damage: 2.5,
      effects: [
        { type: 'damage', value: 2.5 },
        { type: 'heal', value: 0.15 },
      ],
      cooldown: 10,
      description: 'Strike with holy power, dealing damage and healing the party.',
      unlockLevel: 4,
    },
    {
      id: 'cleric_divine_wrath',
      name: 'Divine Wrath',
      classId: 'cleric',
      inputs: [
        { action: 'spell', timing: 'perfect' },
        { action: 'spell', timing: 'perfect' },
        { action: 'attack', timing: 'perfect' },
      ],
      damage: 3.0,
      effects: [{ type: 'aoe', value: 2.0, radius: 5 }],
      cooldown: 12,
      description: 'Channel divine energy into a devastating holy AoE.',
      unlockLevel: 7,
    },

    // ---- Paladin ----
    {
      id: 'paladin_judgment_chain',
      name: 'Judgment Chain',
      classId: 'paladin',
      inputs: [
        { action: 'attack', timing: 'perfect' },
        { action: 'special', timing: 'perfect' },
        { action: 'spell', timing: 'perfect' },
      ],
      damage: 3.0,
      effects: [
        { type: 'damage', value: 3.0 },
        { type: 'stun', value: 1, duration: 2 },
      ],
      cooldown: 10,
      description: 'A holy assault that deals holy damage and stuns the target.',
      unlockLevel: 5,
    },
    {
      id: 'paladin_consecration',
      name: 'Consecration',
      classId: 'paladin',
      inputs: [
        { action: 'special', timing: 'perfect' },
        { action: 'spell', timing: 'perfect' },
        { action: 'special', timing: 'perfect' },
      ],
      damage: 2.5,
      effects: [{ type: 'aoe', value: 2.0, radius: 4, duration: 5 }],
      cooldown: 14,
      description: 'Consecrate the ground beneath you, dealing sustained holy AoE damage.',
      unlockLevel: 8,
    },
  ];
}

// ---------------------------------------------------------------------------
// ComboSystem
// ---------------------------------------------------------------------------

export class ComboSystem {
  private combos: Map<string, ComboDefinition>;
  private activeCombo: ActiveCombo | null;
  private comboHistory: ComboInput[];
  private comboWindow: number; // time window per step (seconds)
  private cooldowns: Map<string, number>; // comboId → remaining cooldown

  constructor() {
    this.combos = new Map<string, ComboDefinition>();
    this.activeCombo = null;
    this.comboHistory = [];
    this.comboWindow = 0.5; // 500 ms per input
    this.cooldowns = new Map<string, number>();
  }

  // ---- Registration -------------------------------------------------------

  registerCombo(combo: ComboDefinition): void {
    this.combos.set(combo.id, combo);
  }

  registerClassCombos(): void {
    const defaults = buildDefaultCombos();
    for (const combo of defaults) {
      this.registerCombo(combo);
    }
  }

  // ---- Input processing ---------------------------------------------------

  processInput(action: string, classId: string): ComboResult | null {
    // If there is already an active combo, try to advance it
    if (this.activeCombo) {
      return this.advanceActiveCombo(action);
    }

    // Otherwise, look for a combo that starts with this action
    return this.tryStartCombo(action, classId);
  }

  private tryStartCombo(action: string, classId: string): ComboResult | null {
    // Find all combos for this class whose first input matches
    const candidates: ComboDefinition[] = [];

    for (const combo of this.combos.values()) {
      if (combo.classId !== classId) {
        continue;
      }
      if (combo.inputs.length === 0) {
        continue;
      }
      if (combo.inputs[0]!.action !== action) {
        continue;
      }
      if (this.isOnCooldown(combo.id)) {
        continue;
      }
      candidates.push(combo);
    }

    if (candidates.length === 0) {
      return null;
    }

    // Pick the longest combo as the active candidate (greedy match)
    candidates.sort((a, b) => b.inputs.length - a.inputs.length);
    const chosen = candidates[0]!;

    // Determine timing (for now default to 'perfect' — timing evaluation
    // would come from the input subsystem measuring frame-level accuracy)
    const timing: 'early' | 'perfect' | 'late' = 'perfect';

    this.activeCombo = {
      definition: chosen,
      currentStep: 1, // step 0 just consumed
      timer: this.comboWindow,
      perfectCount: timing === 'perfect' ? 1 : 0,
    };

    this.comboHistory.push({ action, timing });

    // If it was a one-step combo, complete immediately
    if (chosen.inputs.length === 1) {
      return this.completeCombo(timing);
    }

    return {
      type: 'started',
      comboId: chosen.id,
      comboName: chosen.name,
      step: 1,
      totalSteps: chosen.inputs.length,
      timing,
    };
  }

  private advanceActiveCombo(action: string): ComboResult {
    const active = this.activeCombo!;
    const expectedInput = active.definition.inputs[active.currentStep];

    if (!expectedInput || expectedInput.action !== action) {
      // Wrong input — combo fails
      const failedId = active.definition.id;
      this.resetActiveCombo();
      return { type: 'failed', comboId: failedId };
    }

    const timing: 'early' | 'perfect' | 'late' = 'perfect';

    if (timing === 'perfect') {
      active.perfectCount += 1;
    }

    active.currentStep += 1;
    active.timer = this.comboWindow; // reset window

    this.comboHistory.push({ action, timing });

    // Check if combo is now complete
    if (active.currentStep >= active.definition.inputs.length) {
      return this.completeCombo(timing);
    }

    return {
      type: 'continued',
      comboId: active.definition.id,
      comboName: active.definition.name,
      step: active.currentStep,
      totalSteps: active.definition.inputs.length,
      timing,
    };
  }

  private completeCombo(lastTiming: 'early' | 'perfect' | 'late'): ComboResult {
    const active = this.activeCombo!;
    const def = active.definition;
    const perfectBonus = 1.0 + 0.1 * active.perfectCount;
    const finalDamage = def.damage * perfectBonus;

    // Put combo on cooldown
    this.cooldowns.set(def.id, def.cooldown);

    const result: ComboResult = {
      type: 'completed',
      comboId: def.id,
      comboName: def.name,
      step: def.inputs.length,
      totalSteps: def.inputs.length,
      timing: lastTiming,
      damage: finalDamage,
      effects: def.effects.map((e) => ({ ...e })),
      perfectBonus,
    };

    this.resetActiveCombo();
    return result;
  }

  private resetActiveCombo(): void {
    this.activeCombo = null;
    this.comboHistory = [];
  }

  // ---- Update -------------------------------------------------------------

  update(dt: number): void {
    // Tick down the active combo timer
    if (this.activeCombo) {
      this.activeCombo.timer -= dt;
      if (this.activeCombo.timer <= 0) {
        this.resetActiveCombo(); // timed out
      }
    }

    // Tick down cooldowns
    for (const [comboId, remaining] of this.cooldowns) {
      const updated = remaining - dt;
      if (updated <= 0) {
        this.cooldowns.delete(comboId);
      } else {
        this.cooldowns.set(comboId, updated);
      }
    }
  }

  // ---- State --------------------------------------------------------------

  getActiveCombo(): ActiveCombo | null {
    return this.activeCombo;
  }

  isComboActive(): boolean {
    return this.activeCombo !== null;
  }

  getAvailableCombos(classId: string): ComboDefinition[] {
    const result: ComboDefinition[] = [];
    for (const combo of this.combos.values()) {
      if (combo.classId === classId) {
        result.push(combo);
      }
    }
    return result;
  }

  // ---- Cooldowns ----------------------------------------------------------

  isOnCooldown(comboId: string): boolean {
    return this.cooldowns.has(comboId);
  }

  getCooldownRemaining(comboId: string): number {
    return this.cooldowns.get(comboId) ?? 0;
  }

  // ---- Reset --------------------------------------------------------------

  reset(): void {
    this.activeCombo = null;
    this.comboHistory = [];
    this.cooldowns.clear();
  }
}
