// ---------------------------------------------------------------------------
// CombatOrchestrator.ts — Central hub wiring all combat subsystems together
// ---------------------------------------------------------------------------
// Pure TypeScript — no PixiJS dependencies.  Rendering is handled separately.
// ---------------------------------------------------------------------------

import {
  CombatManager,
  CombatState,
  CombatEventType,
  DamageType,
  CombatantTeam,
  type Combatant,
  type CombatActionResult,
  type EnemySpawnConfig,
  type CombatEvent,
} from './CombatManager';

import {
  ElementalSystem,
  Element,
} from './ElementalSystem';

import {
  ComboSystem,
  type ComboResult,
} from './ComboSystem';

import {
  LimitBreakSystem,
  type LimitBreak,
} from './LimitBreakSystem';

import {
  StatusEffectSystem,
  StatusType,
} from './StatusEffectSystem';

import {
  EnemyAI,
} from './EnemyAI';

import {
  BossAI,
} from './BossAI';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface AbilityDef {
  id: string;
  name: string;
  mpCost: number;
  cooldown: number;
  baseDamage: number;
  damageType: DamageType;
  skillMultiplier: number;
  effects?: Array<{
    type: string;
    value: number;
    duration?: number;
  }>;
}

export interface OrchestratorConfig {
  onDamageDealt?: (result: CombatActionResult) => void;
  onComboComplete?: (result: ComboResult) => void;
  onLimitBreakReady?: (characterId: string) => void;
  onThreatChanged?: (enemyId: string, targetId: string, threat: number) => void;
}

// ---------------------------------------------------------------------------
// CombatOrchestrator
// ---------------------------------------------------------------------------

/**
 * Central combat hub that wires together CombatManager, ElementalSystem,
 * ComboSystem, LimitBreakSystem, and StatusEffectSystem into a unified
 * damage pipeline with threat/aggro management.
 */
export class CombatOrchestrator {
  // -----------------------------------------------------------------------
  // Subsystems
  // -----------------------------------------------------------------------

  public readonly combatManager: CombatManager;
  public readonly elementalSystem: ElementalSystem;
  public readonly comboSystem: ComboSystem;
  public readonly limitBreakSystem: LimitBreakSystem;
  public readonly statusEffectSystem: StatusEffectSystem;

  // -----------------------------------------------------------------------
  // Threat table: enemyId -> Map<partyMemberId, threat>
  // -----------------------------------------------------------------------

  private threatTable: Map<string, Map<string, number>> = new Map();

  // -----------------------------------------------------------------------
  // AI controllers
  // -----------------------------------------------------------------------

  private enemyAIs: Map<string, EnemyAI | BossAI> = new Map();
  private abilityDefs: Map<string, AbilityDef> = new Map();

  // -----------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------

  private config: OrchestratorConfig;

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  constructor(config: OrchestratorConfig = {}) {
    this.config = config;
    this.combatManager = new CombatManager();
    this.elementalSystem = new ElementalSystem();
    this.comboSystem = new ComboSystem();
    this.limitBreakSystem = new LimitBreakSystem();
    this.statusEffectSystem = new StatusEffectSystem();

    // Register default data
    this.comboSystem.registerClassCombos();
    this.limitBreakSystem.registerLimitBreaks();

    // Wire status effect callbacks
    this.statusEffectSystem.onDotTick = (targetId, effect, tickValue) => {
      this.combatManager.setHP(
        targetId,
        (this.combatManager.getCombatant(targetId)?.stats.hp ?? 0) - tickValue,
        effect.source,
      );
    };

    this.statusEffectSystem.onHotTick = (targetId, _effect, tickValue) => {
      const target = this.combatManager.getCombatant(targetId);
      if (target) {
        const newHp = Math.min(target.stats.maxHp, target.stats.hp + tickValue);
        this.combatManager.setHP(targetId, newHp);
      }
    };

    // Subscribe to CombatManager events
    this.subscribeToEvents();
  }

  // -----------------------------------------------------------------------
  // Event subscriptions
  // -----------------------------------------------------------------------

