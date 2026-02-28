import { Graphics, Text, TextStyle, Container } from 'pixi.js';
import gsap from 'gsap';

import { Scene } from '../engine/Scene';
import { TitleScene } from './TitleScene';
import { FadeTransition } from '@/ui/TransitionEffects';

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
  /** Radius of the mote core. */
  radius: number;
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
 * Displays the game title with a golden gradient, a subtitle, a loading
 * bar that fills over ~2 seconds, ambient floating motes of light, and
 * a pulsing "Press any key to continue" prompt.  Pressing any key after
 * the loading completes transitions to the TestScene.
 */
export class BootScene extends Scene {
  // ------------------------------------------------------------------
  // Display objects
  // ------------------------------------------------------------------

  private _bg!: Graphics;
  private _vignette!: Graphics;
  private _titleText!: Text;
  private _subtitleText!: Text;
  private _loadBarBg!: Graphics;
  private _loadBarFill!: Graphics;
  private _loadBarGlow!: Graphics;
  private _loadLabel!: Text;
  private _promptText!: Text;
  private _motesContainer!: Container;

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  private _motes: Mote[] = [];
  private _loadingComplete: boolean = false;
  private _elapsed: number = 0;
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private _pointerHandler: (() => void) | null = null;
  private _transitioning: boolean = false;

  // ------------------------------------------------------------------
  // Constants
  // ------------------------------------------------------------------

  private static readonly MOTE_COUNT = 35;
  private static readonly BAR_WIDTH = 420;
  private static readonly BAR_HEIGHT = 14;

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
    this._bg.rect(0, 0, w, h).fill(0x050510);
    this._bg.alpha = 0;
    this.container.addChild(this._bg);

    // --- Vignette overlay for atmospheric depth ---
    this._vignette = new Graphics();
    this._drawVignette(w, h);
    this._vignette.alpha = 0;
    this.container.addChild(this._vignette);

    // --- Floating motes container (behind text) ---
    this._motesContainer = new Container();
    this.container.addChild(this._motesContainer);
    this._spawnMotes(w, h);

    // --- Title text: "REALMS OF CONQUEST" ---
    const titleStyle = new TextStyle({
      fontFamily: 'Georgia, "Palatino Linotype", "Book Antiqua", serif',
      fontSize: 64,
      fontWeight: 'bold',
      fill: 0xffd700,
      stroke: { color: 0x1a0800, width: 6 },
      letterSpacing: 8,
      dropShadow: {
        color: '#ff8c00',
        blur: 20,
        distance: 0,
        alpha: 0.35,
      },
    });
    this._titleText = new Text({
      text: 'REALMS OF CONQUEST',
      style: titleStyle,
    });
    this._titleText.anchor.set(0.5, 0.5);
    this._titleText.position.set(w / 2, h * 0.30);
    this._titleText.alpha = 0;
    this.container.addChild(this._titleText);

    // --- Subtitle text ---
    const subtitleStyle = new TextStyle({
      fontFamily: 'Georgia, "Palatino Linotype", "Book Antiqua", serif',
      fontSize: 22,
      fontStyle: 'italic',
      fill: '#b8a080',
      letterSpacing: 3,
    });
    this._subtitleText = new Text({
      text: 'A Might & Magic Inspired Adventure',
      style: subtitleStyle,
    });
    this._subtitleText.anchor.set(0.5, 0.5);
    this._subtitleText.position.set(w / 2, h * 0.30 + 56);
    this._subtitleText.alpha = 0;
    this.container.addChild(this._subtitleText);

    // --- Loading bar background ---
    const barX = (w - BootScene.BAR_WIDTH) / 2;
    const barY = h * 0.56;

    this._loadBarBg = new Graphics();
    this._loadBarBg
      .roundRect(barX, barY, BootScene.BAR_WIDTH, BootScene.BAR_HEIGHT, 7)
      .fill({ color: 0x1a1a22, alpha: 0.9 });
    this._loadBarBg
      .roundRect(barX, barY, BootScene.BAR_WIDTH, BootScene.BAR_HEIGHT, 7)
      .stroke({ color: 0x44403a, width: 1.5 });
    this._loadBarBg.alpha = 0;
    this.container.addChild(this._loadBarBg);

