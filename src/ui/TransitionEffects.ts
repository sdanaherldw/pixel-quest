import { Container, Graphics } from 'pixi.js';
import gsap from 'gsap';

import type { SceneTransition } from '../engine/SceneManager';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Default screen dimensions – used as fallback when the stage has no size. */
const DEFAULT_W = 1280;
const DEFAULT_H = 720;

/** Return the visible area of the stage (renderer screen). */
function stageSize(stage: Container): { w: number; h: number } {
  // In PixiJS v8 the Application's stage is a regular Container.
  // The renderer screen bounds are available only on the Application
  // instance, but we can read the stage's own bounds as a fallback.
  const bounds = stage.getBounds();
  const w = bounds.width > 0 ? bounds.width : DEFAULT_W;
  const h = bounds.height > 0 ? bounds.height : DEFAULT_H;
  return { w, h };
}

// ==================================================================
// FadeTransition
// ==================================================================

/**
 * Simple full-screen colour fade.
 *
 * **out** – fades overlay from transparent to opaque (hides old scene).
 * **in**  – fades overlay from opaque to transparent (reveals new scene).
 */
export class FadeTransition implements SceneTransition {
  private readonly _duration: number;
  private readonly _color: number;

  private _overlay!: Graphics;
  private _stage!: Container;

  constructor(duration: number = 0.5, color: number = 0x000000) {
    this._duration = duration;
    this._color = color;
  }

  async init(stage: Container): Promise<void> {
    this._stage = stage;
    const { w, h } = stageSize(stage);

    this._overlay = new Graphics();
    this._overlay.rect(0, 0, w, h).fill(this._color);
    this._overlay.alpha = 0;
    stage.addChild(this._overlay);
  }

  async out(): Promise<void> {
    return new Promise<void>((resolve) => {
      gsap.to(this._overlay, {
        alpha: 1,
        duration: this._duration,
        ease: 'power2.inOut',
        onComplete: resolve,
      });
    });
  }

  async in(): Promise<void> {
    return new Promise<void>((resolve) => {
      gsap.to(this._overlay, {
        alpha: 0,
        duration: this._duration,
        ease: 'power2.inOut',
        onComplete: resolve,
      });
    });
  }

  destroy(): void {
    gsap.killTweensOf(this._overlay);
    if (this._overlay.parent) {
      this._stage.removeChild(this._overlay);
    }
    this._overlay.destroy();
  }
}

// ==================================================================
// WipeTransition
// ==================================================================

/** Supported wipe directions. */
export type WipeDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Directional wipe / slide transition.
 *
 * A solid rectangle slides in from the specified edge to cover the screen
 * during **out**, then slides away in the same direction during **in**.
 */
export class WipeTransition implements SceneTransition {
  private readonly _duration: number;
  private readonly _direction: WipeDirection;
  private readonly _color: number;

  private _overlay!: Graphics;
  private _stage!: Container;
  private _w!: number;
  private _h!: number;

  constructor(
    duration: number = 0.5,
    direction: WipeDirection = 'left',
    color: number = 0x000000,
  ) {
    this._duration = duration;
    this._direction = direction;
    this._color = color;
  }

  async init(stage: Container): Promise<void> {
    this._stage = stage;
    const { w, h } = stageSize(stage);
    this._w = w;
    this._h = h;

    this._overlay = new Graphics();
    this._overlay.rect(0, 0, w, h).fill(this._color);

    // Position the overlay just outside the visible area.
    this._setOffScreen();
    stage.addChild(this._overlay);
  }

  async out(): Promise<void> {
    // Slide from off-screen to cover the visible area.
    return new Promise<void>((resolve) => {
      gsap.to(this._overlay, {
        x: 0,
        y: 0,
        duration: this._duration,
        ease: 'power2.inOut',
        onComplete: resolve,
      });
    });
  }

  async in(): Promise<void> {
    // Slide away in the same direction to reveal the new scene.
    const target = this._getOffScreenTarget();

    return new Promise<void>((resolve) => {
      gsap.to(this._overlay, {
        x: target.x,
        y: target.y,
        duration: this._duration,
        ease: 'power2.inOut',
        onComplete: resolve,
      });
    });
  }

  destroy(): void {
    gsap.killTweensOf(this._overlay);
    if (this._overlay.parent) {
      this._stage.removeChild(this._overlay);
    }
    this._overlay.destroy();
  }

  // ----------------------------------------------------------------
  // Internal helpers
  // ----------------------------------------------------------------

  /** Place the overlay just outside the screen on the incoming edge. */
  private _setOffScreen(): void {
    switch (this._direction) {
      case 'left':
        this._overlay.x = -this._w;
        this._overlay.y = 0;
        break;
      case 'right':
        this._overlay.x = this._w;
        this._overlay.y = 0;
        break;
      case 'up':
        this._overlay.x = 0;
        this._overlay.y = -this._h;
        break;
      case 'down':
        this._overlay.x = 0;
        this._overlay.y = this._h;
        break;
    }
  }

  /** Return the position the overlay should animate to when leaving. */
  private _getOffScreenTarget(): { x: number; y: number } {
    switch (this._direction) {
      case 'left':
        return { x: this._w, y: 0 };
      case 'right':
        return { x: -this._w, y: 0 };
      case 'up':
        return { x: 0, y: this._h };
      case 'down':
        return { x: 0, y: -this._h };
    }
  }
}

