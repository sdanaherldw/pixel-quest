import type { Entity } from './Entity';

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

/**
 * Abstract base class for all ECS systems.
 *
 * A system encapsulates a single slice of game logic that operates on every
 * entity carrying a specific set of components.  The {@link World} is
 * responsible for collecting matching entities and invoking `update` /
 * `fixedUpdate` each frame.
 *
 * ### Execution order
 *
 * Systems run in ascending {@link priority} order (lower numbers execute
 * first).  If two systems share the same priority their relative order is
 * determined by insertion order.
 *
 * ### Enabling / disabling
 *
 * Set {@link enabled} to `false` to skip a system without removing it.
 */
export abstract class System {
  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------

  /**
   * Component names that an entity **must** carry to be processed by this
   * system.  The world uses this list (via {@link Query}) to pre-filter the
   * entity set before calling `update` / `fixedUpdate`.
   */
  public abstract readonly requiredComponents: readonly string[];

  /**
   * Execution priority.  Systems with a **lower** value run first.
   * Override in subclasses or set directly after construction.
   *
   * @default 0
   */
  public priority: number = 0;

  /**
   * When `false` the world will skip this system during the update loop.
   * Useful for pausing specific behaviour (e.g. disabling physics while
   * in a menu).
   */
  public enabled: boolean = true;

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  /**
   * Called once per variable-rate frame with all entities that match
   * {@link requiredComponents}.
   *
   * @param dt  Frame delta time in **seconds**.
   * @param entities  Pre-filtered entity list (all carry the required components).
   */
  public abstract update(dt: number, entities: Entity[]): void;

  /**
   * Called once per fixed-rate tick (default 60 Hz) with matching entities.
   *
   * Override this for deterministic physics / game-logic updates.
   * The default implementation is a no-op so systems that only need
   * `update` don't have to provide a stub.
   *
   * @param dt  Fixed timestep in **seconds** (e.g. 1/60).
   * @param entities  Pre-filtered entity list.
   */
  public fixedUpdate(_dt: number, _entities: Entity[]): void {
    /* no-op – override when needed */
  }

  // ------------------------------------------------------------------
  // Optional hooks
  // ------------------------------------------------------------------

  /**
   * Called once when the system is added to the world.
   * Useful for acquiring references or subscribing to events.
   */
  public init(): void {
    /* no-op – override when needed */
  }

  /**
   * Called once when the system is removed from the world.
   * Clean up subscriptions / external resources here.
   */
  public destroy(): void {
    /* no-op – override when needed */
  }
}
