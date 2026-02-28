import localforage from 'localforage';
import { z } from 'zod';

const CURRENT_SAVE_VERSION = '1.0.0';
const AUTOSAVE_SLOT = 0;
const MAX_MANUAL_SLOT = 3;

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const StatsSchema = z.object({
  str: z.number(),
  int: z.number(),
  wis: z.number(),
  dex: z.number(),
  con: z.number(),
  cha: z.number(),
});

const PartyMemberSchema = z.object({
  name: z.string(),
  classId: z.string(),
  level: z.number().int().min(1),
  currentHp: z.number(),
  maxHp: z.number().positive(),
  currentMp: z.number(),
  maxMp: z.number().min(0),
  xp: z.number().min(0),
  stats: StatsSchema,
  equipment: z.record(z.string(), z.string()),
  knownSpells: z.array(z.string()),
  equippedSpells: z.array(z.string()),
  skillPoints: z.number().int().min(0),
  investedSkills: z.record(z.string(), z.number()),
});

const InventorySchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string(),
      quantity: z.number().int().positive(),
    })
  ),
  gold: z.number().int().min(0),
});

const QuestStateSchema = z.object({
  active: z.array(z.string()),
  completed: z.array(z.string()),
  failed: z.array(z.string()),
  objectives: z.record(z.string(), z.record(z.string(), z.boolean())),
});

const WorldStateSchema = z.object({
  currentRegion: z.string(),
  currentZone: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  unlockedRegions: z.array(z.string()),
  defeatedBosses: z.array(z.string()),
  discoveredTowns: z.array(z.string()),
  clearedDungeons: z.array(z.string()),
  flags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  reputation: z.record(z.string(), z.number()),
});

const SettingsSchema = z.object({
  musicVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
  difficulty: z.string(),
});

const SaveDataSchema = z.object({
  version: z.string(),
  slot: z.number().int().min(0).max(3),
  timestamp: z.number(),
  playtime: z.number().min(0),
  playerName: z.string(),
  partyMembers: z.array(PartyMemberSchema),
  inventory: InventorySchema,
  questState: QuestStateSchema,
  worldState: WorldStateSchema,
  settings: SettingsSchema,
  newGamePlusLevel: z.number().int().min(0),
});

// ── Exported Types ───────────────────────────────────────────────────────────

export type SaveData = z.infer<typeof SaveDataSchema>;
export type PartyMember = z.infer<typeof PartyMemberSchema>;
export type Stats = z.infer<typeof StatsSchema>;
export type Inventory = z.infer<typeof InventorySchema>;
export type QuestState = z.infer<typeof QuestStateSchema>;
export type WorldState = z.infer<typeof WorldStateSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

export interface SaveSlotInfo {
  slot: number;
  exists: boolean;
  playerName?: string;
  level?: number;
  playtime?: number;
  timestamp?: number;
  region?: string;
}

// ── SaveManager ──────────────────────────────────────────────────────────────

export class SaveManager {
  private static _instance: SaveManager;

  static get instance(): SaveManager {
    if (!SaveManager._instance) {
      SaveManager._instance = new SaveManager();
    }
    return SaveManager._instance;
  }

  private store: LocalForage | null = null;
  private initialized = false;

