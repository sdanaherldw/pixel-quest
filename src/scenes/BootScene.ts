import { Graphics, Text, TextStyle, Container } from 'pixi.js';
import gsap from 'gsap';

import { Scene } from '../engine/Scene';
import { TestScene } from './TestScene';

// ------------------------------------------------------------------
// Floating mote of light (ambient particle)
// ------------------------------------------------------------------

interface Mote {
  /** The Graphics circle display object. */
  gfx: Graphics;
  /** Current X position. */
  x: number;
  /** Current Y position. */
  y: number;
  /** Horizontal drift speed (px / s). */
  vx: number;
  /** Upward drift speed (px / s). */
  vy: number;
  /** Base alpha for pulsing. */
  baseAlpha: number;
  /** Phase offset for the sine pulse. */
  phase: number;
}

// ------------------------------------------------------------------
// BootScene
// ------------------------------------------------------------------

/**
 * Polished boot / loading scene for "Realms of Conquest".
 *
 * Displays the game title with a golden gradient, a loading bar that
 * fills over ~2 seconds, ambient floating motes of light, and a
 * pulsing "Press any key to continue" prompt.  Pressing any key after
 * the loading completes transitions to the TestScene.
 */
export class BootScene extends Scene {
  // Display objects
  private _bg!: Graphics;
  private _titleText!: Text;
  private _subtitleText!: Text;
  private _loadBarBg!: Graphics;
  private _loadBarFill!: Graphics;
  private _promptText!: Text;
  private _motesContainer!: Container;

  // State
  private _motes: Mote[] = [];
  private _loadingComplete: boolean = false;
  private _elapsed: number = 0;
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private _transitioning: boolean = false;