  private subscribeToEvents(): void {
    this.combatManager.on(CombatEventType.DAMAGE_DEALT, (event: CombatEvent) => {
      const result = event.data.result as CombatActionResult;
      if (!result) return;

      // Update limit break meters
      this.limitBreakSystem.onDamageDealt(result.attackerId, result.finalDamage);
      this.limitBreakSystem.onDamageTaken(result.targetId, result.finalDamage);

      if (result.isCritical) {
        this.limitBreakSystem.onCriticalHit(result.attackerId);
      }

      // Update threat
      const attacker = this.combatManager.getCombatant(result.attackerId);
      if (attacker && attacker.team === CombatantTeam.PARTY) {
        // Damage generates 1:1 threat against all enemies
        for (const enemy of this.combatManager.getAliveEnemies()) {
          this.addThreat(enemy.id, result.attackerId, result.finalDamage);
        }
      }

      this.config.onDamageDealt?.(result);
    });

    this.combatManager.on(CombatEventType.COMBATANT_DEFEATED, (event: CombatEvent) => {
      const combatantId = event.data.combatantId as string;
      const killerId = event.data.killerId as string;
      if (combatantId && killerId) {
        this.limitBreakSystem.onKill(killerId);
      }
      // Clear status effects on defeated combatant
      this.statusEffectSystem.clearAll(combatantId);
      // Clear element state
      this.elementalSystem.clearElement(combatantId);
      // Remove from threat table if enemy
      this.threatTable.delete(combatantId);
    });

    this.combatManager.on(CombatEventType.HEALING_APPLIED, (event: CombatEvent) => {
      const result = event.data.result as CombatActionResult;
      if (!result) return;

      this.limitBreakSystem.onHeal(result.attackerId, result.finalDamage);

      // Healing generates 0.5:1 threat split across enemies
      const healer = this.combatManager.getCombatant(result.attackerId);
      if (healer && healer.team === CombatantTeam.PARTY) {
        const enemies = this.combatManager.getAliveEnemies();
        if (enemies.length > 0) {
          const threatPerEnemy = (result.finalDamage * 0.5) / enemies.length;
          for (const enemy of enemies) {
            this.addThreat(enemy.id, result.attackerId, threatPerEnemy);
          }
        }
      }
    });

    this.combatManager.on(CombatEventType.VICTORY, () => {
      this.comboSystem.reset();
    });

    this.combatManager.on(CombatEventType.DEFEAT, () => {
      this.comboSystem.reset();
    });
  }

  // -----------------------------------------------------------------------
  // Encounter lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start a new combat encounter.
   */
  public startEncounter(
    partyMembers: Combatant[],
    enemies: EnemySpawnConfig[],
  ): void {
    // Reset subsystems
    this.comboSystem.reset();
    this.statusEffectSystem.reset();
    this.threatTable.clear();
    this.enemyAIs.clear();

    // Start combat
    this.combatManager.startCombat(partyMembers, enemies);

    // Initialize limit break meters for party members
    for (const member of partyMembers) {
      this.limitBreakSystem.initializeMeter(member.id);
    }

    // Initialize threat table for enemies
    for (const enemy of this.combatManager.getAliveEnemies()) {
      this.threatTable.set(enemy.id, new Map());
    }
  }

  /**
   * End the encounter.
   */
  public endEncounter(): void {
    this.combatManager.endCombat();
    this.comboSystem.reset();
    this.statusEffectSystem.reset();
    this.threatTable.clear();
    this.enemyAIs.clear();
  }

  // -----------------------------------------------------------------------
  // Per-frame update
  // -----------------------------------------------------------------------

  /**
   * Advance all combat subsystems by dt seconds.
   */
  public update(dt: number): void {
    if (this.combatManager.state !== CombatState.ACTIVE) return;

    this.combatManager.update(dt);
    this.elementalSystem.update(dt);
    this.comboSystem.update(dt);
    this.limitBreakSystem.update(dt);
    this.statusEffectSystem.update(dt);
  }

  // -----------------------------------------------------------------------
  // Unified damage pipeline
  // -----------------------------------------------------------------------

