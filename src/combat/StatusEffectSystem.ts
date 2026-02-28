// ---------------------------------------------------------------------------
// StatusEffectSystem.ts — Buffs, debuffs, DOTs, HOTs, and crowd control
// ---------------------------------------------------------------------------
// Pure TypeScript — no PixiJS dependencies.  Rendering is handled separately.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Broad category of a status effect. */
export enum StatusType {
  /** Positive stat modifier. */
  BUFF = 'BUFF',
  /** Negative stat modifier. */
  DEBUFF = 'DEBUFF',
  /** Damage over time. */
  DOT = 'DOT',
  /** Heal over time. */
  HOT = 'HOT',
  /** Crowd control (stun, freeze, etc.). */
  CC = 'CC',
}

/** Well-known effect names for type-safe look-ups. */
export enum StatusEffectName {
  POISON = 'Poison',
  BURN = 'Burn',
  FREEZE = 'Freeze',
  BLEED = 'Bleed',
  BLESS = 'Bless',
  REGENERATE = 'Regenerate',
  WEAKEN = 'Weaken',
  SHIELD = 'Shield',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Definition of a single status effect instance. */
export interface StatusEffect {
  /** Globally unique id for this instance (auto-generated). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Category. */
  type: StatusType;
  /** The stat this effect modifies (if BUFF/DEBUFF). */
  stat: string;
  /** Flat modifier applied to the stat (positive = buff, negative = debuff). */
  value: number;
  /** Total duration in seconds. */
  duration: number;
  /** Seconds remaining. */
  remaining: number;
  /** Seconds between DOT/HOT ticks.  0 = no tick, effect is purely passive. */
  tickRate: number;
  /** Damage per tick (DOT) or healing per tick (HOT). */
  tickDamage: number;
  /** If true the effect can stack with copies of itself. */
  stackable: boolean;
  /** Maximum stack count (ignored when `stackable` is false). */
  maxStacks: number;
  /** Current stack count. */
  stacks: number;
  /** ID of the combatant that applied this effect. */
  source: string;
  /** Seconds since last tick. */
  tickAccumulator: number;
  /** If true, the target is stunned (cannot act). */
  stuns: boolean;
  /** Additional damage multiplier applied to the target for a specific type. */
  damageAmplify: { type: string; multiplier: number } | null;
  /** If > 0, absorbs incoming damage before breaking. */
  shieldHp: number;
  /** Percentage by which incoming healing is reduced (0-1). */
  healingReduction: number;
}

/** Callback for when a DOT/HOT tick fires. */
export type TickCallback = (
  targetId: string,
  effect: StatusEffect,
  tickValue: number,
) => void;

/** Callback for when an effect is applied or removed. */
export type EffectLifecycleCallback = (
  targetId: string,
  effect: StatusEffect,
) => void;

/** Set of immunities for a specific target. */
export interface EffectImmunity {
  /** Effect names the target is immune to. */
  names: Set<string>;
  /** Effect types the target is immune to. */
  types: Set<StatusType>;
}

// ---------------------------------------------------------------------------
// Template definitions for common effects
// ---------------------------------------------------------------------------

export interface StatusEffectTemplate {
  name: string;
  type: StatusType;
  stat: string;
  value: number;
  duration: number;
  tickRate: number;
  tickDamage: number;
  stackable: boolean;
  maxStacks: number;
  stuns: boolean;
  damageAmplify: { type: string; multiplier: number } | null;
  shieldHp: number;
  healingReduction: number;
}

/** Pre-defined effect templates matching the design spec. */
export const STATUS_TEMPLATES: Record<StatusEffectName, StatusEffectTemplate> = {
  [StatusEffectName.POISON]: {
    name: StatusEffectName.POISON,
    type: StatusType.DOT,
    stat: '',
    value: 0,
    duration: 6,
    tickRate: 1,
    tickDamage: 3,
    stackable: false,
    maxStacks: 1,
    stuns: false,
    damageAmplify: null,
    shieldHp: 0,
    healingReduction: 0,
  },
  [StatusEffectName.BURN]: {
    name: StatusEffectName.BURN,
    type: StatusType.DOT,
    stat: '',
    value: 0,
    duration: 4,
    tickRate: 1,
    tickDamage: 5,
    stackable: false,
    maxStacks: 1,
    stuns: false,
    damageAmplify: null,
    shieldHp: 0,
    healingReduction: 0.3,
  },
  [StatusEffectName.FREEZE]: {
    name: StatusEffectName.FREEZE,
    type: StatusType.CC,
    stat: '',
    value: 0,
    duration: 2,
    tickRate: 0,
    tickDamage: 0,
    stackable: false,
    maxStacks: 1,
    stuns: true,
    damageAmplify: { type: 'ice', multiplier: 1.2 },
    shieldHp: 0,
    healingReduction: 0,
  },
  [StatusEffectName.BLEED]: {
    name: StatusEffectName.BLEED,
    type: StatusType.DOT,
    stat: '',
    value: 0,
    duration: 8,
    tickRate: 1,
    tickDamage: 0, // variable — set at apply time based on attacker ATK
    stackable: true,
    maxStacks: 3,
    stuns: false,
    damageAmplify: null,
    shieldHp: 0,
    healingReduction: 0,
  },
  [StatusEffectName.BLESS]: {
    name: StatusEffectName.BLESS,
    type: StatusType.BUFF,
    stat: 'all', // special: applies +15% to every stat
    value: 0.15, // stored as fraction; caller multiplies by base stat
    duration: 30,
    tickRate: 0,
    tickDamage: 0,
    stackable: false,
    maxStacks: 1,
    stuns: false,
    damageAmplify: null,
    shieldHp: 0,
    healingReduction: 0,
  },
  [StatusEffectName.REGENERATE]: {
    name: StatusEffectName.REGENERATE,
    type: StatusType.HOT,
    stat: '',
    value: 0,
    duration: 10,
    tickRate: 1,
    tickDamage: 5, // positive means healing for HOT
    stackable: false,
    maxStacks: 1,
    stuns: false,
    damageAmplify: null,
    shieldHp: 0,
    healingReduction: 0,
  },
  [StatusEffectName.WEAKEN]: {
    name: StatusEffectName.WEAKEN,
    type: StatusType.DEBUFF,
    stat: 'atk',
    value: -0.2, // -20% ATK (applied as flat reduction from base)
    duration: 8,
    tickRate: 0,
    tickDamage: 0,
    stackable: false,
    maxStacks: 1,
    stuns: false,
    damageAmplify: null,
    shieldHp: 0,
    healingReduction: 0,
  },
  [StatusEffectName.SHIELD]: {
    name: StatusEffectName.SHIELD,
    type: StatusType.BUFF,
    stat: '',
    value: 0,
    duration: 15,
    tickRate: 0,
    tickDamage: 0,
    stackable: false,
    maxStacks: 1,
    stuns: false,
    damageAmplify: null,
    shieldHp: 50, // default; can be overridden at apply time
    healingReduction: 0,
  },
};

// ---------------------------------------------------------------------------
// StatusEffectSystem
// ---------------------------------------------------------------------------

let nextEffectId = 0;

/**
 * Manages all active status effects across all combatants.
 *
 * Effects are stored per-target and ticked each frame.  DOTs and HOTs fire
 * their tick callbacks at the configured rate; BUFF/DEBUFF effects are
 * purely stat modifications resolved externally.
 *
 * The system is decoupled from CombatManager — it communicates through IDs
 * and callbacks rather than direct references.
 */
export class StatusEffectSystem {
  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  /** targetId → array of active effects. */
  private readonly _effects: Map<string, StatusEffect[]> = new Map();
  /** targetId → immunity set. */
  private readonly _immunities: Map<string, EffectImmunity> = new Map();

