/**
 * PartyManager.ts — Party composition, formation, and morale management.
 *
 * Max party size is 6 members arranged in front/back lines. Includes
 * morale tracking and special handling for Crag Hack (unique class,
 * personal quest tracking, Obsidian Affinity passive).
 */

import balanceData from '@/data/balance.json';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PARTY_SIZE = balanceData.partySize.max; // 6

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FormationRow = 'front' | 'back';

// ---------------------------------------------------------------------------
// Interfaces (JSON-serializable)
// ---------------------------------------------------------------------------

export interface PartyMemberState {
  id: string;
  name: string;
  classId: string;
  level: number;
  isLeader: boolean;
  morale: number;
  formation: FormationRow;
  /** References to external system states (by character id). */
  statsRef: string;
  inventoryRef: string;
  spellBookRef: string;
  levelingRef: string;
  /** Unspent skill points available for skill tree. */
  skillPoints: number;
  /** Crag Hack specific */
  isCragHack: boolean;
  personalQuestId: string | null;
  personalQuestComplete: boolean;
}

export interface PartyState {
  members: PartyMemberState[];
  leaderId: string | null;
}

// ---------------------------------------------------------------------------
// Morale constants
// ---------------------------------------------------------------------------

const MORALE_MIN = 0;
const MORALE_MAX = 100;
const MORALE_DEFAULT = 50;

// Morale thresholds for combat performance modifiers.
export const MORALE_THRESHOLDS = {
  /** Below this: -10% damage, -5% accuracy */
  LOW: 25,
  /** Above this: +10% damage, +5% crit */
  HIGH: 75,
  /** Above this: +20% damage, +10% crit, occasional bonus attacks */
  EXCELLENT: 90,
} as const;

// ---------------------------------------------------------------------------
// PartyManager class
// ---------------------------------------------------------------------------

export class PartyManager {
  private state: PartyState;

  constructor(state: PartyState) {
    this.state = {
      members: state.members.map((m) => ({ ...m })),
      leaderId: state.leaderId,
    };
  }

  // -----------------------------------------------------------------------
  // Party composition
  // -----------------------------------------------------------------------

  /**
   * Add a member to the party. Returns true on success.
   * Fails if the party is full or a member with the same id already exists.
   */
  addMember(member: PartyMemberState): boolean {
    if (this.state.members.length >= MAX_PARTY_SIZE) return false;
    if (this.state.members.some((m) => m.id === member.id)) return false;

    this.state.members.push({ ...member });

    // If this is the first member, make them the leader.
    if (this.state.members.length === 1) {
      this.setLeader(member.id);
    }

    return true;
  }

  /**
   * Remove a member from the party.
   * The leader cannot be removed unless they are the last member.
   */
  removeMember(id: string): boolean {
    const idx = this.state.members.findIndex((m) => m.id === id);
    if (idx === -1) return false;

    // Prevent removing the leader unless they're the only member.
    if (this.state.leaderId === id && this.state.members.length > 1) {
      return false;
    }

    this.state.members.splice(idx, 1);

    if (this.state.leaderId === id) {
      this.state.leaderId =
        this.state.members.length > 0 ? this.state.members[0].id : null;
    }

    return true;
  }

