import type { ComponentMap } from './Component';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/** Auto-incrementing counter shared by all Entity instances. */
let nextEntityId = 0;

/**
 * Lightweight game-object that is nothing more than a unique ID and a bag of
 * components.  All behaviour lives in {@link System} implementations.
 *
 * Components are stored in a `Map<string, unknown>` keyed by the component
 * name string (see {@link ComponentType}).  The generic helpers ensure
 * compile-time safety when the key is a known literal from {@link ComponentMap}.
 */
export class Entity {
  // ------------------------------------------------------------------
  // Public state
  // ------------------------------------------------------------------

  /** Globally unique numeric identifier for this entity. */
  public readonly id: number;

  /** When `false` the entity is skipped by every system. */
  public active: boolean = true;

  /**
   * Marked `true` when the entity has been scheduled for destruction.
   * Actual removal from the world happens at the end of the current frame
   * (deferred destruction).
   */
  public destroyed: boolean = false;

  // ------------------------------------------------------------------
  // Internal storage
  // ------------------------------------------------------------------

  /** Component name → component data. */
  private readonly _components: Map<string, unknown> = new Map();

  /**
   * Monotonically increasing version counter, bumped every time a component
   * is added or removed.  {@link Query} uses this to know when its cached
   * match result is stale.
   */
  private _version: number = 0;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor() {
    this.id = nextEntityId++;
  }

  /**
   * Internal factory used by World for entity ID recycling.
   * Reuses a previously freed ID instead of allocating a new one.
   */
  public static _createWithId(id: number): Entity {
    const entity = Object.create(Entity.prototype) as Entity;
    (entity as { id: number }).id = id;
    entity.active = true;
    entity.destroyed = false;
    (entity as unknown as { _components: Map<string, unknown> })._components = new Map();
    (entity as unknown as { _version: number })._version = 0;
    return entity;
  }

  // ------------------------------------------------------------------
  // Component accessors
  // ------------------------------------------------------------------

  /**
   * Attach (or replace) a component on this entity.
   *
   * @returns `this` for convenient chaining:
   * ```ts
   * world.createEntity()
   *   .addComponent('Transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
   *   .addComponent('Velocity',  { vx: 0, vy: 0 });
   * ```
   */
  public addComponent<K extends string>(
    name: K,
    data: K extends keyof ComponentMap ? ComponentMap[K] : unknown,
  ): this {
    this._components.set(name, data);
    this._version++;
    return this;
  }

  /** Remove a component by name.  No-op if the component is not present. */
  public removeComponent(name: string): this {
    if (this._components.delete(name)) {
      this._version++;
    }
    return this;
  }

  /**
   * Retrieve a component's data.  Returns `undefined` when the entity does
   * not carry the requested component.
   */
  public getComponent<K extends string>(
    name: K,
  ): (K extends keyof ComponentMap ? ComponentMap[K] : unknown) | undefined {
    return this._components.get(name) as
      | (K extends keyof ComponentMap ? ComponentMap[K] : unknown)
      | undefined;
  }

  /** Returns `true` when the entity has the named component. */
  public hasComponent(name: string): boolean {
    return this._components.has(name);
  }

  /** Returns `true` when the entity has **all** of the listed components. */
  public hasComponents(...names: string[]): boolean {
    for (const name of names) {
      if (!this._components.has(name)) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Introspection
  // ------------------------------------------------------------------

  /** Current component-change version (incremented on add / remove). */
  public get version(): number {
    return this._version;
  }

  /** Iterable of every component name currently on this entity. */
  public get componentNames(): IterableIterator<string> {
    return this._components.keys();
  }

  /** Number of components currently attached. */
  public get componentCount(): number {
    return this._components.size;
  }
}
