import { z } from 'zod';

// ---------------------------------------------------------------------------
// Event emitter
// ---------------------------------------------------------------------------

type GameStateEventCallback = (...args: unknown[]) => void;

class GameStateEmitter {
  private readonly _listeners: Map<string, Set<GameStateEventCallback>> = new Map();

  on(event: string, cb: GameStateEventCallback): void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(cb);
  }

  off(event: string, cb: GameStateEventCallback): void {
    this._listeners.get(event)?.delete(cb);
  }

  emit(event: string, ...args: unknown[]): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      cb(...args);
    }
  }

  clear(): void {
    this._listeners.clear();
  }
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface PartyMemberStats {
  hp: number; maxHp: number;
  mp: number; maxMp: number;
  str: number; dex: number; int: number;
  vit: number; cha: number; luk: number;
  atk: number; def: number; spd: number;
  critChance: number; critDamage: number; dodgeChance: number;
}

export interface PartyMemberEquipment {
  weapon: string | null;
  armor: string | null;
  helmet: string | null;
  accessory: string | null;
  ring: string | null;
}

export interface PartyMember {
  id: string;
  name: string;
  classId: string;
  level: number;
  xp: number;
  xpToNext: number;
  stats: PartyMemberStats;
  equipment: PartyMemberEquipment;
  equippedSpells: string[];
  learnedSpells: string[];
  skillPoints: number;
  unlockedSkills: string[];
  statusEffects: string[];
  berserkerBloodStacks?: number;
}

export interface InventorySlot {
  itemId: string;
  quantity: number;
}

export interface QuestObjectiveProgress {
  id: string;
  current: number;
  target: number;
  completed: boolean;
}

export interface QuestProgress {
  questId: string;
  regionId: string;
  objectives: QuestObjectiveProgress[];
  startedAt: number;
}

export interface GameStateData {
  // Party
  party: PartyMember[];
  activePartyIds: string[];

  // Inventory
  inventory: InventorySlot[];
  gold: number;

  // Quest progress
  activeQuests: QuestProgress[];
  completedQuestIds: string[];
  failedQuestIds: string[];

  // World state
  currentRegion: string;
  currentPosition: { x: number; y: number };
  unlockedRegions: string[];
  worldFlags: Record<string, boolean | number | string>;

  // Time
  playtimeSeconds: number;
  dayNightTime: number;

  // Meta
  saveSlot: number;
  newGamePlusLevel: number;

  // Codex
  discoveredEnemies: string[];
  discoveredItems: string[];
  discoveredLore: string[];
}

// ---------------------------------------------------------------------------
// Zod schema for deserialization validation
// ---------------------------------------------------------------------------

const PartyMemberStatsSchema = z.object({
  hp: z.number(), maxHp: z.number(),
  mp: z.number(), maxMp: z.number(),
  str: z.number(), dex: z.number(), int: z.number(),
  vit: z.number(), cha: z.number(), luk: z.number(),
  atk: z.number(), def: z.number(), spd: z.number(),
  critChance: z.number(), critDamage: z.number(), dodgeChance: z.number(),
});

const PartyMemberEquipmentSchema = z.object({
  weapon: z.string().nullable(),
  armor: z.string().nullable(),
  helmet: z.string().nullable(),
  accessory: z.string().nullable(),
  ring: z.string().nullable(),
});

const PartyMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  classId: z.string(),
  level: z.number().int().min(1),
  xp: z.number().min(0),
  xpToNext: z.number().min(0),
  stats: PartyMemberStatsSchema,
  equipment: PartyMemberEquipmentSchema,
  equippedSpells: z.array(z.string()),
  learnedSpells: z.array(z.string()),
  skillPoints: z.number().int().min(0),
  unlockedSkills: z.array(z.string()),
  statusEffects: z.array(z.string()),
  berserkerBloodStacks: z.number().optional(),
});

const InventorySlotSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int().positive(),
});

const QuestObjectiveSchema = z.object({
  id: z.string(),
  current: z.number(),
  target: z.number(),
  completed: z.boolean(),
});

const QuestProgressSchema = z.object({
  questId: z.string(),
  regionId: z.string(),
  objectives: z.array(QuestObjectiveSchema),
  startedAt: z.number(),
});

