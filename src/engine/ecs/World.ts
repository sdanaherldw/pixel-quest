import { Entity } from './Entity';
import type { System } from './System';
import { Query } from './Query';
import { ComponentType } from './Component';
import type { TagComponent } from './Component';

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

/**
 * Central ECS manager that owns all entities and systems.
 *
 * ### Entity lifecycle
 *
 * Entities created via {@link createEntity} are immediately available for
 * queries.  Destruction is **deferred**: calling {@link destroyEntity} marks
 * the entity but does not remove it until {@link flushDestroyed} runs at the
 * end of each frame.  This prevents iterator invalidation while systems are
 * processing.
 *
 * ### System execution
 *
 * Systems are executed in ascending {@link System.priority} order.  For each
 * system the world pre-filters entities through a {@link Query} built from
 * the system's `requiredComponents` list.
 */
export class World {
  // ------------------------------------------------------------------
  // Private state
  // ------------------------------------------------------------------

  /** All live entities (including those pending destruction). */
  private readonly _entities: Map<number, Entity> = new Map();

  /** Ordered list of registered systems. */
  private readonly _systems: System[] = [];

  /** One query per system, keyed by the system's identity (index). */
  private readonly _systemQueries: Map<System, Query> = new Map();

  /** Entity IDs that have been flagged for deferred removal. */
  private readonly _pendingDestroy: Set<number> = new Set();

  /** Flat array view of entities – rebuilt when the map changes. */
  private _entityList: Entity[] = [];
  private _entityListDirty: boolean = true;

  // ------------------------------------------------------------------
  // Entity management
  // ------------------------------------------------------------------

  /**
   * Create and register a new entity.
   *
   * @returns The freshly created entity, ready for component attachment.
   */
  public createEntity(): Entity {
    const entity = new Entity();
    this._entities.set(entity.id, entity);
    this._entityListDirty = true;
    this._invalidateAllQueries();
    return entity;
  }

  /**
   * Schedule an entity for deferred destruction.
   *
   * The entity is flagged immediately (`entity.destroyed = true`) so that
   * systems can skip it, but actual removal from the world happens at the
   * end of the current frame via {@link flushDestroyed}.
   */
  public destroyEntity(id: number): void {
    const entity = this._entities.get(id);
    if (entity) {
      entity.destroyed = true;
      entity.active = false;
      this._pendingDestroy.add(id);
    }
  }

  /**
   * Look up an entity by its numeric ID.
   *
   * @returns The entity, or `undefined` if no entity with that ID exists
   *          (or it has already been destroyed).
   */
  public getEntity(id: number): Entity | undefined {
    return this._entities.get(id);
  }

  /**
   * Return every active entity that carries a {@link TagComponent} containing
   * the given tag string.
   */
  public getEntitiesByTag(tag: string): Entity[] {
    const result: Entity[] = [];

    for (const entity of this._entities.values()) {
      if (!entity.active || entity.destroyed) continue;

      const tagComp = entity.getComponent<typeof ComponentType.Tag>(
        ComponentType.Tag,
      ) as TagComponent | undefined;

      if (tagComp && tagComp.tags.has(tag)) {
        result.push(entity);
      }
    }

    return result;
  }

  /**
   * Read-only snapshot of all live entities.
   * Rebuilt lazily when the entity set changes.
   */
  public get entities(): ReadonlyArray<Entity> {
    if (this._entityListDirty) {
      this._entityList = Array.from(this._entities.values());
      this._entityListDirty = false;
    }
    return this._entityList;
  }

  /** Total number of registered entities (including pending-destroy). */
  public get entityCount(): number {
    return this._entities.size;
  }

  // ------------------------------------------------------------------
  // System management
  // ------------------------------------------------------------------

  /**
   * Register a system with the world.
   *
   * Systems are automatically sorted by {@link System.priority} after
   * insertion.  A matching {@link Query} is created and cached for each
   * system.
   */
  public addSystem(system: System): void {
    this._systems.push(system);
    this._sortSystems();

    // Build a query from the system's required components.
    const query = new Query(system.requiredComponents);
    this._systemQueries.set(system, query);

    system.init();
  }

  /**
   * Remove a previously registered system.
   */
  public removeSystem(system: System): void {
    const idx = this._systems.indexOf(system);
    if (idx !== -1) {
      this._systems.splice(idx, 1);
      this._systemQueries.delete(system);
      system.destroy();
    }
  }

  /**
   * Read-only view of all registered systems (in priority order).
   */
  public get systems(): ReadonlyArray<System> {
    return this._systems;
  }

  // ------------------------------------------------------------------
  // Per-frame update
  // ------------------------------------------------------------------

  /**
   * Variable-rate update.  Iterates systems in priority order, passing
   * each system only the entities that match its requirements.
   *
   * Calls {@link flushDestroyed} at the end of the frame.
   */
  public update(dt: number): void {
    const allEntities = this.entities;

    for (const system of this._systems) {
      if (!system.enabled) continue;

      const query = this._systemQueries.get(system)!;
      const matched = query.execute(allEntities);
      system.update(dt, matched);
    }

    this.flushDestroyed();
  }

  /**
   * Fixed-rate update.  Same filtering as {@link update} but invokes
   * `system.fixedUpdate` instead.
   *
   * Does **not** flush destroyed entities – that only happens once per
   * variable-rate frame to keep fixed ticks lightweight.
   */
  public fixedUpdate(dt: number): void {
    const allEntities = this.entities;

    for (const system of this._systems) {
      if (!system.enabled) continue;

      const query = this._systemQueries.get(system)!;
      const matched = query.execute(allEntities);
      system.fixedUpdate(dt, matched);
    }
  }

  // ------------------------------------------------------------------
  // Deferred destruction
  // ------------------------------------------------------------------

  /**
   * Remove all entities that were flagged for destruction during this frame.
   *
   * This is called automatically at the end of {@link update}.  You may
   * also call it manually after batched `destroyEntity` operations.
   */
  public flushDestroyed(): void {
    if (this._pendingDestroy.size === 0) return;

    for (const id of this._pendingDestroy) {
      this._entities.delete(id);
    }

    this._pendingDestroy.clear();
    this._entityListDirty = true;
    this._invalidateAllQueries();
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  /**
   * Destroy every entity and remove every system.
   * Call this when tearing down the world entirely.
   */
  public clear(): void {
    for (const system of [...this._systems]) {
      this.removeSystem(system);
    }

    this._entities.clear();
    this._pendingDestroy.clear();
    this._entityList = [];
    this._entityListDirty = true;
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  /** Sort systems by ascending priority (stable). */
  private _sortSystems(): void {
    this._systems.sort((a, b) => a.priority - b.priority);
  }

  /** Invalidate every cached query so they re-evaluate next execute. */
  private _invalidateAllQueries(): void {
    for (const query of this._systemQueries.values()) {
      query.invalidate();
    }
  }
}
