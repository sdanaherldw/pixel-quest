/**
 * QuestSystem.ts — Quest tracking, objectives, branching, and rewards.
 *
 * Loads quest definitions from data/quests/forest-quests.json and provides
 * methods for starting, progressing, and completing quests with support for
 * branching choices and prerequisite checking.
 */

import forestQuestsData from '@/data/quests/forest-quests.json';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum QuestState {
  UNKNOWN = 'unknown',
  AVAILABLE = 'available',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum ObjectiveState {
  INCOMPLETE = 'incomplete',
  COMPLETE = 'complete',
}

// ---------------------------------------------------------------------------
// Interfaces — Quest definitions (read from JSON)
// ---------------------------------------------------------------------------

export interface QuestObjectiveDef {
  id: number;
  description: string;
  type: string;
  target: string;
  count?: number;
  location?: string;
  journal?: string;
  triggerDialogue?: string;
  options?: QuestChoiceOption[];
  specialRules?: Record<string, unknown>;
  enemies?: string[];
}

export interface QuestChoiceOption {
  id: string;
  description: string;
  type?: string;
  target?: string;
  condition?: Record<string, unknown>;
  setOutcome?: string;
}

export interface QuestRewardDef {
  xp?: number;
  gold?: number;
  items?: string[];
  reputation?: Record<string, number>;
  unlocks?: string[];
  companionBonus?: Record<string, unknown>;
}

export interface QuestDef {
  id: string;
  name: string;
  type: string;
  region: string;
  level: { recommended: number; minimum: number };
  giver: string;
  description: string;
  journal: string;
  objectives: QuestObjectiveDef[];
  optionalObjectives?: QuestObjectiveDef[];
  rewards: QuestRewardDef | Record<string, QuestRewardDef>;
  flags?: { onAccept?: string[]; onComplete?: string[] };
  prerequisite?: Record<string, unknown>;
  branchCondition?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Interfaces — Quest progress (serializable state)
// ---------------------------------------------------------------------------

export interface QuestProgress {
  questId: string;
  state: QuestState;
  currentObjective: number;
  objectiveStates: Record<number, ObjectiveState>;
  /** Counts for collection-type objectives. */
  objectiveCounts: Record<number, number>;
  flags: string[];
  outcome: string | null;
  choicesMade: Record<number, string>;
}

export interface QuestSystemState {
  activeQuests: Record<string, QuestProgress>;
  completedQuests: string[];
  failedQuests: string[];
  globalFlags: string[];
  reputation: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Event callbacks
// ---------------------------------------------------------------------------

export interface QuestEventCallbacks {
  onQuestStart?: (questId: string) => void;
  onObjectiveComplete?: (questId: string, objectiveId: number) => void;
  onQuestComplete?: (questId: string, rewards: QuestRewardDef) => void;
  onQuestFailed?: (questId: string) => void;
}

// ---------------------------------------------------------------------------
// Internal: load quest definitions
// ---------------------------------------------------------------------------

interface RawQuestFile {
  region: string;
  regionName: string;
  quests: Array<Record<string, unknown>>;
}

const questMap = new Map<string, QuestDef>();

function loadQuestsFromRaw(raw: RawQuestFile): void {
  for (const q of raw.quests) {
    const def = q as unknown as QuestDef;
    questMap.set(def.id, def);
  }
}

loadQuestsFromRaw(forestQuestsData as unknown as RawQuestFile);

// ---------------------------------------------------------------------------
// QuestSystem class
// ---------------------------------------------------------------------------

export class QuestSystem {
  private state: QuestSystemState;
  private callbacks: QuestEventCallbacks;

  constructor(state: QuestSystemState, callbacks: QuestEventCallbacks = {}) {
    this.state = {
      activeQuests: {},
      completedQuests: [...state.completedQuests],
      failedQuests: [...state.failedQuests],
      globalFlags: [...state.globalFlags],
      reputation: { ...state.reputation },
    };
    // Deep-clone active quests
    for (const [k, v] of Object.entries(state.activeQuests)) {
      this.state.activeQuests[k] = {
        ...v,
        objectiveStates: { ...v.objectiveStates },
        objectiveCounts: { ...v.objectiveCounts },
        flags: [...v.flags],
        choicesMade: { ...v.choicesMade },
      };
    }
    this.callbacks = callbacks;
  }

  // -----------------------------------------------------------------------
  // Quest lookup
  // -----------------------------------------------------------------------

  getQuestDef(id: string): QuestDef | undefined {
    return questMap.get(id);
  }

  getAllQuestDefs(): QuestDef[] {
    return Array.from(questMap.values());
  }

  // -----------------------------------------------------------------------
  // Quest state queries
  // -----------------------------------------------------------------------

  getQuestState(id: string): QuestState {
    if (this.state.completedQuests.includes(id)) return QuestState.COMPLETED;
    if (this.state.failedQuests.includes(id)) return QuestState.FAILED;
    if (this.state.activeQuests[id]) return QuestState.ACTIVE;
    return QuestState.UNKNOWN;
  }

  getActiveQuests(): QuestProgress[] {
    return Object.values(this.state.activeQuests);
  }

  getQuestProgress(id: string): QuestProgress | undefined {
    return this.state.activeQuests[id];
  }

  // -----------------------------------------------------------------------
  // Start quest
  // -----------------------------------------------------------------------

  startQuest(id: string): boolean {
    if (this.state.activeQuests[id]) return false; // already active
    if (this.state.completedQuests.includes(id)) return false; // already done
    const def = questMap.get(id);
    if (!def) return false;

    const progress: QuestProgress = {
      questId: id,
      state: QuestState.ACTIVE,
      currentObjective: 0,
      objectiveStates: {},
      objectiveCounts: {},
      flags: [],
      outcome: null,
      choicesMade: {},
    };

    // Mark first objective as incomplete.
    for (const obj of def.objectives) {
      progress.objectiveStates[obj.id] = ObjectiveState.INCOMPLETE;
      if (obj.count !== undefined) {
        progress.objectiveCounts[obj.id] = 0;
      }
    }

    this.state.activeQuests[id] = progress;

    // Set onAccept flags
    if (def.flags?.onAccept) {
      for (const flag of def.flags.onAccept) {
        this.addFlag(flag);
        progress.flags.push(flag);
      }
    }

    this.callbacks.onQuestStart?.(id);
    return true;
  }

  // -----------------------------------------------------------------------
  // Objective updates
  // -----------------------------------------------------------------------

  /**
   * Update progress on a specific objective.
   *
   * @param questId      - The quest id.
   * @param objectiveId  - The objective index/id.
   * @param progressAmount - Amount to increment (for collection types).
   * @param choiceId     - If this is a choice objective, which option.
   */
  updateObjective(
    questId: string,
    objectiveId: number,
    progressAmount: number = 1,
    choiceId?: string,
  ): boolean {
    const progress = this.state.activeQuests[questId];
    if (!progress) return false;
    if (progress.state !== QuestState.ACTIVE) return false;

    const def = questMap.get(questId);
    if (!def) return false;

    const objDef = def.objectives.find((o) => o.id === objectiveId);
    if (!objDef) return false;

    // Already complete?
    if (progress.objectiveStates[objectiveId] === ObjectiveState.COMPLETE) {
      return false;
    }

    // Choice objectives
    if (objDef.type === 'choice' && choiceId) {
      progress.choicesMade[objectiveId] = choiceId;
      const option = objDef.options?.find((o) => o.id === choiceId);
      if (option?.setOutcome) {
        progress.outcome = option.setOutcome;
      }
      progress.objectiveStates[objectiveId] = ObjectiveState.COMPLETE;
      this.callbacks.onObjectiveComplete?.(questId, objectiveId);
      this.advanceObjective(questId, progress);
      return true;
    }

    // Collection objectives
    if (objDef.count !== undefined) {
      progress.objectiveCounts[objectiveId] =
        (progress.objectiveCounts[objectiveId] ?? 0) + progressAmount;
      if (progress.objectiveCounts[objectiveId] >= objDef.count) {
        progress.objectiveStates[objectiveId] = ObjectiveState.COMPLETE;
        this.callbacks.onObjectiveComplete?.(questId, objectiveId);
        this.advanceObjective(questId, progress);
      }
      return true;
    }

    // Simple completion (defeat, reach, interact, talk_to, etc.)
    progress.objectiveStates[objectiveId] = ObjectiveState.COMPLETE;
    this.callbacks.onObjectiveComplete?.(questId, objectiveId);
    this.advanceObjective(questId, progress);
    return true;
  }

  private advanceObjective(questId: string, progress: QuestProgress): void {
    const def = questMap.get(questId);
    if (!def) return;

    // Move to next incomplete objective.
    for (const obj of def.objectives) {
      if (progress.objectiveStates[obj.id] === ObjectiveState.INCOMPLETE) {
        progress.currentObjective = obj.id;
        return;
      }
    }

    // All objectives complete => complete the quest.
    this.completeQuest(questId);
  }

  // -----------------------------------------------------------------------
  // Complete / fail quest
  // -----------------------------------------------------------------------

  completeQuest(id: string): QuestRewardDef | null {
    const progress = this.state.activeQuests[id];
    if (!progress) return null;

    const def = questMap.get(id);
    if (!def) return null;

    progress.state = QuestState.COMPLETED;

    // Resolve rewards (may be outcome-based).
    let rewards: QuestRewardDef;
    if (progress.outcome && typeof def.rewards === 'object' && !('xp' in def.rewards)) {
      // Branching rewards keyed by outcome.
      const outcomeLookup = progress.outcome.replace('sheep-', '').replace('bandits-', '');
      rewards = (def.rewards as Record<string, QuestRewardDef>)[outcomeLookup] ??
        (def.rewards as Record<string, QuestRewardDef>)[progress.outcome] ?? {};
    } else {
      rewards = def.rewards as QuestRewardDef;
    }

    // Apply reputation.
    if (rewards.reputation) {
      for (const [faction, amount] of Object.entries(rewards.reputation)) {
        this.state.reputation[faction] =
          (this.state.reputation[faction] ?? 0) + amount;
      }
    }

    // Set onComplete flags.
    if (def.flags?.onComplete) {
      for (const flag of def.flags.onComplete) {
        this.addFlag(flag);
      }
    }

    // Move to completed list.
    delete this.state.activeQuests[id];
    this.state.completedQuests.push(id);

    this.callbacks.onQuestComplete?.(id, rewards);
    return rewards;
  }

  failQuest(id: string): boolean {
    const progress = this.state.activeQuests[id];
    if (!progress) return false;

    progress.state = QuestState.FAILED;
    delete this.state.activeQuests[id];
    this.state.failedQuests.push(id);

    this.callbacks.onQuestFailed?.(id);
    return true;
  }

  // -----------------------------------------------------------------------
  // Prerequisites / conditions
  // -----------------------------------------------------------------------

  /**
   * Check whether a quest's prerequisites are met.
   *
   * @param questId      - The quest to check.
   * @param characterLevel - The party leader's level.
   * @param partyCharacterIds - IDs of recruited party members.
   */
  checkConditions(
    questId: string,
    characterLevel: number,
    partyCharacterIds: string[] = [],
  ): boolean {
    const def = questMap.get(questId);
    if (!def) return false;

    // Level requirement
    if (characterLevel < def.level.minimum) return false;

    // Prerequisite flags / quests
    if (def.prerequisite) {
      const prereq = def.prerequisite;
      if (prereq.recruited && !partyCharacterIds.includes(prereq.recruited as string)) {
        return false;
      }
      // Could add more prerequisite types here.
    }

    return true;
  }

  // -----------------------------------------------------------------------
  // Flags
  // -----------------------------------------------------------------------

  hasFlag(flag: string): boolean {
    return this.state.globalFlags.includes(flag);
  }

  addFlag(flag: string): void {
    if (!this.state.globalFlags.includes(flag)) {
      this.state.globalFlags.push(flag);
    }
  }

  removeFlag(flag: string): void {
    const idx = this.state.globalFlags.indexOf(flag);
    if (idx !== -1) this.state.globalFlags.splice(idx, 1);
  }

  getReputation(faction: string): number {
    return this.state.reputation[faction] ?? 0;
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  getState(): QuestSystemState {
    const activeQuests: Record<string, QuestProgress> = {};
    for (const [k, v] of Object.entries(this.state.activeQuests)) {
      activeQuests[k] = {
        ...v,
        objectiveStates: { ...v.objectiveStates },
        objectiveCounts: { ...v.objectiveCounts },
        flags: [...v.flags],
        choicesMade: { ...v.choicesMade },
      };
    }
    return {
      activeQuests,
      completedQuests: [...this.state.completedQuests],
      failedQuests: [...this.state.failedQuests],
      globalFlags: [...this.state.globalFlags],
      reputation: { ...this.state.reputation },
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createQuestSystemState(): QuestSystemState {
  return {
    activeQuests: {},
    completedQuests: [],
    failedQuests: [],
    globalFlags: [],
    reputation: {},
  };
}
