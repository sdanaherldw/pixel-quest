/**
 * SkillTree.ts — Skill tree investment and node management.
 *
 * Loads skill tree definitions from skill-trees.json and provides
 * methods for investing points, checking prerequisites, and querying
 * invested nodes per character.
 */

import skillTreesData from '@/data/skill-trees.json';

// ---------------------------------------------------------------------------
// Interfaces — Skill node definitions (from JSON)
// ---------------------------------------------------------------------------

export interface SkillNodeEffect {
  type: string;
  value?: number | boolean;
  values?: number[];
  [key: string]: unknown;
}

export interface SkillNodeDef {
  id: string;
  name: string;
  tier: number;
  maxRank: number;
  prerequisites: string[];
  type: 'active' | 'passive' | 'legendary';
  description: string;
  effects: SkillNodeEffect[];
  manaCost?: number;
  cooldown?: number;
}

export interface SkillTreeBranchDef {
  branchId: string;
  classId: string;
  branch: string;
  description: string;
  nodes: SkillNodeDef[];
}

// ---------------------------------------------------------------------------
// Interfaces — Per-character investment state (JSON-serializable)
// ---------------------------------------------------------------------------

export interface SkillTreeState {
  characterId: string;
  /** nodeId -> invested rank */
  investments: Record<string, number>;
  /** Total points spent across all trees. */
  totalPointsSpent: number;
}

// ---------------------------------------------------------------------------
// Internal: load skill tree data
// ---------------------------------------------------------------------------

interface RawSkillTreeFile {
  skillTrees: Record<string, {
    classId: string;
    branch: string;
    description: string;
    nodes: Array<Record<string, unknown>>;
  }>;
}

const branchMap = new Map<string, SkillTreeBranchDef>();
const nodeMap = new Map<string, SkillNodeDef>();
const nodeToBranch = new Map<string, string>();

function loadSkillTrees(): void {
  const raw = skillTreesData as unknown as RawSkillTreeFile;
  for (const [branchId, branchData] of Object.entries(raw.skillTrees)) {
    const nodes: SkillNodeDef[] = branchData.nodes.map((n) => ({
      id: n.id as string,
      name: n.name as string,
      tier: n.tier as number,
      maxRank: n.maxRank as number,
      prerequisites: (n.prerequisites ?? []) as string[],
      type: (n.type ?? 'active') as SkillNodeDef['type'],
      description: n.description as string,
      effects: (n.effects ?? []) as SkillNodeEffect[],
      manaCost: n.manaCost as number | undefined,
      cooldown: n.cooldown as number | undefined,
    }));

    const branch: SkillTreeBranchDef = {
      branchId,
      classId: branchData.classId,
      branch: branchData.branch,
      description: branchData.description,
      nodes,
    };

    branchMap.set(branchId, branch);

    for (const node of nodes) {
      nodeMap.set(node.id, node);
      nodeToBranch.set(node.id, branchId);
    }
  }
}

loadSkillTrees();

// ---------------------------------------------------------------------------
// Pure lookups
// ---------------------------------------------------------------------------

export function getSkillNode(nodeId: string): SkillNodeDef | undefined {
  return nodeMap.get(nodeId);
}

export function getBranch(branchId: string): SkillTreeBranchDef | undefined {
  return branchMap.get(branchId);
}

export function getBranchesForClass(classId: string): SkillTreeBranchDef[] {
  return Array.from(branchMap.values()).filter((b) => b.classId === classId);
}

export function getAllBranches(): SkillTreeBranchDef[] {
  return Array.from(branchMap.values());
}

// ---------------------------------------------------------------------------
// SkillTree class (per-character state)
// ---------------------------------------------------------------------------

export class SkillTree {
  private state: SkillTreeState;

  constructor(state: SkillTreeState) {
    this.state = {
      characterId: state.characterId,
      investments: { ...state.investments },
      totalPointsSpent: state.totalPointsSpent,
    };
  }

  // -----------------------------------------------------------------------
  // Investment
  // -----------------------------------------------------------------------

  /**
   * Invest one skill point into a node.
   * Returns true on success, false if prerequisites or rank limits are not met.
   *
   * @param nodeId         - The skill node to invest in.
   * @param availablePoints - Number of unspent skill points the character has.
   */
  investPoint(nodeId: string, availablePoints: number): boolean {
    if (availablePoints <= 0) return false;
    if (!this.canInvest(nodeId, availablePoints)) return false;

    const currentRank = this.state.investments[nodeId] ?? 0;
    this.state.investments[nodeId] = currentRank + 1;
    this.state.totalPointsSpent += 1;
    return true;
  }

