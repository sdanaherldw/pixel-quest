// ---------------------------------------------------------------------------
// ElementalSystem.ts — Elemental reactions and weakness system
// ---------------------------------------------------------------------------
// Manages element application, reaction triggering, weakness / resistance
// profiles, and per-entity active-element state.  When two elements combine
// on a target, a reaction is triggered for bonus damage and status effects.
// ---------------------------------------------------------------------------

export enum Element {
  FIRE = 'fire',
  ICE = 'ice',
  LIGHTNING = 'lightning',
  HOLY = 'holy',
  SHADOW = 'shadow',
  NATURE = 'nature',
  POISON = 'poison',
  PHYSICAL = 'physical',
}

export interface ElementalReaction {
  elements: [Element, Element];
  name: string;
  effect: string;
  damageMultiplier: number;
  statusEffect?: { type: string; duration: number; damage?: number };
  description: string;
}

export interface ElementalProfile {
  weaknesses: Element[];
  resistances: Element[];
  immunities: Element[];
  absorbs: Element[];
}

interface ActiveElementState {
  element: Element;
  duration: number; // seconds remaining
  stacks: number;
}

// ---- helper: canonical key for an element pair ----------------------------

function reactionKey(a: Element, b: Element): string {
  // Always store in sorted order so lookup is order-independent
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}

// ---------------------------------------------------------------------------
// ElementalSystem
// ---------------------------------------------------------------------------

export class ElementalSystem {
  private reactions: Map<string, ElementalReaction>;
  private profiles: Map<string, ElementalProfile>;
  private activeElements: Map<string, ActiveElementState>;

  // Constants
  private readonly weaknessMultiplier: number = 1.5;
  private readonly resistanceMultiplier: number = 0.5;
  private readonly defaultElementDuration: number = 8; // seconds
  private readonly maxStacks: number = 3;

  constructor() {
    this.reactions = new Map<string, ElementalReaction>();
    this.profiles = new Map<string, ElementalProfile>();
    this.activeElements = new Map<string, ActiveElementState>();

    this.registerDefaultReactions();
    this.registerDefaultProfiles();
  }

  // ---- Profile management -------------------------------------------------

  registerProfile(entityId: string, profile: ElementalProfile): void {
    this.profiles.set(entityId, profile);
  }

  getProfile(entityId: string): ElementalProfile | undefined {
    return this.profiles.get(entityId);
  }

  // ---- Damage calculation -------------------------------------------------

  calculateDamage(
    baseDamage: number,
    element: Element,
    targetId: string,
  ): {
    finalDamage: number;
    multiplier: number;
    reaction: ElementalReaction | null;
    effectiveness:
      | 'weak'
      | 'resist'
      | 'immune'
      | 'absorb'
      | 'normal'
      | 'reaction';
  } {
    const profile = this.profiles.get(targetId);
    let multiplier = 1.0;
    let effectiveness: 'weak' | 'resist' | 'immune' | 'absorb' | 'normal' | 'reaction' =
      'normal';

    if (profile) {
      if (profile.absorbs.includes(element)) {
        return {
          finalDamage: -baseDamage, // negative = healing
          multiplier: -1.0,
          reaction: null,
          effectiveness: 'absorb',
        };
      }

      if (profile.immunities.includes(element)) {
        return {
          finalDamage: 0,
          multiplier: 0,
          reaction: null,
          effectiveness: 'immune',
        };
      }

      if (profile.weaknesses.includes(element)) {
        multiplier = this.weaknessMultiplier;
        effectiveness = 'weak';
      } else if (profile.resistances.includes(element)) {
        multiplier = this.resistanceMultiplier;
        effectiveness = 'resist';
      }
    }

    // Check for reaction with existing element on target
    const reaction = this.applyElement(targetId, element);
    if (reaction) {
      multiplier *= reaction.damageMultiplier;
      effectiveness = 'reaction';
    }

    const finalDamage = Math.round(baseDamage * multiplier);

    return { finalDamage, multiplier, reaction, effectiveness };
  }

  // ---- Element application ------------------------------------------------

  applyElement(
    targetId: string,
    element: Element,
    duration?: number,
  ): ElementalReaction | null {
    const existing = this.activeElements.get(targetId);
    const dur = duration ?? this.defaultElementDuration;

    if (!existing) {
      // No element on target — apply fresh
      this.activeElements.set(targetId, {
        element,
        duration: dur,
        stacks: 1,
      });
      return null;
    }

    if (existing.element === element) {
      // Same element — increase stacks (up to max)
      existing.stacks = Math.min(this.maxStacks, existing.stacks + 1);
      existing.duration = Math.max(existing.duration, dur);
      return null;
    }

    // Different element — check for reaction
    const reaction = this.checkReaction(existing.element, element);

    // Consume the existing element regardless
    this.activeElements.delete(targetId);

    return reaction;
  }

  getActiveElement(
    targetId: string,
  ): { element: Element; duration: number; stacks: number } | undefined {
    const state = this.activeElements.get(targetId);
    if (!state) {
      return undefined;
    }
    return { element: state.element, duration: state.duration, stacks: state.stacks };
  }

  clearElement(targetId: string): void {
    this.activeElements.delete(targetId);
  }

  // ---- Reactions ----------------------------------------------------------

  checkReaction(
    existingElement: Element,
    newElement: Element,
  ): ElementalReaction | null {
    const key = reactionKey(existingElement, newElement);
    return this.reactions.get(key) ?? null;
  }

  getReaction(
    element1: Element,
    element2: Element,
  ): ElementalReaction | null {
    const key = reactionKey(element1, element2);
    return this.reactions.get(key) ?? null;
  }

