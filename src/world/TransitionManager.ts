// ------------------------------------------------------------------
// TransitionManager – handles scene / region transitions
// ------------------------------------------------------------------
//
// Manages transition zones placed throughout the world (dungeon
// entrances, town gates, region borders, etc.).  When the player
// enters a zone the manager triggers the appropriate scene change
// using the transition effects defined in ui/TransitionEffects.ts.
//
// Usage:
//   const tm = new TransitionManager();
//   tm.registerZone({ id: 'crypt-entrance', type: TransitionType.OVERWORLD_TO_DUNGEON, ... });
//   // Each frame:
//   const zone = tm.checkTransition(player.x, player.y);
//   if (zone) await tm.executeTransition(zone);
// ------------------------------------------------------------------

// ==================================================================
// Enums & data types
// ==================================================================

/** Category of transition between game areas. */
export enum TransitionType {
  OVERWORLD_TO_DUNGEON = 'overworld_to_dungeon',
  DUNGEON_TO_OVERWORLD = 'dungeon_to_overworld',
  OVERWORLD_TO_TOWN = 'overworld_to_town',
  TOWN_TO_OVERWORLD = 'town_to_overworld',
  REGION_TRAVEL = 'region_travel',
}

/** A rectangular zone in world space that triggers a transition. */
export interface TransitionZone {
  /** Unique identifier for this zone. */
  id: string;

  /** What kind of transition this zone triggers. */
  type: TransitionType;

  /** Top-left corner of the trigger area (world pixels). */
  position: { x: number; y: number };

  /** Dimensions of the trigger area (world pixels). */
  size: { width: number; height: number };

  /**
   * Identifier of the target scene / region / town / dungeon.
   * Interpretation depends on the {@link type}.
   */
  target: string;

  /**
   * Where the player should be placed in the target scene after the
   * transition completes (world pixels).
   */
  targetSpawn: { x: number; y: number };

  /** If true this zone is currently inactive and will be skipped. */
  disabled?: boolean;
}

/** Snapshot of the player's location before a transition. */
export interface TransitionSaveState {
  /** ID of the zone that was triggered. */
  zoneId: string;
  /** Player position at the moment of transition. */
  playerPosition: { x: number; y: number };
  /** Timestamp (Date.now()) when the transition occurred. */
  timestamp: number;
}

/**
 * Callback signature for the function that actually loads a new
 * scene.  This decouples TransitionManager from the SceneManager /
 * Engine so it can be tested independently.
 */
export type SceneLoadCallback = (
  zone: TransitionZone,
  saveState: TransitionSaveState,
) => Promise<void>;

// ==================================================================
// TransitionManager
// ==================================================================

export class TransitionManager {
  // ----------------------------------------------------------------
  // Internal state
  // ----------------------------------------------------------------

  /** All registered zones, keyed by id. */
  private readonly _zones: Map<string, TransitionZone> = new Map();

  /** Stack of saved states (supports nested transitions, e.g. town → shop). */
  private readonly _history: TransitionSaveState[] = [];

  /** External callback that performs the actual scene load. */
  private _onSceneLoad: SceneLoadCallback | null = null;

  /** Guard against overlapping transitions. */
  private _transitioning = false;

  /** Cooldown timer (seconds) after a transition to prevent re-trigger. */
  private _cooldown = 0;

  /** Cooldown duration in seconds. */
  private static readonly COOLDOWN_DURATION = 0.5;

  // ----------------------------------------------------------------
  // Configuration
  // ----------------------------------------------------------------

  /**
   * Set the callback that will be invoked to load the target scene
   * during {@link executeTransition}.
   *
   * The callback receives the triggered zone and a save-state snapshot.
   * It is responsible for calling into SceneManager and playing any
   * transition effect (e.g. FadeTransition, DiamondTransition).
   */
  setSceneLoadCallback(callback: SceneLoadCallback): void {
    this._onSceneLoad = callback;
  }

  // ----------------------------------------------------------------
  // Zone registration
  // ----------------------------------------------------------------

  /** Register a new transition zone. Replaces any existing zone with the same id. */
  registerZone(zone: TransitionZone): void {
    this._zones.set(zone.id, zone);
  }

