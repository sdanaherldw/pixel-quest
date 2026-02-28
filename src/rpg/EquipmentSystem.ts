/**
 * EquipmentSystem.ts — Equipment definitions, stat calculation, and validation.
 *
 * Loads item definitions from items.json and provides lookup, stat aggregation,
 * rarity display colours, and Crag Hack synergy handling.
 */

import itemsData from '@/data/items.json';
import type { EquipSlot } from '@/rpg/InventorySystem';
import type { PrimaryStatBlock } from '@/rpg/StatSystem';
import { PrimaryStat } from '@/rpg/StatSystem';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RarityTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ItemType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'material' | 'quest';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ItemEffect {
  type: string;
  value?: number | boolean;
  duration?: number;
  chance?: number;
  description?: string;
  condition?: string;
  /** Crag Hack synergy fields */
  characterId?: string;
  bonusDamage?: number;
  bonusCrit?: number;
  lifeSteal?: number;
}

export interface UniquePassive {
  name: string;
  description: string;
  hitCounter?: number;
  damageMultiplier?: number;
  damageType?: string;
  aoeRadius?: number;
  particleEffect?: string;
}

export interface ItemStatBonuses {
  atk?: number;
  def?: number;
  spd?: number;
  crit?: number;
  str?: number;
  int?: number;
  wis?: number;
  dex?: number;
  con?: number;
  cha?: number;
  [key: string]: number | undefined;
}

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  subtype: string;
  rarity: RarityTier;
  level: number;
  stats: ItemStatBonuses;
  effects: ItemEffect[];
  uniquePassive?: UniquePassive;
  equipSlot: EquipSlot | null;
  twoHanded: boolean;
  classRestriction: string | null;
  description: string;
  lore?: string;
  value: number;
  sellable: boolean;
  stackable: boolean;
  maxStack: number;
  armorType?: string;
  questReward?: string;
}

export interface EquipmentStatTotals {
  atk: number;
  def: number;
  spd: number;
  crit: number;
  primaryBonuses: Partial<PrimaryStatBlock>;
}

export interface CragHackSynergy {
  bonusDamage: number;
  bonusCrit: number;
  lifeSteal: number;
  obsidianAffinity: boolean;
}

// ---------------------------------------------------------------------------
// Internal: parse raw JSON items
// ---------------------------------------------------------------------------

interface RawItem {
  id: string;
  name: string;
  type: string;
  subtype: string;
  rarity: string;
  level: number;
  stats?: Record<string, number>;
  effects?: Array<Record<string, unknown>>;
  uniquePassive?: Record<string, unknown>;
  slot?: string;
  twoHanded?: boolean;
  classRestriction?: string;
  description: string;
  lore?: string;
  value: number;
  sellable?: boolean;
  stackable?: boolean;
  maxStack?: number;
  armorType?: string;
  questReward?: string;
  speedPenalty?: number;
}

function slotFromRaw(raw: RawItem): EquipSlot | null {
  if (raw.slot) return raw.slot as EquipSlot;
  if (raw.type === 'weapon') return 'weapon' as EquipSlot;
  return null;
}

function mapRawItem(raw: RawItem): ItemDef {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type as ItemType,
    subtype: raw.subtype ?? '',
    rarity: raw.rarity as RarityTier,
    level: raw.level,
    stats: (raw.stats ?? {}) as ItemStatBonuses,
    effects: (raw.effects ?? []) as unknown as ItemEffect[],
    uniquePassive: raw.uniquePassive as UniquePassive | undefined,
    equipSlot: slotFromRaw(raw),
    twoHanded: raw.twoHanded ?? false,
    classRestriction: raw.classRestriction ?? null,
    description: raw.description,
    lore: raw.lore,
    value: raw.value,
    sellable: raw.sellable ?? true,
    stackable: raw.stackable ?? false,
    maxStack: raw.maxStack ?? 1,
    armorType: raw.armorType,
    questReward: raw.questReward,
  };
}

// ---------------------------------------------------------------------------
// Pre-loaded item map
// ---------------------------------------------------------------------------

const itemMap = new Map<string, ItemDef>();

for (const raw of (itemsData as { items: RawItem[] }).items) {
  itemMap.set(raw.id, mapRawItem(raw));
}

// ---------------------------------------------------------------------------
// Rarity colours (from items.json rarityColors)
// ---------------------------------------------------------------------------

const RARITY_COLORS: Record<RarityTier, string> = {
  common: '#FFFFFF',
  uncommon: '#1EFF00',
  rare: '#0070FF',
  epic: '#A335EE',
  legendary: '#FF8000',
};

