// ---------------------------------------------------------------------------
// CombatManager.ts — Real-time action combat management
// ---------------------------------------------------------------------------
// Pure TypeScript — no PixiJS dependencies.  Rendering is handled separately.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** High-level state of the combat encounter. */
export enum CombatState {
  IDLE = 'IDLE',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  VICTORY = 'VICTORY',
  DEFEAT = 'DEFEAT',
}

/** Broad damage categories. */
export enum DamageType {
  PHYSICAL = 'physical',
  FIRE = 'fire',
  ICE = 'ice',
  LIGHTNING = 'lightning',
  SHADOW = 'shadow',
  HOLY = 'holy',
  NATURE = 'nature',
}

/** Broad combatant allegiance. */
export enum CombatantTeam {
  PARTY = 'party',
  ENEMY = 'enemy',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Runtime stats used in damage calculations. */
export interface CombatStats {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  spd: number;
  int: number;
  critChance: number;   // 0-100
  critDamage: number;    // multiplier, e.g. 1.5
  dodgeChance: number;   // 0-100
}

/** Position and dimensions for hitbox-based collision (dungeon mode). */
export interface CombatPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  facingRight: boolean;
}

/** A single participant in combat. */
export interface Combatant {
  id: string;
  name: string;
  team: CombatantTeam;
  stats: CombatStats;
  position: CombatPosition;
  /** Seconds until next auto-action. */
  actionTimer: number;
  /** Seconds needed for the action timer to fill (derived from SPD). */
  actionInterval: number;
  /** True if the combatant is still alive. */
  alive: boolean;
  /** IDs of active status effects (managed by StatusEffectSystem). */
  statusEffectIds: string[];
  /** Enemy data ID for cross-referencing enemies.json. */
  enemyDataId?: string;
  /** XP reward for defeating this combatant (enemies only). */
  xpReward?: number;
  /** Gold reward for defeating this combatant (enemies only). */
  goldReward?: number;
  /** Element weaknesses (take extra damage). */
  weaknesses: string[];
  /** Element resistances (take reduced damage). */
  resistances: string[];
  /** Cooldowns keyed by ability name, value = seconds remaining. */
  cooldowns: Map<string, number>;
  /** Seconds of invincibility remaining (i-frames after taking a hit). */
  invincibilityTimer: number;
}

/** Minimal loot drop returned on victory. */
export interface LootDrop {
  itemId: string;
  quantity: number;
}

/** Reward bundle distributed after a victorious encounter. */
export interface CombatReward {
  xp: number;
  gold: number;
  loot: LootDrop[];
}

/** Result of a single damage / healing action. */
export interface CombatActionResult {
  attackerId: string;
  targetId: string;
  rawDamage: number;
  finalDamage: number;
  damageType: DamageType;
  isCritical: boolean;
  isDodged: boolean;
  isHealing: boolean;
  overkill: number;
  targetAlive: boolean;
}

/** Configuration for spawning an enemy into combat. */
export interface EnemySpawnConfig {
  enemyDataId: string;
  name: string;
  stats: CombatStats;
  position: CombatPosition;
  weaknesses: string[];
  resistances: string[];
}

/**
 * Listener callback for combat events.  Systems can subscribe to be notified
 * of damage, healing, kills, phase changes, etc.
 */
export type CombatEventListener = (event: CombatEvent) => void;

export interface CombatEvent {
  type: CombatEventType;
  data: Record<string, unknown>;
}

export enum CombatEventType {
  COMBAT_START = 'COMBAT_START',
  COMBAT_END = 'COMBAT_END',
  DAMAGE_DEALT = 'DAMAGE_DEALT',
  HEALING_APPLIED = 'HEALING_APPLIED',
  COMBATANT_DEFEATED = 'COMBATANT_DEFEATED',
  ACTION_READY = 'ACTION_READY',
  STATUS_APPLIED = 'STATUS_APPLIED',
  STATUS_REMOVED = 'STATUS_REMOVED',
  VICTORY = 'VICTORY',
  DEFEAT = 'DEFEAT',
  STATE_CHANGED = 'STATE_CHANGED',
}

// ---------------------------------------------------------------------------
// Constants (sourced conceptually from balance.json)
// ---------------------------------------------------------------------------

