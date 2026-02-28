// ---------------------------------------------------------------------------
// LimitBreakSystem.ts — Dual meter system: individual + party synergy
// ---------------------------------------------------------------------------
// Each party member has an individual Limit Break meter that charges through
// combat actions.  A separate Party Meter tracks overall synergy — its level
// (0-3) is determined by how many individual meters are at least 50 % full.
// ---------------------------------------------------------------------------

export interface LimitBreakMeter {
  current: number; // 0-100
  max: number; // 100
  chargeRate: number; // base charge multiplier
  ready: boolean; // current >= max
}

export interface PartyMeter {
  current: number; // 0-100
  max: number; // 100
  chargeRate: number;
  ready: boolean;
  level: number; // 0-3
}

export interface LimitBreak {
  id: string;
  name: string;
  classId: string;
  type: 'individual' | 'party';
  damage: number; // multiplier
  effects: Array<{ type: string; value: number; duration?: number }>;
  animation: string;
  description: string;
}

// ---- internal serialisation shape -----------------------------------------

interface SerializedLBData {
  individualMeters: Array<[string, LimitBreakMeter]>;
  partyMeter: PartyMeter;
}

// ---- charge constants -----------------------------------------------------

const CHARGE_DAMAGE_DEALT = 2; // per 100 damage dealt
const CHARGE_DAMAGE_TAKEN = 5; // per 100 damage taken (taking hits charges more)
const CHARGE_HEAL = 1; // per 100 healing
const CHARGE_KILL = 8; // flat per kill
const CHARGE_PERFECT_DODGE = 6; // flat per perfect dodge
const CHARGE_CRITICAL_HIT = 4; // flat per crit
const CHARGE_COMBO_BASE = 5; // base per combo completion
const CHARGE_COMBO_PERFECT = 3; // extra per perfect input in a combo
const PASSIVE_CHARGE_RATE = 0.1; // per second

// ---------------------------------------------------------------------------
// Pre-defined Limit Breaks
// ---------------------------------------------------------------------------

function buildDefaultLimitBreaks(): LimitBreak[] {
  return [
    // ---- Individual ----
    {
      id: 'lb_knight',
      name: 'Sword of Kings',
      classId: 'knight',
      type: 'individual',
      damage: 5.0,
      effects: [
        { type: 'damage', value: 5.0 },
        { type: 'buff_def', value: 1.3, duration: 10 },
      ],
      animation: 'lb_sword_of_kings',
      description: '5x damage single target strike + party DEF buff for 10 s.',
    },
    {
      id: 'lb_barbarian',
      name: 'Cataclysmic Rage',
      classId: 'barbarian',
      type: 'individual',
      damage: 8.0,
      effects: [
        { type: 'aoe_damage', value: 8.0 },
        { type: 'self_heal', value: 0.5 },
      ],
      animation: 'lb_cataclysmic_rage',
      description: '8x damage AoE + self-heal 50 % of max HP.',
    },
    {
      id: 'lb_rogue',
      name: 'Thousand Cuts',
      classId: 'rogue',
      type: 'individual',
      damage: 10.0, // 20 hits x 0.5
      effects: [{ type: 'multi_hit', value: 20 }],
      animation: 'lb_thousand_cuts',
      description: '20-hit rapid attack, 0.5x each = 10x total damage.',
    },
    {
      id: 'lb_ranger',
      name: 'Starfall',
      classId: 'ranger',
      type: 'individual',
      damage: 15.0, // 15 arrows x 1.0
      effects: [{ type: 'multi_hit', value: 15 }],
      animation: 'lb_starfall',
      description: '15 arrows rain from the sky, each dealing 1x damage.',
    },
    {
      id: 'lb_sorcerer',
      name: 'Arcane Apocalypse',
      classId: 'sorcerer',
      type: 'individual',
      damage: 6.0,
      effects: [
        { type: 'aoe_damage', value: 6.0 },
        { type: 'random_element', value: 1 },
      ],
      animation: 'lb_arcane_apocalypse',
      description: '6x damage to all enemies with random elemental effects.',
    },
    {
      id: 'lb_cleric',
      name: 'Divine Intervention',
      classId: 'cleric',
      type: 'individual',
      damage: 0,
      effects: [
        { type: 'party_heal', value: 1.0 },
        { type: 'revive', value: 1 },
        { type: 'invulnerability', value: 1, duration: 10 },
      ],
      animation: 'lb_divine_intervention',
      description: 'Full party heal + revive all fallen + 10 s invulnerability.',
    },
    {
      id: 'lb_paladin',
      name: 'Holy Judgment',
      classId: 'paladin',
      type: 'individual',
      damage: 4.0,
      effects: [
        { type: 'aoe_holy_damage', value: 4.0 },
        { type: 'party_heal', value: 0.3 },
      ],
      animation: 'lb_holy_judgment',
      description: '4x holy damage to all enemies + heal party 30 %.',
    },

    // ---- Party ----
    {
      id: 'lb_convergence',
      name: 'Convergence',
      classId: 'party',
      type: 'party',
      damage: 3.0, // per member
      effects: [
        { type: 'synergy_attack', value: 3.0 },
        { type: 'visual_synergy', value: 1 },
      ],
      animation: 'lb_convergence',
      description:
        'All party members attack simultaneously, each dealing 3x damage with a visual synergy effect.',
    },
  ];
}

