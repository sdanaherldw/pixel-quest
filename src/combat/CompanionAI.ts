// ---------------------------------------------------------------------------
// CompanionAI.ts — AI for party companions in dungeons
// ---------------------------------------------------------------------------
// Pure TypeScript — no PixiJS dependencies.  Rendering is handled separately.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Commands that the player can issue to a companion. */
export enum CompanionCommand {
  /** Charge nearest enemy, use damage abilities on cooldown. */
  AGGRESSIVE = 'AGGRESSIVE',
  /** Stay near leader, prioritize healing/buffs, only attack if attacked. */
  DEFENSIVE = 'DEFENSIVE',
  /** Stay in current position, only attack enemies that enter range. */
  HOLD = 'HOLD',
  /** Autonomous decision-making based on class role. */
  FREE = 'FREE',
}

/** Role-based class archetypes that shape autonomous behavior. */
export enum CompanionRole {
  TANK = 'TANK',
  HEALER = 'HEALER',
  MELEE_DPS = 'MELEE_DPS',
  RANGED_DPS = 'RANGED_DPS',
  BARBARIAN = 'BARBARIAN',
}

/** Internal state of the companion AI. */
export enum CompanionState {
  FOLLOWING = 'FOLLOWING',
  COMBAT = 'COMBAT',
  RETREATING = 'RETREATING',
  HOLDING = 'HOLDING',
  DEAD = 'DEAD',
}

