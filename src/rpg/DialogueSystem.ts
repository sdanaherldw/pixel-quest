/**
 * DialogueSystem.ts — Dialogue tree traversal and condition evaluation.
 *
 * Loads dialogue files from data/dialogues/ and provides a stateful
 * dialogue runner that walks nodes, evaluates conditions, and executes
 * actions (quest acceptance, item grants, flag setting, etc.).
 */

import farmerBrambleDialogue from '@/data/dialogues/farmer-bramble.json';
import cragHackRecruitmentDialogue from '@/data/dialogues/crag-hack-recruitment.json';
import elderOakworthDialogue from '@/data/dialogues/elder-oakworth.json';

// ---------------------------------------------------------------------------
// Interfaces — Dialogue definition (loaded from JSON)
// ---------------------------------------------------------------------------

export interface DialogueAction {
  type: string;
  questId?: string;
  items?: string[];
  rewards?: Record<string, unknown>;
  setFlag?: string;
  flags?: string[];
  characterId?: string;
  [key: string]: unknown;
}

export interface DialogueCondition {
  questProgress?: string;
  outcome?: string;
  flag?: string;
  stat?: string;
  min?: number;
  [key: string]: unknown;
}

export interface DialogueChoice {
  text: string;
  next: string;
  condition?: DialogueCondition;
}

export interface DialogueNode {
  text: string;
  choices: DialogueChoice[];
  action?: DialogueAction;
  condition?: DialogueCondition;
}

export interface DialogueFileDef {
  id: string;
  speaker: string;
  context?: string;
  portrait?: string;
  nodes: Record<string, DialogueNode>;
}

// ---------------------------------------------------------------------------
// Interfaces — Runtime state (JSON-serializable)
// ---------------------------------------------------------------------------

export interface DialogueSessionState {
  dialogueId: string;
  currentNodeId: string;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Evaluation context the host game provides
// ---------------------------------------------------------------------------

export interface DialogueContext {
  /** Global game flags. */
  flags: string[];
  /** Quest states keyed by quest id. */
  questStates: Record<string, { state: string; outcome?: string }>;
  /** Character primary stats for stat checks. */
  characterStats: Record<string, number>;
  /** Items the party is carrying (id -> count). */
  inventory: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Event callbacks
// ---------------------------------------------------------------------------

export interface DialogueEventCallbacks {
  onDialogueStart?: (dialogueId: string, speaker: string) => void;
  onDialogueEnd?: (dialogueId: string) => void;
  onAction?: (action: DialogueAction) => void;
}

// ---------------------------------------------------------------------------
// Internal: load dialogue files
// ---------------------------------------------------------------------------

const dialogueMap = new Map<string, DialogueFileDef>();

function registerDialogue(raw: Record<string, unknown>): void {
  const def = raw as unknown as DialogueFileDef;
  dialogueMap.set(def.id, def);
}

registerDialogue(farmerBrambleDialogue as unknown as Record<string, unknown>);
registerDialogue(cragHackRecruitmentDialogue as unknown as Record<string, unknown>);
registerDialogue(elderOakworthDialogue as unknown as Record<string, unknown>);

/** Register additional dialogue files at runtime. */
export function registerDialogueFile(def: DialogueFileDef): void {
  dialogueMap.set(def.id, def);
}

// ---------------------------------------------------------------------------
// DialogueSystem class
// ---------------------------------------------------------------------------

export class DialogueSystem {
  private session: DialogueSessionState | null = null;
  private callbacks: DialogueEventCallbacks;

  constructor(callbacks: DialogueEventCallbacks = {}) {
    this.callbacks = callbacks;
  }

  // -----------------------------------------------------------------------
  // Dialogue lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start a dialogue by id. Enters the "start" node.
   * Returns true if the dialogue was found and started.
   */
  startDialogue(dialogueId: string, context: DialogueContext): boolean {
    const def = dialogueMap.get(dialogueId);
    if (!def) return false;

    // Find the appropriate starting node.
    // Some dialogues have conditional entry points (e.g. return nodes).
    let startNode = 'start';
    for (const [nodeId, node] of Object.entries(def.nodes)) {
      if (node.condition && nodeId !== 'start') {
        if (this.evaluateCondition(node.condition, context)) {
          startNode = nodeId;
          break;
        }
      }
    }

    this.session = {
      dialogueId,
      currentNodeId: startNode,
      isActive: true,
    };

    this.callbacks.onDialogueStart?.(dialogueId, def.speaker);

    // Execute the initial node's action (if any).
    const currentNode = def.nodes[startNode];
    if (currentNode?.action) {
      this.callbacks.onAction?.(currentNode.action);
    }

    return true;
  }

