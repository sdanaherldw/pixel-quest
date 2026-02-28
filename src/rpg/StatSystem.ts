/**
 * StatSystem.ts — Character stat management for Realms of Conquest.
 *
 * Handles primary stats (STR, INT, etc.), derived stat calculation,
 * buff/debuff tracking, and the Berserker Blood passive for Crag Hack.
 */

import balanceData from '@/data/balance.json';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum PrimaryStat {
  STR = 'str',
  INT = 'int',
  WIS = 'wis',
  DEX = 'dex',
  CON = 'con',
  CHA = 'cha',
}

export enum DerivedStat {
  HP = 'hp',
  MP = 'mp',
  ATK = 'atk',
  DEF = 'def',
  SPD = 'spd',
  CRIT = 'crit',
  DODGE = 'dodge',
  MAGIC_ATK = 'magic_atk',
  MAGIC_DEF = 'magic_def',
}

// ---------------------------------------------------------------------------
// Interfaces (JSON-serializable state)
// ---------------------------------------------------------------------------

export interface PrimaryStatBlock {
  [PrimaryStat.STR]: number;
  [PrimaryStat.INT]: number;
  [PrimaryStat.WIS]: number;
  [PrimaryStat.DEX]: number;
  [PrimaryStat.CON]: number;
  [PrimaryStat.CHA]: number;
}

export interface DerivedStatBlock {
  [DerivedStat.HP]: number;
  [DerivedStat.MP]: number;
  [DerivedStat.ATK]: number;
  [DerivedStat.DEF]: number;
  [DerivedStat.SPD]: number;
  [DerivedStat.CRIT]: number;
  [DerivedStat.DODGE]: number;
  [DerivedStat.MAGIC_ATK]: number;
  [DerivedStat.MAGIC_DEF]: number;
}

/** A timed buff or debuff applied to a stat. */
export interface StatBuff {
  id: string;
  stat: PrimaryStat | DerivedStat;
  amount: number;
  /** Duration in seconds. -1 = permanent (e.g. passive). */
  duration: number;
  /** Remaining time in seconds. -1 = permanent. */
  remaining: number;
  source: string;
}

/** Equipment stat contribution snapshot (flat values). */
export interface EquipmentStatSnapshot {
  atk: number;
  def: number;
  spd: number;
  crit: number;
  /** Bonus primary stats granted by equipment. */
  primaryBonuses: Partial<PrimaryStatBlock>;
}

/** Passive modifier that scales with a condition (e.g. Berserker Blood). */
export interface ConditionalModifier {
  id: string;
  type: 'berserker_blood' | 'custom';
  /** Function is evaluated at recalculate time. */
  evaluate: (ctx: ConditionalModifierContext) => StatModification;
}

export interface ConditionalModifierContext {
  currentHP: number;
  maxHP: number;
  level: number;
  characterId: string;
}

export interface StatModification {
  stat: DerivedStat;
  multiplier: number; // 1.0 = no change
}

/** Berserker Blood threshold entry from balance.json. */
interface BerserkerThreshold {
  hpPercent: number;
  damageMultiplier: number;
}

// ---------------------------------------------------------------------------
// Serializable state (for save/load)
// ---------------------------------------------------------------------------

export interface CharacterStatsState {
  characterId: string;
  level: number;
  hpPerLevel: number;
  mpPerLevel: number;
  basePrimary: PrimaryStatBlock;
  allocatedPoints: Partial<PrimaryStatBlock>;
  buffs: StatBuff[];
  equipment: EquipmentStatSnapshot;
  /** Current HP/MP (runtime) */
  currentHP: number;
  currentMP: number;
  /** Whether this character has Berserker Blood */
  hasBerserkerBlood: boolean;
}

// ---------------------------------------------------------------------------
// CharacterStats class
// ---------------------------------------------------------------------------

