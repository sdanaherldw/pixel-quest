import { Container, Graphics } from 'pixi.js';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/**
 * Configuration for a particle emitter.
 */
export interface ParticleConfig {
  /** Maximum number of live particles at once. */
  maxParticles: number;

  /** Particles emitted per second. */
  emitRate: number;

  /** Lifetime of each particle in seconds. */
  lifetime: number;

  /** Base speed of emitted particles (pixels per second). */
  speed: number;

  /** Particle colour (hex). */
  color: number;

  /** Particle radius in pixels. */
  size: number;

  /** Downward acceleration applied each frame (pixels/s^2). @default 0 */
  gravity?: number;

  /** Whether particles fade out over their lifetime. @default true */
  fadeOut?: boolean;

  /**
   * Angular spread in radians. `Math.PI * 2` = full circle,
   * `Math.PI / 4` = narrow cone. @default Math.PI * 2
   */
  spread?: number;

  /** Base emission angle in radians. @default -Math.PI / 2 (upward) */
  angle?: number;

  /** Size variation range. The actual size will be
   *  `size + random(-sizeVariation, sizeVariation)`. @default 0 */
  sizeVariation?: number;

  /** Speed variation range. @default 0 */
  speedVariation?: number;
}

/**
 * Internal state for a single particle.
 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
  alpha: number;
  active: boolean;
}

// ------------------------------------------------------------------
// Preset configurations
// ------------------------------------------------------------------

/**
 * Built-in particle effect presets.
 */
export const PARTICLE_PRESETS: Record<string, ParticleConfig> = {
  sparkle: {
    maxParticles: 30,
    emitRate: 15,
    lifetime: 0.8,
    speed: 40,
    color: 0xffee88,
    size: 3,
    gravity: -20,
    fadeOut: true,
    spread: Math.PI * 2,
    sizeVariation: 1,
    speedVariation: 15,
  },
  fire: {
    maxParticles: 60,
    emitRate: 40,
    lifetime: 0.6,
    speed: 60,
    color: 0xff6622,
    size: 5,
    gravity: -80,
    fadeOut: true,
    spread: Math.PI / 3,
    angle: -Math.PI / 2,
    sizeVariation: 2,
    speedVariation: 20,
  },
  heal: {
    maxParticles: 25,
    emitRate: 12,
    lifetime: 1.2,
    speed: 30,
    color: 0x44ff88,
    size: 4,
    gravity: -40,
    fadeOut: true,
    spread: Math.PI / 2,
    angle: -Math.PI / 2,
    sizeVariation: 1,
    speedVariation: 10,
  },
  smoke: {
    maxParticles: 40,
    emitRate: 20,
    lifetime: 1.5,
    speed: 20,
    color: 0x888888,
    size: 6,
    gravity: -15,
    fadeOut: true,
    spread: Math.PI / 4,
    angle: -Math.PI / 2,
    sizeVariation: 3,
    speedVariation: 8,
  },
  blood: {
    maxParticles: 20,
    emitRate: 60,
    lifetime: 0.4,
    speed: 80,
    color: 0xcc2222,
    size: 3,
    gravity: 200,
    fadeOut: true,
    spread: Math.PI,
    angle: -Math.PI / 2,
    sizeVariation: 1,
    speedVariation: 30,
  },
  'magic-burst': {
    maxParticles: 50,
    emitRate: 100,
    lifetime: 0.5,
    speed: 100,
    color: 0x8844ff,
    size: 4,
    gravity: 0,
    fadeOut: true,
    spread: Math.PI * 2,
    sizeVariation: 2,
    speedVariation: 40,
  },
};

// ------------------------------------------------------------------
// ParticleEmitter
// ------------------------------------------------------------------

/**
 * Manages a pool of simple particles using a single shared
 * {@link Graphics} object for rendering.
 *
 * Particles are circles drawn with alpha blending. This is a
 * lightweight system intended as a placeholder until the full
 * `@pixi/particle-emitter` integration is ready.
 *
 * ### Usage
 *
 * ```ts
 * const emitter = new ParticleEmitter(PARTICLE_PRESETS.fire);
 * emitter.position.set(400, 300);
 * scene.container.addChild(emitter.container);
 *
 * // Each frame:
 * emitter.update(dt);
 * emitter.render();
 * ```
 */