/** Seconds of invincibility after taking damage. */
const INVINCIBILITY_FRAMES_DURATION = 0.3;
/** Base action interval divisor — higher SPD = shorter interval. */
const BASE_ACTION_INTERVAL = 10;
/** Minimum action interval in seconds. */
const MIN_ACTION_INTERVAL = 0.5;
/** Damage variance range: [0.9, 1.1]. */
const DAMAGE_VARIANCE_MIN = 0.9;
const DAMAGE_VARIANCE_MAX = 0.2; // added to min → [0.9, 1.1]
/** Elemental modifier when target is weak. */
const ELEMENTAL_WEAK_MULTIPLIER = 1.5;
/** Elemental modifier when target resists. */
const ELEMENTAL_RESIST_MULTIPLIER = 0.5;
/**
 * Global cooldown between any two actions (seconds).
 * Exported for use by external systems that need to enforce GCD.
 */
export const GLOBAL_COOLDOWN = 0.5;

// ---------------------------------------------------------------------------
// CombatManager
// ---------------------------------------------------------------------------

/**
 * Manages a single combat encounter: combatant tracking, action timers,
 * damage / healing resolution, and victory / defeat conditions.
 *
 * The manager is **mode-agnostic** — it exposes the same API regardless of
 * whether the encounter is overworld (turn-timer) or dungeon (real-time
 * with hitboxes).  The calling game scene decides which update path to use.
 */
export class CombatManager {
  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  private _state: CombatState = CombatState.IDLE;
  private readonly _combatants: Map<string, Combatant> = new Map();
  private readonly _listeners: Map<CombatEventType, CombatEventListener[]> = new Map();
  private _rewards: CombatReward | null = null;
  private _elapsed: number = 0;

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  public get state(): CombatState {
    return this._state;
  }

  public get elapsed(): number {
    return this._elapsed;
  }

  public get rewards(): CombatReward | null {
    return this._rewards;
  }

  /** All combatants currently registered. */
  public getCombatants(): Combatant[] {
    return Array.from(this._combatants.values());
  }

  /** Retrieve a single combatant by id, or `undefined`. */
  public getCombatant(id: string): Combatant | undefined {
    return this._combatants.get(id);
  }

  /** Party members that are still alive. */
  public getAliveParty(): Combatant[] {
    return this.getCombatants().filter(
      (c) => c.team === CombatantTeam.PARTY && c.alive,
    );
  }

  /** Enemies that are still alive. */
  public getAliveEnemies(): Combatant[] {
    return this.getCombatants().filter(
      (c) => c.team === CombatantTeam.ENEMY && c.alive,
    );
  }

  // -----------------------------------------------------------------------
  // Event system
  // -----------------------------------------------------------------------

