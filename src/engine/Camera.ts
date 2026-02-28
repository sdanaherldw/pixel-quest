import { Container, Rectangle } from 'pixi.js';
import gsap from 'gsap';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/** Anything with an x/y position the camera can follow. */
export interface CameraTarget {
  readonly x: number;
  readonly y: number;
}

/** Options for {@link Camera.follow}. */
export interface CameraFollowOptions {
  /** Smoothing factor (0 = instant snap, 1 = never moves).
   *  Internally used as `1 - (1 - lerp)^(dt*60)` for frame-rate
   *  independent smoothing. @default 0.1 */
  lerp?: number;

  /** Half-width of the dead zone in world pixels. The camera won't
   *  move horizontally while the target stays within this band
   *  around the current camera centre. @default 0 */
  deadZoneX?: number;

  /** Half-height of the dead zone in world pixels. @default 0 */
  deadZoneY?: number;

  /** Constant offset added to the target position (e.g. look-ahead). */
  offsetX?: number;
  offsetY?: number;
}

/** Axis-aligned rectangle in world space. */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Options for {@link Camera.shake}. */
export interface ShakeOptions {
  /** Maximum displacement in pixels. @default 8 */
  intensity?: number;

  /** Duration in seconds. @default 0.4 */
  duration?: number;

  /** Controls how the shake fades out (1 = linear, 2 = quadratic,
   *  etc.). Higher values make the shake die off faster. @default 1 */
  decayExponent?: number;
}

// ------------------------------------------------------------------
// Camera
// ------------------------------------------------------------------

/**
 * 2-D camera / viewport that drives the transform of a PixiJS
 * {@link Container} (the "world container").
 *
 * The camera works by applying the **inverse** of its world-space
 * transform to the target container.  Moving the camera right causes
 * the world to shift left, creating the illusion of a viewport
 * panning over the scene.
 *
 * ### Coordinate conventions
 *
 * * {@link x} and {@link y} represent the camera's position in
 *   **world space** (where in the game world the camera is looking).
 * * The camera is centred on the viewport by default: world position
 *   (0, 0) maps to the centre of the screen.
 *
 * ### Features
 *
 * * **Smooth follow** with dead zone and offset.
 * * **Screen shake** with configurable intensity, duration, and decay.
 * * **Zoom tweening** via GSAP.
 * * **World-bounds clamping** to prevent scrolling outside the map.
 * * **Coordinate conversion** between world and screen space.
 */
export class Camera {
  // ------------------------------------------------------------------
  // Public state
  // ------------------------------------------------------------------

  /** Camera centre X in world coordinates. */
  public x: number = 0;

  /** Camera centre Y in world coordinates. */
  public y: number = 0;

  /** Current zoom multiplier (1 = 100 %).  Values > 1 zoom in. */
  public zoom: number = 1;

  /** Camera rotation in radians. */
  public rotation: number = 0;

  // ------------------------------------------------------------------
  // World bounds clamping
  // ------------------------------------------------------------------

  /**
   * If set, the camera will not scroll past these world-space bounds.
   * When the viewport is larger than the bounds along an axis the
   * camera centres itself on that axis.
   */
  public worldBounds: WorldRect | null = null;

  // ------------------------------------------------------------------
  // Private state
  // ------------------------------------------------------------------

  /** The Container whose transform mirrors the camera. */
  private readonly _worldContainer: Container;

  /** Viewport size in screen (CSS) pixels – updated via {@link resize}. */
  private _viewportWidth: number;
  private _viewportHeight: number;

  // --- Follow ---
  private _target: CameraTarget | null = null;
  private _followLerp: number = 0.1;
  private _deadZoneX: number = 0;
  private _deadZoneY: number = 0;
  private _followOffsetX: number = 0;
  private _followOffsetY: number = 0;

  // --- Shake ---
  private _shakeIntensity: number = 0;
  private _shakeDuration: number = 0;
  private _shakeElapsed: number = 0;
  private _shakeDecay: number = 1;
  private _shakeOffsetX: number = 0;
  private _shakeOffsetY: number = 0;

