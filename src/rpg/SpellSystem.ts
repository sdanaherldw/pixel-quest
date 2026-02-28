/**
 * SpellSystem.ts — Spell definitions, spellbooks, casting, and cooldown tracking.
 *
 * Loads spell data from spells.json. Each character has a SpellBook that
 * tracks learned spells and active cooldowns.
 */

import spellsData from '@/data/spells.json';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum SpellSchool {
  FIRE = 'fire',
  ICE = 'ice',
  LIGHTNING = 'lightning',
  HOLY = 'holy',
  HEALING = 'healing',
  NATURE = 'nature',
  SHADOW = 'shadow',
  UTILITY = 'utility',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface SpellDamage {
  base: number;
  scaling?: Record<string, number>;
  tickRate?: number;
}

export interface SpellHealing {
  base: number;
  scaling?: Record<string, number>;
  tickRate?: number;
  percentHP?: number;
}

export interface SpellAoE {
  type: string;
  radius?: number;
  width?: number;
  height?: number;
}

export interface SpellEffect {
  type: string;
  value?: number | boolean | string;
  damage?: number;
  duration?: number;
  chance?: number;
  description?: string;
  [key: string]: unknown;
}

export interface SpellDef {
  id: string;
  name: string;
  school: SpellSchool;
  level: number;
  manaCost: number;
  cooldown: number;
  range: number;
  damage: SpellDamage;
  healing?: SpellHealing;
  aoe?: SpellAoE;
  duration?: number;
  effects: SpellEffect[];
  description: string;
  targetType?: string;
  channelTime?: number;
  castInterruptible?: boolean;
  chainTargets?: number;
  chainDamageDecay?: number;
  classRestriction?: string;
}

/** Per-character spell state (JSON-serializable). */
export interface SpellBookState {
  characterId: string;
  learnedSpellIds: string[];
  /** Remaining cooldown seconds per spell id. */
  cooldowns: Record<string, number>;
}

/** Result of a cast attempt. */
export interface CastResult {
  success: boolean;
  reason?: 'unknown_spell' | 'not_learned' | 'not_enough_mana' | 'on_cooldown' | 'level_too_low';
  spell?: SpellDef;
  damageDealt?: number;
}

// ---------------------------------------------------------------------------
// Internal: parse raw JSON spells
// ---------------------------------------------------------------------------

interface RawSpell {
  id: string;
  name: string;
  school: string;
  level: number;
  manaCost: number;
  cooldown: number;
  range: number;
  damage?: Record<string, unknown>;
  healing?: Record<string, unknown>;
  aoe?: Record<string, unknown>;
  duration?: number;
  effects?: Array<Record<string, unknown>>;
  description: string;
  targetType?: string;
  channelTime?: number;
  castInterruptible?: boolean;
  castAnimation?: string;
  chainTargets?: number;
  chainDamageDecay?: number;
  classRestriction?: string;
  projectile?: Record<string, unknown>;
}

function mapRawSpell(raw: RawSpell): SpellDef {
  return {
    id: raw.id,
    name: raw.name,
    school: raw.school as SpellSchool,
    level: raw.level,
    manaCost: raw.manaCost,
    cooldown: raw.cooldown,
    range: raw.range,
    damage: (raw.damage ?? { base: 0 }) as unknown as SpellDamage,
    healing: raw.healing as SpellHealing | undefined,
    aoe: raw.aoe as SpellAoE | undefined,
    duration: raw.duration,
    effects: (raw.effects ?? []) as SpellEffect[],
    description: raw.description,
    targetType: raw.targetType,
    channelTime: raw.channelTime,
    castInterruptible: raw.castInterruptible,
    chainTargets: raw.chainTargets,
    chainDamageDecay: raw.chainDamageDecay,
    classRestriction: raw.classRestriction,
  };
}

// ---------------------------------------------------------------------------
// Pre-loaded spell map
// ---------------------------------------------------------------------------

const spellMap = new Map<string, SpellDef>();

for (const raw of (spellsData as { spells: RawSpell[] }).spells) {
  spellMap.set(raw.id, mapRawSpell(raw));
}

// ---------------------------------------------------------------------------
// Pure spell lookups
// ---------------------------------------------------------------------------

export function getSpell(id: string): SpellDef | undefined {
  return spellMap.get(id);
}

export function getAllSpells(): SpellDef[] {
  return Array.from(spellMap.values());
}

export function getSpellsBySchool(school: SpellSchool): SpellDef[] {
  return Array.from(spellMap.values()).filter((s) => s.school === school);
}

/**
 * Get spells available to a class at a given level.
 * A spell is "available" if:
 *  - Its level <= the character's level
 *  - Its school is in the class's spell school list
 *  - No class restriction, or restriction matches
 */
export function getAvailableSpells(
  classSpellSchools: string[],
  classId: string,
  level: number,
): SpellDef[] {
  return Array.from(spellMap.values()).filter((spell) => {
    if (spell.level > level) return false;
    if (spell.classRestriction && spell.classRestriction !== classId) return false;
    if (!classSpellSchools.includes(spell.school)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Damage calculation
// ---------------------------------------------------------------------------

/**
 * Calculate base spell damage including stat scaling.
 *
 * Formula: baseDamage * (1 + MAGIC_ATK / 100) * elementalModifier
 *
 * @param spell            - The spell being cast.
 * @param magicAtk         - Caster's MAGIC_ATK derived stat.
 * @param elementalModifier - Target's elemental multiplier (default 1.0).
 * @param statValues       - Caster's primary stat values for spell scaling.
 */
export function calculateSpellDamage(
  spell: SpellDef,
  magicAtk: number,
  elementalModifier: number = 1.0,
  statValues: Record<string, number> = {},
): number {
  let base = spell.damage.base;

  // Add scaling contributions.
  if (spell.damage.scaling) {
    for (const [stat, factor] of Object.entries(spell.damage.scaling)) {
      base += (statValues[stat] ?? 0) * factor;
    }
  }

  return Math.round(base * (1 + magicAtk / 100) * elementalModifier);
}

// ---------------------------------------------------------------------------
// SpellBook class
// ---------------------------------------------------------------------------

export class SpellBook {
  private state: SpellBookState;

  constructor(state: SpellBookState) {
    this.state = {
      characterId: state.characterId,
      learnedSpellIds: [...state.learnedSpellIds],
      cooldowns: { ...state.cooldowns },
    };
  }

  // -----------------------------------------------------------------------
  // Learning
  // -----------------------------------------------------------------------

  learnSpell(spellId: string): boolean {
    if (!spellMap.has(spellId)) return false;
    if (this.state.learnedSpellIds.includes(spellId)) return false;
    this.state.learnedSpellIds.push(spellId);
    return true;
  }

  forgetSpell(spellId: string): boolean {
    const idx = this.state.learnedSpellIds.indexOf(spellId);
    if (idx === -1) return false;
    this.state.learnedSpellIds.splice(idx, 1);
    delete this.state.cooldowns[spellId];
    return true;
  }

  knowsSpell(spellId: string): boolean {
    return this.state.learnedSpellIds.includes(spellId);
  }

  getKnownSpells(): SpellDef[] {
    return this.state.learnedSpellIds
      .map((id) => spellMap.get(id))
      .filter((s): s is SpellDef => s !== undefined);
  }

  // -----------------------------------------------------------------------
  // Casting
  // -----------------------------------------------------------------------

  /**
   * Check if a spell can be cast right now.
   */
  canCast(
    spellId: string,
    currentMana: number,
    characterLevel: number,
  ): { ok: boolean; reason?: CastResult['reason'] } {
    const spell = spellMap.get(spellId);
    if (!spell) return { ok: false, reason: 'unknown_spell' };
    if (!this.state.learnedSpellIds.includes(spellId))
      return { ok: false, reason: 'not_learned' };
    if (characterLevel < spell.level)
      return { ok: false, reason: 'level_too_low' };
    if (currentMana < spell.manaCost)
      return { ok: false, reason: 'not_enough_mana' };
    if ((this.state.cooldowns[spellId] ?? 0) > 0)
      return { ok: false, reason: 'on_cooldown' };
    return { ok: true };
  }

  /**
   * Execute a spell cast. Deducts mana and starts the cooldown.
   * Returns a CastResult. The caller is responsible for applying the
   * actual game effects (damage, healing, etc.).
   *
   * @param spellId        - Spell to cast.
   * @param caster         - The caster object; must have stats.mp for mana deduction.
   * @param characterLevel - Character's level.
   * @param magicAtk       - Caster's MAGIC_ATK for damage calc.
   * @param elementalMod   - Target elemental multiplier.
   * @param statValues     - Caster stats for spell scaling.
   * @returns CastResult including mana consumed and damage estimate.
   */
  cast(
    spellId: string,
    caster: { stats: { mp: number } } | number,
    characterLevel: number,
    magicAtk: number = 0,
    elementalMod: number = 1.0,
    statValues: Record<string, number> = {},
  ): CastResult {
    // Support both the new caster object and legacy numeric currentMana
    const currentMana = typeof caster === 'number' ? caster : caster.stats.mp;
    const check = this.canCast(spellId, currentMana, characterLevel);
    if (!check.ok) return { success: false, reason: check.reason };

    const spell = spellMap.get(spellId)!;

    // Deduct mana from the caster
    if (typeof caster !== 'number') {
      caster.stats.mp -= spell.manaCost;
    }

    // Start cooldown.
    this.state.cooldowns[spellId] = spell.cooldown;

    // Calculate damage (may be 0 for non-damage spells).
    const damageDealt = calculateSpellDamage(
      spell,
      magicAtk,
      elementalMod,
      statValues,
    );

    return {
      success: true,
      spell,
      damageDealt,
    };
  }

  // -----------------------------------------------------------------------
  // Cooldowns
  // -----------------------------------------------------------------------

  /** Tick all cooldowns by deltaSeconds. */
  updateCooldowns(deltaSeconds: number): void {
    for (const spellId of Object.keys(this.state.cooldowns)) {
      this.state.cooldowns[spellId] -= deltaSeconds;
      if (this.state.cooldowns[spellId] <= 0) {
        delete this.state.cooldowns[spellId];
      }
    }
  }

  getRemainingCooldown(spellId: string): number {
    return Math.max(0, this.state.cooldowns[spellId] ?? 0);
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  getState(): SpellBookState {
    return {
      characterId: this.state.characterId,
      learnedSpellIds: [...this.state.learnedSpellIds],
      cooldowns: { ...this.state.cooldowns },
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSpellBookState(characterId: string): SpellBookState {
  return {
    characterId,
    learnedSpellIds: [],
    cooldowns: {},
  };
}