  /**
   * Execute damage through the full pipeline:
   * 1. ElementalSystem for reaction checks/modifiers
   * 2. ComboSystem for combo chain bonuses
   * 3. CombatManager.dealDamage() for core damage resolution
   * 4. LimitBreakSystem meter updates (via event subscription)
   * 5. StatusEffectSystem proc effects
   */
  public executeDamage(
    attackerId: string,
    targetId: string,
    baseDamage: number,
    damageType: DamageType,
    _abilityName?: string,
  ): CombatActionResult | null {
    const attacker = this.combatManager.getCombatant(attackerId);
    const target = this.combatManager.getCombatant(targetId);
    if (!attacker || !target || !target.alive) return null;

    let modifiedDamage = baseDamage;
    let skillMultiplier = 1.0;

    // Step 1: Elemental system — check for reactions and modifiers
    const element = damageType as string as Element;
    if (Object.values(Element).includes(element)) {
      const eleResult = this.elementalSystem.calculateDamage(
        modifiedDamage,
        element,
        targetId,
      );
      modifiedDamage = eleResult.finalDamage;
    }

    // Step 2: Status effect damage amplification
    const ampMult = this.statusEffectSystem.getDamageAmplification(
      targetId,
      damageType,
    );
    modifiedDamage = Math.round(modifiedDamage * ampMult);

    // Step 3: Shield absorption
    if (this.statusEffectSystem.getTotalShield(targetId) > 0) {
      modifiedDamage = this.statusEffectSystem.absorbDamage(targetId, modifiedDamage);
      if (modifiedDamage <= 0) {
        return null; // fully absorbed
      }
    }

    // Step 4: Apply crit/dodge soft caps
    this.applySoftCaps(attacker);

    // Step 5: Core damage resolution through CombatManager
    const result = this.combatManager.dealDamage(
      attackerId,
      targetId,
      modifiedDamage,
      damageType,
      skillMultiplier,
    );

    // Restore uncapped stats after damage calc
    this.restoreSoftCaps(attacker);

    return result;
  }

  // -----------------------------------------------------------------------
  // Ability execution
  // -----------------------------------------------------------------------

  /**
   * Register an ability definition for use with useAbility.
   */
  public registerAbility(ability: AbilityDef): void {
    this.abilityDefs.set(ability.id, ability);
  }

