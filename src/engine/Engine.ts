import { Application, Container } from 'pixi.js';

import { SceneManager } from './SceneManager';
import { InputManager } from './InputManager';
import { Camera } from './Camera';
import { Debug } from './Debug';
import { RenderPipeline } from '@/rendering/RenderPipeline';
import { ErrorReporter } from './ErrorReporter';
import type { Scene } from './Scene';

// ------------------------------------------------------------------
// Configuration
// ------------------------------------------------------------------

/** Options accepted by {@link Engine.start}. */
export interface EngineOptions {
  /** Width of the canvas in CSS pixels. @default 1280 */
  width?: number;

  /** Height of the canvas in CSS pixels. @default 720 */
  height?: number;

  /** Canvas background colour (hex). @default 0x1a1a2e */
  backgroundColor?: number;

  /** DOM element to append the canvas to. @default document.body */
  parentElement?: HTMLElement;

  /** Fixed-update rate in Hz. @default 60 */
  fixedTickRate?: number;

  /** Maximum frame delta in seconds. Frames longer than this are clamped
   *  so the accumulator cannot spiral. @default 0.1 */
  maxFrameTime?: number;

  /** Whether to enable anti-aliasing. @default true */
  antialias?: boolean;

  /** Device pixel ratio override.  `undefined` = use window value. */
  resolution?: number;

  /** Whether to start with the debug overlay visible. @default false */
  debug?: boolean;
}

// ------------------------------------------------------------------
// Engine
// ------------------------------------------------------------------

/**
 * Top-level game engine.
 *
 * Owns the PixiJS {@link Application} and drives a **fixed-timestep**
 * game loop (60 Hz physics / logic, variable-rate render with
 * interpolation).
 *
 * Access the singleton via `Engine.instance` after calling `start()`.
 *
 * ```ts
 * const engine = new Engine();
 * await engine.start({ width: 1280, height: 720 });
 * await engine.scenes.push(new GameplayScene());
 * ```
 */
export class Engine {
  // ------------------------------------------------------------------
  // Singleton
  // ------------------------------------------------------------------

  private static _instance: Engine | null = null;

  /** The active Engine singleton. Throws if none has been started. */
  public static get instance(): Engine {
    if (!Engine._instance) {
      throw new Error(
        '[Engine] No Engine instance exists. Call `new Engine().start()` first.',
      );
    }
    return Engine._instance;
  }

  // ------------------------------------------------------------------
  // Public subsystems
  // ------------------------------------------------------------------

  /** PixiJS v8 Application – available after `start()` resolves. */
  public app!: Application;

  /** Root PixiJS Container (alias for `app.stage`). */
  public get stage(): Container {
    return this.app.stage;
  }

  /** Shortcut to `app.renderer`. */
  public get renderer(): Application['renderer'] {
    return this.app.renderer;
  }

  /** The "world" container that the {@link Camera} transforms. */
  public readonly worldContainer: Container = new Container();

  /** The HUD / UI container rendered on top of the world (unaffected by camera). */
  public readonly uiContainer: Container = new Container();

  /** Scene stack manager. */
  public scenes!: SceneManager;

  /** Input / action-mapping manager. */
  public input!: InputManager;

  /** Camera / viewport controller. */
  public camera!: Camera;

  /** Debug overlay. */
  public debug!: Debug;

  /** Render pipeline with named layers and post-processing. */
  public pipeline!: RenderPipeline;

  // ------------------------------------------------------------------
  // Loop state
  // ------------------------------------------------------------------

  /** Fixed timestep in seconds (e.g. 1/60). */
  private _fixedDt: number = 1 / 60;

  /** Maximum elapsed time per frame, in seconds. */
  private _maxFrameTime: number = 0.1;

  /** Accumulated time not yet consumed by fixed-updates. */
  private _accumulator: number = 0;

  /** High-resolution timestamp of the previous frame. */
  private _previousTime: number = 0;

  /** Whether the loop is currently running. */
  private _running: boolean = false;

  /** Consecutive error count for the game loop. */
  private _errorCount: number = 0;

  /** Bound reference to the tick callback (for clean removal). */
  private readonly _tickBound: (ticker: { deltaMS: number }) => void;

