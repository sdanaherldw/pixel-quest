import { Container } from 'pixi.js';

import type { Engine } from './Engine';
import type { Scene } from './Scene';

// ------------------------------------------------------------------
// Transition effect interface
// ------------------------------------------------------------------

/**
 * Optional visual transition played between scene changes.
 *
 * Implementations can animate a full-screen overlay (fade, wipe, etc.)
 * and should resolve their returned promises only when the animation
 * completes.
 */
export interface SceneTransition {
  /** Set up any display objects; called once before the transition starts. */
  init(stage: Container): Promise<void>;

  /**
   * "Out" phase – hides the old scene.
   * The promise should resolve when the animation is finished.
   */
  out(): Promise<void>;

  /**
   * "In" phase – reveals the new scene.
   * The promise should resolve when the animation is finished.
   */
  in(): Promise<void>;

  /** Tear down display objects created during `init`. */
  destroy(): void;
}

// ------------------------------------------------------------------
// SceneManager
// ------------------------------------------------------------------

/**
 * Stack-based scene manager.
 *
 * * **push** – adds a scene on top (good for overlays: inventory over gameplay).
 * * **pop**  – removes the top scene and returns to the one below.
 * * **replace** – swaps the top scene for a new one.
 *
 * Only the top scene receives logic updates and input.  All *visible*
 * scenes in the stack are rendered from bottom to top so that overlay
 * scenes draw on top of the ones below.
 */
export class SceneManager {
  // ------------------------------------------------------------------
  // Private state
  // ------------------------------------------------------------------

  private readonly _stack: Scene[] = [];
  private readonly _engine: Engine;
  private readonly _stageContainer: Container;

  /** Guards against concurrent push/pop/replace during transitions. */
  private _transitioning: boolean = false;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor(engine: Engine, stageContainer: Container) {
    this._engine = engine;
    this._stageContainer = stageContainer;
  }

  // ------------------------------------------------------------------
  // Public accessors
  // ------------------------------------------------------------------

  /** The currently active (top-of-stack) scene, or `undefined`. */
  public get current(): Scene | undefined {
    return this._stack.length > 0
      ? this._stack[this._stack.length - 1]
      : undefined;
  }

  /** Number of scenes on the stack. */
  public get depth(): number {
    return this._stack.length;
  }

  /** Read-only view of the full scene stack (bottom → top). */
  public get stack(): ReadonlyArray<Scene> {
    return this._stack;
  }

  // ------------------------------------------------------------------
  // Stack operations
  // ------------------------------------------------------------------

  /**
   * Push a new scene onto the top of the stack.
   *
   * The currently active scene (if any) receives `exit()`.
   * The new scene is initialised (if needed), its container is added
   * to the stage, and it receives `enter()`.
   */
  public async push(
    scene: Scene,
    transition?: SceneTransition,
  ): Promise<void> {
    if (this._transitioning) {
      console.warn('[SceneManager] push ignored – transition in progress');
      return;
    }

    this._transitioning = true;

    try {
      // --- transition OUT (old scene) ---
      if (transition) {
        await transition.init(this._stageContainer);
        await transition.out();
      }

      // Deactivate old top scene.
      const previous = this.current;
      if (previous) {
        previous.isActive = false;
        await previous.exit();
      }

      // Clear stale input between scenes.
      this._engine.input.releaseAll();

      // Prepare the new scene.
      scene.setEngine(this._engine);

      if (!scene.isInitialized) {
        await scene.init();
        scene.isInitialized = true;
      }

      this._stack.push(scene);
      this._stageContainer.addChild(scene.container);
      scene.isActive = true;
      await scene.enter();

      // --- transition IN (new scene) ---
      if (transition) {
        await transition.in();
        transition.destroy();
      }
    } finally {
      this._transitioning = false;
    }
  }

