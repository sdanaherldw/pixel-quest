// ------------------------------------------------------------------
// WeatherSystem – dynamic weather with PixiJS Graphics particles
// ------------------------------------------------------------------
//
// Manages the current weather state and renders visual effects as
// an overlay Container that sits above the world layer but below UI.
//
// Each weather type is implemented as a lightweight particle system
// drawn with PixiJS Graphics primitives.  Weather transitions happen
// smoothly over a configurable duration by cross-fading particle
// counts and overlay tints.
//
// Usage:
//   const weather = new WeatherSystem(1280, 720);
//   stage.addChild(weather.container);    // above world, below UI
//   weather.setWeather(WeatherType.RAIN);
//   // each frame:
//   weather.update(dt);
// ------------------------------------------------------------------

import { Container, Graphics } from 'pixi.js';

// ==================================================================
// Enums & types
// ==================================================================

/** All supported weather types. */
export enum WeatherType {
  CLEAR = 'clear',
  CLOUDY = 'cloudy',
  RAIN = 'rain',
  STORM = 'storm',
  SNOW = 'snow',
  FOG = 'fog',
  SANDSTORM = 'sandstorm',
  ASH_FALL = 'ash_fall',
}

/** Configuration for how a weather type is rendered. */
interface WeatherVisuals {
  /** Maximum number of particles. */
  maxParticles: number;
  /** Ambient overlay colour (hex). */
  tintColor: number;
  /** Ambient overlay alpha at full intensity. */
  tintAlpha: number;
  /** Whether lightning flashes can occur. */
  lightning: boolean;
  /** Whether screen shake can occur (storms). */
  screenShake: boolean;
}

/** Internal particle state. */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

// ==================================================================
// Visual presets per weather type
// ==================================================================

const WEATHER_VISUALS: Record<WeatherType, WeatherVisuals> = {
  [WeatherType.CLEAR]: {
    maxParticles: 0,
    tintColor: 0x000000,
    tintAlpha: 0,
    lightning: false,
    screenShake: false,
  },
  [WeatherType.CLOUDY]: {
    maxParticles: 0,
    tintColor: 0x444466,
    tintAlpha: 0.15,
    lightning: false,
    screenShake: false,
  },
  [WeatherType.RAIN]: {
    maxParticles: 300,
    tintColor: 0x223344,
    tintAlpha: 0.2,
    lightning: false,
    screenShake: false,
  },
  [WeatherType.STORM]: {
    maxParticles: 500,
    tintColor: 0x111133,
    tintAlpha: 0.35,
    lightning: true,
    screenShake: true,
  },
  [WeatherType.SNOW]: {
    maxParticles: 250,
    tintColor: 0xccccff,
    tintAlpha: 0.1,
    lightning: false,
    screenShake: false,
  },
  [WeatherType.FOG]: {
    maxParticles: 60,
    tintColor: 0xaaaaaa,
    tintAlpha: 0.4,
    lightning: false,
    screenShake: false,
  },
  [WeatherType.SANDSTORM]: {
    maxParticles: 400,
    tintColor: 0xcc9944,
    tintAlpha: 0.3,
    lightning: false,
    screenShake: false,
  },
  [WeatherType.ASH_FALL]: {
    maxParticles: 150,
    tintColor: 0x333333,
    tintAlpha: 0.25,
    lightning: false,
    screenShake: false,
  },
};

// ==================================================================
// WeatherSystem
// ==================================================================

export class WeatherSystem {
  // ----------------------------------------------------------------
  // Public
  // ----------------------------------------------------------------

  /** Root container – add this to the stage above the world layer. */
  public readonly container: Container;

  // ----------------------------------------------------------------
  // Internal state
  // ----------------------------------------------------------------

  /** Current (or target) weather type. */
  private _currentWeather: WeatherType = WeatherType.CLEAR;

  /** Previous weather type (used during transitions). */
  private _previousWeather: WeatherType = WeatherType.CLEAR;

  /** 0 → fully previous weather, 1 → fully current weather. */
  private _transitionProgress = 1;

  /** Duration of the current weather transition in seconds. */
  private _transitionDuration = 0;

  /** Screen dimensions (updated via {@link resize}). */
  private _width: number;
  private _height: number;

  /** Active particle pool. */
  private _particles: Particle[] = [];

  /** Graphics object used to draw particles each frame. */
  private readonly _particleGfx: Graphics;

  /** Graphics object used for the ambient tint overlay. */
  private readonly _tintOverlay: Graphics;

  /** Graphics object used for lightning flashes. */
  private readonly _lightningGfx: Graphics;

  /** Timer for next lightning flash (seconds). */
  private _lightningTimer = 0;

  /** Remaining flash brightness (0 → no flash). */
  private _lightningFlash = 0;

  /** Optional callback invoked when a screen-shake should fire. */
  private _onScreenShake: (() => void) | null = null;

  // ----------------------------------------------------------------
  // Constructor
  // ----------------------------------------------------------------

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;

    this.container = new Container();
    this.container.label = 'WeatherSystem';
    // The container should not block pointer events.
    this.container.eventMode = 'none';