/** Action types the companion can perform. */
export enum CompanionActionType {
  NONE = 'NONE',
  MOVE = 'MOVE',
  ATTACK_MELEE = 'ATTACK_MELEE',
  ATTACK_RANGED = 'ATTACK_RANGED',
  USE_ABILITY = 'USE_ABILITY',
  HEAL = 'HEAL',
  BUFF = 'BUFF',
  TAUNT = 'TAUNT',
  USE_POTION = 'USE_POTION',
  INTERCEPT = 'INTERCEPT',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** 2D position. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Minimal snapshot of a combatant consumed by the companion AI. */
export interface CompanionCombatantState {
  id: string;
  position: Vec2;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  spd: number;
  alive: boolean;
  stunned: boolean;
  abilities: string[];
  cooldowns: string[];
  /** Role classification for the companion. */
  role: CompanionRole;
  /** Whether this combatant has potions available. */
  hasPotions: boolean;
  /** Class name (e.g. 'Knight', 'Cleric', 'Sorcerer', etc.). */
  className: string;
  team: string;
}

/** Minimal snapshot of an enemy. */
export interface EnemyCombatantState {
  id: string;
  position: Vec2;
  hp: number;
  maxHp: number;
  atk: number;
  alive: boolean;
  /** Whether this enemy is targeting a specific ally. */
  targetId: string | null;
}

/** The action chosen by the companion AI. */
export interface CompanionAction {
  type: CompanionActionType;
  targetId: string | null;
  targetPosition: Vec2 | null;
  abilityId: string | null;
  moveDirection: Vec2;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Distance to maintain from the leader when following. */
const FOLLOW_DISTANCE = 48;
/** Maximum distance before the companion sprints to catch up. */
const MAX_FOLLOW_DISTANCE = 150;
/** Distance behind the leader for back-line formation. */
const BACKLINE_OFFSET = 64;
/** Distance in front of leader for front-line (tank) formation. */
const FRONTLINE_OFFSET = 32;
/** HP percentage threshold for self-preservation potion use. */
const POTION_THRESHOLD = 0.2;
/** HP percentage of an ally that triggers healer response. */
const HEAL_THRESHOLD = 0.6;
/** HP percentage for emergency healing. */
const EMERGENCY_HEAL_THRESHOLD = 0.3;
/** Range within which companions will attack enemies in HOLD mode. */
const HOLD_ATTACK_RANGE = 80;
/** Melee attack range. */
const MELEE_RANGE = 32;
/** Ranged attack range. */
const RANGED_ATTACK_RANGE = 180;
/** Range at which tank will intercept enemies. */
const INTERCEPT_RANGE = 120;

/** Berserker Blood damage thresholds from balance.json. */
const BERSERKER_THRESHOLDS: Array<{ hpPercent: number; damageMultiplier: number }> = [
  { hpPercent: 0.5, damageMultiplier: 1.0 },
  { hpPercent: 0.4, damageMultiplier: 1.3 },
  { hpPercent: 0.3, damageMultiplier: 1.6 },
  { hpPercent: 0.25, damageMultiplier: 1.85 },
  { hpPercent: 0.2, damageMultiplier: 2.0 },
  { hpPercent: 0.15, damageMultiplier: 2.25 },
  { hpPercent: 0.1, damageMultiplier: 2.5 },
];

// ---------------------------------------------------------------------------
// CompanionAI
// ---------------------------------------------------------------------------

/**
 * AI controller for a single party companion in dungeon exploration.
 *
 * The companion follows the player-controlled leader, maintains formation
 * distance (back-line behind front-line), and engages enemies based on the
 * active {@link CompanionCommand}.
 *
 * Class-role-specific behaviour shapes how the companion fights:
 * - **Tank (Knight/Paladin):** intercepts enemies targeting squishies, taunts.
 * - **Healer (Cleric):** monitors party HP, heals lowest, buffs before combat.
 * - **DPS (Sorcerer/Ranger/Rogue):** focuses same target as leader, uses
 *   best damage abilities.
 * - **Barbarian (Crag Hack):** always aggressive, charges the strongest enemy,
 *   uses Berserker Blood effectively — fights *harder* at low HP instead of
 *   retreating.
 */
export class CompanionAI {
  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  private _command: CompanionCommand = CompanionCommand.FREE;
  private _state: CompanionState = CompanionState.FOLLOWING;
  private _currentAction: CompanionAction;
  public targetId: string | null = null;
  /** Position to hold when in HOLD command. */
  private _holdPosition: Vec2 | null = null;

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  constructor(initialCommand: CompanionCommand = CompanionCommand.FREE) {
    this._command = initialCommand;
    this._currentAction = this.noAction();
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  public get command(): CompanionCommand {
    return this._command;
  }

  public get state(): CompanionState {
    return this._state;
  }

  public get currentAction(): CompanionAction {
    return this._currentAction;
  }

  // -----------------------------------------------------------------------
  // Commands
  // -----------------------------------------------------------------------

  public setCommand(command: CompanionCommand): void {
    this._command = command;
    if (command === CompanionCommand.HOLD) {
      // Lock to current position (will be set on next update)
      this._state = CompanionState.HOLDING;
    }
  }

  public getCommand(): CompanionCommand {
    return this._command;
  }

  // -----------------------------------------------------------------------
  // Main update
  // -----------------------------------------------------------------------

  /**
   * Per-frame AI update.
   *
   * @param dt              Delta time in seconds.
   * @param companionState  The companion's own state snapshot.
   * @param leaderPos       Position of the player-controlled leader.
   * @param enemies         Snapshots of all enemy combatants.
   * @param allies          Snapshots of all allied combatants (including self).
   */
  public update(
    _dt: number,
    companionState: CompanionCombatantState,
    leaderPos: Vec2,
    enemies: EnemyCombatantState[],
    allies: CompanionCombatantState[],
  ): CompanionAction {
    // Dead check
    if (!companionState.alive) {
      this._state = CompanionState.DEAD;
      this._currentAction = this.noAction();
      return this._currentAction;
    }

    // Stunned — do nothing
    if (companionState.stunned) {
      this._currentAction = this.noAction();
      return this._currentAction;
    }

    // Self-preservation check (except Crag Hack)
    if (this.shouldUseSelfPreservation(companionState)) {
      this._currentAction = {
        type: CompanionActionType.USE_POTION,
        targetId: companionState.id,
        targetPosition: companionState.position,
        abilityId: null,
        moveDirection: { x: 0, y: 0 },
      };
      this._state = CompanionState.RETREATING;
      return this._currentAction;
    }

    const aliveEnemies = enemies.filter((e) => e.alive);
    const inCombat = aliveEnemies.length > 0;

    // Set hold position on first HOLD frame
    if (this._command === CompanionCommand.HOLD && !this._holdPosition) {
      this._holdPosition = { ...companionState.position };
    }
    if (this._command !== CompanionCommand.HOLD) {
      this._holdPosition = null;
    }

    // Dispatch based on command
    switch (this._command) {
      case CompanionCommand.AGGRESSIVE:
        this._currentAction = this.handleAggressive(
          companionState, leaderPos, aliveEnemies, allies,
        );
        break;

      case CompanionCommand.DEFENSIVE:
        this._currentAction = this.handleDefensive(
          companionState, leaderPos, aliveEnemies, allies,
        );
        break;

      case CompanionCommand.HOLD:
        this._currentAction = this.handleHold(
          companionState, aliveEnemies, allies,
        );
        break;

      case CompanionCommand.FREE:
        this._currentAction = this.handleFree(
          companionState, leaderPos, aliveEnemies, allies,
        );
        break;
    }

    // Update internal state
    if (!inCombat && this._state !== CompanionState.HOLDING) {
      this._state = CompanionState.FOLLOWING;
    } else if (inCombat && this._state !== CompanionState.HOLDING && this._state !== CompanionState.RETREATING) {
      this._state = CompanionState.COMBAT;
    }

    return this._currentAction;
  }

  // -----------------------------------------------------------------------
  // Command handlers
  // -----------------------------------------------------------------------

  private handleAggressive(
    self: CompanionCombatantState,
    leaderPos: Vec2,
    enemies: EnemyCombatantState[],
    _allies: CompanionCombatantState[],
  ): CompanionAction {
    if (enemies.length === 0) {
      return this.followLeader(self, leaderPos);
    }

    // Charge nearest enemy
    const nearest = this.findNearestEnemy(self.position, enemies);
    if (!nearest) return this.followLeader(self, leaderPos);

    this.targetId = nearest.id;
    const dist = this.distance(self.position, nearest.position);

    // Use abilities on cooldown
    const ability = this.pickDamageAbility(self);
    if (ability && dist <= RANGED_ATTACK_RANGE) {
      return {
        type: CompanionActionType.USE_ABILITY,
        targetId: nearest.id,
        targetPosition: nearest.position,
        abilityId: ability,
        moveDirection: this.directionToward(self.position, nearest.position),
      };
    }

    if (dist <= MELEE_RANGE) {
      return {
        type: CompanionActionType.ATTACK_MELEE,
        targetId: nearest.id,
        targetPosition: nearest.position,
        abilityId: null,
        moveDirection: this.directionToward(self.position, nearest.position),
      };
    }

    // Move toward enemy
    return {
      type: CompanionActionType.MOVE,
      targetId: nearest.id,
      targetPosition: nearest.position,
      abilityId: null,
      moveDirection: this.directionToward(self.position, nearest.position),
    };
  }

  private handleDefensive(
    self: CompanionCombatantState,
    leaderPos: Vec2,
    enemies: EnemyCombatantState[],
    allies: CompanionCombatantState[],
  ): CompanionAction {
    // Priority 1: Heal allies
    const healAction = this.tryHealAlly(self, allies);
    if (healAction) return healAction;

    // Priority 2: Buff allies
    const buffAction = this.tryBuffAlly(self, allies);
    if (buffAction) return buffAction;

    // Priority 3: Only attack enemies that are attacking us
    const attacker = enemies.find((e) => e.targetId === self.id);
    if (attacker) {
      const dist = this.distance(self.position, attacker.position);
      if (dist <= MELEE_RANGE) {
        return {
          type: CompanionActionType.ATTACK_MELEE,
          targetId: attacker.id,
          targetPosition: attacker.position,
          abilityId: null,
          moveDirection: this.directionToward(self.position, attacker.position),
        };
      }
    }

    // Stay near leader
    return this.followLeader(self, leaderPos);
  }

  private handleHold(
    self: CompanionCombatantState,
    enemies: EnemyCombatantState[],
    _allies: CompanionCombatantState[],
  ): CompanionAction {
    const holdPos = this._holdPosition ?? self.position;

    // Attack enemies that enter range
    for (const enemy of enemies) {
      const dist = this.distance(holdPos, enemy.position);
      if (dist <= HOLD_ATTACK_RANGE) {
        const selfDist = this.distance(self.position, enemy.position);
        if (selfDist <= MELEE_RANGE) {
          return {
            type: CompanionActionType.ATTACK_MELEE,
            targetId: enemy.id,
            targetPosition: enemy.position,
            abilityId: this.pickDamageAbility(self),
            moveDirection: { x: 0, y: 0 },
          };
        }
        // Ranged attack if available
        const rangedAbility = this.pickRangedAbility(self);
        if (rangedAbility) {
          return {
            type: CompanionActionType.ATTACK_RANGED,
            targetId: enemy.id,
            targetPosition: enemy.position,
            abilityId: rangedAbility,
            moveDirection: { x: 0, y: 0 },
          };
        }
      }
    }

    // Stay at hold position
    const distToHold = this.distance(self.position, holdPos);
    if (distToHold > 8) {
      return {
        type: CompanionActionType.MOVE,
        targetId: null,
        targetPosition: holdPos,
        abilityId: null,
        moveDirection: this.directionToward(self.position, holdPos),
      };
    }

    return this.noAction();
  }

  private handleFree(
    self: CompanionCombatantState,
    leaderPos: Vec2,
    enemies: EnemyCombatantState[],
    allies: CompanionCombatantState[],
  ): CompanionAction {
    // Autonomous decision-making based on class role
    switch (self.role) {
      case CompanionRole.TANK:
        return this.handleTankBehavior(self, leaderPos, enemies, allies);
      case CompanionRole.HEALER:
        return this.handleHealerBehavior(self, leaderPos, enemies, allies);
      case CompanionRole.MELEE_DPS:
        return this.handleMeleeDpsBehavior(self, leaderPos, enemies, allies);
      case CompanionRole.RANGED_DPS:
        return this.handleRangedDpsBehavior(self, leaderPos, enemies, allies);
      case CompanionRole.BARBARIAN:
        return this.handleBarbarianBehavior(self, leaderPos, enemies, allies);
    }
  }

  // -----------------------------------------------------------------------
  // Role-specific behaviors
  // -----------------------------------------------------------------------

  /**
   * Tank (Knight/Paladin): intercept enemies targeting squishies, use taunts.
   */
  private handleTankBehavior(
    self: CompanionCombatantState,
    leaderPos: Vec2,
    enemies: EnemyCombatantState[],
    allies: CompanionCombatantState[],
  ): CompanionAction {
    if (enemies.length === 0) {
      return this.followLeader(self, leaderPos, true); // front-line
    }

    // Priority 1: Intercept enemies targeting squishy allies
    const squishyAlly = allies.find(
      (a) =>
        a.alive &&
        a.id !== self.id &&
        (a.role === CompanionRole.HEALER || a.role === CompanionRole.RANGED_DPS),
    );
    if (squishyAlly) {
      const threatToSquishy = enemies.find(
        (e) => e.targetId === squishyAlly.id,
      );
      if (threatToSquishy) {
        const dist = this.distance(self.position, threatToSquishy.position);
        if (dist <= INTERCEPT_RANGE) {
          // Taunt if available
          if (self.abilities.includes('taunt') && !self.cooldowns.includes('taunt')) {
            return {
              type: CompanionActionType.TAUNT,
              targetId: threatToSquishy.id,
              targetPosition: threatToSquishy.position,
              abilityId: 'taunt',
              moveDirection: this.directionToward(self.position, threatToSquishy.position),
            };
          }
          // Intercept
          return {
            type: CompanionActionType.INTERCEPT,
            targetId: threatToSquishy.id,
            targetPosition: threatToSquishy.position,
            abilityId: null,
            moveDirection: this.directionToward(self.position, threatToSquishy.position),
          };
        }
      }
    }

    // Priority 2: Attack nearest enemy
    const nearest = this.findNearestEnemy(self.position, enemies);
    if (nearest) {
      const dist = this.distance(self.position, nearest.position);
      if (dist <= MELEE_RANGE) {
        return {
          type: CompanionActionType.ATTACK_MELEE,
          targetId: nearest.id,
          targetPosition: nearest.position,
          abilityId: this.pickDamageAbility(self),
          moveDirection: this.directionToward(self.position, nearest.position),
        };
      }
      return {
        type: CompanionActionType.MOVE,
        targetId: nearest.id,
        targetPosition: nearest.position,
        abilityId: null,
        moveDirection: this.directionToward(self.position, nearest.position),
      };
    }

    return this.followLeader(self, leaderPos, true);
  }

  /**
   * Healer (Cleric): monitor party HP, heal lowest, buff before combat.
   */
  private handleHealerBehavior(
    self: CompanionCombatantState,
    leaderPos: Vec2,
    enemies: EnemyCombatantState[],
    allies: CompanionCombatantState[],
  ): CompanionAction {
    // Priority 1: Emergency heal (lowest HP ally below 30%)
    const emergency = allies
      .filter((a) => a.alive && a.hp / a.maxHp < EMERGENCY_HEAL_THRESHOLD)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (emergency) {
      const healAbility = this.pickHealAbility(self);
      if (healAbility) {
        return {
          type: CompanionActionType.HEAL,
          targetId: emergency.id,
          targetPosition: emergency.position,
          abilityId: healAbility,
          moveDirection: { x: 0, y: 0 },
        };
      }
    }

    // Priority 2: Regular healing (lowest HP ally below 60%)
    const healAction = this.tryHealAlly(self, allies);
    if (healAction) return healAction;

    // Priority 3: Buff allies (if no enemies or pre-combat)
    const buffAction = this.tryBuffAlly(self, allies);
    if (buffAction) return buffAction;

    // Priority 4: Ranged attack if in combat and nothing else to do
    if (enemies.length > 0) {
      const nearest = this.findNearestEnemy(self.position, enemies);
      if (nearest) {
        const rangedAbility = this.pickRangedAbility(self);
        if (rangedAbility) {
          return {
            type: CompanionActionType.ATTACK_RANGED,
            targetId: nearest.id,
            targetPosition: nearest.position,
            abilityId: rangedAbility,
            moveDirection: { x: 0, y: 0 },
          };
        }
      }
    }

    // Stay near leader (back-line)
    return this.followLeader(self, leaderPos, false);
  }

  /**
   * Melee DPS (Sorcerer in melee range, Rogue): focus same target as leader,
   * use best abilities.
   */
  private handleMeleeDpsBehavior(
    self: CompanionCombatantState,
    leaderPos: Vec2,
    enemies: EnemyCombatantState[],
    _allies: CompanionCombatantState[],
  ): CompanionAction {
    if (enemies.length === 0) {
      return this.followLeader(self, leaderPos);
    }

    // Focus same target as leader (nearest to leader)
    const leaderTarget = this.findNearestEnemy(leaderPos, enemies);
    const target = leaderTarget ?? this.findNearestEnemy(self.position, enemies);
    if (!target) return this.followLeader(self, leaderPos);

    this.targetId = target.id;
    const dist = this.distance(self.position, target.position);

    if (dist <= MELEE_RANGE) {
      return {
        type: CompanionActionType.ATTACK_MELEE,
        targetId: target.id,
        targetPosition: target.position,
        abilityId: this.pickDamageAbility(self),
        moveDirection: this.directionToward(self.position, target.position),
      };
    }

    return {
      type: CompanionActionType.MOVE,
      targetId: target.id,
      targetPosition: target.position,
      abilityId: null,
      moveDirection: this.directionToward(self.position, target.position),
    };
  }

  /**
   * Ranged DPS (Sorcerer, Ranger): focus same target as leader, stay at range.
   */
  private handleRangedDpsBehavior(
    self: CompanionCombatantState,
    leaderPos: Vec2,
    enemies: EnemyCombatantState[],
    _allies: CompanionCombatantState[],
  ): CompanionAction {
    if (enemies.length === 0) {
      return this.followLeader(self, leaderPos, false);
    }

    const leaderTarget = this.findNearestEnemy(leaderPos, enemies);
    const target = leaderTarget ?? this.findNearestEnemy(self.position, enemies);
    if (!target) return this.followLeader(self, leaderPos, false);

    this.targetId = target.id;
    const dist = this.distance(self.position, target.position);

    // Too close — back away
    if (dist < MELEE_RANGE * 2) {
      return {
        type: CompanionActionType.MOVE,
        targetId: target.id,
        targetPosition: null,
        abilityId: null,
        moveDirection: this.directionAway(self.position, target.position),
      };
    }

    // In range — fire
    if (dist <= RANGED_ATTACK_RANGE) {
      const ability = this.pickDamageAbility(self) ?? this.pickRangedAbility(self);
      return {
        type: CompanionActionType.ATTACK_RANGED,
        targetId: target.id,
        targetPosition: target.position,
        abilityId: ability,
        moveDirection: { x: 0, y: 0 },
      };
    }

    // Too far — approach to range
    return {
      type: CompanionActionType.MOVE,
      targetId: target.id,
      targetPosition: target.position,
      abilityId: null,
      moveDirection: this.directionToward(self.position, target.position),
    };
  }

  /**
   * Barbarian (Crag Hack): always aggressive.  Charges strongest enemy.
   * Uses Berserker Blood effectively — fights *harder* at low HP.
   * Never retreats, never uses potions for self-preservation.
   */
  private handleBarbarianBehavior(
    self: CompanionCombatantState,
    leaderPos: Vec2,
    enemies: EnemyCombatantState[],
    _allies: CompanionCombatantState[],
  ): CompanionAction {
    if (enemies.length === 0) {
      return this.followLeader(self, leaderPos, true);
    }

    // Crag Hack charges the strongest (highest ATK) enemy
    const strongest = enemies.reduce((best, e) =>
      e.atk > best.atk ? e : best,
    );

    this.targetId = strongest.id;
    const dist = this.distance(self.position, strongest.position);

    if (dist <= MELEE_RANGE) {
      // Pick the most damaging ability available
      const ability = this.pickDamageAbility(self);
      return {
        type: CompanionActionType.ATTACK_MELEE,
        targetId: strongest.id,
        targetPosition: strongest.position,
        abilityId: ability,
        moveDirection: this.directionToward(self.position, strongest.position),
      };
    }

    // Charge toward strongest enemy
    return {
      type: CompanionActionType.MOVE,
      targetId: strongest.id,
      targetPosition: strongest.position,
      abilityId: null,
      moveDirection: this.directionToward(self.position, strongest.position),
    };
  }

  // -----------------------------------------------------------------------
  // Berserker Blood (Crag Hack)
  // -----------------------------------------------------------------------

  /**
   * Calculate the Berserker Blood damage multiplier based on current HP%.
   * Data from balance.json cragHackBerserkerBlood thresholds.
   */
  public getBerserkerMultiplier(hpPercent: number): number {
    let multiplier = 1.0;
    for (const threshold of BERSERKER_THRESHOLDS) {
      if (hpPercent <= threshold.hpPercent) {
        multiplier = threshold.damageMultiplier;
      } else {
        break;
      }
    }
    return multiplier;
  }

  // -----------------------------------------------------------------------
  // Shared helpers
  // -----------------------------------------------------------------------

  /** Try to heal the most wounded ally below the threshold. */
  private tryHealAlly(
    self: CompanionCombatantState,
    allies: CompanionCombatantState[],
  ): CompanionAction | null {
    const healAbility = this.pickHealAbility(self);
    if (!healAbility) return null;

    const wounded = allies
      .filter((a) => a.alive && a.hp / a.maxHp < HEAL_THRESHOLD)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);

    if (wounded.length === 0) return null;

    return {
      type: CompanionActionType.HEAL,
      targetId: wounded[0].id,
      targetPosition: wounded[0].position,
      abilityId: healAbility,
      moveDirection: { x: 0, y: 0 },
    };
  }