  constructor() {
    super('BootScene');
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  public async init(): Promise<void> {
    const w = this.engine.width;
    const h = this.engine.height;

    // --- Dark background ---
    this._bg = new Graphics();
    this._bg.rect(0, 0, w, h).fill(0x05050a);
    this._bg.alpha = 0;
    this.container.addChild(this._bg);

    // --- Floating motes container (behind text) ---
    this._motesContainer = new Container();
    this.container.addChild(this._motesContainer);
    this._spawnMotes(w, h);

    // --- Title text ---
    const titleStyle = new TextStyle({
      fontFamily: 'Georgia, "Palatino Linotype", "Book Antiqua", serif',
      fontSize: 62,
      fontWeight: 'bold',
      fill: 0xffd700,
      stroke: { color: 0x1a0a00, width: 6 },
      letterSpacing: 6,
      dropShadow: {
        color: '#ff8c00',
        blur: 16,
        distance: 0,
        alpha: 0.4,
      },
    });
    this._titleText = new Text({
      text: 'REALMS OF CONQUEST',
      style: titleStyle,
    });
    this._titleText.anchor.set(0.5, 0.5);
    this._titleText.position.set(w / 2, h * 0.32);
    this._titleText.alpha = 0;
    this.container.addChild(this._titleText);

    // --- Subtitle text ---
    const subtitleStyle = new TextStyle({
      fontFamily: 'Georgia, "Palatino Linotype", "Book Antiqua", serif',
      fontSize: 20,
      fontStyle: 'italic',
      fill: '#b8a080',
      letterSpacing: 3,
    });
    this._subtitleText = new Text({
      text: 'A Might & Magic Inspired Adventure',
      style: subtitleStyle,
    });
    this._subtitleText.anchor.set(0.5, 0.5);
    this._subtitleText.position.set(w / 2, h * 0.32 + 52);
    this._subtitleText.alpha = 0;
    this.container.addChild(this._subtitleText);

    // --- Loading bar background ---
    const barWidth = 400;
    const barHeight = 12;
    const barX = (w - barWidth) / 2;
    const barY = h * 0.58;

    this._loadBarBg = new Graphics();
    this._loadBarBg
      .roundRect(barX, barY, barWidth, barHeight, 6)
      .fill({ color: 0x222222, alpha: 0.8 });
    this._loadBarBg
      .roundRect(barX, barY, barWidth, barHeight, 6)
      .stroke({ color: 0x555544, width: 1 });
    this._loadBarBg.alpha = 0;
    this.container.addChild(this._loadBarBg);

    // --- Loading bar fill (starts at zero width) ---
    this._loadBarFill = new Graphics();
    this._loadBarFill.alpha = 0;
    this.container.addChild(this._loadBarFill);

    // --- "Press any key" prompt ---
    const promptStyle = new TextStyle({
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 18,
      fill: '#ccccaa',
      letterSpacing: 2,
    });
    this._promptText = new Text({
      text: 'Press any key to continue',
      style: promptStyle,
    });
    this._promptText.anchor.set(0.5, 0.5);
    this._promptText.position.set(w / 2, h * 0.68);
    this._promptText.alpha = 0;
    this.container.addChild(this._promptText);
  }

  public async enter(): Promise<void> {
    const w = this.engine.width;
    const h = this.engine.height;

    const barWidth = 400;
    const barHeight = 12;
    const barX = (w - barWidth) / 2;
    const barY = h * 0.58;

    // --- Phase 1: Fade in background ---
    gsap.to(this._bg, { alpha: 1, duration: 0.8, ease: 'power2.inOut' });

    // --- Phase 2: Fade in title (delayed) ---
    gsap.to(this._titleText, {
      alpha: 1,
      duration: 1.2,
      delay: 0.4,
      ease: 'power2.out',
    });

    // --- Phase 3: Fade in subtitle ---
    gsap.to(this._subtitleText, {
      alpha: 1,
      duration: 1.0,
      delay: 0.9,
      ease: 'power2.out',
    });

    // --- Phase 4: Show & fill loading bar ---
    gsap.to(this._loadBarBg, {
      alpha: 1,
      duration: 0.5,
      delay: 1.2,
      ease: 'power2.out',
    });
    gsap.to(this._loadBarFill, {
      alpha: 1,
      duration: 0.5,
      delay: 1.2,
      ease: 'power2.out',
    });

    // Animate loading bar fill over 2 seconds
    const loadProgress = { value: 0 };
    gsap.to(loadProgress, {
      value: 1,
      duration: 2,
      delay: 1.4,
      ease: 'power1.inOut',
      onUpdate: () => {
        this._drawLoadBar(barX, barY, barWidth, barHeight, loadProgress.value);
      },
      onComplete: () => {
        this._onLoadingComplete();
      },
    });
  }

  public update(dt: number): void {
    this._elapsed += dt;

    const w = this.engine.width;
    const h = this.engine.height;

    // --- Update motes ---
    for (const mote of this._motes) {
      mote.y += mote.vy * dt;
      mote.x += mote.vx * dt + Math.sin(this._elapsed * 1.5 + mote.phase) * 0.3;

      // Pulse alpha
      const pulse = 0.5 + 0.5 * Math.sin(this._elapsed * 2.0 + mote.phase);
      mote.gfx.alpha = mote.baseAlpha * pulse;
      mote.gfx.position.set(mote.x, mote.y);

      // Reset mote when it drifts off the top
      if (mote.y < -20) {
        mote.y = h + 20;
        mote.x = Math.random() * w;
      }
    }
  }

  public fixedUpdate(_dt: number): void {
    // No fixed-step logic needed for the boot screen.
  }

  public render(_alpha: number): void {
    // All rendering is handled by PixiJS display objects and GSAP tweens.
    // Resize handling: reposition elements if the viewport changed.
    const w = this.engine.width;
    const h = this.engine.height;

    this._bg.clear().rect(0, 0, w, h).fill(0x05050a);
    this._titleText.position.set(w / 2, h * 0.32);
    this._subtitleText.position.set(w / 2, h * 0.32 + 52);
    this._promptText.position.set(w / 2, h * 0.68);
  }

  public async exit(): Promise<void> {
    // Remove key listener
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }

    // Kill all GSAP tweens targeting our display objects
    gsap.killTweensOf(this._bg);
    gsap.killTweensOf(this._titleText);
    gsap.killTweensOf(this._subtitleText);
    gsap.killTweensOf(this._loadBarBg);
    gsap.killTweensOf(this._loadBarFill);
    gsap.killTweensOf(this._promptText);
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Redraws the loading bar fill to reflect current progress.
   */
  private _drawLoadBar(
    x: number,
    y: number,
    fullWidth: number,
    height: number,
    progress: number,
  ): void {
    const fillWidth = Math.max(0, fullWidth * progress);
    this._loadBarFill.clear();

    if (fillWidth > 0) {
      // Golden gradient bar
      this._loadBarFill
        .roundRect(x + 1, y + 1, fillWidth - 2, height - 2, 5)
        .fill(0xdaa520);

      // Bright highlight on top half
      this._loadBarFill
        .roundRect(x + 2, y + 2, fillWidth - 4, (height - 4) / 2, 3)
        .fill({ color: 0xffd700, alpha: 0.5 });
    }
  }

  /**
   * Called when the loading bar animation completes.
   * Shows the "press any key" prompt with a pulsing animation.
   */
  private _onLoadingComplete(): void {
    this._loadingComplete = true;

    // Pulse the prompt text in and out continuously
    gsap.to(this._promptText, {
      alpha: 1,
      duration: 0.6,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(this._promptText, {
          alpha: 0.25,
          duration: 1.0,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });
      },
    });

    // Listen for any key press
    this._keyHandler = (_e: KeyboardEvent) => {
      if (this._loadingComplete && !this._transitioning) {
        this._transitioning = true;
        this._transitionToGame();
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  /**
   * Fade out and transition to the TestScene.
   */
  private _transitionToGame(): void {
    // Fade everything out
    const tl = gsap.timeline({
      onComplete: () => {
        void this.engine.scenes.replace(new TestScene());
      },
    });

    tl.to(this._promptText, { alpha: 0, duration: 0.3, ease: 'power2.in' }, 0);
    tl.to(this._titleText, { alpha: 0, duration: 0.5, ease: 'power2.in' }, 0.1);
    tl.to(this._subtitleText, { alpha: 0, duration: 0.5, ease: 'power2.in' }, 0.1);
    tl.to(this._loadBarBg, { alpha: 0, duration: 0.4, ease: 'power2.in' }, 0.1);
    tl.to(this._loadBarFill, { alpha: 0, duration: 0.4, ease: 'power2.in' }, 0.1);
    tl.to(this._motesContainer, { alpha: 0, duration: 0.6, ease: 'power2.in' }, 0.2);
    tl.to(this._bg, { alpha: 0, duration: 0.8, ease: 'power2.in' }, 0.3);
  }

  /**
   * Creates ambient floating mote particles across the screen.
   */
  private _spawnMotes(w: number, h: number): void {
    const moteCount = 30;

    for (let i = 0; i < moteCount; i++) {
      const radius = 1.5 + Math.random() * 2.5;
      const gfx = new Graphics();
      gfx.circle(0, 0, radius).fill({ color: 0xffd700, alpha: 1 });

      // Smaller glow ring around the mote
      gfx.circle(0, 0, radius * 2.5).fill({ color: 0xffd700, alpha: 0.15 });

      const x = Math.random() * w;
      const y = Math.random() * h;
      gfx.position.set(x, y);

      const mote: Mote = {
        gfx,
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: -(10 + Math.random() * 25), // drift upward
        baseAlpha: 0.3 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
      };

      gfx.alpha = mote.baseAlpha * 0.5;
      this._motesContainer.addChild(gfx);
      this._motes.push(mote);
    }
  }
}
