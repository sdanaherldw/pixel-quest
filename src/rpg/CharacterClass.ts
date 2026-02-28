/**
 * CharacterClass.ts — Character class definitions for Realms of Conquest.
 *
 * Loads class data from classes.json and provides lookup, filtering, and
 * stat-growth calculation utilities.
 */

import classesData from '@/data/classes.json';
import type { PrimaryStatBlock } from '@/rpg/StatSystem';
import { PrimaryStat } from '@/rpg/StatSystem';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClassId =
  | 'knight'
  | 'paladin'
  | 'ranger'
  | 'sorcerer'
  | 'cleric'
  | 'rogue'
  | 'barbarian';

export type WeaponType =
  | 'sword'
  | 'axe'
  | 'mace'
  | 'greataxe'
  | 'greatsword'
  | 'bow'
  | 'crossbow'
  | 'dagger'
  | 'staff'
  | 'wand';

export type ArmorType = 'light' | 'medium' | 'heavy';

export type SpellSchoolId =
  | 'fire'
  | 'ice'
  | 'lightning'
  | 'holy'
  | 'healing'
  | 'nature'
  | 'shadow'
  | 'utility';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CharacterClassDef {
  id: ClassId;
  name: string;
  description: string;
  baseStats: PrimaryStatBlock;
  statGrowth: PrimaryStatBlock;
  hpPerLevel: number;
  mpPerLevel: number;
  startingEquipment: string[];
  allowedWeapons: WeaponType[];
  allowedArmor: ArmorType[];
  skillTreeBranches: string[];
  spellSchools: SpellSchoolId[];
  passiveAbilities: string[];
  baseSpeed: number;
  unique: boolean;
  uniqueCharacter: string | null;
}

export interface StatGrowthResult {
  statIncreases: Partial<PrimaryStatBlock>;
  hpIncrease: number;
  mpIncrease: number;
}

// ---------------------------------------------------------------------------
// Internal data mapping
// ---------------------------------------------------------------------------

interface RawClassEntry {
  id: string;
  name: string;
  description: string;
  baseStats: Record<string, number>;
  statGrowth: Record<string, number>;
  hpPerLevel: number;
  mpPerLevel: number;
  weaponTypes: string[];
  armorTypes: string[];
  startingEquipment: string[];
  skillTreeIds: string[];
  spellSchools: string[];
  passiveAbilities: string[];
  baseSpeed: number;
  unique?: boolean;
  uniqueCharacter?: string;
  portraitVariants: number;
}

function mapRawToClassDef(raw: RawClassEntry): CharacterClassDef {
  return {
    id: raw.id as ClassId,
    name: raw.name,
    description: raw.description,
    baseStats: {
      [PrimaryStat.STR]: raw.baseStats.str ?? 10,
      [PrimaryStat.INT]: raw.baseStats.int ?? 10,
      [PrimaryStat.WIS]: raw.baseStats.wis ?? 10,
      [PrimaryStat.DEX]: raw.baseStats.dex ?? 10,
      [PrimaryStat.CON]: raw.baseStats.con ?? 10,
      [PrimaryStat.CHA]: raw.baseStats.cha ?? 10,
    },
    statGrowth: {
      [PrimaryStat.STR]: raw.statGrowth.str ?? 1,
      [PrimaryStat.INT]: raw.statGrowth.int ?? 1,
      [PrimaryStat.WIS]: raw.statGrowth.wis ?? 1,
      [PrimaryStat.DEX]: raw.statGrowth.dex ?? 1,
      [PrimaryStat.CON]: raw.statGrowth.con ?? 1,
      [PrimaryStat.CHA]: raw.statGrowth.cha ?? 1,
    },
    hpPerLevel: raw.hpPerLevel,
    mpPerLevel: raw.mpPerLevel,
    startingEquipment: raw.startingEquipment,
    allowedWeapons: raw.weaponTypes as WeaponType[],
    allowedArmor: raw.armorTypes as ArmorType[],
    skillTreeBranches: raw.skillTreeIds,
    spellSchools: raw.spellSchools as SpellSchoolId[],
    passiveAbilities: raw.passiveAbilities,
    baseSpeed: raw.baseSpeed,
    unique: raw.unique ?? false,
    uniqueCharacter: raw.uniqueCharacter ?? null,
  };
}

// ---------------------------------------------------------------------------
// Pre-loaded class map
// ---------------------------------------------------------------------------

const classMap = new Map<ClassId, CharacterClassDef>();

for (const raw of (classesData as { classes: RawClassEntry[] }).classes) {
  classMap.set(raw.id as ClassId, mapRawToClassDef(raw));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a single class definition by id.
 * Returns undefined if the id is not found.
 */
export function getClass(id: ClassId): CharacterClassDef | undefined {
  return classMap.get(id);
}

/** Get all 7 class definitions. */
export function getAllClasses(): CharacterClassDef[] {
  return Array.from(classMap.values());
}

/**
 * Get classes available for player character creation.
 * Excludes barbarian (Crag Hack only).
 */
export function getAvailableClasses(): CharacterClassDef[] {
  return Array.from(classMap.values()).filter((c) => !c.unique);
}

/**
 * Calculate stat growth for a single level-up based on class growth rates.
 *
 * Each primary stat grows by its class growth rate multiplied by a random
 * factor between 0.8 and 1.2 (rounded), ensuring some variation.  HP and MP
 * grow by the fixed per-level amount.
 */
export function calculateLevelUpGrowth(
  classId: ClassId,
  _currentLevel: number,
): StatGrowthResult {
  const classDef = classMap.get(classId);
  if (!classDef) {
    throw new Error(`Unknown class id: ${classId}`);
  }

  const growth = classDef.statGrowth;
  const statIncreases: Partial<PrimaryStatBlock> = {};

  for (const stat of Object.values(PrimaryStat)) {
    const base = growth[stat];
    // Deterministic growth: each stat increases by growth rate per 3 levels,
    // using a weighted random in [0.8, 1.2] for per-level variability.
    const factor = 0.8 + Math.random() * 0.4;
    const increase = Math.max(0, Math.round(base * factor));
    if (increase > 0) {
      statIncreases[stat] = increase;
    }
  }

  return {
    statIncreases,
    hpIncrease: classDef.hpPerLevel,
    mpIncrease: classDef.mpPerLevel,
  };
}

/**
 * Check if a weapon type is allowed for a given class.
 */
export function canUseWeapon(classId: ClassId, weaponType: WeaponType): boolean {
  const classDef = classMap.get(classId);
  if (!classDef) return false;
  return classDef.allowedWeapons.includes(weaponType);
}

/**
 * Check if an armor type is allowed for a given class.
 */
export function canUseArmor(classId: ClassId, armorType: ArmorType): boolean {
  const classDef = classMap.get(classId);
  if (!classDef) return false;
  return classDef.allowedArmor.includes(armorType);
}