  // -----------------------------------------------------------------------
  // Callbacks — set by the owning system (e.g. CombatManager)
  // -----------------------------------------------------------------------

  /** Called when a DOT ticks.  The receiver should call `setHP`. */
  public onDotTick: TickCallback | null = null;
  /** Called when a HOT ticks.  The receiver should call `applyHealing`. */
  public onHotTick: TickCallback | null = null;
  /** Called when an effect is first applied. */
  public onEffectApplied: EffectLifecycleCallback | null = null;
  /** Called when an effect is removed (expired or manually). */
  public onEffectRemoved: EffectLifecycleCallback | null = null;

  // -----------------------------------------------------------------------
  // Apply / Remove
  // -----------------------------------------------------------------------

  /**
   * Apply a status effect to a target.
   *
   * Stacking rules:
   * - Same source + same name → refresh duration (do not add a new stack).
   * - Different source + same name + stackable → add stack (up to maxStacks).
   * - Different source + same name + not stackable → refresh duration.
   *
   * @param targetId  The ID of the combatant receiving the effect.
   * @param template  A template name or a full StatusEffectTemplate.
   * @param source    The ID of the combatant applying the effect.
   * @param overrides Partial overrides (e.g. custom tickDamage for Bleed).
   * @returns The applied effect, or `null` if the target is immune.
   */
  public apply(
    targetId: string,
    template: StatusEffectName | StatusEffectTemplate,
    source: string,
    overrides: Partial<StatusEffectTemplate> = {},
  ): StatusEffect | null {
    const base: StatusEffectTemplate =
      typeof template === 'string'
        ? { ...STATUS_TEMPLATES[template], ...overrides }
        : { ...template, ...overrides };

    // Immunity check
    if (this.isImmune(targetId, base.name, base.type)) return null;

    // Ensure array exists
    if (!this._effects.has(targetId)) {
      this._effects.set(targetId, []);
    }
    const effects = this._effects.get(targetId)!;

    // Check for existing effect with same name
    const existing = effects.filter((e) => e.name === base.name);

    // Same source → refresh
    const sameSource = existing.find((e) => e.source === source);
    if (sameSource) {
      sameSource.remaining = base.duration;
      sameSource.tickAccumulator = 0;
      return sameSource;
    }

    // Different source, stackable
    if (base.stackable && existing.length > 0) {
      const first = existing[0];
      if (first.stacks < first.maxStacks) {
        first.stacks++;
        first.remaining = base.duration; // refresh
        first.tickAccumulator = 0;
        return first;
      }
      // At max stacks — just refresh
      first.remaining = base.duration;
      first.tickAccumulator = 0;
      return first;
    }

    // Not stackable, different source — refresh the first existing if any
    if (!base.stackable && existing.length > 0) {
      const first = existing[0];
      first.remaining = base.duration;
      first.source = source;
      first.tickAccumulator = 0;
      return first;
    }

    // No existing — create new
    const effect: StatusEffect = {
      id: `se_${nextEffectId++}`,
      name: base.name,
      type: base.type,
      stat: base.stat,
      value: base.value,
      duration: base.duration,
      remaining: base.duration,
      tickRate: base.tickRate,
      tickDamage: base.tickDamage,
      stackable: base.stackable,
      maxStacks: base.maxStacks,
      stacks: 1,
      source,
      tickAccumulator: 0,
      stuns: base.stuns,
      damageAmplify: base.damageAmplify ? { ...base.damageAmplify } : null,
      shieldHp: base.shieldHp,
      healingReduction: base.healingReduction,
    };

    effects.push(effect);
    this.onEffectApplied?.(targetId, effect);
    return effect;
  }