  // --- Zoom tween ---
  private _zoomTween: gsap.core.Tween | null = null;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor(
    worldContainer: Container,
    viewportWidth: number,
    viewportHeight: number,
  ) {
    this._worldContainer = worldContainer;
    this._viewportWidth = viewportWidth;
    this._viewportHeight = viewportHeight;
  }

  // ------------------------------------------------------------------
  // Viewport
  // ------------------------------------------------------------------

  /** Viewport width in CSS pixels. */
  public get viewportWidth(): number {
    return this._viewportWidth;
  }

  /** Viewport height in CSS pixels. */
  public get viewportHeight(): number {
    return this._viewportHeight;
  }

  /** Update the viewport dimensions (call on window / renderer resize). */
  public resize(width: number, height: number): void {
    this._viewportWidth = width;
    this._viewportHeight = height;
  }

  // ------------------------------------------------------------------
  // Follow
  // ------------------------------------------------------------------

  /**
   * Begin tracking a target.  The camera will smoothly lerp towards
   * the target each frame.  Pass `null` to stop following.
   */
  public follow(
    target: CameraTarget | null,
    options: CameraFollowOptions = {},
  ): void {
    this._target = target;
    this._followLerp = options.lerp ?? 0.1;
    this._deadZoneX = options.deadZoneX ?? 0;
    this._deadZoneY = options.deadZoneY ?? 0;
    this._followOffsetX = options.offsetX ?? 0;
    this._followOffsetY = options.offsetY ?? 0;
  }

  /** Stop following the current target. */
  public unfollow(): void {
    this._target = null;
  }

