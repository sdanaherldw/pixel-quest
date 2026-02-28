import type { Entity } from './Entity';

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Efficient entity filter that matches entities carrying a specific set of
 * components while optionally excluding others.
 *
 * Each {@link Query} maintains a cached list of matched entities.  The cache
 * is automatically invalidated when the world's structural version changes
 * (entity creation/destruction) or when an entity's component set changes
 * (tracked via {@link Entity.version}).
 *
 * ### Usage
 *
 * ```ts
 * const movable = new Query(['Transform', 'Velocity']);
 * const alive   = new Query(['Health'], ['Dead']);
 *
 * // Each frame:
 * const matched = movable.execute(allEntities, world.structuralVersion);
 * ```
 */
export class Query {
  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------

  /** Component names an entity **must** carry to match this query. */
  public readonly required: readonly string[];

  /** Component names an entity must **not** carry to match this query. */
  public readonly excluded: readonly string[];

  // ------------------------------------------------------------------
  // Cache
  // ------------------------------------------------------------------

  /** Cached result set from the last `execute` call. */
  private _cache: Entity[] = [];

  /**
   * Snapshot of entity IDs and their component versions at the time the cache
   * was built.  Used to determine whether the cache is still valid.
   */
  private _versionMap: Map<number, number> = new Map();

  /** Total entity count the cache was built from. */
  private _lastEntityCount: number = -1;

  /** When `true` the cache is known to be stale and must be rebuilt. */
  private _dirty: boolean = true;

  /** The world structural version when this cache was last built. */
  private _lastStructuralVersion: number = -1;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  /**
   * @param required  Component names the entity must have.
   * @param excluded  Component names the entity must **not** have.
   */
  constructor(required: readonly string[], excluded: readonly string[] = []) {
    this.required = required;
    this.excluded = excluded;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Test whether a single entity satisfies this query.
   */
  public match(entity: Entity): boolean {
    if (!entity.active || entity.destroyed) return false;

    for (const name of this.required) {
      if (!entity.hasComponent(name)) return false;
    }

    for (const name of this.excluded) {
      if (entity.hasComponent(name)) return false;
    }

    return true;
  }

  /**
   * Return every entity from `entities` that satisfies this query.
   *
   * Results are cached and reused across multiple calls within the same
   * frame as long as no structural changes have occurred and no entity's
   * component set has changed.
   *
   * @param entities  The full entity list from the world.
   * @param structuralVersion  The world's current structural version.
   *        When omitted, falls back to per-entity version checking.
   */
  public execute(entities: ReadonlyArray<Entity>, structuralVersion?: number): Entity[] {
    // Fast path: if structural version hasn't changed and cache isn't dirty,
    // check per-entity component versions.
    if (
      !this._dirty &&
      structuralVersion !== undefined &&
      structuralVersion === this._lastStructuralVersion &&
      this._isCacheValid(entities)
    ) {
      return this._cache;
    }

    // Fallback for callers that don't pass structural version.
    if (!this._dirty && structuralVersion === undefined && this._isCacheValid(entities)) {
      return this._cache;
    }

    this._rebuild(entities, structuralVersion);
    return this._cache;
  }

  /**
   * Explicitly mark the cache as stale.  Call this after bulk entity
   * operations to force a re-evaluation on the next `execute`.
   */
  public invalidate(): void {
    this._dirty = true;
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  /**
   * Check whether the cache is still valid by comparing entity count and
   * component versions.  This is cheaper than re-filtering in the common
   * case where nothing changed.
   */
  private _isCacheValid(entities: ReadonlyArray<Entity>): boolean {
    if (entities.length !== this._lastEntityCount) return false;

    for (const entity of entities) {
      const cached = this._versionMap.get(entity.id);
      if (cached === undefined || cached !== entity.version) {
        return false;
      }
    }

    return true;
  }

  /**
   * Rebuild the cached match list from scratch.
   */
  private _rebuild(entities: ReadonlyArray<Entity>, structuralVersion?: number): void {
    this._cache.length = 0;
    this._versionMap.clear();

    for (const entity of entities) {
      this._versionMap.set(entity.id, entity.version);

      if (this.match(entity)) {
        this._cache.push(entity);
      }
    }

    this._lastEntityCount = entities.length;
    this._lastStructuralVersion = structuralVersion ?? -1;
    this._dirty = false;
  }
}