export class CharacterStats {
  private state: CharacterStatsState;
  private cachedDerived: DerivedStatBlock;
  private conditionalModifiers: ConditionalModifier[] = [];

  constructor(state: CharacterStatsState) {
    this.state = { ...state, buffs: [...state.buffs] };
    this.cachedDerived = this.computeDerived();

    if (state.hasBerserkerBlood) {
      this.registerBerserkerBlood();
    }
  }

  // -----------------------------------------------------------------------
  // Public API — Primary Stats
  // -----------------------------------------------------------------------

  /** Total primary stat = base + allocated + equipment bonuses + buffs. */
  getPrimary(stat: PrimaryStat): number {
    const base = this.state.basePrimary[stat];
    const allocated = this.state.allocatedPoints[stat] ?? 0;
    const equipBonus = this.state.equipment.primaryBonuses[stat] ?? 0;
    const buffBonus = this.getBuffTotal(stat);
    return base + allocated + equipBonus + buffBonus;
  }

  /** Return the full primary stat block with all bonuses applied. */
  getAllPrimary(): PrimaryStatBlock {
    return {
      [PrimaryStat.STR]: this.getPrimary(PrimaryStat.STR),
      [PrimaryStat.INT]: this.getPrimary(PrimaryStat.INT),
      [PrimaryStat.WIS]: this.getPrimary(PrimaryStat.WIS),
      [PrimaryStat.DEX]: this.getPrimary(PrimaryStat.DEX),
      [PrimaryStat.CON]: this.getPrimary(PrimaryStat.CON),
      [PrimaryStat.CHA]: this.getPrimary(PrimaryStat.CHA),
    };
  }

  // -----------------------------------------------------------------------
  // Public API — Derived Stats
  // -----------------------------------------------------------------------

  getDerived(stat: DerivedStat): number {
    return this.cachedDerived[stat];
  }

  getAllDerived(): DerivedStatBlock {
    return { ...this.cachedDerived };
  }

  getMaxHP(): number {
    return this.cachedDerived[DerivedStat.HP];
  }

  getMaxMP(): number {
    return this.cachedDerived[DerivedStat.MP];
  }

  getCurrentHP(): number {
    return this.state.currentHP;
  }

  getCurrentMP(): number {
    return this.state.currentMP;
  }

  setCurrentHP(value: number): void {
    this.state.currentHP = Math.max(0, Math.min(value, this.getMaxHP()));
    // Berserker Blood may change derived stats based on HP %.
    if (this.state.hasBerserkerBlood) {
      this.recalculate();
    }
  }

  setCurrentMP(value: number): void {
    this.state.currentMP = Math.max(0, Math.min(value, this.getMaxMP()));
  }

  // -----------------------------------------------------------------------
  // Buffs
  // -----------------------------------------------------------------------