    // --- Loading bar glow (drawn behind the fill for a bloom effect) ---
    this._loadBarGlow = new Graphics();
    this._loadBarGlow.alpha = 0;
    this.container.addChild(this._loadBarGlow);

    // --- Loading bar fill (starts at zero width) ---
    this._loadBarFill = new Graphics();
    this._loadBarFill.alpha = 0;
    this.container.addChild(this._loadBarFill);

    // --- "Loading..." label below bar ---
    const loadLabelStyle = new TextStyle({
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 13,
      fill: '#665f50',
      letterSpacing: 2,
    });
    this._loadLabel = new Text({
      text: 'LOADING...',
      style: loadLabelStyle,
    });
    this._loadLabel.anchor.set(0.5, 0);
    this._loadLabel.position.set(w / 2, barY + BootScene.BAR_HEIGHT + 10);
    this._loadLabel.alpha = 0;
    this.container.addChild(this._loadLabel);

    // --- "Press any key to continue" prompt ---
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
    this._promptText.position.set(w / 2, h * 0.70);
    this._promptText.alpha = 0;
    this.container.addChild(this._promptText);
  }

  public async enter(): Promise<void> {
    await super.enter();

    const w = this.engine.width;
    const h = this.engine.height;

    const barX = (w - BootScene.BAR_WIDTH) / 2;
    const barY = h * 0.56;

    // --- Phase 1: Fade in the dark background ---
    gsap.to(this._bg, { alpha: 1, duration: 1.0, ease: 'power2.inOut' });
    gsap.to(this._vignette, {
      alpha: 0.6,
      duration: 1.5,
      delay: 0.3,
      ease: 'power2.inOut',
    });

    // --- Phase 2: Fade in the title with a subtle scale-up ---
    this._titleText.scale.set(0.92);
    gsap.to(this._titleText, {
      alpha: 1,
      duration: 1.4,
      delay: 0.5,
      ease: 'power2.out',
    });
    gsap.to(this._titleText.scale, {
      x: 1,
      y: 1,
      duration: 1.8,
      delay: 0.5,
      ease: 'power3.out',
    });

    // --- Phase 3: Fade in subtitle ---
    gsap.to(this._subtitleText, {
      alpha: 1,
      duration: 1.0,
      delay: 1.0,
      ease: 'power2.out',
    });

    // --- Phase 4: Show & fill loading bar ---
    gsap.to(this._loadBarBg, {
      alpha: 1,
      duration: 0.5,
      delay: 1.4,
      ease: 'power2.out',
    });
    gsap.to(this._loadBarFill, {
      alpha: 1,
      duration: 0.5,
      delay: 1.4,
      ease: 'power2.out',
    });
    gsap.to(this._loadBarGlow, {
      alpha: 1,
      duration: 0.5,
      delay: 1.4,
      ease: 'power2.out',
    });
    gsap.to(this._loadLabel, {
      alpha: 1,
      duration: 0.5,
      delay: 1.4,
      ease: 'power2.out',
    });

    // Animate loading bar fill over 2 seconds
    const loadProgress = { value: 0 };
    gsap.to(loadProgress, {
      value: 1,
      duration: 2,
      delay: 1.6,
      ease: 'power1.inOut',
      onUpdate: () => {
        this._drawLoadBar(
          barX,
          barY,
          BootScene.BAR_WIDTH,
          BootScene.BAR_HEIGHT,
          loadProgress.value,
        );
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
      // Drift upward and wobble horizontally
      mote.y += mote.vy * dt;
      mote.x += mote.vx * dt + Math.sin(this._elapsed * 1.2 + mote.phase) * 0.25;

      // Pulse alpha with a sine wave
      const pulse = 0.4 + 0.6 * Math.sin(this._elapsed * 2.0 + mote.phase);
      mote.gfx.alpha = mote.baseAlpha * pulse;
      mote.gfx.position.set(mote.x, mote.y);

      // Respawn mote at the bottom when it drifts off the top
      if (mote.y < -30) {
        mote.y = h + 20 + Math.random() * 40;
        mote.x = Math.random() * w;
      }
    }
  }

  public fixedUpdate(_dt: number): void {
    // No fixed-step logic needed for the boot screen.
  }

  public render(_alpha: number): void {
    // Resize-aware repositioning of all elements.
    const w = this.engine.width;
    const h = this.engine.height;

    // Redraw background to fill the viewport
    this._bg.clear().rect(0, 0, w, h).fill(0x050510);
    this._drawVignette(w, h);

    // Reposition text elements
    this._titleText.position.set(w / 2, h * 0.30);
    this._subtitleText.position.set(w / 2, h * 0.30 + 56);
    this._promptText.position.set(w / 2, h * 0.70);

    // Reposition loading bar label
    const barY = h * 0.56;
    this._loadLabel.position.set(w / 2, barY + BootScene.BAR_HEIGHT + 10);
  }

  public async exit(): Promise<void> {
    // Remove event listeners
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this._pointerHandler) {
      window.removeEventListener('pointerdown', this._pointerHandler);
      this._pointerHandler = null;
    }

    // Kill all GSAP tweens targeting our display objects
    gsap.killTweensOf(this._bg);
    gsap.killTweensOf(this._vignette);
    gsap.killTweensOf(this._titleText);
    gsap.killTweensOf(this._titleText.scale);
    gsap.killTweensOf(this._subtitleText);
    gsap.killTweensOf(this._loadBarBg);
    gsap.killTweensOf(this._loadBarFill);
    gsap.killTweensOf(this._loadBarGlow);
    gsap.killTweensOf(this._loadLabel);
    gsap.killTweensOf(this._promptText);
    gsap.killTweensOf(this._motesContainer);
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Draws a soft vignette overlay to darken the edges of the screen.
   */
  private _drawVignette(w: number, h: number): void {
    this._vignette.clear();

    const edgeSize = Math.max(w, h) * 0.35;

    // Top edge
    this._vignette
      .rect(0, 0, w, edgeSize)
      .fill({ color: 0x000008, alpha: 0.4 });
    // Bottom edge
    this._vignette
      .rect(0, h - edgeSize, w, edgeSize)
      .fill({ color: 0x000008, alpha: 0.5 });
    // Left edge
    this._vignette
      .rect(0, 0, edgeSize, h)
      .fill({ color: 0x000008, alpha: 0.3 });
    // Right edge
    this._vignette
      .rect(w - edgeSize, 0, edgeSize, h)
      .fill({ color: 0x000008, alpha: 0.3 });
  }

  /**
   * Redraws the loading bar fill to reflect current progress (0 - 1).
   */
  private _drawLoadBar(
    x: number,
    y: number,
    fullWidth: number,
    height: number,
    progress: number,
  ): void {
    const fillWidth = Math.max(0, (fullWidth - 4) * progress);

    // --- Glow behind the bar ---
    this._loadBarGlow.clear();
    if (fillWidth > 0) {
      this._loadBarGlow
        .roundRect(x - 4, y - 4, fillWidth + 12, height + 8, 10)
        .fill({ color: 0xdaa520, alpha: 0.08 });
    }

    // --- Main fill ---
    this._loadBarFill.clear();
    if (fillWidth > 0) {
      // Base golden fill
      this._loadBarFill
        .roundRect(x + 2, y + 2, fillWidth, height - 4, 5)
        .fill(0xc89520);

      // Bright highlight on top half for a beveled look
      this._loadBarFill
        .roundRect(x + 3, y + 3, fillWidth - 2, (height - 6) / 2, 4)
        .fill({ color: 0xffd700, alpha: 0.55 });

      // Tip glow: brighter spot at the leading edge
      if (fillWidth > 6) {
        const tipX = x + 2 + fillWidth - 4;
        const tipY = y + height / 2;
        this._loadBarFill
          .circle(tipX, tipY, 6)
          .fill({ color: 0xffeedd, alpha: 0.3 });
      }
    }
  }

  /**
   * Called when the loading bar animation completes.
   * Hides the loading label, shows the pulsing prompt, and listens for input.
   */
  private _onLoadingComplete(): void {
    this._loadingComplete = true;

    // Fade out the loading label
    gsap.to(this._loadLabel, {
      alpha: 0,
      duration: 0.4,
      ease: 'power2.in',
    });

    // Fade in the prompt, then start a continuous pulse
    gsap.to(this._promptText, {
      alpha: 1,
      duration: 0.6,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(this._promptText, {
          alpha: 0.2,
          duration: 1.2,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });
      },
    });

    // Listen for any key press
    this._keyHandler = (_e: KeyboardEvent) => {
      this._tryTransition();
    };
    window.addEventListener('keydown', this._keyHandler);

    // Also listen for mouse / touch
    this._pointerHandler = () => {
      this._tryTransition();
    };
    window.addEventListener('pointerdown', this._pointerHandler);
  }

  /**
   * Guard against double-transitions before kicking off the fade-out.
   */
  private _tryTransition(): void {
    if (this._loadingComplete && !this._transitioning) {
      this._transitioning = true;
      this._transitionToGame();
    }
  }

  /**
   * Fade everything out in a staggered sequence, then transition to TestScene.
   */
  private _transitionToGame(): void {
    const tl = gsap.timeline({
      onComplete: () => {
        void this.engine.scenes.replace(new TitleScene(), new FadeTransition(0.6));
      },
    });

    // Stagger the fade-out for a cinematic feel
    tl.to(this._promptText, { alpha: 0, duration: 0.3, ease: 'power2.in' }, 0);
    tl.to(this._loadBarFill, { alpha: 0, duration: 0.4, ease: 'power2.in' }, 0.05);
    tl.to(this._loadBarGlow, { alpha: 0, duration: 0.4, ease: 'power2.in' }, 0.05);
    tl.to(this._loadBarBg, { alpha: 0, duration: 0.4, ease: 'power2.in' }, 0.1);
    tl.to(this._subtitleText, { alpha: 0, duration: 0.5, ease: 'power2.in' }, 0.1);
    tl.to(this._titleText, { alpha: 0, duration: 0.6, ease: 'power2.in' }, 0.15);
    tl.to(this._motesContainer, { alpha: 0, duration: 0.7, ease: 'power2.in' }, 0.2);
    tl.to(this._vignette, { alpha: 0, duration: 0.6, ease: 'power2.in' }, 0.2);
    tl.to(this._bg, { alpha: 0, duration: 0.8, ease: 'power2.in' }, 0.3);
  }

  /**
   * Creates ambient floating mote particles scattered across the screen.
   * Each mote is a small Graphics circle with a soft glow ring that
   * drifts slowly upward and pulses in opacity.
   */
  private _spawnMotes(w: number, h: number): void {
    for (let i = 0; i < BootScene.MOTE_COUNT; i++) {
      const radius = 1.2 + Math.random() * 2.8;
      const gfx = new Graphics();

      // Outer glow ring (drawn first so core renders on top)
      gfx.circle(0, 0, radius * 3).fill({ color: 0xffd700, alpha: 0.08 });
      // Core circle
      gfx.circle(0, 0, radius).fill({ color: 0xffeebb, alpha: 1 });

      const x = Math.random() * w;
      const y = Math.random() * h;
      gfx.position.set(x, y);

      const mote: Mote = {
        gfx,
        x,
        y,
        radius,
        vx: (Math.random() - 0.5) * 8,
        vy: -(8 + Math.random() * 22), // drift upward at varying speeds
        baseAlpha: 0.25 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
      };

      gfx.alpha = mote.baseAlpha * 0.5;
      this._motesContainer.addChild(gfx);
      this._motes.push(mote);
    }
  }
}
