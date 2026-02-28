// ---------------------------------------------------------------------------
// EnemyAI.ts — Behavior tree-based enemy AI system
// ---------------------------------------------------------------------------
// Pure TypeScript — no PixiJS dependencies.  Rendering is handled separately.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Behaviour archetypes that map to the `behavior` field in enemies.json.
 * Each archetype drives the decision tree in a different way.
 */
export enum BehaviorType {
  PATROL_SLOW = 'patrol-slow',
  FLY_SWOOP = 'fly-swoop',
  CHASE_AGGRESSIVE = 'chase-aggressive',
  MELEE_AGGRESSIVE = 'melee-aggressive',
  RANGED_SUPPORT = 'ranged-support',
  AMBUSH_CEILING = 'ambush-ceiling',
  STATIONARY_GUARD = 'stationary-guard',
  RANGED_DODGE = 'ranged-dodge',
  MELEE_TACTICAL = 'melee-tactical',
  TANK_AGGRESSIVE = 'tank-aggressive',
  BERSERK = 'berserk',
  DESPERATE = 'desperate',
  BALANCED_CASTER = 'balanced-caster',
  AGGRESSIVE_CASTER = 'aggressive-caster',
  DESPERATE_CASTER = 'desperate-caster',
}

/** Finite-state-machine states for an enemy. */
export enum AIState {
  IDLE = 'IDLE',
  PATROL = 'PATROL',
  ALERT = 'ALERT',
  CHASE = 'CHASE',
  ATTACK = 'ATTACK',
  RETREAT = 'RETREAT',
  DEAD = 'DEAD',
}

