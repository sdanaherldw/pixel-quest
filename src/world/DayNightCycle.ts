// ------------------------------------------------------------------
// DayNightCycle – 24-minute real-time day/night system
// ------------------------------------------------------------------
//
// Maps 24 real-time minutes to 24 in-game hours (1 min = 1 hour).
// Maintains a global clock, computes the current TimeOfDay, and
// provides a PixiJS Graphics tint overlay + ambient light level
// that scenes can layer over the world.
//
// Usage:
//   const cycle = new DayNightCycle(1280, 720);
//   stage.addChild(cycle.container);   // above world, below UI/weather
//   // each frame:
//   cycle.update(dt);
//   const ambient = cycle.getAmbientLevel(); // 0..1
//   const tint = cycle.getTintColor();       // hex
// ------------------------------------------------------------------

import { Container, Graphics } from 'pixi.js';

// ==================================================================
// Enums & constants
// ==================================================================

/** Named periods of the in-game day. */
export enum TimeOfDay {
  DAWN = 'dawn',           // 05:00 – 07:00
  MORNING = 'morning',     // 07:00 – 10:00
  MIDDAY = 'midday',       // 10:00 – 14:00
  AFTERNOON = 'afternoon', // 14:00 – 17:00
  DUSK = 'dusk',           // 17:00 – 19:00
  EVENING = 'evening',     // 19:00 – 21:00
  NIGHT = 'night',         // 21:00 – 05:00
}

/**
 * Duration of one full in-game day in real-time seconds.
 * 24 minutes = 1440 seconds.
 */
const FULL_DAY_SECONDS = 24 * 60;

/**
 * Each colour stop defines the tint and ambient at a specific in-game
 * hour.  Values between stops are linearly interpolated.
 */
interface ColourStop {
  hour: number;
  /** Tint overlay colour (hex). */
  color: number;
  /** Tint overlay alpha (0 = invisible, 1 = solid). */
  alpha: number;
  /** Ambient light multiplier (0 = dark, 1 = fully lit). */
  ambient: number;
}

/** Ordered colour stops for the full 24-hour cycle. */
const COLOUR_STOPS: ColourStop[] = [
  // Night (deep blue, low ambient)
  { hour: 0,  color: 0x0a0a30, alpha: 0.55, ambient: 0.25 },
  // Pre-dawn (slightly lighter blue)
  { hour: 4,  color: 0x0a0a30, alpha: 0.50, ambient: 0.28 },
  // Dawn (warm orange)
  { hour: 5,  color: 0xff6622, alpha: 0.25, ambient: 0.50 },
  // Sunrise (light orange / yellow)
  { hour: 7,  color: 0xffcc44, alpha: 0.10, ambient: 0.80 },
  // Morning (nearly clear)
  { hour: 9,  color: 0xffffff, alpha: 0.0,  ambient: 0.95 },
  // Midday (clear)
  { hour: 12, color: 0xffffff, alpha: 0.0,  ambient: 1.00 },
  // Afternoon (very slight warm tint)
  { hour: 15, color: 0xffeedd, alpha: 0.03, ambient: 0.95 },
  // Dusk (deep orange / purple)
  { hour: 17, color: 0xff6622, alpha: 0.20, ambient: 0.65 },
  // Late dusk (purple)
  { hour: 19, color: 0x6622aa, alpha: 0.30, ambient: 0.45 },
  // Evening (dark blue-purple)
  { hour: 21, color: 0x1a1044, alpha: 0.45, ambient: 0.30 },
  // Night (wraps to 24 / 0)
  { hour: 24, color: 0x0a0a30, alpha: 0.55, ambient: 0.25 },
];

// ==================================================================
// DayNightCycle
// ==================================================================

export class DayNightCycle {
  // ----------------------------------------------------------------
  // Public
  // ----------------------------------------------------------------

  /** Container holding the tint overlay.  Add to stage above world. */
  public readonly container: Container;

  // ----------------------------------------------------------------
  // Internal state
  // ----------------------------------------------------------------

  /** Current in-game time in fractional hours [0, 24). */
  private _time = 8; // start at 08:00 (morning)

  /** Speed multiplier.  1 = normal (1 real min = 1 game hour). 0 = paused. */
  private _speed = 1;

  /** Screen dimensions for the tint overlay. */
  private _width: number;
  private _height: number;

  /** Graphics object for the colour tint overlay. */
  private readonly _tintOverlay: Graphics;

  /** Cached tint colour for external queries. */
  private _cachedTintColor: number = 0;

  /** Cached tint alpha for external queries. */
  private _cachedTintAlpha: number = 0;

  /** Cached ambient level for external queries. */
  private _cachedAmbient: number = 1;

  // ----------------------------------------------------------------
  // Constructor
  // ----------------------------------------------------------------

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;

    this.container = new Container();
    this.container.label = 'DayNightCycle';
    this.container.eventMode = 'none';

    this._tintOverlay = new Graphics();
    this._tintOverlay.label = 'DayNightTint';
    this.container.addChild(this._tintOverlay);