    // Ambient tint overlay (drawn behind particles).
    this._tintOverlay = new Graphics();
    this._tintOverlay.label = 'WeatherTint';
    this.container.addChild(this._tintOverlay);

    // Particle layer.
    this._particleGfx = new Graphics();
    this._particleGfx.label = 'WeatherParticles';
    this.container.addChild(this._particleGfx);

    // Lightning flash layer (drawn on top).
    this._lightningGfx = new Graphics();
    this._lightningGfx.label = 'WeatherLightning';
    this._lightningGfx.alpha = 0;
    this.container.addChild(this._lightningGfx);

    this._drawLightning();
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------

  /** The currently active (or transitioning-to) weather type. */
  get currentWeather(): WeatherType {
    return this._currentWeather;
  }

  /** Whether a weather transition is currently in progress. */
  get isTransitioning(): boolean {
    return this._transitionProgress < 1;
  }

  /**
   * Change the weather.  If `duration` is 0 the change is instant;
   * otherwise particles and tint cross-fade over the given seconds.
   *
   * @param type     Target weather type.
   * @param duration Transition duration in seconds (default 3).
   */
  setWeather(type: WeatherType, duration: number = 3): void {
    if (type === this._currentWeather && this._transitionProgress >= 1) {
      return; // already at target weather
    }

    this._previousWeather = this._currentWeather;
    this._currentWeather = type;
    this._transitionDuration = duration;
    this._transitionProgress = duration > 0 ? 0 : 1;
  }

  /**
   * Register a callback invoked when storm screen-shake should fire.
   * The callback should call Camera.shake() or equivalent.
   */
  onScreenShake(callback: () => void): void {
    this._onScreenShake = callback;
  }