  /**
   * Execute an ability. Checks cooldowns, MP cost, applies effects.
   */
  public useAbility(
    casterId: string,
    targetId: string,
    abilityId: string,
  ): CombatActionResult | null {
    const caster = this.combatManager.getCombatant(casterId);
    const target = this.combatManager.getCombatant(targetId);
    if (!caster || !target) return null;

    // Check if stunned
    if (this.statusEffectSystem.isStunned(casterId)) return null;

    const ability = this.abilityDefs.get(abilityId);
    if (!ability) return null;

    // Check cooldown
    if (!this.combatManager.isAbilityReady(casterId, abilityId)) return null;

    // Check MP cost
    if (caster.stats.mp < ability.mpCost) return null;

    // Deduct MP
    caster.stats.mp -= ability.mpCost;

    // Start cooldown
    this.combatManager.startCooldown(casterId, abilityId, ability.cooldown);

    // Execute damage pipeline
    const result = this.executeDamage(
      casterId,
      targetId,
      ability.baseDamage,
      ability.damageType,
      ability.name,
    );

    // Apply ability effects (status effects, etc.)
    if (ability.effects) {
      for (const eff of ability.effects) {
        this.statusEffectSystem.apply(
          targetId,
          {
            name: eff.type,
            type: StatusType.DEBUFF,
            stat: '',
            value: eff.value,
            duration: eff.duration ?? 5,
            tickRate: 0,
            tickDamage: 0,
            stackable: false,
            maxStacks: 1,
            stuns: eff.type === 'stun',
            damageAmplify: null,
            shieldHp: 0,
            healingReduction: 0,
          },
          casterId,
        );
      }
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Combo integration
  // -----------------------------------------------------------------------

  /**
   * Process a combo input and return the result.
   */
  public processComboInput(
    action: string,
    classId: string,
    attackerId: string,
    targetId: string,
    baseDamage: number,
    damageType: DamageType,
  ): ComboResult | null {
    const result = this.comboSystem.processInput(action, classId);

    if (result && result.type === 'completed' && result.damage) {
      // Execute combo damage through the pipeline
      this.executeDamage(
        attackerId,
        targetId,
        baseDamage * result.damage,
        damageType,
        result.comboName,
      );

      // Charge limit break for combo completion
      this.limitBreakSystem.onComboComplete(
        attackerId,
        result.perfectBonus ? Math.round((result.perfectBonus - 1.0) * 10) : 0,
      );

      this.config.onComboComplete?.(result);
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Limit break integration
  // -----------------------------------------------------------------------

  /**
   * Execute a limit break for a character.
   */
  public executeLimitBreak(
    characterId: string,
    targetId: string,
    baseDamage: number,
  ): LimitBreak | null {
    const lb = this.limitBreakSystem.executeLimitBreak(characterId);
    if (!lb) return null;

    // Apply limit break damage
    this.executeDamage(
      characterId,
      targetId,
      baseDamage * lb.damage,
      DamageType.PHYSICAL,
      lb.name,
    );

    return lb;
  }

  // -----------------------------------------------------------------------
  // Threat / Aggro system
  // -----------------------------------------------------------------------

  /**
   * Add threat from a party member to an enemy.
   */
  public addThreat(
    enemyId: string,
    partyMemberId: string,
    amount: number,
  ): void {
    if (!this.threatTable.has(enemyId)) {
      this.threatTable.set(enemyId, new Map());
    }
    const enemyThreats = this.threatTable.get(enemyId)!;
    const current = enemyThreats.get(partyMemberId) ?? 0;
    enemyThreats.set(partyMemberId, current + amount);

    this.config.onThreatChanged?.(enemyId, partyMemberId, current + amount);
  }

  /**
   * Get the highest-threat party member for an enemy.
   */
  public getThreatTarget(enemyId: string): string | null {
    const enemyThreats = this.threatTable.get(enemyId);
    if (!enemyThreats || enemyThreats.size === 0) return null;

    let highestThreat = -1;
    let highestTarget: string | null = null;

    for (const [memberId, threat] of enemyThreats) {
      // Only consider alive party members
      const member = this.combatManager.getCombatant(memberId);
      if (!member || !member.alive) continue;

      if (threat > highestThreat) {
        highestThreat = threat;
        highestTarget = memberId;
      }
    }

    return highestTarget;
  }

  /**
   * Reduce threat of a party member against an enemy by a percentage.
   */
  public reduceThreat(
    enemyId: string,
    partyMemberId: string,
    percent: number,
  ): void {
    const enemyThreats = this.threatTable.get(enemyId);
    if (!enemyThreats) return;

    const current = enemyThreats.get(partyMemberId) ?? 0;
    const reduction = current * Math.min(1, Math.max(0, percent));
    enemyThreats.set(partyMemberId, current - reduction);
  }

  /**
   * Apply a taunt: set a fixed high threat for this party member.
   */
  public applyTaunt(
    enemyId: string,
    partyMemberId: string,
    threatAmount: number = 10000,
  ): void {
    this.addThreat(enemyId, partyMemberId, threatAmount);
  }

  /**
   * Get the threat table for a specific enemy.
   */
  public getThreatTable(enemyId: string): Map<string, number> | undefined {
    return this.threatTable.get(enemyId);
  }

  // -----------------------------------------------------------------------
  // AI management
  // -----------------------------------------------------------------------

  /**
   * Register an AI controller for an enemy combatant.
   */
  public registerEnemyAI(enemyId: string, ai: EnemyAI | BossAI): void {
    this.enemyAIs.set(enemyId, ai);
  }

  /**
   * Get the AI controller for an enemy.
   */
  public getEnemyAI(enemyId: string): EnemyAI | BossAI | undefined {
    return this.enemyAIs.get(enemyId);
  }

  // -----------------------------------------------------------------------
  // Soft cap helpers
  // -----------------------------------------------------------------------

  /** Stored original stat values before soft cap application. */
  private uncappedCrit: number = 0;
  private uncappedDodge: number = 0;

  /**
   * Apply soft caps to crit and dodge before damage calculation.
   * Crit soft cap: effective = 50 + (raw - 50) * 0.5 for raw > 50
   * Dodge soft cap: same formula
   */
  private applySoftCaps(combatant: Combatant): void {
    this.uncappedCrit = combatant.stats.critChance;
    this.uncappedDodge = combatant.stats.dodgeChance;

    if (combatant.stats.critChance > 50) {
      combatant.stats.critChance =
        50 + (combatant.stats.critChance - 50) * 0.5;
    }
    if (combatant.stats.dodgeChance > 50) {
      combatant.stats.dodgeChance =
        50 + (combatant.stats.dodgeChance - 50) * 0.5;
    }
  }

  /**
   * Restore original crit/dodge values after damage calculation.
   */
  private restoreSoftCaps(combatant: Combatant): void {
    combatant.stats.critChance = this.uncappedCrit;
    combatant.stats.dodgeChance = this.uncappedDodge;
  }

  // -----------------------------------------------------------------------
  // Utility accessors
  // -----------------------------------------------------------------------

  public get state(): CombatState {
    return this.combatManager.state;
  }

  public getAliveParty(): Combatant[] {
    return this.combatManager.getAliveParty();
  }

  public getAliveEnemies(): Combatant[] {
    return this.combatManager.getAliveEnemies();
  }
}