  /** Try to buff an ally (pre-combat or when idle). */
  private tryBuffAlly(
    self: CompanionCombatantState,
    allies: CompanionCombatantState[],
  ): CompanionAction | null {
    const buffAbility = self.abilities.find(
      (a) =>
        (a.includes('buff') || a.includes('bless') || a.includes('war-drum') || a.includes('shield')) &&
        !self.cooldowns.includes(a),
    );
    if (!buffAbility) return null;

    // Buff the ally with the highest ATK that is alive (prioritise DPS)
    const target = allies
      .filter((a) => a.alive && a.id !== self.id)
      .sort((a, b) => b.atk - a.atk)[0];

    if (!target) return null;

    return {
      type: CompanionActionType.BUFF,
      targetId: target.id,
      targetPosition: target.position,
      abilityId: buffAbility,
      moveDirection: { x: 0, y: 0 },
    };
  }

  /** Follow the leader, maintaining formation distance. */
  private followLeader(
    self: CompanionCombatantState,
    leaderPos: Vec2,
    frontLine: boolean = false,
  ): CompanionAction {
    // Calculate formation position
    const offset = frontLine ? FRONTLINE_OFFSET : -BACKLINE_OFFSET;
    const formationPos: Vec2 = {
      x: leaderPos.x + offset,
      y: leaderPos.y,
    };

    const dist = this.distance(self.position, formationPos);

    if (dist < FOLLOW_DISTANCE * 0.5) {
      return this.noAction();
    }

    // Sprint if too far
    const speedMult = dist > MAX_FOLLOW_DISTANCE ? 1.5 : 1.0;
    const dir = this.directionToward(self.position, formationPos);

    return {
      type: CompanionActionType.MOVE,
      targetId: null,
      targetPosition: formationPos,
      abilityId: null,
      moveDirection: { x: dir.x * speedMult, y: dir.y * speedMult },
    };
  }