  addBuff(
    stat: PrimaryStat | DerivedStat,
    amount: number,
    duration: number,
    source: string = 'unknown',
  ): string {
    const id = `buff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const buff: StatBuff = {
      id,
      stat,
      amount,
      duration,
      remaining: duration,
      source,
    };
    this.state.buffs.push(buff);
    this.recalculate();
    return id;
  }

  removeBuff(id: string): boolean {
    const idx = this.state.buffs.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    this.state.buffs.splice(idx, 1);
    this.recalculate();
    return true;
  }

  /** Tick buff timers by deltaSeconds. Expired buffs are removed. */
  updateBuffTimers(deltaSeconds: number): void {
    let changed = false;
    this.state.buffs = this.state.buffs.filter((buff) => {
      if (buff.remaining === -1) return true; // permanent
      buff.remaining -= deltaSeconds;
      if (buff.remaining <= 0) {
        changed = true;
        return false;
      }
      return true;
    });
    if (changed) {
      this.recalculate();
    }
  }

  getBuffs(): ReadonlyArray<StatBuff> {
    return this.state.buffs;
  }

  // -----------------------------------------------------------------------
  // Equipment
  // -----------------------------------------------------------------------

  /** Replace the equipment snapshot and recalculate. */
  setEquipmentStats(snapshot: EquipmentStatSnapshot): void {
    this.state.equipment = snapshot;
    this.recalculate();
  }

  // -----------------------------------------------------------------------
  // Level / Growth
  // -----------------------------------------------------------------------

  setLevel(level: number): void {
    this.state.level = level;
    this.recalculate();
  }

  getLevel(): number {
    return this.state.level;
  }

  /** Allocate a single stat point to a primary stat. */
  allocatePoint(stat: PrimaryStat): void {
    this.state.allocatedPoints[stat] =
      (this.state.allocatedPoints[stat] ?? 0) + 1;
    this.recalculate();
  }

  // -----------------------------------------------------------------------
  // Conditional Modifiers
  // -----------------------------------------------------------------------

  registerConditionalModifier(modifier: ConditionalModifier): void {
    this.conditionalModifiers.push(modifier);
    this.recalculate();
  }

  removeConditionalModifier(id: string): void {
    this.conditionalModifiers = this.conditionalModifiers.filter(
      (m) => m.id !== id,
    );
    this.recalculate();
  }

  // -----------------------------------------------------------------------
  // Recalculate
  // -----------------------------------------------------------------------

  recalculate(): void {
    this.cachedDerived = this.computeDerived();
    // Clamp current HP/MP to new maximums
    this.state.currentHP = Math.min(this.state.currentHP, this.cachedDerived[DerivedStat.HP]);
    this.state.currentMP = Math.min(this.state.currentMP, this.cachedDerived[DerivedStat.MP]);
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  getState(): CharacterStatsState {
    return {
      ...this.state,
      buffs: this.state.buffs.map((b) => ({ ...b })),
      equipment: {
        ...this.state.equipment,
        primaryBonuses: { ...this.state.equipment.primaryBonuses },
      },
      basePrimary: { ...this.state.basePrimary },
      allocatedPoints: { ...this.state.allocatedPoints },
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private getBuffTotal(stat: PrimaryStat | DerivedStat): number {
    return this.state.buffs
      .filter((b) => b.stat === stat)
      .reduce((sum, b) => sum + b.amount, 0);
  }

  private computeDerived(): DerivedStatBlock {
    const s = this.state;
    const eq = s.equipment;
    const str = this.getPrimary(PrimaryStat.STR);
    const int = this.getPrimary(PrimaryStat.INT);
    const wis = this.getPrimary(PrimaryStat.WIS);
    const dex = this.getPrimary(PrimaryStat.DEX);
    const con = this.getPrimary(PrimaryStat.CON);

    // HP = CON * 8 + level * hpPerLevel
    const hp = con * 8 + s.level * s.hpPerLevel + this.getBuffTotal(DerivedStat.HP);

    // MP = INT * 6 + WIS * 3 + level * mpPerLevel
    const mp = int * 6 + wis * 3 + s.level * s.mpPerLevel + this.getBuffTotal(DerivedStat.MP);

    // ATK = STR * 2 + weapon.atk + buffs
    let atk = str * 2 + eq.atk + this.getBuffTotal(DerivedStat.ATK);

    // DEF = CON + armor.def + shield.def + buffs
    const def = con + eq.def + this.getBuffTotal(DerivedStat.DEF);

    // SPD = DEX * 1.5 + equipment.spd
    const spd = dex * 1.5 + eq.spd + this.getBuffTotal(DerivedStat.SPD);

    // CRIT = DEX * 0.5 + luck + equipment.crit  (luck = CHA * 0.1)
    const luck = this.getPrimary(PrimaryStat.CHA) * 0.1;
    const crit = Math.min(
      dex * 0.5 + luck + eq.crit + this.getBuffTotal(DerivedStat.CRIT),
      (balanceData.statFormulas.critChance as { maxCrit: number }).maxCrit,
    );

    // DODGE = DEX * 0.3 + SPD * 0.1
    const dodge = Math.min(
      dex * 0.3 + spd * 0.1 + this.getBuffTotal(DerivedStat.DODGE),
      (balanceData.statFormulas.dodgeChance as { maxDodge: number }).maxDodge,
    );

    // MAGIC_ATK = INT * 2.5 + WIS * 0.5
    const magicAtk = int * 2.5 + wis * 0.5 + this.getBuffTotal(DerivedStat.MAGIC_ATK);

    // MAGIC_DEF = WIS * 2 + INT * 0.5
    const magicDef = wis * 2 + int * 0.5 + this.getBuffTotal(DerivedStat.MAGIC_DEF);

    // Apply conditional modifiers (e.g. Berserker Blood)
    let atkMultiplier = 1.0;
    for (const mod of this.conditionalModifiers) {
      const ctx: ConditionalModifierContext = {
        currentHP: this.state.currentHP,
        maxHP: hp,
        level: this.state.level,
        characterId: this.state.characterId,
      };
      const result = mod.evaluate(ctx);
      if (result.stat === DerivedStat.ATK) {
        atkMultiplier *= result.multiplier;
      }
    }
    atk = Math.round(atk * atkMultiplier);

    return {
      [DerivedStat.HP]: Math.round(hp),
      [DerivedStat.MP]: Math.round(mp),
      [DerivedStat.ATK]: atk,
      [DerivedStat.DEF]: Math.round(def),
      [DerivedStat.SPD]: Math.round(spd * 10) / 10,
      [DerivedStat.CRIT]: Math.round(crit * 10) / 10,
      [DerivedStat.DODGE]: Math.round(dodge * 10) / 10,
      [DerivedStat.MAGIC_ATK]: Math.round(magicAtk),
      [DerivedStat.MAGIC_DEF]: Math.round(magicDef),
    };
  }

  // -----------------------------------------------------------------------
  // Berserker Blood
  // -----------------------------------------------------------------------

  private registerBerserkerBlood(): void {
    const thresholds: BerserkerThreshold[] =
      balanceData.cragHackBerserkerBlood.thresholds;

    this.registerConditionalModifier({
      id: 'berserker-blood',
      type: 'berserker_blood',
      evaluate: (ctx) => {
        const hpPct = ctx.maxHP > 0 ? ctx.currentHP / ctx.maxHP : 1;
        let multiplier = 1.0;

        // Walk thresholds from highest to lowest HP%.
        // Pick the multiplier for the first threshold the character is at or below.
        for (let i = thresholds.length - 1; i >= 0; i--) {
          if (hpPct <= thresholds[i].hpPercent) {
            multiplier = thresholds[i].damageMultiplier;
            break;
          }
        }

        return { stat: DerivedStat.ATK, multiplier };
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

/** Create a default EquipmentStatSnapshot (no equipment). */
export function emptyEquipmentSnapshot(): EquipmentStatSnapshot {
  return { atk: 0, def: 0, spd: 0, crit: 0, primaryBonuses: {} };
}

/** Create a fresh CharacterStatsState from base values. */
export function createCharacterStatsState(
  characterId: string,
  level: number,
  basePrimary: PrimaryStatBlock,
  hpPerLevel: number,
  mpPerLevel: number,
  hasBerserkerBlood: boolean = false,
): CharacterStatsState {
  const state: CharacterStatsState = {
    characterId,
    level,
    hpPerLevel,
    mpPerLevel,
    basePrimary: { ...basePrimary },
    allocatedPoints: {},
    buffs: [],
    equipment: emptyEquipmentSnapshot(),
    currentHP: 0,
    currentMP: 0,
    hasBerserkerBlood,
  };
  // Compute initial max HP/MP so currentHP/MP can be set to full.
  const temp = new CharacterStats(state);
  state.currentHP = temp.getMaxHP();
  state.currentMP = temp.getMaxMP();
  return state;
}