  /**
   * Select a choice by index. Advances to the next node.
   * Returns the new DialogueNode, or null if the dialogue ended.
   */
  selectChoice(index: number, context: DialogueContext): DialogueNode | null {
    if (!this.session?.isActive) return null;

    const def = dialogueMap.get(this.session.dialogueId);
    if (!def) return null;

    const currentNode = def.nodes[this.session.currentNodeId];
    if (!currentNode) return null;

    // Filter choices by condition.
    const availableChoices = this.getAvailableChoices(currentNode, context);
    if (index < 0 || index >= availableChoices.length) return null;

    const choice = availableChoices[index];
    const nextNodeId = choice.next;
    const nextNode = def.nodes[nextNodeId];

    if (!nextNode) {
      // End of dialogue.
      this.endDialogue();
      return null;
    }

    this.session.currentNodeId = nextNodeId;

    // Execute action on the new node.
    if (nextNode.action) {
      this.callbacks.onAction?.(nextNode.action);
    }

    // If no choices remain, dialogue ends after this node.
    if (nextNode.choices.length === 0) {
      // The node is displayed, then dialogue ends.
      this.session.isActive = false;
      this.callbacks.onDialogueEnd?.(this.session.dialogueId);
    }

    return nextNode;
  }

  /** Get the current dialogue node. */
  getCurrentNode(): DialogueNode | null {
    if (!this.session?.isActive) return null;
    const def = dialogueMap.get(this.session.dialogueId);
    if (!def) return null;
    return def.nodes[this.session.currentNodeId] ?? null;
  }

  /** Get available choices for the current node (filtered by conditions). */
  getCurrentChoices(context: DialogueContext): DialogueChoice[] {
    const node = this.getCurrentNode();
    if (!node) return [];
    return this.getAvailableChoices(node, context);
  }

  /** Get the speaker name for the current dialogue. */
  getSpeaker(): string | null {
    if (!this.session) return null;
    const def = dialogueMap.get(this.session.dialogueId);
    return def?.speaker ?? null;
  }

  /** Get the portrait id for the current dialogue. */
  getPortrait(): string | null {
    if (!this.session) return null;
    const def = dialogueMap.get(this.session.dialogueId);
    return def?.portrait ?? null;
  }

  isInDialogue(): boolean {
    return this.session?.isActive ?? false;
  }

  endDialogue(): void {
    if (this.session) {
      const dialogueId = this.session.dialogueId;
      this.session.isActive = false;
      this.session = null;
      this.callbacks.onDialogueEnd?.(dialogueId);
    }
  }

  // -----------------------------------------------------------------------
  // Condition evaluation
  // -----------------------------------------------------------------------

  evaluateCondition(
    condition: DialogueCondition,
    context: DialogueContext,
  ): boolean {
    // Check flag
    if (condition.flag) {
      if (!context.flags.includes(condition.flag)) return false;
    }

    // Check quest progress / outcome
    if (condition.questProgress) {
      const qs = context.questStates[condition.questProgress];
      if (!qs) return false;
      if (condition.outcome && qs.outcome !== condition.outcome) return false;
    }

    // Check stat minimum
    if (condition.stat && condition.min !== undefined) {
      const statValue = context.characterStats[condition.stat] ?? 0;
      if (statValue < condition.min) return false;
    }

    return true;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private getAvailableChoices(
    node: DialogueNode,
    context: DialogueContext,
  ): DialogueChoice[] {
    return node.choices.filter((choice) => {
      if (!choice.condition) return true;
      return this.evaluateCondition(choice.condition, context);
    });
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  getSessionState(): DialogueSessionState | null {
    return this.session ? { ...this.session } : null;
  }

  restoreSession(state: DialogueSessionState): void {
    this.session = { ...state };
  }
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function getDialogueDef(id: string): DialogueFileDef | undefined {
  return dialogueMap.get(id);
}

export function getAllDialogueIds(): string[] {
  return Array.from(dialogueMap.keys());
}
