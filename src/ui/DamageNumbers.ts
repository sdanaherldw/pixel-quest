import { Container, Text, TextStyle } from 'pixi.js';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/** Damage / feedback number category. */
export type DamageNumberType =
  | 'physical'
  | 'fire'
  | 'ice'
  | 'lightning'
  | 'poison'
  | 'holy'
  | 'healing'
  | 'critical'
  | 'miss'
  | 'xp';

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

/** Colour per damage type. */
const TYPE_COLORS: Record<DamageNumberType, number> = {
  physical: 0xffffff,
  fire: 0xff8833,
  ice: 0x66ddff,
  lightning: 0xffee44,
  poison: 0x44cc44,
  holy: 0xffd700,
  healing: 0x44cc44,
  critical: 0xffee44,
  miss: 0x999999,
  xp: 0xbb66ff,
};

const LIFETIME = 1.5; // seconds
const FADE_START = 1.0; // fade begins after this many seconds
const DRIFT_SPEED = 60; // pixels per second upward
const SCATTER_RANGE = 30; // max horizontal scatter in pixels
const DEFAULT_FONT_SIZE = 20;
const CRIT_SCALE = 1.5;
const POOL_INITIAL = 32;

// ------------------------------------------------------------------
// Pooled number entry
// ------------------------------------------------------------------

interface DamageEntry {
  text: Text;
  /** Seconds since spawn. */
  age: number;
  /** Horizontal velocity (pixels / sec). */
  vx: number;
  /** Vertical velocity (pixels / sec, negative = upward). */
  vy: number;
  active: boolean;
}

// ------------------------------------------------------------------
// DamageNumbers
// ------------------------------------------------------------------

/**
 * Floating combat numbers that spawn at an entity position, drift
 * upward with random horizontal scatter, and fade out.
 *
 * Uses a simple object pool for efficiency — Text objects are reused
 * rather than created/destroyed each time.
 */
export class DamageNumbers {
  /** Root container — add to the UI or entity layer. */
  public readonly container: Container = new Container();

  /** Object pool. */
  private readonly _pool: DamageEntry[] = [];

  constructor() {
    this.container.label = 'DamageNumbers';
    // Pre-warm pool
    for (let i = 0; i < POOL_INITIAL; i++) {
      this._pool.push(this._createEntry());
    }
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Spawn a new floating number.
   *
   * @param x      World X position.
   * @param y      World Y position.
   * @param value  Numeric value to display (ignored for 'miss').
   * @param type   Category determining colour and formatting.
   */
  public spawn(x: number, y: number, value: number, type: DamageNumberType): void {
    const entry = this._acquire();

    // Format display string
    let displayStr: string;
    let fontSize = DEFAULT_FONT_SIZE;

    switch (type) {
      case 'miss':
        displayStr = 'MISS';
        break;
      case 'healing':
        displayStr = `+${value}`;
        break;
      case 'critical':
        displayStr = `CRIT! ${value}`;
        fontSize = Math.round(DEFAULT_FONT_SIZE * CRIT_SCALE);
        break;
      case 'xp':
        displayStr = `+${value} XP`;
        break;
      default:
        displayStr = `${value}`;
        break;
    }

    const color = TYPE_COLORS[type];

    // Reset style
    const style = entry.text.style as TextStyle;
    style.fontSize = fontSize;
    style.fill = color;
    entry.text.text = displayStr;

    // Position
    entry.text.x = x;
    entry.text.y = y;
    entry.text.alpha = 1;
    entry.text.scale.set(1);
    entry.text.visible = true;

    // Random scatter velocity
    entry.vx = (Math.random() - 0.5) * SCATTER_RANGE * 2;
    entry.vy = -DRIFT_SPEED;
    entry.age = 0;
    entry.active = true;
  }

  /**
   * Update all active numbers. Call once per frame.
   *
   * @param dt Frame delta in seconds.
   */
  public update(dt: number): void {
    for (const entry of this._pool) {
      if (!entry.active) continue;

      entry.age += dt;

      if (entry.age >= LIFETIME) {
        this._release(entry);
        continue;
      }

      // Move
      entry.text.x += entry.vx * dt;
      entry.text.y += entry.vy * dt;

      // Decelerate horizontal scatter
      entry.vx *= 0.96;

      // Fade during last portion
      if (entry.age > FADE_START) {
        const fadeRatio = 1 - (entry.age - FADE_START) / (LIFETIME - FADE_START);
        entry.text.alpha = Math.max(0, fadeRatio);
      }
    }
  }

  /**
   * Render pass (no-op — PixiJS renders via the container tree).
   * Provided for interface symmetry with other systems.
   */
  public render(): void {
    // Display list is updated in-place during update().
  }

  /** Destroy all resources. */
  public destroy(): void {
    this.container.destroy({ children: true });
    this._pool.length = 0;
  }

  // ------------------------------------------------------------------
  // Pool management
  // ------------------------------------------------------------------

  private _createEntry(): DamageEntry {
    const text = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: DEFAULT_FONT_SIZE,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 4 },
        align: 'center',
      }),
    });
    text.anchor.set(0.5, 0.5);
    text.visible = false;
    this.container.addChild(text);

    return {
      text,
      age: 0,
      vx: 0,
      vy: 0,
      active: false,
    };
  }

  /** Get an inactive entry from the pool, or create a new one. */
  private _acquire(): DamageEntry {
    for (const entry of this._pool) {
      if (!entry.active) return entry;
    }
    // Pool exhausted — grow
    const entry = this._createEntry();
    this._pool.push(entry);
    return entry;
  }

  /** Return an entry to the pool. */
  private _release(entry: DamageEntry): void {
    entry.active = false;
    entry.text.visible = false;
  }
}