  /**
   * Manually remove a specific effect instance from a target.
   */
  public remove(targetId: string, effectId: string): boolean {
    const effects = this._effects.get(targetId);
    if (!effects) return false;
    const idx = effects.findIndex((e) => e.id === effectId);
    if (idx === -1) return false;
    const [removed] = effects.splice(idx, 1);
    this.onEffectRemoved?.(targetId, removed);
    return true;
  }

  /**
   * Remove all effects with a given name from a target.
   */
  public removeByName(targetId: string, effectName: string): number {
    const effects = this._effects.get(targetId);
    if (!effects) return 0;
    let removed = 0;
    for (let i = effects.length - 1; i >= 0; i--) {
      if (effects[i].name === effectName) {
        const [eff] = effects.splice(i, 1);
        this.onEffectRemoved?.(targetId, eff);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Remove every effect from a target (e.g. on death or dispel).
   */
  public clearAll(targetId: string): void {
    const effects = this._effects.get(targetId);
    if (!effects) return;
    for (const eff of effects) {
      this.onEffectRemoved?.(targetId, eff);
    }
    this._effects.set(targetId, []);
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  /** All active effects on a target. */
  public getEffects(targetId: string): readonly StatusEffect[] {
    return this._effects.get(targetId) ?? [];
  }

  /** Whether a target has a specific named effect. */
  public hasEffect(targetId: string, effectName: string): boolean {
    const effects = this._effects.get(targetId);
    if (!effects) return false;
    return effects.some((e) => e.name === effectName);
  }

  /** Get a specific named effect on a target (first match). */
  public getEffect(
    targetId: string,
    effectName: string,
  ): StatusEffect | undefined {
    return this._effects.get(targetId)?.find((e) => e.name === effectName);
  }

  /** Whether the target is currently stunned (any CC with `stuns`). */
  public isStunned(targetId: string): boolean {
    const effects = this._effects.get(targetId);
    if (!effects) return false;
    return effects.some((e) => e.stuns);
  }

  /** Total healing reduction on a target (compounded from all effects). */
  public getHealingReduction(targetId: string): number {
    const effects = this._effects.get(targetId);
    if (!effects) return 0;
    let reduction = 0;
    for (const e of effects) {
      reduction += e.healingReduction;
    }
    return Math.min(1, reduction); // cap at 100%
  }

  /**
   * Total shield HP remaining on a target across all Shield effects.
   */
  public getTotalShield(targetId: string): number {
    const effects = this._effects.get(targetId);
    if (!effects) return 0;
    let total = 0;
    for (const e of effects) {
      total += e.shieldHp;
    }
    return total;
  }

  /**
   * Absorb damage through shield effects.  Returns the remaining
   * (unabsorbed) damage.  Shields are consumed in application order.
   */
  public absorbDamage(targetId: string, damage: number): number {
    const effects = this._effects.get(targetId);
    if (!effects) return damage;

    let remaining = damage;
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      if (e.shieldHp <= 0) continue;

      if (e.shieldHp >= remaining) {
        e.shieldHp -= remaining;
        remaining = 0;
        break;
      } else {
        remaining -= e.shieldHp;
        e.shieldHp = 0;
        // Shield is broken — remove the effect
        const [removed] = effects.splice(i, 1);
        this.onEffectRemoved?.(targetId, removed);
      }
    }

    return remaining;
  }

  /**
   * Get the damage amplification multiplier for a specific damage type
   * on a target.  Returns 1.0 if no amplification is active.
   */
  public getDamageAmplification(targetId: string, damageType: string): number {
    const effects = this._effects.get(targetId);
    if (!effects) return 1.0;
    let mult = 1.0;
    for (const e of effects) {
      if (e.damageAmplify && e.damageAmplify.type === damageType) {
        mult *= e.damageAmplify.multiplier;
      }
    }
    return mult;
  }

  // -----------------------------------------------------------------------
  // Immunities
  // -----------------------------------------------------------------------

  /** Register an immunity for a target. */
  public addImmunity(
    targetId: string,
    nameOrType: string | StatusType,
  ): void {
    if (!this._immunities.has(targetId)) {
      this._immunities.set(targetId, {
        names: new Set(),
        types: new Set(),
      });
    }
    const imm = this._immunities.get(targetId)!;
    if (Object.values(StatusType).includes(nameOrType as StatusType)) {
      imm.types.add(nameOrType as StatusType);
    } else {
      imm.names.add(nameOrType);
    }
  }

  /** Remove an immunity from a target. */
  public removeImmunity(
    targetId: string,
    nameOrType: string | StatusType,
  ): void {
    const imm = this._immunities.get(targetId);
    if (!imm) return;
    imm.names.delete(nameOrType);
    imm.types.delete(nameOrType as StatusType);
  }

  /** Check if a target is immune to a given effect. */
  public isImmune(
    targetId: string,
    effectName: string,
    effectType: StatusType,
  ): boolean {
    const imm = this._immunities.get(targetId);
    if (!imm) return false;
    return imm.names.has(effectName) || imm.types.has(effectType);
  }

  // -----------------------------------------------------------------------
  // Per-frame update
  // -----------------------------------------------------------------------

  /**
   * Advance all active effects by `dt` seconds.
   *
   * - Duration tracking: remaining decreases; auto-remove when expired.
   * - Tick processing: DOTs / HOTs fire their callback at the configured
   *   tick rate.  Stacked effects multiply tick damage by stack count.
   */
  public update(dt: number): void {
    for (const [targetId, effects] of this._effects) {
      for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i];

        // Tick duration
        e.remaining -= dt;
        if (e.remaining <= 0) {
          effects.splice(i, 1);
          this.onEffectRemoved?.(targetId, e);
          continue;
        }

        // Process DOT / HOT ticks
        if (e.tickRate > 0 && e.tickDamage !== 0) {
          e.tickAccumulator += dt;
          while (e.tickAccumulator >= e.tickRate) {
            e.tickAccumulator -= e.tickRate;
            const tickValue = e.tickDamage * e.stacks;

            if (e.type === StatusType.DOT) {
              this.onDotTick?.(targetId, e, tickValue);
            } else if (e.type === StatusType.HOT) {
              this.onHotTick?.(targetId, e, tickValue);
            }
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Remove all effects for every target. */
  public reset(): void {
    for (const [targetId, effects] of this._effects) {
      for (const eff of effects) {
        this.onEffectRemoved?.(targetId, eff);
      }
    }
    this._effects.clear();
    this._immunities.clear();
  }
}