// Overlay data-defined colours if present.
const rawColors = (itemsData as { rarityColors?: Record<string, string> }).rarityColors;
if (rawColors) {
  for (const [key, hex] of Object.entries(rawColors)) {
    if (key in RARITY_COLORS) {
      RARITY_COLORS[key as RarityTier] = hex;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get a single item definition by id. */
export function getItem(id: string): ItemDef | undefined {
  return itemMap.get(id);
}

/** Get all loaded item definitions. */
export function getAllItems(): ItemDef[] {
  return Array.from(itemMap.values());
}

/** Calculate the stat bonuses granted by a single item. */
export function getStatBonus(itemId: string): ItemStatBonuses {
  const item = itemMap.get(itemId);
  if (!item) return {};
  return { ...item.stats };
}

/** Get active effects for an item. */
export function getEffects(itemId: string): ItemEffect[] {
  const item = itemMap.get(itemId);
  if (!item) return [];
  return [...item.effects];
}

/**
 * Validate whether a character can equip an item.
 *
 * @param itemId   - Item to check.
 * @param classId  - The character's class id.
 * @param level    - The character's current level.
 * @param allowedWeapons - Weapon subtypes the class can use.
 * @param allowedArmor   - Armor types the class can use.
 */
export function canEquip(
  itemId: string,
  classId: string,
  level: number,
  allowedWeapons: string[] = [],
  allowedArmor: string[] = [],
): boolean {
  const item = itemMap.get(itemId);
  if (!item) return false;

  // Level requirement
  if (level < item.level) return false;

  // Class restriction
  if (item.classRestriction && item.classRestriction !== classId) return false;

  // Weapon subtype restriction
  if (item.type === 'weapon') {
    if (allowedWeapons.length > 0 && !allowedWeapons.includes(item.subtype)) {
      return false;
    }
  }

  // Armor type restriction
  if (item.type === 'armor' && item.armorType) {
    if (allowedArmor.length > 0 && !allowedArmor.includes(item.armorType)) {
      return false;
    }
  }

  return true;
}

/**
 * Aggregate stats from all equipped items into a single totals object.
 * This result can be fed directly into CharacterStats.setEquipmentStats().
 */
export function calculateEquipmentStats(equippedItemIds: string[]): EquipmentStatTotals {
  const totals: EquipmentStatTotals = {
    atk: 0,
    def: 0,
    spd: 0,
    crit: 0,
    primaryBonuses: {},
  };

  const primaryKeys: PrimaryStat[] = Object.values(PrimaryStat);

  for (const id of equippedItemIds) {
    const item = itemMap.get(id);
    if (!item) continue;

    const s = item.stats;
    totals.atk += s.atk ?? 0;
    totals.def += s.def ?? 0;
    totals.spd += s.spd ?? 0;
    totals.crit += s.crit ?? 0;

    // Speed penalty from heavy armour
    if (item.type === 'armor') {
      const raw = (itemsData as { items: RawItem[] }).items.find((r) => r.id === id);
      if (raw?.speedPenalty) {
        totals.spd -= raw.speedPenalty;
      }
    }

    for (const pk of primaryKeys) {
      const val = s[pk];
      if (val !== undefined && val > 0) {
        totals.primaryBonuses[pk] = (totals.primaryBonuses[pk] ?? 0) + val;
      }
    }
  }

  return totals;
}

/** Return the hex colour string for a rarity tier. */
export function getDisplayColor(rarity: RarityTier): string {
  return RARITY_COLORS[rarity] ?? RARITY_COLORS.common;
}

// ---------------------------------------------------------------------------
// Crag Hack / Obsidian synergy
// ---------------------------------------------------------------------------

/** IDs of items with obsidian affinity for Crag Hack. */
const OBSIDIAN_ITEMS = new Set([
  'obsidian-great-axe',
  'cracked-obsidian-axe',
  'obsidian-dagger',
]);

/**
 * Calculate Crag Hack synergy bonuses for a set of equipped items.
 * Returns zero bonuses if the character is not Crag Hack.
 */
export function calculateCragHackSynergy(
  equippedItemIds: string[],
  characterId: string,
): CragHackSynergy {
  const synergy: CragHackSynergy = {
    bonusDamage: 0,
    bonusCrit: 0,
    lifeSteal: 0,
    obsidianAffinity: false,
  };

  if (characterId !== 'crag-hack') return synergy;

  for (const id of equippedItemIds) {
    // Obsidian Affinity: 30% increased damage with obsidian weapons.
    if (OBSIDIAN_ITEMS.has(id)) {
      synergy.obsidianAffinity = true;
      synergy.bonusDamage += 0.3;
    }

    // Character-specific synergy effects from item data.
    const item = itemMap.get(id);
    if (!item) continue;

    for (const effect of item.effects) {
      if (effect.type === 'character_synergy' && effect.characterId === 'crag-hack') {
        synergy.bonusDamage += effect.bonusDamage ?? 0;
        synergy.bonusCrit += effect.bonusCrit ?? 0;
        synergy.lifeSteal += effect.lifeSteal ?? 0;
      }
    }
  }

  return synergy;
}

// ---------------------------------------------------------------------------
// ItemLookup adapter (for InventorySystem)
// ---------------------------------------------------------------------------

/**
 * Create an ItemLookup object that InventorySystem can use.
 * This keeps InventorySystem decoupled from EquipmentSystem at import time.
 */
export function createItemLookup(
  allowedWeapons: string[] = [],
  allowedArmor: string[] = [],
): {
  exists(itemId: string): boolean;
  isStackable(itemId: string): boolean;
  maxStack(itemId: string): number;
  getEquipSlot(itemId: string): EquipSlot | null;
  isTwoHanded(itemId: string): boolean;
  canEquip(itemId: string, classId: string, level: number): boolean;
  getItemType(itemId: string): string;
  getItemRarity(itemId: string): string;
} {
  return {
    exists: (itemId: string) => itemMap.has(itemId),
    isStackable: (itemId: string) => itemMap.get(itemId)?.stackable ?? false,
    maxStack: (itemId: string) => itemMap.get(itemId)?.maxStack ?? 1,
    getEquipSlot: (itemId: string) => itemMap.get(itemId)?.equipSlot ?? null,
    isTwoHanded: (itemId: string) => itemMap.get(itemId)?.twoHanded ?? false,
    canEquip: (itemId: string, classId: string, level: number) =>
      canEquip(itemId, classId, level, allowedWeapons, allowedArmor),
    getItemType: (itemId: string) => itemMap.get(itemId)?.type ?? 'unknown',
    getItemRarity: (itemId: string) => itemMap.get(itemId)?.rarity ?? 'common',
  };
}