  /** Remove a transition zone by id. */
  unregisterZone(id: string): void {
    this._zones.delete(id);
  }

  /** Remove all registered zones (e.g. when leaving a region). */
  clearZones(): void {
    this._zones.clear();
  }

  /** Retrieve a zone by id. */
  getZone(id: string): TransitionZone | undefined {
    return this._zones.get(id);
  }

  /** Enable or disable a specific zone. */
  setZoneEnabled(id: string, enabled: boolean): void {
    const zone = this._zones.get(id);
    if (zone) {
      zone.disabled = !enabled;
    }
  }

  // ----------------------------------------------------------------
  // Collision check
  // ----------------------------------------------------------------

  /**
   * Test whether a world-space position overlaps any active transition
   * zone.  Returns the first matching zone, or `null` if none.
   *
   * Call this every frame with the player's centre position.
   */
  checkTransition(playerX: number, playerY: number): TransitionZone | null {
    // Skip checks during cooldown or active transition.
    if (this._transitioning || this._cooldown > 0) {
      return null;
    }

    for (const zone of this._zones.values()) {
      if (zone.disabled) continue;

      const { x, y } = zone.position;
      const { width, height } = zone.size;

      if (
        playerX >= x &&
        playerX < x + width &&
        playerY >= y &&
        playerY < y + height
      ) {
        return zone;
      }
    }

    return null;
  }

  // ----------------------------------------------------------------
  // Execute a transition
  // ----------------------------------------------------------------

  /**
   * Perform a full transition through the given zone.
   *
   * 1. Saves the current player position.
   * 2. Invokes the registered scene-load callback.
   * 3. The callback is expected to play the transition effect, load
   *    the new scene, and place the player at {@link zone.targetSpawn}.
   *
   * @param zone       The zone to transition through.
   * @param playerX    Current player X (world pixels) – used for save state.
   * @param playerY    Current player Y (world pixels) – used for save state.
   */
  async executeTransition(
    zone: TransitionZone,
    playerX: number,
    playerY: number,
  ): Promise<void> {
    if (this._transitioning) {
      console.warn('[TransitionManager] Transition already in progress');
      return;
    }

    if (!this._onSceneLoad) {
      console.warn('[TransitionManager] No scene-load callback registered');
      return;
    }

    this._transitioning = true;

    const saveState: TransitionSaveState = {
      zoneId: zone.id,
      playerPosition: { x: playerX, y: playerY },
      timestamp: Date.now(),
    };

    this._history.push(saveState);

    try {
      await this._onSceneLoad(zone, saveState);
    } catch (err) {
      console.error('[TransitionManager] Scene load failed:', err);
    } finally {
      this._transitioning = false;
      this._cooldown = TransitionManager.COOLDOWN_DURATION;
    }
  }

  // ----------------------------------------------------------------
  // History
  // ----------------------------------------------------------------

  /** Get the most recent save state (the location before the last transition). */
  getLastSaveState(): TransitionSaveState | undefined {
    return this._history.length > 0
      ? this._history[this._history.length - 1]
      : undefined;
  }

  /**
   * Pop and return the most recent save state.  Useful for "return to
   * previous area" logic (e.g. exiting a dungeon back to the overworld).
   */
  popSaveState(): TransitionSaveState | undefined {
    return this._history.pop();
  }

  /** Clear all saved history. */
  clearHistory(): void {
    this._history.length = 0;
  }

  // ----------------------------------------------------------------
  // Per-frame update
  // ----------------------------------------------------------------

  /**
   * Tick down the post-transition cooldown timer.
   * Call once per frame with the frame delta (seconds).
   */
  update(dt: number): void {
    if (this._cooldown > 0) {
      this._cooldown = Math.max(0, this._cooldown - dt);
    }
  }

  // ----------------------------------------------------------------
  // State queries
  // ----------------------------------------------------------------

  /** `true` while a transition is in progress. */
  get isTransitioning(): boolean {
    return this._transitioning;
  }

  /** Number of registered zones. */
  get zoneCount(): number {
    return this._zones.size;
  }
}