  private playtimeAccumulated = 0;
  private playtimeTrackingStart: number | null = null;
  private playtimeInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    // singleton — use SaveManager.instance
  }

  // ── Initialization ───────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.store = localforage.createInstance({
      name: 'realms-of-conquest',
    });

    this.initialized = true;
    console.log('[SaveManager] Initialized with IndexedDB store "realms-of-conquest".');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private ensureInitialized(): void {
    if (!this.initialized || !this.store) {
      throw new Error('[SaveManager] Not initialized. Call initialize() first.');
    }
  }

  private slotKey(slot: number): string {
    return `save_slot_${slot}`;
  }

  private isValidSlot(slot: number): boolean {
    return Number.isInteger(slot) && slot >= AUTOSAVE_SLOT && slot <= MAX_MANUAL_SLOT;
  }

  private migrateIfNeeded(data: SaveData): SaveData {
    if (data.version !== CURRENT_SAVE_VERSION) {
      console.warn(
        `[SaveManager] Save version mismatch: found "${data.version}", expected "${CURRENT_SAVE_VERSION}". ` +
          'Migration may be required.'
      );
      // ── Version migration stub ──
      // Future migrations go here, e.g.:
      // if (data.version === '0.9.0') { data = migrate_0_9_to_1_0(data); }
      // For now we return the data as-is and let the caller decide.
    }
    return data;
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async save(slot: number, data: SaveData): Promise<boolean> {
    this.ensureInitialized();

    if (!this.isValidSlot(slot)) {
      console.error(`[SaveManager] Invalid save slot: ${slot}. Must be ${AUTOSAVE_SLOT}-${MAX_MANUAL_SLOT}.`);
      return false;
    }

    try {
      const saveData: SaveData = {
        ...data,
        slot,
        timestamp: Date.now(),
        version: CURRENT_SAVE_VERSION,
      };

      // Validate before writing
      SaveDataSchema.parse(saveData);

      await this.store!.setItem(this.slotKey(slot), saveData);
      console.log(`[SaveManager] Saved to slot ${slot} (player: "${saveData.playerName}").`);
      return true;
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        console.error('[SaveManager] Validation failed on save:', err.issues);
      } else {
        console.error(`[SaveManager] Failed to save slot ${slot}:`, err);
      }
      return false;
    }
  }

  // ── Load ─────────────────────────────────────────────────────────────────

  async load(slot: number): Promise<SaveData | null> {
    this.ensureInitialized();

    if (!this.isValidSlot(slot)) {
      console.error(`[SaveManager] Invalid load slot: ${slot}.`);
      return null;
    }

    try {
      const raw: unknown = await this.store!.getItem(this.slotKey(slot));

      if (raw === null || raw === undefined) {
        console.log(`[SaveManager] Slot ${slot} is empty.`);
        return null;
      }

      // Validate against schema to protect against corrupted data
      const parseResult = SaveDataSchema.safeParse(raw);
      if (!parseResult.success) {
        console.error(
          `[SaveManager] Corrupted save data in slot ${slot}:`,
          parseResult.error.issues
        );
        return null;
      }

      const data = this.migrateIfNeeded(parseResult.data);
      console.log(`[SaveManager] Loaded slot ${slot} (player: "${data.playerName}").`);
      return data;
    } catch (err: unknown) {
      console.error(`[SaveManager] Failed to load slot ${slot}:`, err);
      return null;
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async delete(slot: number): Promise<boolean> {
    this.ensureInitialized();

    if (!this.isValidSlot(slot)) {
      console.error(`[SaveManager] Invalid delete slot: ${slot}.`);
      return false;
    }

    try {
      await this.store!.removeItem(this.slotKey(slot));
      console.log(`[SaveManager] Deleted slot ${slot}.`);
      return true;
    } catch (err: unknown) {
      console.error(`[SaveManager] Failed to delete slot ${slot}:`, err);
      return false;
    }
  }

  // ── Slot Info ────────────────────────────────────────────────────────────

  async getSlotInfo(): Promise<SaveSlotInfo[]> {
    this.ensureInitialized();

    const slots: SaveSlotInfo[] = [];

    for (let slot = AUTOSAVE_SLOT; slot <= MAX_MANUAL_SLOT; slot++) {
      try {
        const raw: unknown = await this.store!.getItem(this.slotKey(slot));

        if (raw === null || raw === undefined) {
          slots.push({ slot, exists: false });
          continue;
        }

        // Lightweight parse: extract only summary fields without full validation
        const obj = raw as Record<string, unknown>;
        const partyMembers = obj['partyMembers'] as
          | Array<{ level?: number }>
          | undefined;
        const leaderLevel =
          partyMembers && partyMembers.length > 0
            ? (partyMembers[0].level as number | undefined)
            : undefined;

        const worldState = obj['worldState'] as
          | { currentRegion?: string }
          | undefined;

        slots.push({
          slot,
          exists: true,
          playerName: obj['playerName'] as string | undefined,
          level: leaderLevel,
          playtime: obj['playtime'] as number | undefined,
          timestamp: obj['timestamp'] as number | undefined,
          region: worldState?.currentRegion,
        });
      } catch (err: unknown) {
        console.error(`[SaveManager] Error reading slot ${slot} info:`, err);
        slots.push({ slot, exists: false });
      }
    }

    return slots;
  }

  // ── Autosave ─────────────────────────────────────────────────────────────

  async autosave(data: SaveData): Promise<boolean> {
    console.log('[SaveManager] Autosaving...');
    return this.save(AUTOSAVE_SLOT, data);
  }

  // ── Has Save Data ────────────────────────────────────────────────────────

  async hasSaveData(): Promise<boolean> {
    this.ensureInitialized();

    for (let slot = AUTOSAVE_SLOT; slot <= MAX_MANUAL_SLOT; slot++) {
      try {
        const raw: unknown = await this.store!.getItem(this.slotKey(slot));
        if (raw !== null && raw !== undefined) {
          return true;
        }
      } catch (_err: unknown) {
        // continue checking other slots
      }
    }

    return false;
  }

  // ── Playtime Tracking ────────────────────────────────────────────────────

  startPlaytimeTracking(): void {
    if (this.playtimeTrackingStart !== null) {
      // Already tracking — accumulate what we have so far and restart
      this.playtimeAccumulated += (Date.now() - this.playtimeTrackingStart) / 1000;
    }

    this.playtimeTrackingStart = Date.now();

    // Use an interval to periodically flush elapsed time into the accumulator.
    // This guards against long sessions where the tab may hibernate.
    if (this.playtimeInterval !== null) {
      clearInterval(this.playtimeInterval);
    }

    this.playtimeInterval = setInterval(() => {
      if (this.playtimeTrackingStart !== null) {
        this.playtimeAccumulated += (Date.now() - this.playtimeTrackingStart) / 1000;
        this.playtimeTrackingStart = Date.now();
      }
    }, 60_000); // flush every 60s

    console.log('[SaveManager] Playtime tracking started.');
  }

  stopPlaytimeTracking(): void {
    if (this.playtimeTrackingStart !== null) {
      this.playtimeAccumulated += (Date.now() - this.playtimeTrackingStart) / 1000;
      this.playtimeTrackingStart = null;
    }

    if (this.playtimeInterval !== null) {
      clearInterval(this.playtimeInterval);
      this.playtimeInterval = null;
    }

    console.log(
      `[SaveManager] Playtime tracking stopped. Total: ${this.playtimeAccumulated.toFixed(1)}s`
    );
  }

  getPlaytime(): number {
    let total = this.playtimeAccumulated;

    if (this.playtimeTrackingStart !== null) {
      total += (Date.now() - this.playtimeTrackingStart) / 1000;
    }

    return Math.floor(total);
  }
}