  /** Update viewport dimensions (call on window resize). */
  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this._drawLightning();
  }

  // ----------------------------------------------------------------
  // Per-frame update
  // ----------------------------------------------------------------

  /**
   * Advance particles, transitions, and lightning.
   * Call once per frame with the frame delta in seconds.
   */
  update(dt: number): void {
    this._advanceTransition(dt);

    const visuals = this._blendedVisuals();

    // Update tint overlay.
    this._drawTintOverlay(visuals.tintColor, visuals.tintAlpha);

    // Update particles.
    this._updateParticles(dt, visuals.maxParticles);
    this._drawParticles();

    // Lightning.
    if (visuals.lightning) {
      this._updateLightning(dt, visuals.screenShake);
    } else {
      this._lightningGfx.alpha = 0;
    }
  }

  // ----------------------------------------------------------------
  // Internal – transition
  // ----------------------------------------------------------------

  private _advanceTransition(dt: number): void {
    if (this._transitionProgress >= 1) return;

    if (this._transitionDuration <= 0) {
      this._transitionProgress = 1;
      return;
    }

    this._transitionProgress = Math.min(
      1,
      this._transitionProgress + dt / this._transitionDuration,
    );
  }

  /**
   * Compute blended visual parameters between previous and current
   * weather types based on transition progress.
   */
  private _blendedVisuals(): WeatherVisuals {
    const t = this._transitionProgress;
    const prev = WEATHER_VISUALS[this._previousWeather];
    const curr = WEATHER_VISUALS[this._currentWeather];

    return {
      maxParticles: Math.round(prev.maxParticles * (1 - t) + curr.maxParticles * t),
      tintColor: t < 0.5 ? prev.tintColor : curr.tintColor,
      tintAlpha: prev.tintAlpha * (1 - t) + curr.tintAlpha * t,
      lightning: t > 0.5 ? curr.lightning : prev.lightning,
      screenShake: t > 0.5 ? curr.screenShake : prev.screenShake,
    };
  }

  // ----------------------------------------------------------------
  // Internal – tint overlay
  // ----------------------------------------------------------------

  private _drawTintOverlay(color: number, alpha: number): void {
    const g = this._tintOverlay;
    g.clear();
    if (alpha <= 0) return;
    g.rect(0, 0, this._width, this._height).fill(color);
    g.alpha = alpha;
  }

  // ----------------------------------------------------------------
  // Internal – particles
  // ----------------------------------------------------------------

  private _updateParticles(dt: number, targetCount: number): void {
    const weather = this._transitionProgress >= 1
      ? this._currentWeather
      : (this._transitionProgress > 0.5 ? this._currentWeather : this._previousWeather);

    // Spawn new particles up to target count.
    while (this._particles.length < targetCount) {
      this._particles.push(this._spawnParticle(weather));
    }

    // Remove excess particles (from highest index).
    while (this._particles.length > targetCount) {
      this._particles.pop();
    }

    // Advance existing particles.
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      // Re-spawn if off-screen or expired.
      if (p.life <= 0 || p.y > this._height + 20 || p.x < -20 || p.x > this._width + 20) {
        this._particles[i] = this._spawnParticle(weather);
      }
    }
  }

  /** Create a new particle appropriate for the given weather type. */
  private _spawnParticle(type: WeatherType): Particle {
    switch (type) {
      case WeatherType.RAIN:
      case WeatherType.STORM:
        return {
          x: Math.random() * (this._width + 100) - 50,
          y: -Math.random() * this._height,
          vx: type === WeatherType.STORM ? -80 - Math.random() * 60 : -20,
          vy: 500 + Math.random() * 200,
          size: 1 + Math.random(),
          alpha: 0.3 + Math.random() * 0.4,
          life: 3,
          maxLife: 3,
        };

      case WeatherType.SNOW:
        return {
          x: Math.random() * this._width,
          y: -Math.random() * this._height * 0.5,
          vx: -10 + Math.random() * 20,
          vy: 30 + Math.random() * 40,
          size: 1.5 + Math.random() * 2.5,
          alpha: 0.5 + Math.random() * 0.4,
          life: 10,
          maxLife: 10,
        };

      case WeatherType.FOG:
        return {
          x: Math.random() * this._width,
          y: Math.random() * this._height,
          vx: 5 + Math.random() * 10,
          vy: -1 + Math.random() * 2,
          size: 40 + Math.random() * 60,
          alpha: 0.05 + Math.random() * 0.1,
          life: 8 + Math.random() * 4,
          maxLife: 12,
        };

      case WeatherType.SANDSTORM:
        return {
          x: this._width + Math.random() * 100,
          y: Math.random() * this._height,
          vx: -300 - Math.random() * 200,
          vy: -20 + Math.random() * 40,
          size: 1 + Math.random() * 2,
          alpha: 0.3 + Math.random() * 0.5,
          life: 4,
          maxLife: 4,
        };

      case WeatherType.ASH_FALL:
        return {
          x: Math.random() * this._width,
          y: -Math.random() * this._height * 0.3,
          vx: -5 + Math.random() * 10,
          vy: 15 + Math.random() * 25,
          size: 1.5 + Math.random() * 2,
          alpha: 0.3 + Math.random() * 0.3,
          life: 12,
          maxLife: 12,
        };

      default:
        // CLEAR, CLOUDY – no particles
        return {
          x: 0, y: 0, vx: 0, vy: 0,
          size: 0, alpha: 0, life: 0, maxLife: 0,
        };
    }
  }

  /** Redraw all particles using Graphics primitives. */
  private _drawParticles(): void {
    const g = this._particleGfx;
    g.clear();

    const weather = this._transitionProgress >= 1
      ? this._currentWeather
      : (this._transitionProgress > 0.5 ? this._currentWeather : this._previousWeather);

    for (const p of this._particles) {
      if (p.alpha <= 0 || p.size <= 0) continue;

      switch (weather) {
        case WeatherType.RAIN:
        case WeatherType.STORM:
          // Rain: thin vertical lines
          g.moveTo(p.x, p.y);
          g.lineTo(p.x + p.vx * 0.016, p.y + p.vy * 0.016);
          g.stroke({ width: p.size, color: 0x8899bb, alpha: p.alpha });
          break;

        case WeatherType.SNOW:
          // Snow: small filled circles
          g.circle(p.x, p.y, p.size);
          g.fill({ color: 0xffffff, alpha: p.alpha });
          break;

        case WeatherType.FOG:
          // Fog: large semi-transparent circles
          g.circle(p.x, p.y, p.size);
          g.fill({ color: 0xcccccc, alpha: p.alpha });
          break;

        case WeatherType.SANDSTORM:
          // Sand: small dots moving horizontally
          g.circle(p.x, p.y, p.size);
          g.fill({ color: 0xddaa55, alpha: p.alpha });
          break;

        case WeatherType.ASH_FALL:
          // Ash: small grey circles drifting down
          g.circle(p.x, p.y, p.size);
          g.fill({ color: 0x666666, alpha: p.alpha });
          break;

        default:
          break;
      }
    }
  }

  // ----------------------------------------------------------------
  // Internal – lightning
  // ----------------------------------------------------------------

  /** Pre-draw the lightning flash overlay (a full-screen white rect). */
  private _drawLightning(): void {
    const g = this._lightningGfx;
    g.clear();
    g.rect(0, 0, this._width, this._height).fill(0xffffff);
    g.alpha = 0;
  }

  private _updateLightning(dt: number, screenShake: boolean): void {
    // Fade existing flash.
    if (this._lightningFlash > 0) {
      this._lightningFlash = Math.max(0, this._lightningFlash - dt * 4);
      this._lightningGfx.alpha = this._lightningFlash;
    }

    // Decrement timer and potentially trigger a new flash.
    this._lightningTimer -= dt;
    if (this._lightningTimer <= 0) {
      this._lightningFlash = 0.6 + Math.random() * 0.4;
      this._lightningGfx.alpha = this._lightningFlash;
      // Random interval for next flash (2–8 seconds).
      this._lightningTimer = 2 + Math.random() * 6;

      // Trigger screen shake if enabled.
      if (screenShake && this._onScreenShake) {
        this._onScreenShake();
      }
    }
  }

  // ----------------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------------

  /** Destroy all Graphics objects and clear particles. */
  destroy(): void {
    this._particles.length = 0;
    this._particleGfx.destroy();
    this._tintOverlay.destroy();
    this._lightningGfx.destroy();
    this.container.destroy({ children: true });
  }
}