  public on(type: CombatEventType, listener: CombatEventListener): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, []);
    }
    this._listeners.get(type)!.push(listener);
  }

  public off(type: CombatEventType, listener: CombatEventListener): void {
    const arr = this._listeners.get(type);
    if (!arr) return;
    const idx = arr.indexOf(listener);
    if (idx !== -1) arr.splice(idx, 1);
  }

  private emit(type: CombatEventType, data: Record<string, unknown> = {}): void {
    const arr = this._listeners.get(type);
    if (!arr) return;
    const event: CombatEvent = { type, data };
    for (const fn of arr) {
      fn(event);
    }
  }

  // -----------------------------------------------------------------------
  // Encounter lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start a new combat encounter.
   *
   * @param partyMembers  Array of party combatants (already populated).
   * @param enemies       Enemy spawn configurations (from enemies.json data).
   */
  public startCombat(
    partyMembers: Combatant[],
    enemies: EnemySpawnConfig[],
  ): void {
    this._combatants.clear();
    this._rewards = null;
    this._elapsed = 0;

    // Register party members
    for (const member of partyMembers) {
      member.actionTimer = 0;
      member.actionInterval = this.computeActionInterval(member.stats.spd);
      member.alive = member.stats.hp > 0;
      member.invincibilityTimer = 0;
      this._combatants.set(member.id, member);
    }

    // Spawn enemies
    let enemyIndex = 0;
    for (const config of enemies) {
      const id = `enemy_${config.enemyDataId}_${enemyIndex++}`;
      const combatant: Combatant = {
        id,
        name: config.name,
        team: CombatantTeam.ENEMY,
        stats: { ...config.stats },
        position: { ...config.position },
        actionTimer: 0,
        actionInterval: this.computeActionInterval(config.stats.spd),
        alive: true,
        statusEffectIds: [],
        enemyDataId: config.enemyDataId,
        weaknesses: [...config.weaknesses],
        resistances: [...config.resistances],
        cooldowns: new Map(),
        invincibilityTimer: 0,
      };
      this._combatants.set(id, combatant);
    }

    this.setState(CombatState.ACTIVE);
    this.emit(CombatEventType.COMBAT_START, {
      partyCount: partyMembers.length,
      enemyCount: enemies.length,
    });
  }

  /**
   * Forcefully end the encounter, optionally specifying the final state.
   * Called externally when e.g. the player flees.
   */
  public endCombat(finalState: CombatState = CombatState.IDLE): void {
    this.setState(finalState);
    this.emit(CombatEventType.COMBAT_END, { finalState });
  }

  /** Pause / unpause the encounter (e.g. when opening a menu). */
  public setPaused(paused: boolean): void {
    if (paused && this._state === CombatState.ACTIVE) {
      this.setState(CombatState.PAUSED);
    } else if (!paused && this._state === CombatState.PAUSED) {
      this.setState(CombatState.ACTIVE);
    }
  }

  // -----------------------------------------------------------------------
  // Per-frame update
  // -----------------------------------------------------------------------

  /**
   * Advance the combat simulation by `dt` seconds.
   *
   * This ticks action timers, cooldowns, and invincibility frames for every
   * living combatant.  When an action timer fills it emits an
   * `ACTION_READY` event so the owning AI / player-input system can choose
   * an ability.
   */
  public update(dt: number): void {
    if (this._state !== CombatState.ACTIVE) return;

    this._elapsed += dt;

    for (const combatant of this._combatants.values()) {
      if (!combatant.alive) continue;

      // Tick invincibility frames
      if (combatant.invincibilityTimer > 0) {
        combatant.invincibilityTimer = Math.max(
          0,
          combatant.invincibilityTimer - dt,
        );
      }

      // Tick action timer
      combatant.actionTimer += dt;
      if (combatant.actionTimer >= combatant.actionInterval) {
        combatant.actionTimer -= combatant.actionInterval;
        this.emit(CombatEventType.ACTION_READY, {
          combatantId: combatant.id,
          team: combatant.team,
        });
      }

      // Tick cooldowns
      for (const [ability, remaining] of combatant.cooldowns) {
        const next = remaining - dt;
        if (next <= 0) {
          combatant.cooldowns.delete(ability);
        } else {
          combatant.cooldowns.set(ability, next);
        }
      }
    }

    // Check victory / defeat
    this.checkCombatEnd();
  }

  // -----------------------------------------------------------------------
  // Damage
  // -----------------------------------------------------------------------

  /**
   * Deal damage from `attacker` to `target`.
   *
   * Formula:
   * ```
   * finalDamage = (ATK * skillMultiplier - DEF * 0.5)
   *             * elementalModifier
   *             * (0.9 + Math.random() * 0.2)
   * ```
   * - Critical hit: if `Math.random() * 100 < CRIT%`, damage *= critDamage
   * - Dodge: if `Math.random() * 100 < target.DODGE%`, damage = 0
   *
   * @param attackerId      ID of the attacking combatant.
   * @param targetId        ID of the target combatant.
   * @param baseDamage      Raw damage value (e.g. ATK or spell base).
   * @param damageType      Element / physical category.
   * @param skillMultiplier Multiplier from the skill / ability used (default 1).
   * @returns Result details, or `null` if the attacker or target is invalid.
   */
  public dealDamage(
    attackerId: string,
    targetId: string,
    baseDamage: number,
    damageType: DamageType = DamageType.PHYSICAL,
    skillMultiplier: number = 1.0,
  ): CombatActionResult | null {
    const attacker = this._combatants.get(attackerId);
    const target = this._combatants.get(targetId);
    if (!attacker || !target || !target.alive) return null;

    // Invincibility check
    if (target.invincibilityTimer > 0) {
      return this.buildResult(attackerId, targetId, baseDamage, 0, damageType, false, true);
    }

    // Dodge check
    const dodgeRoll = Math.random() * 100;
    if (dodgeRoll < target.stats.dodgeChance) {
      return this.buildResult(attackerId, targetId, baseDamage, 0, damageType, false, true);
    }

    // Base damage calculation — diminishing returns DEF formula
    const rawDmg = baseDamage * skillMultiplier;
    let damage = rawDmg * (1 - target.stats.def / (target.stats.def + 100));

    // Elemental modifier
    const eleMod = this.getElementalModifier(damageType, target);
    damage *= eleMod;

    // Variance
    damage *= DAMAGE_VARIANCE_MIN + Math.random() * DAMAGE_VARIANCE_MAX;

    // Critical hit
    let isCrit = false;
    const critRoll = Math.random() * 100;
    if (critRoll < attacker.stats.critChance) {
      damage *= attacker.stats.critDamage;
      isCrit = true;
    }

    damage = Math.floor(damage);
    damage = Math.max(1, damage); // minimum damage floor of 1

    // Apply
    const overkill = Math.max(0, damage - target.stats.hp);
    target.stats.hp = Math.max(0, target.stats.hp - damage);
    target.invincibilityTimer = INVINCIBILITY_FRAMES_DURATION;

    const result = this.buildResult(
      attackerId,
      targetId,
      baseDamage,
      damage,
      damageType,
      isCrit,
      false,
    );
    result.overkill = overkill;
    result.targetAlive = target.stats.hp > 0;

    if (target.stats.hp <= 0) {
      target.alive = false;
      this.emit(CombatEventType.COMBATANT_DEFEATED, {
        combatantId: target.id,
        killerId: attacker.id,
        team: target.team,
      });
    }

    this.emit(CombatEventType.DAMAGE_DEALT, { result });
    return result;
  }

  // -----------------------------------------------------------------------
  // Healing
  // -----------------------------------------------------------------------

  /**
   * Apply healing from `source` to `target`.
   *
   * @param sourceId  ID of the healing source.
   * @param targetId  ID of the heal target.
   * @param amount    Base heal amount before modifiers.
   * @returns Action result, or `null` if source/target is invalid.
   */
  public applyHealing(
    sourceId: string,
    targetId: string,
    amount: number,
  ): CombatActionResult | null {
    const source = this._combatants.get(sourceId);
    const target = this._combatants.get(targetId);
    if (!source || !target || !target.alive) return null;

    const effectiveHeal = Math.min(amount, target.stats.maxHp - target.stats.hp);
    target.stats.hp += effectiveHeal;

    const result: CombatActionResult = {
      attackerId: sourceId,
      targetId,
      rawDamage: amount,
      finalDamage: effectiveHeal,
      damageType: DamageType.HOLY, // healing uses holy as a category
      isCritical: false,
      isDodged: false,
      isHealing: true,
      overkill: 0,
      targetAlive: true,
    };

    this.emit(CombatEventType.HEALING_APPLIED, { result });
    return result;
  }

  // -----------------------------------------------------------------------
  // Stat modifiers (used by StatusEffectSystem to temporarily alter stats)
  // -----------------------------------------------------------------------

  /**
   * Modify a combatant's stat by a flat amount.  Negative values reduce.
   * This is the hook that StatusEffectSystem calls for buffs / debuffs.
   */
  public modifyStat(
    combatantId: string,
    stat: keyof CombatStats,
    delta: number,
  ): void {
    const c = this._combatants.get(combatantId);
    if (!c) return;
    (c.stats[stat] as number) += delta;

    // Clamp HP to maxHp after a maxHp change
    if (stat === 'maxHp') {
      c.stats.hp = Math.min(c.stats.hp, c.stats.maxHp);
    }

    // Recalculate action interval if SPD changed
    if (stat === 'spd') {
      c.actionInterval = this.computeActionInterval(c.stats.spd);
    }
  }

  /**
   * Directly set a combatant's HP (e.g. from a DOT tick).  Clamps between
   * 0 and maxHp and triggers defeat events when appropriate.
   */
  public setHP(combatantId: string, newHP: number, sourceId?: string): void {
    const c = this._combatants.get(combatantId);
    if (!c || !c.alive) return;
    c.stats.hp = Math.max(0, Math.min(newHP, c.stats.maxHp));
    if (c.stats.hp <= 0) {
      c.alive = false;
      this.emit(CombatEventType.COMBATANT_DEFEATED, {
        combatantId: c.id,
        killerId: sourceId ?? 'dot',
        team: c.team,
      });
      this.checkCombatEnd();
    }
  }

  // -----------------------------------------------------------------------
  // Ability cooldowns
  // -----------------------------------------------------------------------

  /** Put an ability on cooldown for a given combatant. */
  public startCooldown(combatantId: string, ability: string, seconds: number): void {
    const c = this._combatants.get(combatantId);
    if (!c) return;
    c.cooldowns.set(ability, seconds);
  }

  /** Check whether a specific ability is off cooldown. */
  public isAbilityReady(combatantId: string, ability: string): boolean {
    const c = this._combatants.get(combatantId);
    if (!c) return false;
    return !c.cooldowns.has(ability);
  }

  // -----------------------------------------------------------------------
  // Rewards
  // -----------------------------------------------------------------------

  /**
   * Calculate and cache XP / gold / loot rewards after a victorious
   * encounter.  The reward data is stored on the manager instance and can
   * be read by the scene to update player state.
   *
   * Loot resolution is intentionally simplified here — the real loot tables
   * live in enemies.json and should be resolved by the calling code that
   * has access to the full item database.
   */
  public calculateRewards(): CombatReward {
    let totalXP = 0;
    let totalGold = 0;
    const loot: LootDrop[] = [];

    for (const c of this._combatants.values()) {
      if (c.team !== CombatantTeam.ENEMY) continue;
      // Use explicit reward fields when available, fall back to stat-based estimates
      totalXP += c.xpReward ?? Math.max(1, c.stats.int);
      totalGold += c.goldReward ?? Math.max(1, Math.floor(c.stats.int * 0.5 + Math.random() * 5));
    }

    // Ensure sane values
    totalXP = Math.max(0, totalXP);
    totalGold = Math.max(0, totalGold);

    this._rewards = { xp: totalXP, gold: totalGold, loot };
    return this._rewards;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private setState(next: CombatState): void {
    const prev = this._state;
    this._state = next;
    this.emit(CombatEventType.STATE_CHANGED, { prev, next });
  }

  /** Check if the encounter has reached a terminal state. */
  private checkCombatEnd(): void {
    if (this._state !== CombatState.ACTIVE) return;

    const partyAlive = this.getAliveParty().length > 0;
    const enemiesAlive = this.getAliveEnemies().length > 0;

    if (!enemiesAlive) {
      const rewards = this.calculateRewards();
      this.setState(CombatState.VICTORY);
      this.emit(CombatEventType.VICTORY, { rewards });
    } else if (!partyAlive) {
      this.setState(CombatState.DEFEAT);
      this.emit(CombatEventType.DEFEAT, {});
    }
  }

  /** Compute the action interval (seconds) from a SPD stat. */
  private computeActionInterval(spd: number): number {
    // Higher SPD → shorter interval.  Clamped to a minimum.
    return Math.max(MIN_ACTION_INTERVAL, BASE_ACTION_INTERVAL / Math.max(1, spd));
  }

  /** Compute elemental modifier based on target weaknesses / resistances. */
  private getElementalModifier(
    damageType: DamageType,
    target: Combatant,
  ): number {
    const typeStr = damageType as string;
    if (target.weaknesses.includes(typeStr)) return ELEMENTAL_WEAK_MULTIPLIER;
    if (target.resistances.includes(typeStr)) return ELEMENTAL_RESIST_MULTIPLIER;
    return 1.0;
  }

  /** Build a CombatActionResult helper. */
  private buildResult(
    attackerId: string,
    targetId: string,
    rawDamage: number,
    finalDamage: number,
    damageType: DamageType,
    isCritical: boolean,
    isDodged: boolean,
  ): CombatActionResult {
    return {
      attackerId,
      targetId,
      rawDamage,
      finalDamage,
      damageType,
      isCritical,
      isDodged,
      isHealing: false,
      overkill: 0,
      targetAlive: true,
    };
  }
}