  /** Bound visibility change handler (for clean removal). */
  private readonly _onVisibilityChange: () => void;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor() {
    this._tickBound = this._tick.bind(this) as (ticker: { deltaMS: number }) => void;
    this._onVisibilityChange = () => {
      if (document.hidden) this.stop();
      else this.resume();
    };
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  /**
   * Initialise PixiJS, create all subsystems, and begin the game loop.
   *
   * This is the primary entry point. The returned promise resolves once
   * the renderer is ready and the first frame has been scheduled.
   */
  public async start(options: EngineOptions = {}): Promise<void> {
    if (Engine._instance && Engine._instance !== this) {
      throw new Error(
        '[Engine] Another Engine instance is already running. Call destroy() first.',
      );
    }

    const {
      width = 1280,
      height = 720,
      backgroundColor = 0x1a1a2e,
      parentElement,
      fixedTickRate = 60,
      maxFrameTime = 0.1,
      antialias = true,
      resolution,
      debug: showDebug = false,
    } = options;

    // PixiJS v8: construct then init.
    this.app = new Application();

    await this.app.init({
      width,
      height,
      backgroundColor,
      antialias,
      resolution: resolution ?? window.devicePixelRatio,
      autoDensity: true,
      powerPreference: 'high-performance',
    });

    // Mount canvas into the DOM.
    const parent = parentElement ?? document.body;
    parent.appendChild(this.app.canvas as HTMLCanvasElement);

    // Fixed-timestep config.
    this._fixedDt = 1 / fixedTickRate;
    this._maxFrameTime = maxFrameTime;

    // Build display hierarchy:
    //   stage
    //     └─ worldContainer  ← moved by Camera
    //     └─ uiContainer     ← screen-space, unaffected by Camera
    this.worldContainer.label = 'world';
    this.uiContainer.label = 'ui';
    this.app.stage.addChild(this.worldContainer);
    this.app.stage.addChild(this.uiContainer);

    // Subsystems.
    this.scenes = new SceneManager(this, this.worldContainer);
    this.input = new InputManager();
    this.camera = new Camera(this.worldContainer, width, height);
    this.debug = new Debug(this);

    this.pipeline = new RenderPipeline(this.worldContainer);

    if (showDebug) {
      this.debug.enabled = true;
    }

    // Register singleton.
    Engine._instance = this;

    // Start loop.
    this._running = true;
    this._previousTime = performance.now();
    this._accumulator = 0;

    // Pause/resume when the tab loses/gains focus.
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    // Use PixiJS ticker for frame scheduling (respects visibility, etc.).
    this.app.ticker.add(this._tickBound);
  }

  /** Pause the game loop without destroying resources. */
  public stop(): void {
    this._running = false;
  }

  /** Resume the game loop after a {@link stop}. */
  public resume(): void {
    if (this._running) return;
    this._running = true;
    this._previousTime = performance.now();
    this._accumulator = 0;
  }

  /**
   * Tear down everything – destroy all scenes, remove event listeners,
   * and destroy the PixiJS application.
   */
  public async destroy(): Promise<void> {
    this.stop();

    // Destroy subsystems in reverse order of creation.
    this.debug.destroy();
    this.input.destroy();

    await this.scenes.destroyAll();

    // Remove event listeners.
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this.app.ticker.remove(this._tickBound);

    // Destroy the PixiJS app (removes canvas from DOM).
    this.app.destroy(true, { children: true });

    if (Engine._instance === this) {
      Engine._instance = null;
    }
  }

  // ------------------------------------------------------------------
  // Convenience
  // ------------------------------------------------------------------

  /** Canvas width in CSS pixels. */
  public get width(): number {
    return this.app.screen.width;
  }

  /** Canvas height in CSS pixels. */
  public get height(): number {
    return this.app.screen.height;
  }

  /** Push an initial scene onto the stack (convenience wrapper). */
  public async loadScene(scene: Scene): Promise<void> {
    await this.scenes.push(scene);
  }

  // ------------------------------------------------------------------
  // Fixed-timestep loop
  // ------------------------------------------------------------------

  /**
   * Core frame callback, driven by the PixiJS Ticker.
   *
   * Implements a semi-fixed timestep:
   *  1. Measure real elapsed time and clamp to {@link _maxFrameTime}.
   *  2. Accumulate time; consume in fixed-size bites (`fixedUpdate`).
   *  3. Run one variable `update`.
   *  4. Compute interpolation alpha and call `render`.
   */
  private _tick(): void {
    if (!this._running) return;

    try {
      const now = performance.now();
      let frameTime = (now - this._previousTime) / 1000; // seconds
      this._previousTime = now;

      // Cap frame time to prevent spiral of death.
      if (frameTime > this._maxFrameTime) {
        frameTime = this._maxFrameTime;
      }

      this._accumulator += frameTime;

      // --- Fixed updates ---
      while (this._accumulator >= this._fixedDt) {
        this.scenes.fixedUpdate(this._fixedDt);
        this.camera.update(this._fixedDt);
        this._accumulator -= this._fixedDt;
      }

      // --- Variable update ---
      this.scenes.update(frameTime);
      this.input.update();

      // --- Debug timing ---
      this.debug.update(frameTime);

      // --- Render (with interpolation) ---
      const alpha = this._accumulator / this._fixedDt;
      this.scenes.render(alpha);
      this.camera.applyTransform();
      this.debug.render();

      // Reset error count on successful frame.
      this._errorCount = 0;
    } catch (error) {
      console.error('[Engine] Error in game loop:', error);
      this._errorCount++;
      if (this._errorCount > 10) {
        this.stop();
        ErrorReporter.show(error as Error);
      }
    }
  }
}