  /**
   * Self-preservation check.  Returns true if the companion should use a
   * potion and retreat.  Crag Hack (Barbarian) is exempt — he fights harder
   * at low HP.
   */
  private shouldUseSelfPreservation(self: CompanionCombatantState): boolean {
    // Barbarians never retreat
    if (self.role === CompanionRole.BARBARIAN) return false;

    const hpPercent = self.hp / self.maxHp;
    return hpPercent < POTION_THRESHOLD && self.hasPotions;
  }

  // -----------------------------------------------------------------------
  // Ability selection
  // -----------------------------------------------------------------------

  private pickDamageAbility(self: CompanionCombatantState): string | null {
    const damage = self.abilities.filter(
      (a) =>
        !a.includes('heal') &&
        !a.includes('buff') &&
        !a.includes('bless') &&
        !a.includes('shield') &&
        !a.includes('taunt') &&
        !self.cooldowns.includes(a),
    );
    if (damage.length === 0) return null;
    return damage[Math.floor(Math.random() * damage.length)];
  }

  private pickHealAbility(self: CompanionCombatantState): string | null {
    return (
      self.abilities.find(
        (a) => a.includes('heal') && !self.cooldowns.includes(a),
      ) ?? null
    );
  }

  private pickRangedAbility(self: CompanionCombatantState): string | null {
    return (
      self.abilities.find(
        (a) =>
          (a.includes('bolt') ||
            a.includes('arrow') ||
            a.includes('blast') ||
            a.includes('shard') ||
            a.includes('beam') ||
            a.includes('fire') ||
            a.includes('ice') ||
            a.includes('lightning')) &&
          !self.cooldowns.includes(a),
      ) ?? null
    );
  }

  // -----------------------------------------------------------------------
  // Spatial helpers
  // -----------------------------------------------------------------------

  private findNearestEnemy(
    from: Vec2,
    enemies: EnemyCombatantState[],
  ): EnemyCombatantState | null {
    if (enemies.length === 0) return null;
    let nearest = enemies[0];
    let nearestDist = this.distance(from, nearest.position);
    for (let i = 1; i < enemies.length; i++) {
      const d = this.distance(from, enemies[i].position);
      if (d < nearestDist) {
        nearest = enemies[i];
        nearestDist = d;
      }
    }
    return nearest;
  }

  private distance(a: Vec2, b: Vec2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private directionToward(from: Vec2, to: Vec2): Vec2 {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / dist, y: dy / dist };
  }

  private directionAway(from: Vec2, threat: Vec2): Vec2 {
    const dir = this.directionToward(from, threat);
    return { x: -dir.x, y: -dir.y };
  }

  private noAction(): CompanionAction {
    return {
      type: CompanionActionType.NONE,
      targetId: null,
      targetPosition: null,
      abilityId: null,
      moveDirection: { x: 0, y: 0 },
    };
  }
}