export class ParticleEmitter {
  // ------------------------------------------------------------------
  // Public
  // ------------------------------------------------------------------

  /** The display container. Add to your scene graph. */
  public readonly container: Container;

  /** Emitter world position. Set this to move the emission point. */
  public readonly position: { x: number; y: number } = { x: 0, y: 0 };

  /** Whether the emitter is actively spawning new particles. */
  public emitting: boolean = true;

  // ------------------------------------------------------------------
  // Private
  // ------------------------------------------------------------------

  private readonly _config: Required<ParticleConfig>;
  private readonly _pool: Particle[];
  private readonly _graphics: Graphics;
  private _emitAccumulator: number = 0;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  /**
   * Create a new particle emitter.
   *
   * @param config Particle configuration (or a preset name string).
   */
  constructor(config: ParticleConfig) {
    this._config = {
      gravity: 0,
      fadeOut: true,
      spread: Math.PI * 2,
      angle: -Math.PI / 2,
      sizeVariation: 0,
      speedVariation: 0,
      ...config,
    };

    // Pre-allocate the particle pool.
    this._pool = [];
    for (let i = 0; i < this._config.maxParticles; i++) {
      this._pool.push(this._createParticle());
    }

    this._graphics = new Graphics();
    this._graphics.label = 'particle-emitter';

    this.container = new Container();
    this.container.label = 'particle-emitter-container';
    this.container.addChild(this._graphics);
  }

  // ------------------------------------------------------------------
  // Particle count
  // ------------------------------------------------------------------

  /** Number of currently active particles. */
  public get activeCount(): number {
    let count = 0;
    for (const p of this._pool) {
      if (p.active) count++;
    }
    return count;
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  /**
   * Advance the simulation by `dt` seconds.
   *
   * * Emits new particles based on `emitRate`.
   * * Updates position, velocity, lifetime, and alpha of all active
   *   particles.
   * * Deactivates expired particles.
   *
   * @param dt Frame delta in seconds.
   */
  public update(dt: number): void {
    // --- Emission ---
    if (this.emitting) {
      this._emitAccumulator += dt * this._config.emitRate;

      while (this._emitAccumulator >= 1) {
        this._emitAccumulator -= 1;
        this._emitOne();
      }
    }

    // --- Simulation ---
    const gravity = this._config.gravity;
    const fadeOut = this._config.fadeOut;

    for (const p of this._pool) {
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      // Physics.
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Alpha fade.
      if (fadeOut) {
        p.alpha = Math.max(0, p.life / p.maxLife);
      }
    }
  }

  /**
   * Draw all active particles into the shared Graphics object.
   *
   * Call this once per frame after {@link update}.
   */
  public render(): void {
    const g = this._graphics;
    g.clear();

    for (const p of this._pool) {
      if (!p.active || p.alpha <= 0) continue;

      g.circle(p.x, p.y, p.size)
        .fill({ color: p.color, alpha: p.alpha });
    }
  }

  /**
   * Emit a burst of particles instantly.
   *
   * @param count Number of particles to emit.
   */
  public burst(count: number): void {
    for (let i = 0; i < count; i++) {
      this._emitOne();
    }
  }

  /**
   * Deactivate all particles immediately.
   */
  public reset(): void {
    for (const p of this._pool) {
      p.active = false;
    }
    this._emitAccumulator = 0;
  }

  /**
   * Destroy the emitter and its graphics.
   */
  public destroy(): void {
    this._graphics.destroy();
    this.container.destroy({ children: true });
    this._pool.length = 0;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /** Create an inactive particle for the pool. */
  private _createParticle(): Particle {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0,
      color: this._config.color,
      size: this._config.size,
      alpha: 1,
      active: false,
    };
  }

  /** Emit a single particle from the emitter position. */
  private _emitOne(): void {
    // Find an inactive particle.
    const p = this._pool.find((p) => !p.active);
    if (!p) return; // Pool exhausted.

    const cfg = this._config;

    p.active = true;
    p.x = this.position.x;
    p.y = this.position.y;
    p.life = cfg.lifetime;
    p.maxLife = cfg.lifetime;
    p.color = cfg.color;
    p.alpha = 1;

    // Size with variation.
    p.size = cfg.size + (Math.random() * 2 - 1) * cfg.sizeVariation;
    p.size = Math.max(0.5, p.size);

    // Speed with variation.
    const speed =
      cfg.speed + (Math.random() * 2 - 1) * cfg.speedVariation;

    // Direction within the spread cone.
    const halfSpread = cfg.spread / 2;
    const angle =
      cfg.angle + (Math.random() * 2 - 1) * halfSpread;

    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
  }
}

// ------------------------------------------------------------------
// ParticleManager
// ------------------------------------------------------------------

/**
 * Manages multiple named {@link ParticleEmitter} instances.
 *
 * Provides a central place to create, update, render, and destroy
 * all particle effects in a scene.
 *
 * ### Usage
 *
 * ```ts
 * const pm = new ParticleManager();
 * scene.container.addChild(pm.container);
 *
 * pm.createEmitter('camp-fire', PARTICLE_PRESETS.fire, 200, 400);
 *
 * // Each frame:
 * pm.update(dt);
 * pm.render();
 * ```
 */
export class ParticleManager {
  // ------------------------------------------------------------------
  // Public
  // ------------------------------------------------------------------

