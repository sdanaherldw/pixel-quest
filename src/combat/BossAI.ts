// ---------------------------------------------------------------------------
// BossAI.ts — Multi-phase boss AI with phase transitions and enrage
// ---------------------------------------------------------------------------
// Pure TypeScript — no PixiJS dependencies.  Rendering is handled separately.
// Extends EnemyAI for base FSM / movement; adds phase management on top.
// ---------------------------------------------------------------------------

import {
  EnemyAI,
  BehaviorType,
  AIState,
  AIActionType,
  type Vec2,
  type AICombatantState,
  type AIAction,
} from './EnemyAI';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Definition of a single boss phase (mirrors bosses[].phases in enemies.json). */
export interface BossPhase {
  /** Display name for the phase (e.g. "Stone Guardian"). */
  name: string;
  /** HP fraction at which this phase activates (1.0 = full HP). */
  hpThreshold: number;
  /** Abilities available during this phase. */
  abilities: string[];
  /** Behavior archetype string during this phase. */
  behavior: string;
  /** Multiplicative stat boosts applied when entering this phase. */
  statBoost: Partial<Record<string, number>>;
  /** Visual change identifier for the rendering layer. */
  visualChange: string | null;
  /** Seconds before the boss enrages in this phase.  0 = no enrage. */
  enrageTimer: number;
}

/** Dialogue triggers for boss encounters. */
export interface BossDialogue {
  intro?: string;
  phase2?: string;
  phase3?: string;
  defeat?: string;
  [key: string]: string | undefined;
}

/** Configuration used to construct a BossAI instance. */
export interface BossConfig {
  /** Boss enemy ID from enemies.json. */
  bossId: string;
  /** Boss display name. */
  name: string;
  /** Ordered list of phases (index 0 = initial phase). */
  phases: BossPhase[];
  /** Optional dialogue strings. */
  dialogue: BossDialogue;
  /** Boss home position (for leash calculations). */
  homePosition: Vec2;
  /** Base stats before any phase boosts. */
  baseStats: {
    hp: number;
    maxHp: number;
    atk: number;
    def: number;
    spd: number;
    int: number;
  };
}

/** Cooldown entry for a single ability. */
interface AbilityCooldownEntry {
  ability: string;
  remaining: number;
  cooldown: number;
}

/** Result from a phase transition check. */
export interface PhaseTransitionResult {
  transitioned: boolean;
  fromPhase: number;
  toPhase: number;
  phaseName: string;
  dialogue: string | null;
  visualChange: string | null;
}

/** Enrage status. */
export interface EnrageStatus {
  enraged: boolean;
  /** Seconds remaining before enrage (0 if already enraged or no timer). */
  remaining: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default ability cooldown in seconds when not specified. */
const DEFAULT_ABILITY_COOLDOWN = 4.0;

/** Stat multiplier applied when the boss enrages. */
const ENRAGE_STAT_MULTIPLIER = 1.5;

/** Map of ability name → default cooldown. */
const ABILITY_COOLDOWNS: Record<string, number> = {
  // Spider Queen
  'web-spray': 5.0,
  'poison-bite': 3.0,
  'summon-spiderlings': 12.0,
  'web-cocoon': 8.0,
  'acid-spit': 4.0,
  'burrow': 10.0,

  // Corrupted Sentinel
  'ground-slam': 5.0,
  'shield-charge': 7.0,
  'stone-throw': 4.0,
  'whirlwind': 6.0,
  'leap-slam': 8.0,
  'summon-gargoyles': 15.0,
  'earthquake': 10.0,
  'self-repair': 20.0,
  'death-grip': 6.0,

  // Forest Guardian
  'vine-whip': 3.0,
  'thorn-barrage': 5.0,
  'root-prison': 8.0,
  'nature-heal': 12.0,
  'shadow-vines': 4.0,
  'corruption-blast': 6.0,
  'summon-treants': 15.0,
  'absorb-life': 8.0,
  'mega-bloom': 10.0,
  'forest-rage': 12.0,
  'death-spores': 7.0,
  'last-stand-heal': 25.0,
};

// ---------------------------------------------------------------------------
// BossAI
// ---------------------------------------------------------------------------

/**
 * Multi-phase boss AI that extends {@link EnemyAI}.
 *
 * Key additions over the base AI:
 * - Phase management based on HP thresholds (from enemies.json boss data).
 * - Per-phase ability sets and behavior switching.
 * - Enrage timer per phase — massive stat boost if phase lasts too long.
 * - Dialogue triggers on phase transitions.
 * - Independent ability cooldowns with intelligent selection.
 * - Target priority: focus lowest-HP enemy if aggressive, heal allies if
 *   support type.
 */
export class BossAI extends EnemyAI {
  // -----------------------------------------------------------------------
  // Boss-specific state
  // -----------------------------------------------------------------------