  /**
   * Check if a point can be invested in a node.
   */
  canInvest(nodeId: string, availablePoints: number): boolean {
    if (availablePoints <= 0) return false;

    const nodeDef = nodeMap.get(nodeId);
    if (!nodeDef) return false;

    // Max rank check.
    const currentRank = this.state.investments[nodeId] ?? 0;
    if (currentRank >= nodeDef.maxRank) return false;

    // Prerequisite check: all prerequisites must have at least 1 rank.
    for (const prereqId of nodeDef.prerequisites) {
      if ((this.state.investments[prereqId] ?? 0) <= 0) return false;
    }

    // Tier check: must have enough total points invested in this branch.
    const branchId = nodeToBranch.get(nodeId);
    if (branchId) {
      const branch = branchMap.get(branchId);
      if (branch) {
        const pointsInBranch = this.getPointsInBranch(branchId);
        const requiredForTier = (nodeDef.tier - 1) * 2; // need 2 points per tier below
        if (pointsInBranch < requiredForTier) return false;
      }
    }

    return true;
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  getSkillRank(nodeId: string): number {
    return this.state.investments[nodeId] ?? 0;
  }

  /** Get the total number of points invested across all trees. */
  getInvestedPoints(): number {
    return this.state.totalPointsSpent;
  }

  /** Get invested points in a specific branch. */
  getPointsInBranch(branchId: string): number {
    const branch = branchMap.get(branchId);
    if (!branch) return 0;

    let total = 0;
    for (const node of branch.nodes) {
      total += this.state.investments[node.id] ?? 0;
    }
    return total;
  }

  /**
   * Get all node IDs that the character can currently invest in.
   */
  getAvailableNodes(availablePoints: number): string[] {
    const available: string[] = [];
    for (const [nodeId] of nodeMap) {
      if (this.canInvest(nodeId, availablePoints)) {
        available.push(nodeId);
      }
    }
    return available;
  }

  /**
   * Get available nodes in a specific branch.
   */
  getAvailableNodesInBranch(branchId: string, availablePoints: number): string[] {
    const branch = branchMap.get(branchId);
    if (!branch) return [];

    return branch.nodes
      .filter((node) => this.canInvest(node.id, availablePoints))
      .map((node) => node.id);
  }

  /**
   * Get all invested nodes as { nodeId, rank } pairs.
   */
  getAllInvestments(): Array<{ nodeId: string; rank: number }> {
    const result: Array<{ nodeId: string; rank: number }> = [];
    for (const [nodeId, rank] of Object.entries(this.state.investments)) {
      if (rank > 0) {
        result.push({ nodeId, rank });
      }
    }
    return result;
  }

  /**
   * Get the effects for a node at the character's current invested rank.
   * Returns null if the node has no investment.
   */
  getNodeEffectsAtCurrentRank(nodeId: string): SkillNodeEffect[] | null {
    const rank = this.state.investments[nodeId] ?? 0;
    if (rank <= 0) return null;

    const nodeDef = nodeMap.get(nodeId);
    if (!nodeDef) return null;

    // Resolve rank-indexed values.
    return nodeDef.effects.map((effect) => {
      const resolved: SkillNodeEffect = { ...effect };
      if (effect.values && Array.isArray(effect.values)) {
        // Pick the value for the current rank (0-indexed).
        const idx = Math.min(rank - 1, effect.values.length - 1);
        resolved.value = effect.values[idx];
      }
      return resolved;
    });
  }

  /**
   * Check whether a specific skill is learned (rank >= 1).
   */
  hasSkill(nodeId: string): boolean {
    return (this.state.investments[nodeId] ?? 0) > 0;
  }

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  /**
   * Reset all investments. Returns the total points refunded.
   */
  resetAll(): number {
    const refunded = this.state.totalPointsSpent;
    this.state.investments = {};
    this.state.totalPointsSpent = 0;
    return refunded;
  }

  /**
   * Reset investments in a specific branch. Returns points refunded.
   */
  resetBranch(branchId: string): number {
    const branch = branchMap.get(branchId);
    if (!branch) return 0;

    let refunded = 0;
    for (const node of branch.nodes) {
      const invested = this.state.investments[node.id] ?? 0;
      if (invested > 0) {
        refunded += invested;
        delete this.state.investments[node.id];
      }
    }
    this.state.totalPointsSpent -= refunded;
    return refunded;
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  getState(): SkillTreeState {
    return {
      characterId: this.state.characterId,
      investments: { ...this.state.investments },
      totalPointsSpent: this.state.totalPointsSpent,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSkillTreeState(characterId: string): SkillTreeState {
  return {
    characterId,
    investments: {},
    totalPointsSpent: 0,
  };
}
