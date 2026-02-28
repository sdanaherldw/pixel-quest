import { Container, Graphics } from 'pixi.js';
import gsap from 'gsap';

import type { Camera } from '@/engine/Camera';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface LetterboxOptions {
  /** Height of each bar in pixels. @default 60 */
  barHeight?: number;
  /** Tween duration in seconds. @default 0.6 */
  duration?: number;
}

export interface PanToOptions {
  /** World X to pan to. */
  x: number;
  /** World Y to pan to. */
  y: number;
  /** Duration in seconds. @default 1.5 */
  duration?: number;
  /** GSAP ease. @default 'power2.inOut' */
  ease?: string;
}

export interface BossIntroOptions {
  /** Boss world position X. */
  x: number;
  /** Boss world position Y. */
  y: number;
  /** Zoom level during intro. @default 1.5 */
  zoom?: number;
  /** Slow-motion time scale (0-1). @default 0.3 */
  slowMo?: number;
  /** Duration of the intro in seconds. @default 3 */
  duration?: number;
}

export interface FreezeFrameOptions {
  /** Duration of the freeze in seconds. @default 0.5 */
  duration?: number;
  /** Flash intensity (0-1). @default 0.8 */
  flashIntensity?: number;
}

// ------------------------------------------------------------------
// CinematicCamera
// ------------------------------------------------------------------

/**
 * Cinematic camera controller layered on top of the core Camera.
 *
 * Provides letterbox bars, scripted pans, boss intros with slow-mo,
 * freeze-frame effects, and zoom pulses — all driven by GSAP.
 *
 * Usage:
 * ```ts
 * const cinematic = new CinematicCamera(engine.camera, engine.uiContainer, w, h);
 * await cinematic.letterboxIn();
 * await cinematic.panTo({ x: 500, y: 300 });
 * await cinematic.letterboxOut();
 * cinematic.destroy();
 * ```
 */
export class CinematicCamera {
  private readonly _camera: Camera;

  // Letterbox bars
  private readonly _topBar: Graphics;
  private readonly _bottomBar: Graphics;
  private _letterboxActive: boolean = false;
  private _barHeight: number = 60;

  // Screen flash
  private readonly _flashOverlay: Graphics;

  // Viewport size
  private _screenW: number;
  private _screenH: number;

  // Time-scale tracking for slow-mo
  private _timeScale: number = 1;
  private _timeScaleTween: gsap.core.Tween | null = null;

  // Active tweens for cleanup
  private readonly _activeTweens: Set<gsap.core.Tween> = new Set();

  constructor(
    camera: Camera,
    uiContainer: Container,
    screenW: number,
    screenH: number,
  ) {
    this._camera = camera;
    this._screenW = screenW;
    this._screenH = screenH;

    // Letterbox bars (hidden above/below viewport)
    this._topBar = new Graphics();
    this._topBar.rect(0, 0, screenW, this._barHeight).fill(0x000000);
    this._topBar.y = -this._barHeight;
    this._topBar.zIndex = 9998;
    uiContainer.addChild(this._topBar);

    this._bottomBar = new Graphics();
    this._bottomBar.rect(0, 0, screenW, this._barHeight).fill(0x000000);
    this._bottomBar.y = screenH;
    this._bottomBar.zIndex = 9998;
    uiContainer.addChild(this._bottomBar);

    // Flash overlay (hidden)
    this._flashOverlay = new Graphics();
    this._flashOverlay.rect(0, 0, screenW, screenH).fill({ color: 0xffffff, alpha: 0 });
    this._flashOverlay.zIndex = 9999;
    this._flashOverlay.visible = false;
    uiContainer.addChild(this._flashOverlay);
  }

  // ------------------------------------------------------------------
  // Time scale (for slow-motion)
  // ------------------------------------------------------------------

  /** Current cinematic time scale (1 = normal, 0.3 = slow-mo). */
  public get timeScale(): number {
    return this._timeScale;
  }

  // ------------------------------------------------------------------
  // Letterbox
  // ------------------------------------------------------------------

  /** Animate letterbox bars into view. */
  public async letterboxIn(options: LetterboxOptions = {}): Promise<void> {
    const barH = options.barHeight ?? 60;
    const duration = options.duration ?? 0.6;
    this._barHeight = barH;
    this._letterboxActive = true;

    this._resizeBars();

    await Promise.all([
      this._tween(this._topBar, { y: 0, duration, ease: 'power2.out' }),
      this._tween(this._bottomBar, { y: this._screenH - barH, duration, ease: 'power2.out' }),
    ]);
  }

  /** Animate letterbox bars out of view. */
  public async letterboxOut(duration: number = 0.6): Promise<void> {
    await Promise.all([
      this._tween(this._topBar, { y: -this._barHeight, duration, ease: 'power2.in' }),
      this._tween(this._bottomBar, { y: this._screenH, duration, ease: 'power2.in' }),
    ]);
    this._letterboxActive = false;
  }

  // ------------------------------------------------------------------
  // Scripted pan
  // ------------------------------------------------------------------

  /** Smoothly pan the camera to a world position. */
  public async panTo(options: PanToOptions): Promise<void> {
    const duration = options.duration ?? 1.5;
    const ease = options.ease ?? 'power2.inOut';

    await this._tween(this._camera, {
      x: options.x,
      y: options.y,
      duration,
      ease,
    });
  }

  // ------------------------------------------------------------------
  // Zoom pulse
  // ------------------------------------------------------------------