  private readonly _bossId: string;
  private readonly _bossName: string;
  private readonly _phases: BossPhase[];
  private readonly _dialogue: BossDialogue;
  public readonly baseStats: BossConfig['baseStats'];

  private _currentPhaseIndex: number = 0;
  private _phaseTimer: number = 0;
  private _enraged: boolean = false;
  private _abilityCooldowns: AbilityCooldownEntry[] = [];
  /** Queue of dialogue strings to be consumed by the presentation layer. */
  private _pendingDialogue: string[] = [];
  /** Track applied stat boosts so they can be reversed on phase change. */
  public appliedStatBoosts: Partial<Record<string, number>> = {};

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  constructor(config: BossConfig) {
    // Initialize base EnemyAI with the first phase's behavior
    const initialBehavior =
      config.phases.length > 0 ? config.phases[0].behavior : 'melee-aggressive';
    super(initialBehavior as BehaviorType, config.homePosition);

    this._bossId = config.bossId;
    this._bossName = config.name;
    this._phases = config.phases;
    this._dialogue = config.dialogue;
    this.baseStats = { ...config.baseStats };

    // Queue intro dialogue
    if (this._dialogue.intro) {
      this._pendingDialogue.push(this._dialogue.intro);
    }

    // Initialize ability cooldowns for the first phase
    this.initializeAbilityCooldowns();
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  public get bossId(): string {
    return this._bossId;
  }

  public get bossName(): string {
    return this._bossName;
  }

  public get currentPhaseIndex(): number {
    return this._currentPhaseIndex;
  }

  public get phaseTimer(): number {
    return this._phaseTimer;
  }

  public get enraged(): boolean {
    return this._enraged;
  }

  /** Consume all pending dialogue strings (drains the queue). */
  public consumeDialogue(): string[] {
    const dialogue = [...this._pendingDialogue];
    this._pendingDialogue = [];
    return dialogue;
  }

  /** Peek at pending dialogue without consuming. */
  public get pendingDialogue(): readonly string[] {
    return this._pendingDialogue;
  }

  // -----------------------------------------------------------------------
  // Phase management
  // -----------------------------------------------------------------------

  /** Get the current boss phase definition. */
  public getCurrentPhase(): BossPhase {
    return this._phases[this._currentPhaseIndex];
  }

  /** Get abilities available in the current phase that are off cooldown. */
  public getAvailableAbilities(): string[] {
    const phase = this.getCurrentPhase();
    return phase.abilities.filter((a) => this.isAbilityReady(a));
  }

  /**
   * Check if a phase transition should occur based on current and max HP.
   *
   * @returns A result describing whether a transition happened.
   */
  public checkPhaseTransition(
    currentHP: number,
    maxHP: number,
  ): PhaseTransitionResult {
    const hpFraction = currentHP / maxHP;
    const fromPhase = this._currentPhaseIndex;

    // Search for the highest phase index whose threshold we've passed
    let targetPhase = this._currentPhaseIndex;
    for (let i = this._phases.length - 1; i > this._currentPhaseIndex; i--) {
      if (hpFraction <= this._phases[i].hpThreshold) {
        targetPhase = i;
        break;
      }
    }

    if (targetPhase === this._currentPhaseIndex) {
      return {
        transitioned: false,
        fromPhase,
        toPhase: fromPhase,
        phaseName: this.getCurrentPhase().name,
        dialogue: null,
        visualChange: null,
      };
    }

    return this.transitionToPhase(targetPhase);
  }

  /**
   * Force a transition to a specific phase index.
   */
  public transitionToPhase(phaseIndex: number): PhaseTransitionResult {
    if (phaseIndex < 0 || phaseIndex >= this._phases.length) {
      return {
        transitioned: false,
        fromPhase: this._currentPhaseIndex,
        toPhase: this._currentPhaseIndex,
        phaseName: this.getCurrentPhase().name,
        dialogue: null,
        visualChange: null,
      };
    }

    const fromPhase = this._currentPhaseIndex;
    this._currentPhaseIndex = phaseIndex;
    this._phaseTimer = 0;
    this._enraged = false;

    const phase = this.getCurrentPhase();

    // Update behavior type
    this._behaviorType = (Object.values(BehaviorType).includes(phase.behavior as BehaviorType)
      ? phase.behavior
      : BehaviorType.MELEE_AGGRESSIVE) as BehaviorType;

    // Reinitialize ability cooldowns for the new phase
    this.initializeAbilityCooldowns();

    // Determine dialogue
    let dialogue: string | null = null;
    const dialogueKey = `phase${phaseIndex + 1}`;
    if (this._dialogue[dialogueKey]) {
      dialogue = this._dialogue[dialogueKey]!;
      this._pendingDialogue.push(dialogue);
    }

    return {
      transitioned: true,
      fromPhase,
      toPhase: phaseIndex,
      phaseName: phase.name,
      dialogue,
      visualChange: phase.visualChange,
    };
  }

  /** Get the enrage status for the current phase. */
  public getEnrageStatus(): EnrageStatus {
    const phase = this.getCurrentPhase();
    if (phase.enrageTimer <= 0) {
      return { enraged: false, remaining: 0 };
    }
    if (this._enraged) {
      return { enraged: true, remaining: 0 };
    }
    return {
      enraged: false,
      remaining: Math.max(0, phase.enrageTimer - this._phaseTimer),
    };
  }

  /**
   * Get the stat multipliers that should be applied for the current phase.
   * This includes both the phase's statBoost and any enrage multiplier.
   */
  public getStatMultipliers(): Record<string, number> {
    const phase = this.getCurrentPhase();
    const multipliers: Record<string, number> = {
      hp: 1,
      atk: 1,
      def: 1,
      spd: 1,
      int: 1,
    };

    // Phase stat boosts
    if (phase.statBoost) {
      for (const [stat, mult] of Object.entries(phase.statBoost)) {
        if (stat in multipliers && typeof mult === 'number') {
          multipliers[stat] = mult;
        }
      }
    }

    // Enrage amplifier
    if (this._enraged) {
      multipliers.atk *= ENRAGE_STAT_MULTIPLIER;
      multipliers.spd *= ENRAGE_STAT_MULTIPLIER;
    }

    return multipliers;
  }

  // -----------------------------------------------------------------------
  // Ability cooldowns
  // -----------------------------------------------------------------------

  /** Check if a specific ability is off cooldown. */
  public isAbilityReady(ability: string): boolean {
    const entry = this._abilityCooldowns.find((e) => e.ability === ability);
    return entry ? entry.remaining <= 0 : true;
  }

  /** Put an ability on cooldown. */
  public triggerAbilityCooldown(ability: string): void {
    const entry = this._abilityCooldowns.find((e) => e.ability === ability);
    if (entry) {
      entry.remaining = entry.cooldown;
    }
  }

  // -----------------------------------------------------------------------
  // Override: update
  // -----------------------------------------------------------------------

  /**
   * Boss-specific update that wraps the base EnemyAI update with phase
   * management, enrage checks, and smarter target selection.
   */
  public override update(
    dt: number,
    selfState: AICombatantState,
    playerPos: Vec2,
    allies: AICombatantState[],
    enemies: AICombatantState[],
  ): AIAction {
    if (!selfState.alive) {
      this._state = AIState.DEAD;
      // Queue defeat dialogue
      if (this._dialogue.defeat && this._pendingDialogue.indexOf(this._dialogue.defeat) === -1) {
        this._pendingDialogue.push(this._dialogue.defeat);
      }
      this._currentAction = this.noAction();
      return this._currentAction;
    }

    // Tick phase timer & enrage
    this._phaseTimer += dt;
    this.checkEnrage();

    // Tick ability cooldowns
    for (const entry of this._abilityCooldowns) {
      entry.remaining = Math.max(0, entry.remaining - dt);
    }

    // Check phase transition
    this.checkPhaseTransition(selfState.hp, selfState.maxHp);

    // Override abilities on selfState with current phase abilities
    const phasedState: AICombatantState = {
      ...selfState,
      abilities: this.getCurrentPhase().abilities,
      behavior: this.getCurrentPhase().behavior,
      cooldowns: this._abilityCooldowns
        .filter((e) => e.remaining > 0)
        .map((e) => e.ability),
    };

    // Smart target selection for bosses
    const targetPos = this.selectTargetPosition(phasedState, playerPos, enemies);
    const bestTarget = this.selectBestTarget(phasedState, enemies, allies);
    if (bestTarget) {
      this.setTarget(bestTarget.id);
    }

    // Run base AI update with the phased state
    const action = super.update(dt, phasedState, targetPos, allies, enemies);

    // Boss-specific overrides
    return this.refineBossAction(action, phasedState, allies, enemies);
  }

  // -----------------------------------------------------------------------
  // Boss-specific decision making
  // -----------------------------------------------------------------------

  /**
   * Refine the base AI action with boss-specific logic:
   * - Support bosses prioritise healing
   * - Aggressive bosses focus the lowest-HP target
   * - Trigger ability cooldowns
   */
  private refineBossAction(
    baseAction: AIAction,
    selfState: AICombatantState,
    allies: AICombatantState[],
    _enemies: AICombatantState[],
  ): AIAction {
    const phase = this.getCurrentPhase();

    // Support behavior: heal allies if any are wounded
    if (
      phase.behavior === BehaviorType.BALANCED_CASTER ||
      phase.behavior === 'balanced-caster'
    ) {
      const healAbility = phase.abilities.find(
        (a) => a.includes('heal') && this.isAbilityReady(a),
      );
      if (healAbility) {
        const woundedAlly = allies.find(
          (a) => a.alive && a.hp / a.maxHp < 0.5,
        );
        if (woundedAlly) {
          return {
            type: AIActionType.HEAL_ALLY,
            targetId: woundedAlly.id,
            targetPosition: woundedAlly.position,
            abilityId: healAbility,
            moveDirection: { x: 0, y: 0 },
          };
        }
      }
    }

    // Summon abilities: use them when available
    const summonAbility = phase.abilities.find(
      (a) => a.includes('summon') && this.isAbilityReady(a),
    );
    if (summonAbility && allies.filter((a) => a.alive).length < 4) {
      return {
        type: AIActionType.SUMMON,
        targetId: null,
        targetPosition: selfState.position,
        abilityId: summonAbility,
        moveDirection: { x: 0, y: 0 },
      };
    }

    // Self-repair when low HP
    const selfRepair = phase.abilities.find(
      (a) => (a.includes('repair') || a.includes('last-stand-heal')) && this.isAbilityReady(a),
    );
    if (selfRepair && selfState.hp / selfState.maxHp < 0.3) {
      return {
        type: AIActionType.USE_ABILITY,
        targetId: selfState.id,
        targetPosition: selfState.position,
        abilityId: selfRepair,
        moveDirection: { x: 0, y: 0 },
      };
    }

    // If the base action chose an ability, record the cooldown trigger
    if (baseAction.abilityId && this.isAbilityReady(baseAction.abilityId)) {
      this.triggerAbilityCooldown(baseAction.abilityId);
    }

    return baseAction;
  }

  /**
   * Select the best target from the enemy party.
   * - Aggressive / berserk: lowest HP target.
   * - Support: highest threat (not implemented — defaults to lowest HP).
   * - Default: nearest target.
   */
  private selectBestTarget(
    selfState: AICombatantState,
    enemies: AICombatantState[],
    _allies: AICombatantState[],
  ): AICombatantState | null {
    const alive = enemies.filter((e) => e.alive);
    if (alive.length === 0) return null;

    const behavior = this.getCurrentPhase().behavior;

    if (
      behavior === BehaviorType.BERSERK ||
      behavior === 'berserk' ||
      behavior === BehaviorType.DESPERATE ||
      behavior === 'desperate' ||
      behavior === BehaviorType.AGGRESSIVE_CASTER ||
      behavior === 'aggressive-caster' ||
      behavior === BehaviorType.DESPERATE_CASTER ||
      behavior === 'desperate-caster'
    ) {
      // Focus lowest HP
      return alive.reduce((lowest, e) =>
        e.hp < lowest.hp ? e : lowest,
      );
    }

    // Default: nearest
    return alive.reduce((nearest, e) => {
      const distE = this.distance(selfState.position, e.position);
      const distN = this.distance(selfState.position, nearest.position);
      return distE < distN ? e : nearest;
    });
  }

  /**
   * Determine the position the boss should move toward / face.
   * Uses the selected target's position, defaulting to player position.
   */
  private selectTargetPosition(
    _selfState: AICombatantState,
    playerPos: Vec2,
    enemies: AICombatantState[],
  ): Vec2 {
    if (this._targetId) {
      const target = enemies.find((e) => e.id === this._targetId);
      if (target && target.alive) return target.position;
    }
    return playerPos;
  }

  // -----------------------------------------------------------------------
  // Enrage
  // -----------------------------------------------------------------------

  private checkEnrage(): void {
    if (this._enraged) return;
    const phase = this.getCurrentPhase();
    if (phase.enrageTimer > 0 && this._phaseTimer >= phase.enrageTimer) {
      this._enraged = true;
    }
  }

  // -----------------------------------------------------------------------
  // Ability cooldown management
  // -----------------------------------------------------------------------

  private initializeAbilityCooldowns(): void {
    const phase = this.getCurrentPhase();
    this._abilityCooldowns = phase.abilities.map((ability) => ({
      ability,
      remaining: 0, // all abilities ready at phase start
      cooldown: ABILITY_COOLDOWNS[ability] ?? DEFAULT_ABILITY_COOLDOWN,
    }));
  }

  // -----------------------------------------------------------------------
  // Override: pickAbility — boss uses cooldown-aware selection
  // -----------------------------------------------------------------------

  protected override pickAbility(_selfState: AICombatantState): string | null {
    const available = this.getAvailableAbilities();
    if (available.length === 0) return null;

    // Weight higher-cooldown abilities (they tend to be stronger)
    const weighted = available.map((a) => {
      const cd = ABILITY_COOLDOWNS[a] ?? DEFAULT_ABILITY_COOLDOWN;
      return { ability: a, weight: cd };
    });

    // Weighted random selection
    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const w of weighted) {
      roll -= w.weight;
      if (roll <= 0) return w.ability;
    }

    return available[0];
  }
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Create a BossAI instance from raw enemies.json boss data.
 *
 * @param bossData  A boss entry from the `bosses` array in enemies.json.
 * @param homePos   Spawn position for the boss.
 */
export function createBossAI(
  bossData: {
    id: string;
    name: string;
    stats: { hp: number; atk: number; def: number; spd: number; int?: number };
    phases: Array<{
      name: string;
      hpThreshold: number;
      abilities: string[];
      behavior: string;
      statBoost?: Record<string, number>;
      visualChange?: string;
      enrageTimer?: number;
    }>;
    dialogue?: Record<string, string>;
  },
  homePos: Vec2,
): BossAI {
  const phases: BossPhase[] = bossData.phases.map((p) => ({
    name: p.name,
    hpThreshold: p.hpThreshold,
    abilities: [...p.abilities],
    behavior: p.behavior,
    statBoost: p.statBoost ?? {},
    visualChange: p.visualChange ?? null,
    enrageTimer: p.enrageTimer ?? 0,
  }));

  return new BossAI({
    bossId: bossData.id,
    name: bossData.name,
    phases,
    dialogue: (bossData.dialogue ?? {}) as BossDialogue,
    homePosition: homePos,
    baseStats: {
      hp: bossData.stats.hp,
      maxHp: bossData.stats.hp,
      atk: bossData.stats.atk,
      def: bossData.stats.def,
      spd: bossData.stats.spd,
      int: bossData.stats.int ?? 0,
    },
  });
}