// ==================================================================
// DiamondTransition
// ==================================================================

/**
 * Classic RPG-style diamond / iris wipe.
 *
 * A diamond-shaped mask grows from the centre outward (**in**) or
 * shrinks from full-screen to nothing (**out**), producing the
 * iconic "iris" effect found in many 16-bit RPGs.
 *
 * Implementation: a solid overlay covers the screen; a diamond-shaped
 * Graphics object is used as a mask on that overlay.  During **out**
 * the diamond shrinks so the overlay is fully visible (screen covered).
 * During **in** the diamond grows so the overlay is fully masked
 * (screen revealed).
 *
 * Because PixiJS masks reveal where the mask is drawn, we actually
 * invert the approach: we draw the overlay with a cutout.  Instead of
 * masking, we draw the overlay as a full-screen rectangle with a
 * diamond-shaped hole that we scale with GSAP.
 *
 * Simplest reliable approach for v8: animate the diamond overlay
 * directly.  We draw four triangles forming the border around the
 * diamond opening each frame via a GSAP onUpdate callback.
 */
export class DiamondTransition implements SceneTransition {
  private readonly _duration: number;
  private readonly _color: number;

  private _overlay!: Graphics;
  private _stage!: Container;
  private _w!: number;
  private _h!: number;

  /** Ranges from 0 (no opening – screen covered) to 1 (full opening – screen clear). */
  private _progress = { value: 0 };

  constructor(duration: number = 0.6, color: number = 0x000000) {
    this._duration = duration;
    this._color = color;
  }

  async init(stage: Container): Promise<void> {
    this._stage = stage;
    const { w, h } = stageSize(stage);
    this._w = w;
    this._h = h;

    this._overlay = new Graphics();
    stage.addChild(this._overlay);

    // Start fully open (progress = 1, no overlay visible).
    this._progress.value = 1;
    this._redraw();
  }

  async out(): Promise<void> {
    // Diamond closes: opening goes from 1 → 0 (fully covered).
    this._progress.value = 1;

    return new Promise<void>((resolve) => {
      gsap.to(this._progress, {
        value: 0,
        duration: this._duration,
        ease: 'power2.inOut',
        onUpdate: () => this._redraw(),
        onComplete: resolve,
      });
    });
  }

  async in(): Promise<void> {
    // Diamond opens: opening goes from 0 → 1 (fully revealed).
    this._progress.value = 0;

    return new Promise<void>((resolve) => {
      gsap.to(this._progress, {
        value: 1,
        duration: this._duration,
        ease: 'power2.inOut',
        onUpdate: () => this._redraw(),
        onComplete: resolve,
      });
    });
  }

  destroy(): void {
    gsap.killTweensOf(this._progress);
    if (this._overlay.parent) {
      this._stage.removeChild(this._overlay);
    }
    this._overlay.destroy();
  }

  // ----------------------------------------------------------------
  // Internal drawing
  // ----------------------------------------------------------------

  /**
   * Redraw the overlay with a diamond-shaped hole at the current
   * progress.  When `progress` is 0 the hole has zero size and the
   * overlay covers the entire screen.  When `progress` is 1 the hole
   * is large enough to reveal the full screen.
   */
  private _redraw(): void {
    const g = this._overlay;
    g.clear();

    const t = this._progress.value;

    if (t >= 1) {
      // Fully open – nothing to draw.
      return;
    }

    if (t <= 0) {
      // Fully closed – solid rectangle.
      g.rect(0, 0, this._w, this._h).fill(this._color);
      return;
    }

    const cx = this._w / 2;
    const cy = this._h / 2;

    // The half-diagonal of the screen – the diamond must reach this
    // size to completely reveal the screen.
    const maxRadius = Math.sqrt(cx * cx + cy * cy);
    const r = t * maxRadius;

    // Diamond tip positions (centred on screen).
    const top = { x: cx, y: cy - r };
    const right = { x: cx + r, y: cy };
    const bottom = { x: cx, y: cy + r };
    const left = { x: cx - r, y: cy };

    // Draw four trapezoids/triangles that fill the area OUTSIDE the
    // diamond but inside the screen rectangle.  This is equivalent to
    // a full-screen rect with a diamond cut out.

    // Top region: screen top-left → screen top-right → diamond right → diamond top → diamond left
    g.moveTo(0, 0);
    g.lineTo(this._w, 0);
    g.lineTo(right.x, right.y);
    g.lineTo(top.x, top.y);
    g.lineTo(left.x, left.y);
    g.closePath();
    g.fill(this._color);

    // Right region: screen top-right → screen bottom-right → diamond bottom → diamond right
    g.moveTo(this._w, 0);
    g.lineTo(this._w, this._h);
    g.lineTo(bottom.x, bottom.y);
    g.lineTo(right.x, right.y);
    g.closePath();
    g.fill(this._color);

    // Bottom region: screen bottom-right → screen bottom-left → diamond left → diamond bottom
    g.moveTo(this._w, this._h);
    g.lineTo(0, this._h);
    g.lineTo(left.x, left.y);
    g.lineTo(bottom.x, bottom.y);
    g.closePath();
    g.fill(this._color);

    // Left region: screen bottom-left → screen top-left → diamond top → diamond left
    g.moveTo(0, this._h);
    g.lineTo(0, 0);
    g.lineTo(top.x, top.y);
    g.lineTo(left.x, left.y);
    g.closePath();
    g.fill(this._color);
  }
}