  /** Quick zoom in then back out, for impact moments. */
  public async zoomPulse(
    zoomLevel: number = 1.3,
    duration: number = 0.4,
  ): Promise<void> {
    const originalZoom = this._camera.zoom;
    const halfDur = duration / 2;

    await this._tween(this._camera, {
      zoom: zoomLevel,
      duration: halfDur,
      ease: 'power2.out',
    });

    await this._tween(this._camera, {
      zoom: originalZoom,
      duration: halfDur,
      ease: 'power2.in',
    });
  }

  // ------------------------------------------------------------------
  // Boss intro
  // ------------------------------------------------------------------

  /**
   * Cinematic boss introduction sequence:
   * 1. Letterbox in
   * 2. Pan to boss position
   * 3. Zoom in + slow-mo
   * 4. Hold
   * 5. Zoom back + normal speed
   * 6. Letterbox out
   */
  public async bossIntro(options: BossIntroOptions): Promise<void> {
    const zoom = options.zoom ?? 1.5;
    const slowMo = options.slowMo ?? 0.3;
    const totalDuration = options.duration ?? 3;

    const panDur = totalDuration * 0.3;
    const holdDur = totalDuration * 0.4;
    const exitDur = totalDuration * 0.3;

    const originalZoom = this._camera.zoom;

    // Phase 1: Letterbox + pan to boss
    await this.letterboxIn({ duration: 0.4 });
    await this.panTo({ x: options.x, y: options.y, duration: panDur });

    // Phase 2: Zoom in + slow-mo
    await Promise.all([
      this._tween(this._camera, { zoom, duration: panDur * 0.5, ease: 'power2.out' }),
      this._setTimeScale(slowMo, panDur * 0.5),
    ]);

    // Phase 3: Hold
    await this._delay(holdDur);

    // Phase 4: Zoom out + restore speed
    await Promise.all([
      this._tween(this._camera, { zoom: originalZoom, duration: exitDur, ease: 'power2.inOut' }),
      this._setTimeScale(1, exitDur),
    ]);

    // Phase 5: Letterbox out
    await this.letterboxOut(0.4);
  }

  // ------------------------------------------------------------------
  // Freeze frame
  // ------------------------------------------------------------------

  /** Brief flash + pause effect for critical hits or dramatic moments. */
  public async freezeFrame(options: FreezeFrameOptions = {}): Promise<void> {
    const duration = options.duration ?? 0.5;
    const flashIntensity = options.flashIntensity ?? 0.8;

    // Flash in
    this._flashOverlay.visible = true;
    this._flashOverlay.alpha = 0;

    await this._tween(this._flashOverlay, {
      alpha: flashIntensity,
      duration: 0.05,
      ease: 'none',
    });

    // Hold
    await this._delay(duration);

    // Flash out
    await this._tween(this._flashOverlay, {
      alpha: 0,
      duration: 0.15,
      ease: 'power2.out',
    });

    this._flashOverlay.visible = false;
  }

  // ------------------------------------------------------------------
  // Slow motion
  // ------------------------------------------------------------------

  /** Transition to a slow-motion time scale. */
  public async slowMotion(scale: number = 0.3, duration: number = 0.5): Promise<void> {
    await this._setTimeScale(scale, duration);
  }

  /** Restore normal speed. */
  public async normalSpeed(duration: number = 0.5): Promise<void> {
    await this._setTimeScale(1, duration);
  }

  // ------------------------------------------------------------------
  // Resize
  // ------------------------------------------------------------------

  public resize(w: number, h: number): void {
    this._screenW = w;
    this._screenH = h;
    this._resizeBars();

    this._flashOverlay.clear();
    this._flashOverlay.rect(0, 0, w, h).fill({ color: 0xffffff, alpha: 0 });
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  public destroy(): void {
    // Kill all active tweens
    for (const tween of this._activeTweens) {
      tween.kill();
    }
    this._activeTweens.clear();
    this._timeScaleTween?.kill();

    // Remove display objects
    this._topBar.destroy();
    this._bottomBar.destroy();
    this._flashOverlay.destroy();
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private _resizeBars(): void {
    this._topBar.clear();
    this._topBar.rect(0, 0, this._screenW, this._barHeight).fill(0x000000);

    this._bottomBar.clear();
    this._bottomBar.rect(0, 0, this._screenW, this._barHeight).fill(0x000000);

    if (this._letterboxActive) {
      this._bottomBar.y = this._screenH - this._barHeight;
    }
  }

  /** Promisified gsap.to with automatic tween tracking. */
  private _tween(target: object, vars: gsap.TweenVars): Promise<void> {
    return new Promise<void>((resolve) => {
      const tween = gsap.to(target, {
        ...vars,
        onComplete: () => {
          this._activeTweens.delete(tween);
          resolve();
        },
      });
      this._activeTweens.add(tween);
    });
  }

  private async _setTimeScale(scale: number, duration: number): Promise<void> {
    this._timeScaleTween?.kill();

    return new Promise<void>((resolve) => {
      this._timeScaleTween = gsap.to(this, {
        _timeScale: scale,
        duration,
        ease: 'power2.inOut',
        onComplete: () => {
          this._timeScaleTween = null;
          resolve();
        },
      });
    });
  }

  private _delay(seconds: number): Promise<void> {
    return new Promise((resolve) => {
      const tween = gsap.delayedCall(seconds, () => {
        this._activeTweens.delete(tween as unknown as gsap.core.Tween);
        resolve();
      });
      this._activeTweens.add(tween as unknown as gsap.core.Tween);
    });
  }
}
