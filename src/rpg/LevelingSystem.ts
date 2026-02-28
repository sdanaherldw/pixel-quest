/**
 * LevelingSystem.ts — Experience, leveling, and stat/skill point allocation.
 *
 * XP curve loaded from balance.json. On level-up characters gain stat points
 * for manual allocation plus automatic HP/MP increases from their class.
 */

import balanceData from '@/data/balance.json';

// ---------------------------------------------------------------------------
// Constants from balance data
// ---------------------------------------------------------------------------

const XP_BASE = balanceData.xpCurve.baseXP; // 100
const XP_EXPONENT = balanceData.xpCurve.exponent; // 1.5
const MAX_LEVEL = balanceData.xpCurve.maxLevel; // 30
const XP_TABLE: number[] = balanceData.xpCurve.table;
const STAT_POINTS_PER_LEVEL = 2; // 2 distributable primary stat points
const SKILL_POINTS_PER_LEVEL = balanceData.levelScaling.skillPointsPerLevel; // 1

// ---------------------------------------------------------------------------
// Interfaces (JSON-serializable state)
// ---------------------------------------------------------------------------

export interface LevelingState {
  characterId: string;
  level: number;
  currentXP: number;
  totalXPEarned: number;
  unspentStatPoints: number;
  unspentSkillPoints: number;
}

export interface LevelUpResult {
  newLevel: number;
  statPointsGained: number;
  skillPointsGained: number;
  hpPerLevel: number;
  mpPerLevel: number;
}

// ---------------------------------------------------------------------------
// XP helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the cumulative XP required to reach a given level.
 * If a pre-computed table entry exists, use it; otherwise compute from formula.
 */
export function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  if (level > MAX_LEVEL) return Infinity;
  if (level < XP_TABLE.length) return XP_TABLE[level];
  return Math.round(XP_BASE * Math.pow(level, XP_EXPONENT));
}

/**
 * XP needed to progress from `currentLevel` to `currentLevel + 1`.
 */
export function getXPForNextLevel(currentLevel: number): number {
  if (currentLevel >= MAX_LEVEL) return Infinity;
  return xpForLevel(currentLevel + 1) - xpForLevel(currentLevel);
}

/**
 * Progress towards the next level as a 0-1 fraction.
 */
export function getXPProgress(currentXP: number, currentLevel: number): number {
  if (currentLevel >= MAX_LEVEL) return 1;
  const xpIntoLevel = currentXP - xpForLevel(currentLevel);
  const xpNeeded = getXPForNextLevel(currentLevel);
  if (xpNeeded <= 0) return 1;
  return Math.max(0, Math.min(1, xpIntoLevel / xpNeeded));
}

/** The maximum attainable level. */
export function getMaxLevel(): number {
  return MAX_LEVEL;
}

// ---------------------------------------------------------------------------
// LevelingSystem class
// ---------------------------------------------------------------------------

export class LevelingSystem {
  private state: LevelingState;

  constructor(state: LevelingState) {
    this.state = { ...state };
  }

  // -----------------------------------------------------------------------
  // XP
  // -----------------------------------------------------------------------

  /**
   * Award XP to this character. Returns an array of LevelUpResults for
   * each level gained (could be multiple at once).
   *
   * @param amount    - XP to add.
   * @param hpPerLevel - From the character's class definition.
   * @param mpPerLevel - From the character's class definition.
   */
  addXP(amount: number, hpPerLevel: number, mpPerLevel: number): LevelUpResult[] {
    if (amount <= 0) return [];
    this.state.currentXP += amount;
    this.state.totalXPEarned += amount;

    const results: LevelUpResult[] = [];
    while (this.checkLevelUp()) {
      results.push(this.applyLevelUp(hpPerLevel, mpPerLevel));
    }
    return results;
  }

  /** Returns true if the character has enough XP to gain a level. */
  checkLevelUp(): boolean {
    if (this.state.level >= MAX_LEVEL) return false;
    return this.state.currentXP >= xpForLevel(this.state.level + 1);
  }

  // -----------------------------------------------------------------------
  // Level up
  // -----------------------------------------------------------------------

  private applyLevelUp(hpPerLevel: number, mpPerLevel: number): LevelUpResult {
    this.state.level += 1;
    this.state.unspentStatPoints += STAT_POINTS_PER_LEVEL;
    this.state.unspentSkillPoints += SKILL_POINTS_PER_LEVEL;

    return {
      newLevel: this.state.level,
      statPointsGained: STAT_POINTS_PER_LEVEL,
      skillPointsGained: SKILL_POINTS_PER_LEVEL,
      hpPerLevel,
      mpPerLevel,
    };
  }

  // -----------------------------------------------------------------------
  // Stat point spending
  // -----------------------------------------------------------------------

  /** Spend one stat point. Returns true if successful. */
  spendStatPoint(): boolean {
    if (this.state.unspentStatPoints <= 0) return false;
    this.state.unspentStatPoints -= 1;
    return true;
  }

  /** Spend one skill point. Returns true if successful. */
  spendSkillPoint(): boolean {
    if (this.state.unspentSkillPoints <= 0) return false;
    this.state.unspentSkillPoints -= 1;
    return true;
  }

  // -----------------------------------------------------------------------
  // Getters
  // -----------------------------------------------------------------------

  getLevel(): number {
    return this.state.level;
  }

  getCurrentXP(): number {
    return this.state.currentXP;
  }

  getTotalXPEarned(): number {
    return this.state.totalXPEarned;
  }

  getUnspentStatPoints(): number {
    return this.state.unspentStatPoints;
  }

  getUnspentSkillPoints(): number {
    return this.state.unspentSkillPoints;
  }

  getXPForNextLevel(): number {
    return getXPForNextLevel(this.state.level);
  }

  getXPProgress(): number {
    return getXPProgress(this.state.currentXP, this.state.level);
  }

  isMaxLevel(): boolean {
    return this.state.level >= MAX_LEVEL;
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  getState(): LevelingState {
    return { ...this.state };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLevelingState(
  characterId: string,
  startingLevel: number = 1,
): LevelingState {
  return {
    characterId,
    level: startingLevel,
    currentXP: xpForLevel(startingLevel),
    totalXPEarned: xpForLevel(startingLevel),
    unspentStatPoints: 0,
    unspentSkillPoints: 0,
  };
}