// ---------------------------------------------------------------------------
// LimitBreakSystem
// ---------------------------------------------------------------------------

export class LimitBreakSystem {
  private individualMeters: Map<string, LimitBreakMeter>;
  private partyMeter: PartyMeter;
  private limitBreaks: Map<string, LimitBreak>; // keyed by `${classId}_${type}`
  /** Maps characterId → classId for limit break lookups. */
  private characterClassMap: Map<string, string>;

  constructor() {
    this.individualMeters = new Map<string, LimitBreakMeter>();
    this.limitBreaks = new Map<string, LimitBreak>();
    this.characterClassMap = new Map<string, string>();
    this.partyMeter = {
      current: 0,
      max: 100,
      chargeRate: 1.0,
      ready: false,
      level: 0,
    };
  }

  // ---- Meter management ---------------------------------------------------

  initializeMeter(characterId: string, chargeRate: number = 1.0, classId?: string): void {
    this.individualMeters.set(characterId, {
      current: 0,
      max: 100,
      chargeRate,
      ready: false,
    });
    if (classId) {
      this.characterClassMap.set(characterId, classId);
    }
  }

  /** Register the class for a character so limit breaks resolve correctly. */
  registerCharacterClass(characterId: string, classId: string): void {
    this.characterClassMap.set(characterId, classId);
  }

  // ---- Charging -----------------------------------------------------------

  private addCharge(characterId: string, amount: number): void {
    const meter = this.individualMeters.get(characterId);
    if (!meter) {
      return;
    }
    meter.current = Math.min(meter.max, meter.current + amount * meter.chargeRate);
    meter.ready = meter.current >= meter.max;
    this.updatePartyMeter();
  }

  onDamageDealt(characterId: string, damage: number): void {
    this.addCharge(characterId, (damage / 100) * CHARGE_DAMAGE_DEALT);
  }

  onDamageTaken(characterId: string, damage: number): void {
    this.addCharge(characterId, (damage / 100) * CHARGE_DAMAGE_TAKEN);
  }

  onHeal(characterId: string, amount: number): void {
    this.addCharge(characterId, (amount / 100) * CHARGE_HEAL);
  }

  onKill(characterId: string): void {
    this.addCharge(characterId, CHARGE_KILL);
  }

  onPerfectDodge(characterId: string): void {
    this.addCharge(characterId, CHARGE_PERFECT_DODGE);
  }

  onCriticalHit(characterId: string): void {
    this.addCharge(characterId, CHARGE_CRITICAL_HIT);
  }

  onComboComplete(characterId: string, perfectCount: number): void {
    this.addCharge(
      characterId,
      CHARGE_COMBO_BASE + CHARGE_COMBO_PERFECT * perfectCount,
    );
  }

  // ---- Party meter --------------------------------------------------------

  updatePartyMeter(): void {
    let metersAboveHalf = 0;
    let totalCharge = 0;

    for (const meter of this.individualMeters.values()) {
      totalCharge += meter.current;
      if (meter.current >= meter.max * 0.5) {
        metersAboveHalf++;
      }
    }

    // Party level = number of individual meters >= 50 %, capped at 3
    this.partyMeter.level = Math.min(3, metersAboveHalf);

    // Party meter current = average of individual meters
    const count = this.individualMeters.size;
    this.partyMeter.current =
      count > 0 ? Math.min(this.partyMeter.max, totalCharge / count) : 0;
    this.partyMeter.ready = this.partyMeter.level >= 3;
  }