  /** Instantly centre the camera on a world-space position (no lerp). */
  public lookAt(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  // ------------------------------------------------------------------
  // Shake
  // ------------------------------------------------------------------

  /**
   * Trigger a screen-shake effect.
   *
   * If a shake is already in progress, the new shake replaces it only
   * when its intensity is greater (to prevent a weak hit from
   * overriding a strong one).
   */
  public shake(options: ShakeOptions = {}): void {
    const intensity = options.intensity ?? 8;

    // Don't override a stronger ongoing shake.
    const remaining = this._shakeDuration - this._shakeElapsed;
    if (remaining > 0 && this._shakeIntensity > intensity) return;

    this._shakeIntensity = intensity;
    this._shakeDuration = options.duration ?? 0.4;
    this._shakeElapsed = 0;
    this._shakeDecay = options.decayExponent ?? 1;
  }

  // ------------------------------------------------------------------
  // Zoom
  // ------------------------------------------------------------------

  /**
   * Animate the zoom level using GSAP.
   *
   * @param level    Target zoom level.
   * @param duration Tween duration in seconds (default 0.5).
   * @returns A promise that resolves when the tween completes.
   */
  public zoomTo(level: number, duration: number = 0.5): Promise<void> {
    // Kill any in-progress zoom tween.
    this._zoomTween?.kill();

    return new Promise<void>((resolve) => {
      this._zoomTween = gsap.to(this, {
        zoom: level,
        duration,
        ease: 'power2.inOut',
        onComplete: () => {
          this._zoomTween = null;
          resolve();
        },
      });
    });
  }

  /** Instantly set the zoom level (kills any running tween). */
  public setZoom(level: number): void {
    this._zoomTween?.kill();
    this._zoomTween = null;
    this.zoom = level;
  }

  // ------------------------------------------------------------------
  // Queries
  // ------------------------------------------------------------------

  /**
   * Axis-aligned bounding box of the currently visible area in world
   * coordinates.  Useful for culling and spatial queries.
   */
  public getBounds(): Rectangle {
    const hw = (this._viewportWidth / 2) / this.zoom;
    const hh = (this._viewportHeight / 2) / this.zoom;

    return new Rectangle(
      this.x - hw,
      this.y - hh,
      hw * 2,
      hh * 2,
    );
  }

  /**
   * Convert a world-space position to screen (canvas) pixels.
   */
  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: (worldX - this.x) * this.zoom + this._viewportWidth / 2,
      y: (worldY - this.y) * this.zoom + this._viewportHeight / 2,
    };
  }

  /**
   * Convert a screen-space position (e.g. mouse click) to world
   * coordinates.
   */
  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this._viewportWidth / 2) / this.zoom + this.x,
      y: (screenY - this._viewportHeight / 2) / this.zoom + this.y,
    };
  }

  // ------------------------------------------------------------------
  // Per-frame update (called by Engine in fixed step)
  // ------------------------------------------------------------------

  /**
   * Advance follow logic and shake timer.
   *
   * Called by the engine every **fixed update** step.
   *
   * @param dt Fixed timestep delta in seconds.
   */
  public update(dt: number): void {
    this._updateFollow(dt);
    this._updateShake(dt);
    this._clampToBounds();
  }

  // ------------------------------------------------------------------
  // Apply transform to the world container
  // ------------------------------------------------------------------

  /**
   * Push the current camera state into the world container's transform.
   *
   * Called by the engine once per rendered frame, after all scene
   * render callbacks have run.
   */
  public applyTransform(): void {
    const c = this._worldContainer;

    // The container pivot represents the camera centre in world space.
    // Adding the shake offset here means the shake displaces the view
    // without affecting the logical camera position.
    c.pivot.set(
      this.x + this._shakeOffsetX,
      this.y + this._shakeOffsetY,
    );

    // Position the pivot point at the screen centre so the camera
    // naturally looks at (this.x, this.y).
    c.position.set(this._viewportWidth / 2, this._viewportHeight / 2);

    c.scale.set(this.zoom);
    c.rotation = -this.rotation;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private _updateFollow(dt: number): void {
    if (!this._target) return;

    const targetX = this._target.x + this._followOffsetX;
    const targetY = this._target.y + this._followOffsetY;

    // Dead zone: only start moving when the target is outside the zone.
    const dx = targetX - this.x;
    const dy = targetY - this.y;

    let moveX = 0;
    let moveY = 0;

    if (Math.abs(dx) > this._deadZoneX) {
      moveX = dx - Math.sign(dx) * this._deadZoneX;
    }
    if (Math.abs(dy) > this._deadZoneY) {
      moveY = dy - Math.sign(dy) * this._deadZoneY;
    }

    // Frame-rate independent exponential smoothing.
    // Since this runs in a fixed step, dt is constant, but the formula
    // still works correctly if the timestep ever varies.
    const t = 1 - Math.pow(1 - this._followLerp, dt * 60);

    this.x += moveX * t;
    this.y += moveY * t;
  }

  private _updateShake(dt: number): void {
    if (this._shakeElapsed >= this._shakeDuration) {
      this._shakeOffsetX = 0;
      this._shakeOffsetY = 0;
      return;
    }

    this._shakeElapsed += dt;

    const progress = Math.min(this._shakeElapsed / this._shakeDuration, 1);
    const decay = Math.pow(1 - progress, this._shakeDecay);
    const magnitude = this._shakeIntensity * decay;

    this._shakeOffsetX = (Math.random() * 2 - 1) * magnitude;
    this._shakeOffsetY = (Math.random() * 2 - 1) * magnitude;
  }

  private _clampToBounds(): void {
    if (!this.worldBounds) return;

    const halfW = (this._viewportWidth / 2) / this.zoom;
    const halfH = (this._viewportHeight / 2) / this.zoom;

    const bounds = this.worldBounds;

    const minX = bounds.x + halfW;
    const maxX = bounds.x + bounds.width - halfW;
    const minY = bounds.y + halfH;
    const maxY = bounds.y + bounds.height - halfH;

    // If the viewport is wider/taller than the world on an axis,
    // centre the camera on that axis instead of clamping.
    if (minX > maxX) {
      this.x = bounds.x + bounds.width / 2;
    } else {
      this.x = Math.max(minX, Math.min(maxX, this.x));
    }

    if (minY > maxY) {
      this.y = bounds.y + bounds.height / 2;
    } else {
      this.y = Math.max(minY, Math.min(maxY, this.y));
    }
  }
}
