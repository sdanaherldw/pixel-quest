/**
 * RPG Core Systems — Barrel export for Realms of Conquest.
 *
 * Re-exports all RPG modules for convenient single-import access.
 */

// Stat System
export {
  PrimaryStat,
  DerivedStat,
  CharacterStats,
  emptyEquipmentSnapshot,
  createCharacterStatsState,
} from '@/rpg/StatSystem';
export type {
  PrimaryStatBlock,
  DerivedStatBlock,
  StatBuff,
  EquipmentStatSnapshot,
  ConditionalModifier,
  ConditionalModifierContext,
  StatModification,
  CharacterStatsState,
} from '@/rpg/StatSystem';

// Character Class
export {
  getClass,
  getAllClasses,
  getAvailableClasses,
  calculateLevelUpGrowth,
  canUseWeapon,
  canUseArmor,
} from '@/rpg/CharacterClass';
export type {
  ClassId,
  WeaponType,
  ArmorType,
  SpellSchoolId,
  CharacterClassDef,
  StatGrowthResult,
} from '@/rpg/CharacterClass';

// Inventory System
export {
  EquipSlot,
  BAG_SIZE,
  Inventory,
  createEmptyInventoryState,
} from '@/rpg/InventorySystem';
export type {
  InventorySlot,
  EquippedItem,
  InventoryState,
  ItemLookup,
} from '@/rpg/InventorySystem';

// Equipment System
export {
  getItem,
  getAllItems,
  getStatBonus,
  getEffects,
  canEquip,
  calculateEquipmentStats,
  getDisplayColor,
  calculateCragHackSynergy,
  createItemLookup,
} from '@/rpg/EquipmentSystem';
export type {
  RarityTier,
  ItemType,
  ItemEffect,
  UniquePassive,
  ItemStatBonuses,
  ItemDef,
  EquipmentStatTotals,
  CragHackSynergy,
} from '@/rpg/EquipmentSystem';

// Leveling System
export {
  xpForLevel,
  getXPForNextLevel,
  getXPProgress,
  getMaxLevel,
  LevelingSystem,
  createLevelingState,
} from '@/rpg/LevelingSystem';
export type {
  LevelingState,
  LevelUpResult,
} from '@/rpg/LevelingSystem';

// Spell System
export {
  SpellSchool,
  getSpell,
  getAllSpells,
  getSpellsBySchool,
  getAvailableSpells,
  calculateSpellDamage,
  SpellBook,
  createSpellBookState,
} from '@/rpg/SpellSystem';
export type {
  SpellDamage,
  SpellHealing,
  SpellAoE,
  SpellEffect,
  SpellDef,
  SpellBookState,
  CastResult,
} from '@/rpg/SpellSystem';

// Quest System
export {
  QuestState,
  ObjectiveState,
  QuestSystem,
  createQuestSystemState,
} from '@/rpg/QuestSystem';
export type {
  QuestObjectiveDef,
  QuestChoiceOption,
  QuestRewardDef,
  QuestDef,
  QuestProgress,
  QuestSystemState,
  QuestEventCallbacks,
} from '@/rpg/QuestSystem';

// Dialogue System
export {
  DialogueSystem,
  registerDialogueFile,
  getDialogueDef,
  getAllDialogueIds,
} from '@/rpg/DialogueSystem';
export type {
  DialogueAction,
  DialogueCondition,
  DialogueChoice,
  DialogueNode,
  DialogueFileDef,
  DialogueSessionState,
  DialogueContext,
  DialogueEventCallbacks,
} from '@/rpg/DialogueSystem';

// Loot Table
export {
  rollLoot,
  rollBossLoot,
  rollGold,
  rollEnemyGold,
  hasLootTable,
  getLootTable,
  getAllLootTableIds,
  registerLootTable,
} from '@/rpg/LootTable';
export type {
  LootDrop,
  LootTableEntry,
  LootTableDef,
  GoldRange,
} from '@/rpg/LootTable';

// Party Manager
export {
  MORALE_THRESHOLDS,
  PartyManager,
  createPartyState,
  createPartyMember,
  createCragHackMember,
} from '@/rpg/PartyManager';
export type {
  FormationRow,
  PartyMemberState,
  PartyState,
} from '@/rpg/PartyManager';

// Skill Tree
export {
  getSkillNode,
  getBranch,
  getBranchesForClass,
  getAllBranches,
  SkillTree,
  createSkillTreeState,
} from '@/rpg/SkillTree';
export type {
  SkillNodeEffect,
  SkillNodeDef,
  SkillTreeBranchDef,
  SkillTreeState,
} from '@/rpg/SkillTree';

// Codex System
export {
  CodexCategory,
  CodexSystem,
} from '@/rpg/CodexSystem';
export type {
  CodexEntry,
  CodexSubEntry,
  BestiaryEntry,
  CodexProgress,
} from '@/rpg/CodexSystem';

// New Game Plus System
export {
  NewGamePlusSystem,
} from '@/rpg/NewGamePlusSystem';
export type {
  NGPlusState,
  AscendedItemBonus,
  AwakenedForm,
} from '@/rpg/NewGamePlusSystem';