  getPartyLevel(): number {
    return this.partyMeter.level;
  }

  // ---- Execution ----------------------------------------------------------

  canUseLimitBreak(characterId: string): boolean {
    const meter = this.individualMeters.get(characterId);
    return meter !== undefined && meter.ready;
  }

  canUsePartyLimitBreak(): boolean {
    return this.partyMeter.ready;
  }

  executeLimitBreak(characterId: string): LimitBreak | null {
    if (!this.canUseLimitBreak(characterId)) {
      return null;
    }

    // Look up the character's classId from the registered mapping
    const classId = this.characterClassMap.get(characterId);

    let found: LimitBreak | null = null;

    // Try to find via classId mapping first
    if (classId) {
      found = this.limitBreaks.get(`${classId}_individual`) ?? null;
    }

    // Fallback: try characterId as classId (for cases where characterId IS the classId)
    if (!found) {
      found = this.limitBreaks.get(`${characterId}_individual`) ?? null;
    }

    if (!found) {
      return null;
    }

    // Consume meter
    this.resetMeter(characterId);
    return { ...found, effects: found.effects.map((e) => ({ ...e })) };
  }

  executePartyLimitBreak(partyClassIds: string[]): LimitBreak | null {
    if (!this.canUsePartyLimitBreak()) {
      return null;
    }

    const convergence = this.limitBreaks.get('party_party');
    if (!convergence) {
      return null;
    }

    // Drain all individual meters
    for (const [id] of this.individualMeters) {
      this.resetMeter(id);
    }

    // Scale damage by number of party members
    const scaledLb: LimitBreak = {
      ...convergence,
      damage: convergence.damage * partyClassIds.length,
      effects: convergence.effects.map((e) => ({ ...e })),
    };

    return scaledLb;
  }

  // ---- State --------------------------------------------------------------

  getMeter(characterId: string): LimitBreakMeter | undefined {
    return this.individualMeters.get(characterId);
  }

  getPartyMeter(): PartyMeter {
    return { ...this.partyMeter };
  }

  getAllMeters(): Map<string, LimitBreakMeter> {
    return new Map(this.individualMeters);
  }

  // ---- Update (passive charge) --------------------------------------------

  update(dt: number): void {
    for (const meter of this.individualMeters.values()) {
      if (!meter.ready) {
        meter.current = Math.min(
          meter.max,
          meter.current + PASSIVE_CHARGE_RATE * dt * meter.chargeRate,
        );
        meter.ready = meter.current >= meter.max;
      }
    }
    this.updatePartyMeter();
  }

  // ---- Reset --------------------------------------------------------------

  resetMeter(characterId: string): void {
    const meter = this.individualMeters.get(characterId);
    if (meter) {
      meter.current = 0;
      meter.ready = false;
    }
    this.updatePartyMeter();
  }

  resetAll(): void {
    for (const meter of this.individualMeters.values()) {
      meter.current = 0;
      meter.ready = false;
    }
    this.partyMeter.current = 0;
    this.partyMeter.ready = false;
    this.partyMeter.level = 0;
  }

  // ---- Registration -------------------------------------------------------

  registerLimitBreaks(): void {
    const defaults = buildDefaultLimitBreaks();
    for (const lb of defaults) {
      const key = `${lb.classId}_${lb.type}`;
      this.limitBreaks.set(key, lb);
    }
  }

  getLimitBreak(
    classId: string,
    type: 'individual' | 'party',
  ): LimitBreak | undefined {
    return this.limitBreaks.get(`${classId}_${type}`);
  }

  // ---- Serialization ------------------------------------------------------

  serialize(): object {
    const metersArr: Array<[string, LimitBreakMeter]> = [];
    for (const [key, value] of this.individualMeters) {
      metersArr.push([key, { ...value }]);
    }

    const data: SerializedLBData = {
      individualMeters: metersArr,
      partyMeter: { ...this.partyMeter },
    };

    return data;
  }

  deserialize(data: object): void {
    const parsed = data as SerializedLBData;

    this.individualMeters.clear();
    if (parsed.individualMeters) {
      for (const [key, value] of parsed.individualMeters) {
        this.individualMeters.set(key, { ...value });
      }
    }

    if (parsed.partyMeter) {
      this.partyMeter = { ...parsed.partyMeter };
    }
  }
}