  // ---- Weakness display helpers -------------------------------------------

  getWeaknessMultiplier(): number {
    return this.weaknessMultiplier;
  }

  getResistanceMultiplier(): number {
    return this.resistanceMultiplier;
  }

  // ---- Update (tick down durations) ---------------------------------------

  update(dt: number): void {
    const toRemove: string[] = [];

    for (const [entityId, state] of this.activeElements) {
      state.duration -= dt;
      if (state.duration <= 0) {
        toRemove.push(entityId);
      }
    }

    for (const entityId of toRemove) {
      this.activeElements.delete(entityId);
    }
  }

  // ---- Default reactions --------------------------------------------------

  registerDefaultReactions(): void {
    const defs: ElementalReaction[] = [
      {
        elements: [Element.FIRE, Element.ICE],
        name: 'Shatter',
        effect: 'Thermal shock shatters frozen targets.',
        damageMultiplier: 2.0,
        statusEffect: { type: 'stun', duration: 2 },
        description: '2x damage and stuns for 2 s (thermal shock).',
      },
      {
        elements: [Element.FIRE, Element.NATURE],
        name: 'Wildfire',
        effect: 'Flames spread through natural matter.',
        damageMultiplier: 1.8,
        statusEffect: { type: 'burn', duration: 5, damage: 10 },
        description: '1.8x damage, DoT for 5 s (burning spread).',
      },
      {
        elements: [Element.FIRE, Element.LIGHTNING],
        name: 'Explosion',
        effect: 'Volatile energy detonates.',
        damageMultiplier: 2.5,
        description: '2.5x AoE damage (volatile combo).',
      },
      {
        elements: [Element.ICE, Element.LIGHTNING],
        name: 'Superconductor',
        effect: 'Superconductive discharge weakens defences.',
        damageMultiplier: 1.5,
        statusEffect: { type: 'def_down', duration: 5 },
        description: '1.5x damage, DEF reduction 50 % for 5 s.',
      },
      {
        elements: [Element.ICE, Element.NATURE],
        name: 'Frostbite',
        effect: 'Freezing sap slows the target.',
        damageMultiplier: 1.5,
        statusEffect: { type: 'slow', duration: 4 },
        description: '1.5x damage, SPD reduction 50 % for 4 s.',
      },
      {
        elements: [Element.LIGHTNING, Element.NATURE],
        name: 'Electro-Growth',
        effect: 'Electric current stimulates explosive plant growth.',
        damageMultiplier: 1.5,
        statusEffect: { type: 'vine_trap', duration: 3, damage: 8 },
        description: '1.5x damage, spawns damaging vines for 3 s.',
      },
      {
        elements: [Element.HOLY, Element.SHADOW],
        name: 'Purification',
        effect: 'Light and darkness annihilate each other.',
        damageMultiplier: 3.0,
        description: '3x damage to undead, 1.5x to others.',
      },
      {
        elements: [Element.POISON, Element.FIRE],
        name: 'Toxic Fumes',
        effect: 'Poison ignites into a toxic cloud.',
        damageMultiplier: 2.0,
        statusEffect: { type: 'poison_aoe', duration: 4, damage: 12 },
        description: '2x AoE poison damage.',
      },
      {
        elements: [Element.POISON, Element.ICE],
        name: 'Frozen Plague',
        effect: 'Poison crystallises into contagious ice.',
        damageMultiplier: 1.5,
        statusEffect: { type: 'slow_poison', duration: 5, damage: 6 },
        description: '1.5x damage, AoE slow + poison DoT.',
      },
      {
        elements: [Element.POISON, Element.NATURE],
        name: 'Pandemic',
        effect: 'Toxins evolve and spread uncontrollably.',
        damageMultiplier: 1.8,
        statusEffect: { type: 'spread_poison', duration: 6, damage: 8 },
        description: '1.8x damage, spreads to nearby enemies.',
      },
    ];

    for (const def of defs) {
      const key = reactionKey(def.elements[0], def.elements[1]);
      this.reactions.set(key, def);
    }
  }

  // ---- Default enemy profiles ---------------------------------------------

  registerDefaultProfiles(): void {
    // Undead: weak to Holy/Fire, resist Shadow/Poison, immune to Poison
    this.profiles.set('undead', {
      weaknesses: [Element.HOLY, Element.FIRE],
      resistances: [Element.SHADOW],
      immunities: [Element.POISON],
      absorbs: [],
    });

    // Fire Elemental: weak to Ice, resist Fire, absorbs Fire
    this.profiles.set('fire_elemental', {
      weaknesses: [Element.ICE],
      resistances: [],
      immunities: [],
      absorbs: [Element.FIRE],
    });

    // Ice Elemental: weak to Fire, resist Ice, absorbs Ice
    this.profiles.set('ice_elemental', {
      weaknesses: [Element.FIRE],
      resistances: [],
      immunities: [],
      absorbs: [Element.ICE],
    });

    // Dragon: resist Fire/Ice, weak to Lightning
    this.profiles.set('dragon', {
      weaknesses: [Element.LIGHTNING],
      resistances: [Element.FIRE, Element.ICE],
      immunities: [],
      absorbs: [],
    });

    // Beast: weak to Fire/Ice, resist Nature
    this.profiles.set('beast', {
      weaknesses: [Element.FIRE, Element.ICE],
      resistances: [Element.NATURE],
      immunities: [],
      absorbs: [],
    });

    // Construct: weak to Lightning, resist Physical, immune to Poison
    this.profiles.set('construct', {
      weaknesses: [Element.LIGHTNING],
      resistances: [Element.PHYSICAL],
      immunities: [Element.POISON],
      absorbs: [],
    });
  }
}