  /**
   * Remove the top scene from the stack and return to the one below.
   *
   * The removed scene receives `exit()` then `destroy()`.
   * The newly-exposed scene receives `enter()`.
   *
   * @returns The popped scene, or `undefined` if the stack was empty.
   */
  public async pop(transition?: SceneTransition): Promise<Scene | undefined> {
    if (this._transitioning) {
      console.warn('[SceneManager] pop ignored – transition in progress');
      return undefined;
    }

    if (this._stack.length === 0) {
      console.warn('[SceneManager] pop called on empty stack');
      return undefined;
    }

    this._transitioning = true;

    try {
      // --- transition OUT ---
      if (transition) {
        await transition.init(this._stageContainer);
        await transition.out();
      }

      const removed = this._stack.pop()!;
      removed.isActive = false;
      await removed.exit();
      this._stageContainer.removeChild(removed.container);
      removed.destroy();

      // Clear stale input between scenes.
      this._engine.input.releaseAll();

      // Activate the scene that is now on top.
      const next = this.current;
      if (next) {
        next.isActive = true;
        await next.enter();
      }

      // --- transition IN ---
      if (transition) {
        await transition.in();
        transition.destroy();
      }

      return removed;
    } finally {
      this._transitioning = false;
    }
  }

  /**
   * Replace the top scene with a new one.
   *
   * Semantically equivalent to `pop()` + `push(scene)` but runs both
   * operations inside a single transition bracket.
   */
  public async replace(
    scene: Scene,
    transition?: SceneTransition,
  ): Promise<void> {
    if (this._transitioning) {
      console.warn('[SceneManager] replace ignored – transition in progress');
      return;
    }

    this._transitioning = true;

    try {
      // --- transition OUT ---
      if (transition) {
        await transition.init(this._stageContainer);
        await transition.out();
      }

      // Remove old top scene.
      if (this._stack.length > 0) {
        const removed = this._stack.pop()!;
        removed.isActive = false;
        await removed.exit();
        this._stageContainer.removeChild(removed.container);
        removed.destroy();
      }

      // Clear stale input between scenes.
      this._engine.input.releaseAll();

      // Prepare the new scene.
      scene.setEngine(this._engine);

      if (!scene.isInitialized) {
        await scene.init();
        scene.isInitialized = true;
      }

      this._stack.push(scene);
      this._stageContainer.addChild(scene.container);
      scene.isActive = true;
      await scene.enter();

      // --- transition IN ---
      if (transition) {
        await transition.in();
        transition.destroy();
      }
    } finally {
      this._transitioning = false;
    }
  }

  // ------------------------------------------------------------------
  // Per-frame updates (called by Engine)
  // ------------------------------------------------------------------

  /**
   * Variable-rate update – forwarded only to the active (top) scene.
   */
  public update(dt: number): void {
    const top = this.current;
    if (top?.isActive) {
      top.update(dt);
    }
  }

  /**
   * Fixed-rate update – forwarded only to the active (top) scene.
   */
  public fixedUpdate(dt: number): void {
    const top = this.current;
    if (top?.isActive) {
      top.fixedUpdate(dt);
    }
  }

  /**
   * Render pass – every visible scene in the stack is given a chance
   * to run its render logic (bottom → top order).
   */
  public render(alpha: number): void {
    for (const scene of this._stack) {
      scene.render(alpha);
    }
  }

  // ------------------------------------------------------------------
  // Resize
  // ------------------------------------------------------------------

  /**
   * Notify all scenes in the stack that the viewport has been resized.
   */
  public resize(width: number, height: number): void {
    for (const scene of this._stack) {
      scene.onResize(width, height);
    }
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  /**
   * Destroy all scenes on the stack (bottom → top).
   * Called during `Engine.destroy()`.
   */
  public async destroyAll(): Promise<void> {
    // Process from top to bottom so exit order mirrors push order.
    while (this._stack.length > 0) {
      const scene = this._stack.pop()!;
      scene.isActive = false;
      await scene.exit();
      this._stageContainer.removeChild(scene.container);
      scene.destroy();
    }
  }
}