const GameStateDataSchema = z.object({
  party: z.array(PartyMemberSchema),
  activePartyIds: z.array(z.string()),
  inventory: z.array(InventorySlotSchema),
  gold: z.number().int().min(0),
  activeQuests: z.array(QuestProgressSchema),
  completedQuestIds: z.array(z.string()),
  failedQuestIds: z.array(z.string()),
  currentRegion: z.string(),
  currentPosition: z.object({ x: z.number(), y: z.number() }),
  unlockedRegions: z.array(z.string()),
  worldFlags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  playtimeSeconds: z.number().min(0),
  dayNightTime: z.number().min(0).max(1440),
  saveSlot: z.number().int().min(0),
  newGamePlusLevel: z.number().int().min(0),
  discoveredEnemies: z.array(z.string()),
  discoveredItems: z.array(z.string()),
  discoveredLore: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Base stat tables per class for newGame
// ---------------------------------------------------------------------------

const CLASS_BASE_STATS: Record<string, Partial<PartyMemberStats>> = {
  knight:    { str: 16, dex: 10, int: 8,  vit: 14, cha: 10, luk: 8  },
  paladin:   { str: 14, dex: 8,  int: 10, vit: 12, cha: 12, luk: 10 },
  ranger:    { str: 10, dex: 16, int: 10, vit: 10, cha: 8,  luk: 12 },
  sorcerer:  { str: 6,  dex: 10, int: 18, vit: 8,  cha: 10, luk: 12 },
  cleric:    { str: 10, dex: 8,  int: 10, vit: 14, cha: 12, luk: 12 },
  rogue:     { str: 10, dex: 16, int: 10, vit: 10, cha: 14, luk: 14 },
  barbarian: { str: 18, dex: 14, int: 6,  vit: 16, cha: 12, luk: 8  },
};

function buildDefaultStats(classId: string): PartyMemberStats {
  const base = CLASS_BASE_STATS[classId] ?? {};
  const str = base.str ?? 10;
  const dex = base.dex ?? 10;
  const int_ = base.int ?? 10;
  const vit = base.vit ?? 10;
  return {
    hp: 80 + vit * 5,
    maxHp: 80 + vit * 5,
    mp: 20 + int_ * 3,
    maxMp: 20 + int_ * 3,
    str,
    dex,
    int: int_,
    vit,
    cha: base.cha ?? 10,
    luk: base.luk ?? 10,
    atk: str * 2,
    def: vit + Math.floor(dex / 2),
    spd: dex + Math.floor(str / 4),
    critChance: 0.05 + dex * 0.002,
    critDamage: 1.5,
    dodgeChance: 0.02 + dex * 0.003,
  };
}

// ---------------------------------------------------------------------------
// GameState singleton
// ---------------------------------------------------------------------------

export class GameState {
  // ------------------------------------------------------------------
  // Singleton
  // ------------------------------------------------------------------

  private static _instance: GameState | null = null;

  public static get instance(): GameState {
    if (!GameState._instance) {
      GameState._instance = new GameState();
    }
    return GameState._instance;
  }

  // ------------------------------------------------------------------
  // Event emitter
  // ------------------------------------------------------------------

  public readonly events = new GameStateEmitter();

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  private _data: GameStateData;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  private constructor() {
    this._data = this._createEmptyState();
  }

  // ------------------------------------------------------------------
  // Read access
  // ------------------------------------------------------------------

  public get party(): ReadonlyArray<PartyMember> {
    return this._data.party;
  }

  public get activePartyIds(): ReadonlyArray<string> {
    return this._data.activePartyIds;
  }

  public get activeParty(): PartyMember[] {
    return this._data.activePartyIds
      .map((id) => this._data.party.find((m) => m.id === id))
      .filter((m): m is PartyMember => m !== undefined);
  }

  public get inventory(): ReadonlyArray<InventorySlot> {
    return this._data.inventory;
  }

  public get gold(): number {
    return this._data.gold;
  }

  public get activeQuests(): ReadonlyArray<QuestProgress> {
    return this._data.activeQuests;
  }

  public get completedQuestIds(): ReadonlyArray<string> {
    return this._data.completedQuestIds;
  }

  public get failedQuestIds(): ReadonlyArray<string> {
    return this._data.failedQuestIds;
  }

  public get currentRegion(): string {
    return this._data.currentRegion;
  }

  public get currentPosition(): Readonly<{ x: number; y: number }> {
    return this._data.currentPosition;
  }

  public get unlockedRegions(): ReadonlyArray<string> {
    return this._data.unlockedRegions;
  }

  public get worldFlags(): Readonly<Record<string, boolean | number | string>> {
    return this._data.worldFlags;
  }

  public get playtimeSeconds(): number {
    return this._data.playtimeSeconds;
  }

  public get dayNightTime(): number {
    return this._data.dayNightTime;
  }

  public get saveSlot(): number {
    return this._data.saveSlot;
  }

  public get newGamePlusLevel(): number {
    return this._data.newGamePlusLevel;
  }

  public get discoveredEnemies(): ReadonlyArray<string> {
    return this._data.discoveredEnemies;
  }

  public get discoveredItems(): ReadonlyArray<string> {
    return this._data.discoveredItems;
  }

  public get discoveredLore(): ReadonlyArray<string> {
    return this._data.discoveredLore;
  }

  // ------------------------------------------------------------------
  // Party operations
  // ------------------------------------------------------------------

  public getPartyMember(id: string): PartyMember | undefined {
    return this._data.party.find((m) => m.id === id);
  }

  public addPartyMember(member: PartyMember): void {
    this._data.party.push(member);
    if (this._data.activePartyIds.length < 4) {
      this._data.activePartyIds.push(member.id);
    }
    this.events.emit('party:changed', member);
  }

  public removePartyMember(id: string): void {
    this._data.party = this._data.party.filter((m) => m.id !== id);
    this._data.activePartyIds = this._data.activePartyIds.filter((pid) => pid !== id);
    this.events.emit('party:changed');
  }

  public setActiveParty(ids: string[]): void {
    this._data.activePartyIds = ids.slice(0, 4);
    this.events.emit('party:changed');
  }

  public levelUp(memberId: string): void {
    const member = this.getPartyMember(memberId);
    if (!member) return;
    member.level++;
    member.xp -= member.xpToNext;
    member.xpToNext = Math.floor(member.xpToNext * 1.5);
    member.skillPoints++;
    this.events.emit('party:levelup', member);
  }

  public addXp(memberId: string, amount: number): void {
    const member = this.getPartyMember(memberId);
    if (!member) return;
    member.xp += amount;
    while (member.xp >= member.xpToNext) {
      this.levelUp(memberId);
    }
  }

  // ------------------------------------------------------------------
  // Inventory operations
  // ------------------------------------------------------------------

  public addItem(itemId: string, quantity: number = 1): void {
    const existing = this._data.inventory.find((s) => s.itemId === itemId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this._data.inventory.push({ itemId, quantity });
    }
    this.events.emit('inventory:changed', itemId, quantity);
  }

  public removeItem(itemId: string, quantity: number = 1): boolean {
    const existing = this._data.inventory.find((s) => s.itemId === itemId);
    if (!existing || existing.quantity < quantity) return false;
    existing.quantity -= quantity;
    if (existing.quantity <= 0) {
      this._data.inventory = this._data.inventory.filter((s) => s.itemId !== itemId);
    }
    this.events.emit('inventory:changed', itemId, -quantity);
    return true;
  }

  public getItemCount(itemId: string): number {
    return this._data.inventory.find((s) => s.itemId === itemId)?.quantity ?? 0;
  }

  public addGold(amount: number): void {
    this._data.gold = Math.max(0, this._data.gold + amount);
    this.events.emit('inventory:gold', this._data.gold);
  }

  public spendGold(amount: number): boolean {
    if (this._data.gold < amount) return false;
    this._data.gold -= amount;
    this.events.emit('inventory:gold', this._data.gold);
    return true;
  }

  // ------------------------------------------------------------------
  // Quest operations
  // ------------------------------------------------------------------

  public startQuest(questId: string, regionId: string, objectives: QuestObjectiveProgress[]): void {
    if (this._data.activeQuests.some((q) => q.questId === questId)) return;
    this._data.activeQuests.push({
      questId,
      regionId,
      objectives,
      startedAt: Date.now(),
    });
    this.events.emit('quest:started', questId);
  }

  public completeQuest(questId: string): void {
    this._data.activeQuests = this._data.activeQuests.filter((q) => q.questId !== questId);
    if (!this._data.completedQuestIds.includes(questId)) {
      this._data.completedQuestIds.push(questId);
    }
    this.events.emit('quest:completed', questId);
  }

  public failQuest(questId: string): void {
    this._data.activeQuests = this._data.activeQuests.filter((q) => q.questId !== questId);
    if (!this._data.failedQuestIds.includes(questId)) {
      this._data.failedQuestIds.push(questId);
    }
    this.events.emit('quest:failed', questId);
  }

  public updateQuestObjective(questId: string, objectiveId: string, current: number): void {
    const quest = this._data.activeQuests.find((q) => q.questId === questId);
    if (!quest) return;
    const obj = quest.objectives.find((o) => o.id === objectiveId);
    if (!obj) return;
    obj.current = current;
    obj.completed = current >= obj.target;
    this.events.emit('quest:updated', questId, objectiveId);
  }

  // ------------------------------------------------------------------
  // World operations
  // ------------------------------------------------------------------

  public setRegion(regionId: string): void {
    this._data.currentRegion = regionId;
    if (!this._data.unlockedRegions.includes(regionId)) {
      this._data.unlockedRegions.push(regionId);
    }
    this.events.emit('world:regionChanged', regionId);
  }

  public setPosition(x: number, y: number): void {
    this._data.currentPosition = { x, y };
  }

  public setWorldFlag(key: string, value: boolean | number | string): void {
    this._data.worldFlags[key] = value;
    this.events.emit('world:flagChanged', key, value);
  }

  public getWorldFlag(key: string): boolean | number | string | undefined {
    return this._data.worldFlags[key];
  }

  // ------------------------------------------------------------------
  // Time operations
  // ------------------------------------------------------------------

  public addPlaytime(seconds: number): void {
    this._data.playtimeSeconds += seconds;
  }

  public setDayNightTime(time: number): void {
    this._data.dayNightTime = time % 1440;
  }

  public advanceDayNightTime(minutes: number): void {
    this._data.dayNightTime = (this._data.dayNightTime + minutes) % 1440;
  }

  // ------------------------------------------------------------------
  // Codex operations
  // ------------------------------------------------------------------

  public discoverEnemy(enemyId: string): void {
    if (!this._data.discoveredEnemies.includes(enemyId)) {
      this._data.discoveredEnemies.push(enemyId);
      this.events.emit('codex:enemy', enemyId);
    }
  }

  public discoverItem(itemId: string): void {
    if (!this._data.discoveredItems.includes(itemId)) {
      this._data.discoveredItems.push(itemId);
      this.events.emit('codex:item', itemId);
    }
  }

  public discoverLore(loreId: string): void {
    if (!this._data.discoveredLore.includes(loreId)) {
      this._data.discoveredLore.push(loreId);
      this.events.emit('codex:lore', loreId);
    }
  }

  // ------------------------------------------------------------------
  // Serialization
  // ------------------------------------------------------------------

  public serialize(): GameStateData {
    return structuredClone(this._data);
  }

  public deserialize(raw: unknown): boolean {
    const result = GameStateDataSchema.safeParse(raw);
    if (!result.success) {
      console.error('[GameState] Deserialization validation failed:', result.error.issues);
      return false;
    }
    this._data = result.data;
    this.events.emit('state:loaded');
    return true;
  }

  // ------------------------------------------------------------------
  // New game
  // ------------------------------------------------------------------

  public newGame(characterName: string, classId: string): void {
    this._data = this._createEmptyState();

    const stats = buildDefaultStats(classId);
    const leader: PartyMember = {
      id: crypto.randomUUID(),
      name: characterName,
      classId,
      level: 1,
      xp: 0,
      xpToNext: 100,
      stats,
      equipment: {
        weapon: null,
        armor: null,
        helmet: null,
        accessory: null,
        ring: null,
      },
      equippedSpells: [],
      learnedSpells: [],
      skillPoints: 0,
      unlockedSkills: [],
      statusEffects: [],
    };

    this._data.party.push(leader);
    this._data.activePartyIds.push(leader.id);
    this._data.currentRegion = 'elderwood';
    this._data.unlockedRegions.push('elderwood');

    this.events.emit('state:newGame');
  }

  // ------------------------------------------------------------------
  // Reset (for testing / cleanup)
  // ------------------------------------------------------------------

  public reset(): void {
    this._data = this._createEmptyState();
    this.events.clear();
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private _createEmptyState(): GameStateData {
    return {
      party: [],
      activePartyIds: [],
      inventory: [],
      gold: 0,
      activeQuests: [],
      completedQuestIds: [],
      failedQuestIds: [],
      currentRegion: '',
      currentPosition: { x: 0, y: 0 },
      unlockedRegions: [],
      worldFlags: {},
      playtimeSeconds: 0,
      dayNightTime: 360, // 6:00 AM
      saveSlot: 0,
      newGamePlusLevel: 0,
      discoveredEnemies: [],
      discoveredItems: [],
      discoveredLore: [],
    };
  }
}