    // Draw initial state.
    this._recalculate();
    this._redraw();
  }

  // ----------------------------------------------------------------
  // Clock queries
  // ----------------------------------------------------------------

  /**
   * Current in-game time as a fractional hour [0, 24).
   * e.g. 13.5 = 1:30 PM.
   */
  getCurrentTime(): number {
    return this._time;
  }

  /**
   * Get the current hour (integer 0–23) and minute (integer 0–59).
   */
  getClockTime(): { hour: number; minute: number } {
    const hour = Math.floor(this._time) % 24;
    const minute = Math.floor((this._time - Math.floor(this._time)) * 60);
    return { hour, minute };
  }

  /** Determine which named period the current time falls within. */
  getTimeOfDay(): TimeOfDay {
    const h = this._time % 24;

    if (h >= 5 && h < 7) return TimeOfDay.DAWN;
    if (h >= 7 && h < 10) return TimeOfDay.MORNING;
    if (h >= 10 && h < 14) return TimeOfDay.MIDDAY;
    if (h >= 14 && h < 17) return TimeOfDay.AFTERNOON;
    if (h >= 17 && h < 19) return TimeOfDay.DUSK;
    if (h >= 19 && h < 21) return TimeOfDay.EVENING;
    return TimeOfDay.NIGHT; // 21–5
  }

  /**
   * Ambient light multiplier [0, 1].
   * 0 = pitch dark, 1 = full daylight.
   */
  getAmbientLevel(): number {
    return this._cachedAmbient;
  }

  /** Current tint overlay colour (hex). */
  getTintColor(): number {
    return this._cachedTintColor;
  }

  /** Current tint overlay alpha. */
  getTintAlpha(): number {
    return this._cachedTintAlpha;
  }

  /**
   * Check whether it is currently "night" in-game.
   * Useful for time-sensitive events (e.g. Moonpetal flowers).
   */
  isNight(): boolean {
    return this.getTimeOfDay() === TimeOfDay.NIGHT;
  }

  // ----------------------------------------------------------------
  // Clock control
  // ----------------------------------------------------------------

  /**
   * Jump to a specific in-game hour.  Values wrap at 24.
   * @param hour Fractional hour (e.g. 13.5 for 1:30 PM).
   */
  setTime(hour: number): void {
    this._time = ((hour % 24) + 24) % 24;
    this._recalculate();
    this._redraw();
  }

  /** Get the current speed multiplier. */
  getSpeed(): number {
    return this._speed;
  }

  /**
   * Set the clock speed.
   * - 0 = paused
   * - 1 = normal (1 real minute = 1 in-game hour)
   * - 2 = double speed, etc.
   */
  setSpeed(multiplier: number): void {
    this._speed = Math.max(0, multiplier);
  }

  /** Pause the day/night cycle (equivalent to setSpeed(0)). */
  pause(): void {
    this._speed = 0;
  }

  /** Resume at normal speed. */
  resume(): void {
    this._speed = 1;
  }

  // ----------------------------------------------------------------
  // Viewport
  // ----------------------------------------------------------------

  /** Update viewport dimensions (call on window resize). */
  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this._redraw();
  }

  // ----------------------------------------------------------------
  // Per-frame update
  // ----------------------------------------------------------------

  /**
   * Advance the in-game clock and update the tint overlay.
   * @param dt Frame delta in real-time seconds.
   */
  update(dt: number): void {
    if (this._speed <= 0) return;

    // Convert real seconds to in-game hours.
    // Full day = FULL_DAY_SECONDS real seconds = 24 game hours.
    const hoursPerSecond = 24 / FULL_DAY_SECONDS;
    this._time += dt * hoursPerSecond * this._speed;

    // Wrap around at 24.
    if (this._time >= 24) {
      this._time -= 24;
    }

    this._recalculate();
    this._redraw();
  }

  // ----------------------------------------------------------------
  // Internal – interpolation
  // ----------------------------------------------------------------

  /** Recalculate cached tint/ambient values from the colour stops. */
  private _recalculate(): void {
    const h = this._time % 24;

    // Find the two stops that bracket the current hour.
    let lower = COLOUR_STOPS[0];
    let upper = COLOUR_STOPS[1];

    for (let i = 0; i < COLOUR_STOPS.length - 1; i++) {
      if (h >= COLOUR_STOPS[i].hour && h < COLOUR_STOPS[i + 1].hour) {
        lower = COLOUR_STOPS[i];
        upper = COLOUR_STOPS[i + 1];
        break;
      }
    }

    // Interpolation factor (0 at lower, 1 at upper).
    const range = upper.hour - lower.hour;
    const t = range > 0 ? (h - lower.hour) / range : 0;

    this._cachedTintColor = DayNightCycle._lerpColor(lower.color, upper.color, t);
    this._cachedTintAlpha = lower.alpha + (upper.alpha - lower.alpha) * t;
    this._cachedAmbient = lower.ambient + (upper.ambient - lower.ambient) * t;
  }

  /** Redraw the tint overlay with current cached values. */
  private _redraw(): void {
    const g = this._tintOverlay;
    g.clear();

    if (this._cachedTintAlpha <= 0) {
      g.alpha = 0;
      return;
    }

    g.rect(0, 0, this._width, this._height).fill(this._cachedTintColor);
    g.alpha = this._cachedTintAlpha;
  }

  // ----------------------------------------------------------------
  // Internal – colour math
  // ----------------------------------------------------------------

  /** Linearly interpolate between two hex colours. */
  private static _lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff;
    const ag = (a >> 8) & 0xff;
    const ab = a & 0xff;

    const br = (b >> 16) & 0xff;
    const bg = (b >> 8) & 0xff;
    const bb = b & 0xff;

    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const blue = Math.round(ab + (bb - ab) * t);

    return (r << 16) | (g << 8) | blue;
  }

  // ----------------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------------

  destroy(): void {
    this._tintOverlay.destroy();
    this.container.destroy({ children: true });
  }
}