  setLeader(id: string): boolean {
    const member = this.state.members.find((m) => m.id === id);
    if (!member) return false;

    // Clear old leader flag.
    for (const m of this.state.members) {
      m.isLeader = false;
    }

    member.isLeader = true;
    this.state.leaderId = id;
    return true;
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  getParty(): ReadonlyArray<PartyMemberState> {
    return this.state.members;
  }

  getMember(id: string): PartyMemberState | undefined {
    return this.state.members.find((m) => m.id === id);
  }

  getLeader(): PartyMemberState | undefined {
    return this.state.members.find((m) => m.id === this.state.leaderId);
  }

  getPartySize(): number {
    return this.state.members.length;
  }

  isFull(): boolean {
    return this.state.members.length >= MAX_PARTY_SIZE;
  }

  hasMember(id: string): boolean {
    return this.state.members.some((m) => m.id === id);
  }

  getMemberIds(): string[] {
    return this.state.members.map((m) => m.id);
  }

  // -----------------------------------------------------------------------
  // Formation
  // -----------------------------------------------------------------------

  /** Get members in the front line. */
  getFrontLine(): PartyMemberState[] {
    return this.state.members.filter((m) => m.formation === 'front');
  }

  /** Get members in the back line. */
  getBackLine(): PartyMemberState[] {
    return this.state.members.filter((m) => m.formation === 'back');
  }

  /** Move a member between front and back lines. */
  setFormation(id: string, row: FormationRow): boolean {
    const member = this.state.members.find((m) => m.id === id);
    if (!member) return false;
    member.formation = row;
    return true;
  }

  /**
   * Auto-assign formation based on class.
   * Melee/tank classes go to front, ranged/caster classes go to back.
   */
  autoFormation(): void {
    const meleeClasses = new Set(['knight', 'paladin', 'barbarian', 'rogue']);
    for (const member of this.state.members) {
      member.formation = meleeClasses.has(member.classId) ? 'front' : 'back';
    }
  }

  // -----------------------------------------------------------------------
  // Morale
  // -----------------------------------------------------------------------

  getMorale(id: string): number {
    return this.state.members.find((m) => m.id === id)?.morale ?? 0;
  }

  /** Get average party morale. */
  getAverageMorale(): number {
    if (this.state.members.length === 0) return 0;
    const total = this.state.members.reduce((sum, m) => sum + m.morale, 0);
    return total / this.state.members.length;
  }

  /**
   * Adjust morale for a specific member.
   */
  adjustMorale(id: string, amount: number): void {
    const member = this.state.members.find((m) => m.id === id);
    if (!member) return;
    member.morale = clampMorale(member.morale + amount);
  }

  /**
   * Adjust morale for the entire party.
   */
  adjustPartyMorale(amount: number): void {
    for (const member of this.state.members) {
      member.morale = clampMorale(member.morale + amount);
    }
  }

  /**
   * Get the combat performance modifier for a member based on morale.
   */
  getMoraleModifier(id: string): { damageModifier: number; critModifier: number } {
    const morale = this.getMorale(id);

    if (morale >= MORALE_THRESHOLDS.EXCELLENT) {
      return { damageModifier: 1.20, critModifier: 10 };
    }
    if (morale >= MORALE_THRESHOLDS.HIGH) {
      return { damageModifier: 1.10, critModifier: 5 };
    }
    if (morale <= MORALE_THRESHOLDS.LOW) {
      return { damageModifier: 0.90, critModifier: -5 };
    }
    return { damageModifier: 1.0, critModifier: 0 };
  }

  // -----------------------------------------------------------------------
  // Crag Hack special handling
  // -----------------------------------------------------------------------

  /** Check if Crag Hack is in the party. */
  hasCragHack(): boolean {
    return this.state.members.some((m) => m.isCragHack);
  }

  /** Get Crag Hack's member state if he's in the party. */
  getCragHack(): PartyMemberState | undefined {
    return this.state.members.find((m) => m.isCragHack);
  }

  /**
   * Update Crag Hack's personal quest status.
   */
  setCragHackQuestComplete(complete: boolean): void {
    const crag = this.getCragHack();
    if (crag) {
      crag.personalQuestComplete = complete;
    }
  }

  // -----------------------------------------------------------------------
  // Level sync
  // -----------------------------------------------------------------------

  /** Update a member's level (called after LevelingSystem level-up). */
  updateMemberLevel(id: string, newLevel: number): void {
    const member = this.state.members.find((m) => m.id === id);
    if (member) {
      member.level = newLevel;
    }
  }

  /** Update a member's skill points. */
  updateSkillPoints(id: string, points: number): void {
    const member = this.state.members.find((m) => m.id === id);
    if (member) {
      member.skillPoints = points;
    }
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  getState(): PartyState {
    return {
      members: this.state.members.map((m) => ({ ...m })),
      leaderId: this.state.leaderId,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampMorale(value: number): number {
  return Math.max(MORALE_MIN, Math.min(MORALE_MAX, Math.round(value)));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPartyState(): PartyState {
  return {
    members: [],
    leaderId: null,
  };
}

/**
 * Create a PartyMemberState for a new character.
 */
export function createPartyMember(
  id: string,
  name: string,
  classId: string,
  level: number = 1,
  isCragHack: boolean = false,
): PartyMemberState {
  const meleeClasses = new Set(['knight', 'paladin', 'barbarian', 'rogue']);

  return {
    id,
    name,
    classId,
    level,
    isLeader: false,
    morale: MORALE_DEFAULT,
    formation: meleeClasses.has(classId) ? 'front' : 'back',
    statsRef: id,
    inventoryRef: id,
    spellBookRef: id,
    levelingRef: id,
    skillPoints: 0,
    isCragHack,
    personalQuestId: isCragHack ? 'forged-in-fury' : null,
    personalQuestComplete: false,
  };
}

/**
 * Create the Crag Hack party member with appropriate defaults.
 */
export function createCragHackMember(level: number = 5): PartyMemberState {
  return createPartyMember('crag-hack', 'Crag Hack', 'barbarian', level, true);
}