/** Actions the AI can decide to take. */
export enum AIActionType {
  NONE = 'NONE',
  MOVE = 'MOVE',
  ATTACK_MELEE = 'ATTACK_MELEE',
  ATTACK_RANGED = 'ATTACK_RANGED',
  USE_ABILITY = 'USE_ABILITY',
  HEAL_ALLY = 'HEAL_ALLY',
  DODGE = 'DODGE',
  FLEE = 'FLEE',
  SUMMON = 'SUMMON',
  AMBUSH = 'AMBUSH',
  SWOOP = 'SWOOP',
  BURROW = 'BURROW',
  TAUNT = 'TAUNT',
  BUFF_ALLY = 'BUFF_ALLY',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** 2D position for all spatial calculations. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Minimal snapshot of a combatant's state consumed by the AI. */
export interface AICombatantState {
  id: string;
  position: Vec2;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  alive: boolean;
  /** Whether the combatant is currently stunned. */
  stunned: boolean;
  /** IDs of abilities currently on cooldown. */
  cooldowns: string[];
  /** Available abilities from enemies.json. */
  abilities: string[];
  /** Behavior archetype string from enemies.json. */
  behavior: string;
  /** Team identifier. */
  team: string;
  /** Facing direction. */
  facingRight: boolean;
}

/** The action chosen by the AI this frame. */
export interface AIAction {
  type: AIActionType;
  targetId: string | null;
  targetPosition: Vec2 | null;
  abilityId: string | null;
  /** Normalised movement direction. */
  moveDirection: Vec2;
}

/** Detection / aggro configuration per behavior type. */
interface AggroConfig {
  /** Radius in pixels within which the enemy detects the player. */
  aggroRange: number;
  /** Radius at which the enemy de-aggros and returns to patrol. */
  leashRange: number;
  /** Preferred engagement distance (ranged types stay at this distance). */
  preferredRange: number;
  /** Melee attack reach in pixels. */
  meleeRange: number;
}

// ---------------------------------------------------------------------------
// Aggro configurations by behavior archetype
// ---------------------------------------------------------------------------

const AGGRO_CONFIGS: Record<BehaviorType, AggroConfig> = {
  [BehaviorType.PATROL_SLOW]:       { aggroRange: 80,  leashRange: 200,  preferredRange: 0,   meleeRange: 20 },
  [BehaviorType.FLY_SWOOP]:         { aggroRange: 160, leashRange: 300,  preferredRange: 120, meleeRange: 24 },
  [BehaviorType.CHASE_AGGRESSIVE]:  { aggroRange: 140, leashRange: 400,  preferredRange: 0,   meleeRange: 24 },
  [BehaviorType.MELEE_AGGRESSIVE]:  { aggroRange: 120, leashRange: 300,  preferredRange: 0,   meleeRange: 28 },
  [BehaviorType.RANGED_SUPPORT]:    { aggroRange: 180, leashRange: 350,  preferredRange: 150, meleeRange: 20 },
  [BehaviorType.AMBUSH_CEILING]:    { aggroRange: 60,  leashRange: 120,  preferredRange: 0,   meleeRange: 24 },
  [BehaviorType.STATIONARY_GUARD]:  { aggroRange: 100, leashRange: 100,  preferredRange: 0,   meleeRange: 32 },
  [BehaviorType.RANGED_DODGE]:      { aggroRange: 200, leashRange: 350,  preferredRange: 160, meleeRange: 20 },
  [BehaviorType.MELEE_TACTICAL]:    { aggroRange: 130, leashRange: 300,  preferredRange: 40,  meleeRange: 28 },
  [BehaviorType.TANK_AGGRESSIVE]:   { aggroRange: 120, leashRange: 300,  preferredRange: 0,   meleeRange: 32 },
  [BehaviorType.BERSERK]:           { aggroRange: 180, leashRange: 500,  preferredRange: 0,   meleeRange: 32 },
  [BehaviorType.DESPERATE]:         { aggroRange: 200, leashRange: 600,  preferredRange: 0,   meleeRange: 32 },
  [BehaviorType.BALANCED_CASTER]:   { aggroRange: 180, leashRange: 350,  preferredRange: 140, meleeRange: 24 },
  [BehaviorType.AGGRESSIVE_CASTER]: { aggroRange: 200, leashRange: 400,  preferredRange: 120, meleeRange: 24 },
  [BehaviorType.DESPERATE_CASTER]:  { aggroRange: 250, leashRange: 600,  preferredRange: 100, meleeRange: 28 },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Seconds the enemy stays alert before returning to patrol. */
const ALERT_DURATION = 1.5;
/** Minimum seconds between swoop attacks (fly-swoop). */
const SWOOP_COOLDOWN = 3.0;
/** HP fraction below which a retreating enemy will try to flee. */
const FLEE_HP_THRESHOLD = 0.2;
/** Seconds between patrol direction changes. */
const PATROL_DIRECTION_CHANGE = 3.0;
/** Distance in pixels to dodge sideways. Exported for external systems. */
export const DODGE_DISTANCE = 60;

// ---------------------------------------------------------------------------
// EnemyAI
// ---------------------------------------------------------------------------

/**
 * AI controller for a single enemy combatant.
 *
 * Uses a finite state machine (IDLE → PATROL → ALERT → CHASE → ATTACK →
 * RETREAT → DEAD) to decide what action to take each frame.  The specific
 * logic within each state is driven by the enemy's {@link BehaviorType}.
 *
 * Pack behaviour is implemented at a higher level by sharing target info
 * across EnemyAI instances of the same pack.
 */
export class EnemyAI {
  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  protected _state: AIState = AIState.IDLE;
  protected _behaviorType: BehaviorType;
  protected _aggroConfig: AggroConfig;
  protected _targetId: string | null = null;
  protected _alertTimer: number = 0;
  protected _patrolTimer: number = 0;
  protected _patrolDirection: Vec2 = { x: 1, y: 0 };
  protected _swoopCooldown: number = 0;
  protected _ambushTriggered: boolean = false;
  /** The spawn / home position for leash calculations. */
  protected _homePosition: Vec2;
  /** Internally accumulated action to be read by the game. */
  protected _currentAction: AIAction;

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  constructor(behaviorType: BehaviorType | string, homePosition: Vec2) {
    this._behaviorType = (Object.values(BehaviorType).includes(behaviorType as BehaviorType)
      ? behaviorType
      : BehaviorType.PATROL_SLOW) as BehaviorType;

    this._aggroConfig = { ...AGGRO_CONFIGS[this._behaviorType] };
    this._homePosition = { ...homePosition };
    this._currentAction = this.noAction();
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  public get state(): AIState {
    return this._state;
  }

  public get behaviorType(): BehaviorType {
    return this._behaviorType;
  }

  public get targetId(): string | null {
    return this._targetId;
  }

  public get currentAction(): AIAction {
    return this._currentAction;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Externally override the current target. */
  public setTarget(target: string | null): void {
    this._targetId = target;
  }

  /** Set the AI state directly (e.g. when killed). */
  public setState(state: AIState): void {
    this._state = state;
  }

  /**
   * Main per-frame update.
   *
   * @param dt          Delta time in seconds.
   * @param selfState   The enemy's own combatant state snapshot.
   * @param playerPos   Position of the player (primary target).
   * @param allies      Snapshots of allied combatants (same team).
   * @param enemies     Snapshots of hostile combatants (player party).
   */
  public update(
    dt: number,
    selfState: AICombatantState,
    playerPos: Vec2,
    allies: AICombatantState[],
    enemies: AICombatantState[],
  ): AIAction {
    // Dead check
    if (!selfState.alive) {
      this._state = AIState.DEAD;
      this._currentAction = this.noAction();
      return this._currentAction;
    }

    // Stunned — skip decision making
    if (selfState.stunned) {
      this._currentAction = this.noAction();
      return this._currentAction;
    }

    // Tick timers
    this._swoopCooldown = Math.max(0, this._swoopCooldown - dt);
    this._patrolTimer += dt;

    // Distance to player
    const distToPlayer = this.distance(selfState.position, playerPos);

    // FSM transitions based on behavior type
    switch (this._state) {
      case AIState.IDLE:
        this.handleIdle(dt, selfState, playerPos, distToPlayer);
        break;
      case AIState.PATROL:
        this.handlePatrol(dt, selfState, playerPos, distToPlayer);
        break;
      case AIState.ALERT:
        this.handleAlert(dt, selfState, playerPos, distToPlayer);
        break;
      case AIState.CHASE:
        this.handleChase(dt, selfState, playerPos, distToPlayer, enemies);
        break;
      case AIState.ATTACK:
        this.handleAttack(dt, selfState, playerPos, distToPlayer, allies, enemies);
        break;
      case AIState.RETREAT:
        this.handleRetreat(dt, selfState, playerPos, distToPlayer);
        break;
      case AIState.DEAD:
        this._currentAction = this.noAction();
        break;
    }

    return this._currentAction;
  }

  /**
   * Choose the next action to execute.  Called by external systems after
   * the action timer fills.  Returns the best available action based on
   * the current AI state, behaviour type, and cooldowns.
   */
  public getNextAction(): AIAction {
    return this._currentAction;
  }

  // -----------------------------------------------------------------------
  // FSM handlers
  // -----------------------------------------------------------------------

  private handleIdle(
    _dt: number,
    _selfState: AICombatantState,
    playerPos: Vec2,
    distToPlayer: number,
  ): void {
    // Transition to patrol after a brief pause
    if (this._behaviorType === BehaviorType.STATIONARY_GUARD) {
      // Guards stay idle until player enters range
      if (distToPlayer <= this._aggroConfig.aggroRange) {
        this._targetId = 'player';
        this._state = AIState.ALERT;
        this._alertTimer = 0;
      }
      this._currentAction = this.noAction();
      return;
    }

    if (this._behaviorType === BehaviorType.AMBUSH_CEILING && !this._ambushTriggered) {
      // Ambush enemies stay hidden until player passes below
      if (distToPlayer <= this._aggroConfig.aggroRange) {
        this._ambushTriggered = true;
        this._targetId = 'player';
        this._state = AIState.ATTACK;
        this._currentAction = {
          type: AIActionType.AMBUSH,
          targetId: 'player',
          targetPosition: playerPos,
          abilityId: null,
          moveDirection: { x: 0, y: 1 }, // drop down
        };
        return;
      }
      this._currentAction = this.noAction();
      return;
    }

    // Default: start patrolling
    this._state = AIState.PATROL;
    this._patrolTimer = 0;
    this.randomizePatrolDirection();
    this._currentAction = this.noAction();
  }

  private handlePatrol(
    _dt: number,
    _selfState: AICombatantState,
    _playerPos: Vec2,
    distToPlayer: number,
  ): void {
    // Check aggro
    if (distToPlayer <= this._aggroConfig.aggroRange) {
      this._targetId = 'player';
      this._state = AIState.ALERT;
      this._alertTimer = 0;
      return;
    }

    // Change direction periodically
    if (this._patrolTimer >= PATROL_DIRECTION_CHANGE) {
      this._patrolTimer = 0;
      this.randomizePatrolDirection();
    }

    // Move in patrol direction
    const speed = this._behaviorType === BehaviorType.PATROL_SLOW ? 0.3 : 0.5;
    this._currentAction = {
      type: AIActionType.MOVE,
      targetId: null,
      targetPosition: null,
      abilityId: null,
      moveDirection: {
        x: this._patrolDirection.x * speed,
        y: this._patrolDirection.y * speed,
      },
    };
  }

  private handleAlert(
    dt: number,
    _selfState: AICombatantState,
    playerPos: Vec2,
    distToPlayer: number,
  ): void {
    this._alertTimer += dt;

    // Face the player
    this._currentAction = {
      type: AIActionType.NONE,
      targetId: this._targetId,
      targetPosition: playerPos,
      abilityId: null,
      moveDirection: { x: 0, y: 0 },
    };

    // After alert period, transition to chase or attack based on distance
    if (this._alertTimer >= ALERT_DURATION) {
      if (distToPlayer <= this._aggroConfig.meleeRange) {
        this._state = AIState.ATTACK;
      } else {
        this._state = AIState.CHASE;
      }
    }

    // If player leaves aggro range during alert, go back to patrol
    if (distToPlayer > this._aggroConfig.leashRange) {
      this._state = AIState.PATROL;
      this._targetId = null;
    }
  }

  protected handleChase(
    _dt: number,
    selfState: AICombatantState,
    playerPos: Vec2,
    distToPlayer: number,
    _enemies: AICombatantState[],
  ): void {
    // Leash check
    const distToHome = this.distance(selfState.position, this._homePosition);
    if (distToHome > this._aggroConfig.leashRange) {
      this._state = AIState.RETREAT;
      this._currentAction = this.noAction();
      return;
    }

    // Behavior-specific chase
    switch (this._behaviorType) {
      case BehaviorType.RANGED_SUPPORT:
      case BehaviorType.RANGED_DODGE:
      case BehaviorType.BALANCED_CASTER:
      case BehaviorType.AGGRESSIVE_CASTER:
      case BehaviorType.DESPERATE_CASTER:
        // Ranged types try to keep distance
        if (distToPlayer < this._aggroConfig.preferredRange * 0.6) {
          // Too close — back away
          this._currentAction = this.moveAwayFrom(selfState.position, playerPos);
        } else if (distToPlayer <= this._aggroConfig.preferredRange) {
          // In range — attack
          this._state = AIState.ATTACK;
        } else {
          // Too far — approach
          this._currentAction = this.moveToward(selfState.position, playerPos);
        }
        break;

      case BehaviorType.FLY_SWOOP:
        // Fly overhead, swoop when ready
        if (this._swoopCooldown <= 0 && distToPlayer < this._aggroConfig.aggroRange) {
          this._state = AIState.ATTACK;
        } else {
          // Circle above
          this._currentAction = this.circleTarget(selfState.position, playerPos);
        }
        break;

      case BehaviorType.MELEE_TACTICAL:
        // Flank: approach from the side
        this._currentAction = this.flankTarget(selfState.position, playerPos);
        if (distToPlayer <= this._aggroConfig.meleeRange * 1.5) {
          this._state = AIState.ATTACK;
        }
        break;

      default:
        // Aggressive types: beeline
        this._currentAction = this.moveToward(selfState.position, playerPos);
        if (distToPlayer <= this._aggroConfig.meleeRange) {
          this._state = AIState.ATTACK;
        }
        break;
    }
  }

  protected handleAttack(
    _dt: number,
    selfState: AICombatantState,
    playerPos: Vec2,
    distToPlayer: number,
    allies: AICombatantState[],
    enemies: AICombatantState[],
  ): void {
    // Low HP check — some behaviors retreat
    const hpFraction = selfState.hp / selfState.maxHp;
    if (hpFraction < FLEE_HP_THRESHOLD && this.shouldFlee()) {
      this._state = AIState.RETREAT;
      this._currentAction = this.noAction();
      return;
    }

    // Out of range — chase again
    const effectiveRange = this.isRanged()
      ? this._aggroConfig.preferredRange * 1.2
      : this._aggroConfig.meleeRange * 1.5;
    if (distToPlayer > effectiveRange) {
      this._state = AIState.CHASE;
      return;
    }

    // Behavior-specific attack
    switch (this._behaviorType) {
      case BehaviorType.PATROL_SLOW:
      case BehaviorType.CHASE_AGGRESSIVE:
      case BehaviorType.MELEE_AGGRESSIVE:
        this._currentAction = {
          type: AIActionType.ATTACK_MELEE,
          targetId: this._targetId,
          targetPosition: playerPos,
          abilityId: this.pickAbility(selfState),
          moveDirection: this.directionToward(selfState.position, playerPos),
        };
        break;

      case BehaviorType.FLY_SWOOP:
        this._swoopCooldown = SWOOP_COOLDOWN;
        this._currentAction = {
          type: AIActionType.SWOOP,
          targetId: this._targetId,
          targetPosition: playerPos,
          abilityId: this.pickAbility(selfState),
          moveDirection: this.directionToward(selfState.position, playerPos),
        };
        // After swoop, go back to chase (circling)
        this._state = AIState.CHASE;
        break;

      case BehaviorType.RANGED_SUPPORT:
        this._currentAction = this.handleSupportAttack(selfState, playerPos, allies, enemies);
        break;

      case BehaviorType.AMBUSH_CEILING:
        // After initial ambush drop, switch to melee
        this._currentAction = {
          type: AIActionType.ATTACK_MELEE,
          targetId: this._targetId,
          targetPosition: playerPos,
          abilityId: this.pickAbility(selfState),
          moveDirection: this.directionToward(selfState.position, playerPos),
        };
        break;

      case BehaviorType.STATIONARY_GUARD:
        // Attack but do not move
        this._currentAction = {
          type: distToPlayer <= this._aggroConfig.meleeRange
            ? AIActionType.ATTACK_MELEE
            : AIActionType.ATTACK_RANGED,
          targetId: this._targetId,
          targetPosition: playerPos,
          abilityId: this.pickAbility(selfState),
          moveDirection: { x: 0, y: 0 },
        };
        break;

      case BehaviorType.RANGED_DODGE:
        // Fire projectile and dodge if player is close
        if (distToPlayer < this._aggroConfig.meleeRange * 2) {
          this._currentAction = {
            type: AIActionType.DODGE,
            targetId: this._targetId,
            targetPosition: playerPos,
            abilityId: null,
            moveDirection: this.dodgeDirection(selfState.position, playerPos),
          };
          this._state = AIState.CHASE; // reposition
        } else {
          this._currentAction = {
            type: AIActionType.ATTACK_RANGED,
            targetId: this._targetId,
            targetPosition: playerPos,
            abilityId: this.pickAbility(selfState),
            moveDirection: { x: 0, y: 0 },
          };
        }
        break;

      case BehaviorType.MELEE_TACTICAL:
        this._currentAction = {
          type: AIActionType.ATTACK_MELEE,
          targetId: this._targetId,
          targetPosition: playerPos,
          abilityId: this.pickAbility(selfState),
          moveDirection: this.directionToward(selfState.position, playerPos),
        };
        break;

      case BehaviorType.TANK_AGGRESSIVE:
      case BehaviorType.BERSERK:
      case BehaviorType.DESPERATE:
        this._currentAction = {
          type: AIActionType.ATTACK_MELEE,
          targetId: this._targetId,
          targetPosition: playerPos,
          abilityId: this.pickAbility(selfState),
          moveDirection: this.directionToward(selfState.position, playerPos),
        };
        break;

      case BehaviorType.BALANCED_CASTER:
      case BehaviorType.AGGRESSIVE_CASTER:
      case BehaviorType.DESPERATE_CASTER:
        this._currentAction = {
          type: AIActionType.ATTACK_RANGED,
          targetId: this._targetId,
          targetPosition: playerPos,
          abilityId: this.pickAbility(selfState),
          moveDirection: { x: 0, y: 0 },
        };
        break;
    }
  }

  private handleRetreat(
    _dt: number,
    selfState: AICombatantState,
    _playerPos: Vec2,
    distToPlayer: number,
  ): void {
    // Move back toward home
    const distToHome = this.distance(selfState.position, this._homePosition);

    if (distToHome < 16) {
      // Reached home — go back to idle
      this._state = AIState.IDLE;
      this._targetId = null;
      this._currentAction = this.noAction();
      return;
    }

    this._currentAction = this.moveToward(selfState.position, this._homePosition);

    // If player chases closely, re-engage
    if (distToPlayer < this._aggroConfig.meleeRange * 2) {
      this._state = AIState.CHASE;
    }
  }

  // -----------------------------------------------------------------------
  // Behavior helpers
  // -----------------------------------------------------------------------

  private handleSupportAttack(
    selfState: AICombatantState,
    playerPos: Vec2,
    allies: AICombatantState[],
    _enemies: AICombatantState[],
  ): AIAction {
    // Check if any ally needs healing
    const woundedAlly = allies.find(
      (a) => a.alive && a.hp / a.maxHp < 0.5 && a.id !== selfState.id,
    );

    if (woundedAlly && selfState.abilities.includes('heal-ally') && !selfState.cooldowns.includes('heal-ally')) {
      return {
        type: AIActionType.HEAL_ALLY,
        targetId: woundedAlly.id,
        targetPosition: woundedAlly.position,
        abilityId: 'heal-ally',
        moveDirection: { x: 0, y: 0 },
      };
    }

    // Check if we should buff allies
    const unbuffedAlly = allies.find(
      (a) => a.alive && a.id !== selfState.id,
    );
    if (unbuffedAlly && selfState.abilities.includes('war-drum') && !selfState.cooldowns.includes('war-drum')) {
      return {
        type: AIActionType.BUFF_ALLY,
        targetId: unbuffedAlly.id,
        targetPosition: unbuffedAlly.position,
        abilityId: 'war-drum',
        moveDirection: { x: 0, y: 0 },
      };
    }

    // Default: ranged attack
    return {
      type: AIActionType.ATTACK_RANGED,
      targetId: this._targetId,
      targetPosition: playerPos,
      abilityId: this.pickAbility(selfState),
      moveDirection: { x: 0, y: 0 },
    };
  }

  /** Pick the best available ability not on cooldown. */
  protected pickAbility(selfState: AICombatantState): string | null {
    const available = selfState.abilities.filter(
      (a) => !selfState.cooldowns.includes(a),
    );
    if (available.length === 0) return null;
    // Simple priority: pick a random available ability
    return available[Math.floor(Math.random() * available.length)];
  }

  /** Whether this behavior type uses ranged attacks. */
  protected isRanged(): boolean {
    switch (this._behaviorType) {
      case BehaviorType.RANGED_SUPPORT:
      case BehaviorType.RANGED_DODGE:
      case BehaviorType.BALANCED_CASTER:
      case BehaviorType.AGGRESSIVE_CASTER:
      case BehaviorType.DESPERATE_CASTER:
        return true;
      default:
        return false;
    }
  }

  /** Whether this behavior type should flee at low HP. */
  private shouldFlee(): boolean {
    switch (this._behaviorType) {
      case BehaviorType.MELEE_TACTICAL:
      case BehaviorType.RANGED_DODGE:
      case BehaviorType.PATROL_SLOW:
        return true;
      case BehaviorType.BERSERK:
      case BehaviorType.DESPERATE:
      case BehaviorType.CHASE_AGGRESSIVE:
      case BehaviorType.TANK_AGGRESSIVE:
        return false; // fight to the death
      default:
        return false;
    }
  }

  // -----------------------------------------------------------------------
  // Movement helpers
  // -----------------------------------------------------------------------

  protected moveToward(from: Vec2, to: Vec2): AIAction {
    return {
      type: AIActionType.MOVE,
      targetId: this._targetId,
      targetPosition: to,
      abilityId: null,
      moveDirection: this.directionToward(from, to),
    };
  }

  private moveAwayFrom(from: Vec2, target: Vec2): AIAction {
    const dir = this.directionToward(from, target);
    return {
      type: AIActionType.MOVE,
      targetId: this._targetId,
      targetPosition: null,
      abilityId: null,
      moveDirection: { x: -dir.x, y: -dir.y },
    };
  }

  /** Circle around the target at roughly the preferred range. */
  private circleTarget(from: Vec2, target: Vec2): AIAction {
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    // Perpendicular + slight inward
    const perpX = -dy / dist;
    const perpY = dx / dist;
    const inwardFactor = dist > this._aggroConfig.preferredRange ? 0.3 : -0.3;
    return {
      type: AIActionType.MOVE,
      targetId: this._targetId,
      targetPosition: target,
      abilityId: null,
      moveDirection: {
        x: perpX + (dx / dist) * inwardFactor,
        y: perpY + (dy / dist) * inwardFactor,
      },
    };
  }

  /** Approach from a flanking angle. */
  private flankTarget(from: Vec2, target: Vec2): AIAction {
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    // Offset perpendicular by 60 degrees
    const angle = Math.atan2(dy, dx) + Math.PI / 3;
    return {
      type: AIActionType.MOVE,
      targetId: this._targetId,
      targetPosition: target,
      abilityId: null,
      moveDirection: {
        x: Math.cos(angle),
        y: Math.sin(angle),
      },
    };
  }

  /** Quick dodge perpendicular to the threat direction. */
  private dodgeDirection(from: Vec2, threat: Vec2): Vec2 {
    const dx = threat.x - from.x;
    const dy = threat.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    // Perpendicular (choose randomly left or right)
    const sign = Math.random() < 0.5 ? 1 : -1;
    return {
      x: (-dy / dist) * sign,
      y: (dx / dist) * sign,
    };
  }

  protected directionToward(from: Vec2, to: Vec2): Vec2 {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / dist, y: dy / dist };
  }

  protected distance(a: Vec2, b: Vec2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private randomizePatrolDirection(): void {
    const angle = Math.random() * Math.PI * 2;
    this._patrolDirection = { x: Math.cos(angle), y: Math.sin(angle) };
  }

  protected noAction(): AIAction {
    return {
      type: AIActionType.NONE,
      targetId: null,
      targetPosition: null,
      abilityId: null,
      moveDirection: { x: 0, y: 0 },
    };
  }
}