  /** Root container for all emitters. */
  public readonly container: Container;

  // ------------------------------------------------------------------
  // Private
  // ------------------------------------------------------------------

  private readonly _emitters: Map<string, ParticleEmitter> = new Map();

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor() {
    this.container = new Container();
    this.container.label = 'particle-manager';
  }

  // ------------------------------------------------------------------
  // Emitter management
  // ------------------------------------------------------------------

  /**
   * Create and register a new particle emitter.
   *
   * @param name   Unique name for this emitter.
   * @param config Particle configuration.
   * @param x      Initial world X position.
   * @param y      Initial world Y position.
   * @returns The created emitter.
   */
  public createEmitter(
    name: string,
    config: ParticleConfig,
    x: number = 0,
    y: number = 0,
  ): ParticleEmitter {
    if (this._emitters.has(name)) {
      throw new Error(
        `[ParticleManager] Emitter "${name}" already exists.`,
      );
    }

    const emitter = new ParticleEmitter(config);
    emitter.position.x = x;
    emitter.position.y = y;

    this._emitters.set(name, emitter);
    this.container.addChild(emitter.container);

    return emitter;
  }

  /**
   * Create an emitter from a named preset.
   *
   * @param name       Unique emitter name.
   * @param presetName Key into {@link PARTICLE_PRESETS}.
   * @param x          Initial X position.
   * @param y          Initial Y position.
   * @returns The created emitter.
   * @throws If the preset name is not found.
   */
  public createFromPreset(
    name: string,
    presetName: string,
    x: number = 0,
    y: number = 0,
  ): ParticleEmitter {
    const preset = PARTICLE_PRESETS[presetName];
    if (!preset) {
      throw new Error(
        `[ParticleManager] Unknown preset "${presetName}". ` +
          `Available: ${Object.keys(PARTICLE_PRESETS).join(', ')}`,
      );
    }
    return this.createEmitter(name, preset, x, y);
  }

  /**
   * Get an emitter by name.
   *
   * @returns The emitter, or `undefined` if not found.
   */
  public getEmitter(name: string): ParticleEmitter | undefined {
    return this._emitters.get(name);
  }

  /**
   * Remove and destroy a named emitter.
   *
   * @param name Emitter name.
   * @returns `true` if the emitter was found and removed.
   */
  public removeEmitter(name: string): boolean {
    const emitter = this._emitters.get(name);
    if (!emitter) return false;

    this.container.removeChild(emitter.container);
    emitter.destroy();
    this._emitters.delete(name);
    return true;
  }

  // ------------------------------------------------------------------
  // Per-frame
  // ------------------------------------------------------------------

  /**
   * Update all emitters.
   *
   * @param dt Frame delta in seconds.
   */
  public update(dt: number): void {
    for (const [, emitter] of this._emitters) {
      emitter.update(dt);
    }
  }

  /**
   * Render all emitters.
   */
  public render(): void {
    for (const [, emitter] of this._emitters) {
      emitter.render();
    }
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  /**
   * Destroy all emitters and the root container.
   */
  public destroy(): void {
    for (const [, emitter] of this._emitters) {
      emitter.destroy();
    }
    this._emitters.clear();
    this.container.destroy({ children: true });
  }
}
