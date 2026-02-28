/**
 * LootTable.ts — Loot generation from enemy drop tables.
 *
 * Loads loot tables from enemies.json and provides roll functions for
 * standard drops, boss guaranteed drops, and gold. Supports a luck
 * modifier that increases rare drop chances.
 */

import enemiesData from '@/data/enemies.json';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface LootDrop {
  itemId: string;
  quantity: number;
}

export interface LootTableEntry {
  itemId: string;
  chance: number;
  quantity: { min: number; max: number };
}

export interface LootTableDef {
  guaranteed?: LootTableEntry[];
  drops: LootTableEntry[];
}

export interface GoldRange {
  min: number;
  max: number;
}

// ---------------------------------------------------------------------------
// Internal: load loot tables from enemies.json
// ---------------------------------------------------------------------------

interface RawLootEntry {
  itemId: string;
  chance?: number;
  quantity: { min: number; max: number };
}

interface RawLootTable {
  guaranteed?: RawLootEntry[];
  drops?: RawLootEntry[];
}

const lootTableMap = new Map<string, LootTableDef>();

function mapRawEntry(raw: RawLootEntry): LootTableEntry {
  return {
    itemId: raw.itemId,
    chance: raw.chance ?? 1.0,
    quantity: { min: raw.quantity.min, max: raw.quantity.max },
  };
}

const rawTables = (enemiesData as { lootTables?: Record<string, RawLootTable> }).lootTables;
if (rawTables) {
  for (const [tableId, table] of Object.entries(rawTables)) {
    lootTableMap.set(tableId, {
      guaranteed: table.guaranteed?.map(mapRawEntry),
      drops: (table.drops ?? []).map(mapRawEntry),
    });
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Roll loot from a standard (non-boss) loot table.
 *
 * @param tableId      - Loot table identifier from enemies.json.
 * @param luckModifier - Increases drop chances. 0 = no bonus, 1 = +100%.
 *                       Drop chance is clamped to 1.0.
 */
export function rollLoot(tableId: string, luckModifier: number = 0): LootDrop[] {
  const table = lootTableMap.get(tableId);
  if (!table) return [];

  const results: LootDrop[] = [];

  for (const entry of table.drops) {
    const effectiveChance = Math.min(1.0, entry.chance * (1 + luckModifier));
    if (Math.random() < effectiveChance) {
      results.push({
        itemId: entry.itemId,
        quantity: randomInt(entry.quantity.min, entry.quantity.max),
      });
    }
  }

  return results;
}

/**
 * Roll loot from a boss loot table. Guaranteed drops are always included.
 *
 * @param tableId      - Boss loot table identifier.
 * @param luckModifier - Bonus to chance-based drops.
 */
export function rollBossLoot(tableId: string, luckModifier: number = 0): LootDrop[] {
  const table = lootTableMap.get(tableId);
  if (!table) return [];

  const results: LootDrop[] = [];

  // Guaranteed drops.
  if (table.guaranteed) {
    for (const entry of table.guaranteed) {
      results.push({
        itemId: entry.itemId,
        quantity: randomInt(entry.quantity.min, entry.quantity.max),
      });
    }
  }

  // Chance drops.
  for (const entry of table.drops) {
    const effectiveChance = Math.min(1.0, entry.chance * (1 + luckModifier));
    if (Math.random() < effectiveChance) {
      results.push({
        itemId: entry.itemId,
        quantity: randomInt(entry.quantity.min, entry.quantity.max),
      });
    }
  }

  return results;
}

/**
 * Roll a random gold amount in the given range.
 *
 * @param min - Minimum gold.
 * @param max - Maximum gold.
 */
export function rollGold(min: number, max: number): number {
  return randomInt(min, max);
}

/**
 * Roll gold for a specific enemy using their gold drop range.
 *
 * @param goldRange    - { min, max } from the enemy definition.
 * @param luckModifier - Bonus multiplier (0 = none).
 */
export function rollEnemyGold(goldRange: GoldRange, luckModifier: number = 0): number {
  const base = randomInt(goldRange.min, goldRange.max);
  return Math.round(base * (1 + luckModifier * 0.5));
}

// ---------------------------------------------------------------------------
// Table queries
// ---------------------------------------------------------------------------

/** Check if a loot table exists. */
export function hasLootTable(tableId: string): boolean {
  return lootTableMap.has(tableId);
}

/** Get the raw loot table definition. */
export function getLootTable(tableId: string): LootTableDef | undefined {
  return lootTableMap.get(tableId);
}

/** Get all registered loot table ids. */
export function getAllLootTableIds(): string[] {
  return Array.from(lootTableMap.keys());
}

/**
 * Register a custom loot table at runtime.
 * Useful for dynamic content (events, modded tables, etc.).
 */
export function registerLootTable(tableId: string, table: LootTableDef): void {
  lootTableMap.set(tableId, table);
}
