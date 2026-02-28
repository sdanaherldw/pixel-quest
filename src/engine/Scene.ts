import { Container } from 'pixi.js';

import type { Engine } from './Engine';

/**
 * Abstract base class for all game scenes.
 *
 * Each scene owns a PixiJS Container that is automatically added to and removed
 * from the stage by the SceneManager.  Subclasses must implement the four core
 * lifecycle methods; optional hooks (`enter`, `exit`, `destroy`) are provided
 * as no-ops that can be overridden when needed.
 */
export abstract class Scene {
  // ------------------------------------------------------------------
  // Public state
  // ------------------------------------------------------------------

  /** PixiJS display container – all scene visuals go here. */
  public readonly container: Container;

  /** `true` after `init()` has been called and resolved. */
  public isInitialized: boolean = false;

  /** `true` while the scene is the active (top-of-stack) scene. */
  public isActive: boolean = false;

  /** Human-readable name used for debugging / logging. */
  public readonly name: string;

  // ------------------------------------------------------------------
  // Protected references
  // ------------------------------------------------------------------

  /** Back-reference to the owning Engine – set by SceneManager. */
  protected _engine!: Engine;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor(name?: string) {
    this.container = new Container();
    this.container.label = name ?? this.constructor.name;
    this.name = name ?? this.constructor.name;
  }

  // ------------------------------------------------------------------
  // Engine accessor (set by SceneManager)
  // ------------------------------------------------------------------

  /** The Engine instance that owns this scene. */
  public get engine(): Engine {
    return this._engine;
  }

  /** @internal – called by SceneManager when pushing the scene. */
  public setEngine(engine: Engine): void {
    this._engine = engine;
  }

  // ------------------------------------------------------------------
  // Abstract – must be implemented by every concrete scene
  // ------------------------------------------------------------------

  /**
   * One-time async initialisation (load assets, create display objects, etc.).
   * Called exactly once before the first `enter()`.
   */
  public abstract init(): Promise<void>;

  /**
   * Variable-rate logic update.  `dt` is the real (uncapped) frame delta in
   * seconds.  Use for animation tweening, timers that don't need determinism.
   */
  public abstract update(dt: number): void;

  /**
   * Fixed-rate logic update.  `dt` is the fixed timestep (1/60 s by default).
   * Use for physics, game-logic, anything that must be deterministic.
   */
  public abstract fixedUpdate(dt: number): void;

  /**
   * Called once per frame after all updates.  `alpha` (0–1) is the
   * interpolation factor between the last two fixed steps – use it to
   * smooth rendering of physics-driven objects.
   */
  public abstract render(alpha: number): void;

  // ------------------------------------------------------------------
  // Optional lifecycle hooks (override as needed)
  // ------------------------------------------------------------------

  /**
   * Called every time the scene becomes the active (top) scene.
   * Guaranteed to be called after `init()` has resolved.
   */
  public async enter(): Promise<void> {
    /* no-op by default */
  }

  /**
   * Called when the scene is no longer the active (top) scene,
   * either because another scene was pushed on top or because this
   * scene was popped / replaced.
   */
  public async exit(): Promise<void> {
    /* no-op by default */
  }

  /**
   * Final cleanup.  Called when the scene is permanently removed from
   * the stack (pop or replace).  Must release GPU resources, event
   * listeners, etc.
   */
  public destroy(): void {
    this.container.destroy({ children: true });
  }
}
