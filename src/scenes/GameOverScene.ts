import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';

// ---------------------------------------------------------------------------
// Ember particle definition
// ---------------------------------------------------------------------------

interface EmberParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  rotation: number;
  rotSpeed: number;
}

// ---------------------------------------------------------------------------
// GameOverScene
// ---------------------------------------------------------------------------

/**
 * Game over screen with somber atmosphere.
 *
 * Features:
 * - Fade from black.
 * - "GAME OVER" in large red text with subtle pulse animation.
 * - Configurable cause of death text.
 * - Stats summary: Time Played, Enemies Defeated, Level Reached.
 * - Menu: "Load Last Save", "Return to Title" (keyboard navigable).
 * - Slowly falling grey ember particles.
 */
export class GameOverScene extends Scene {
  // ------------------------------------------------------------------
  // Display objects
  // ------------------------------------------------------------------

  private _bgGfx!: Graphics;
  private _gameOverText!: Text;
  private _causeText!: Text;
  private _statsContainer!: Container;
  private _menuContainer!: Container;
  private _particleGfx!: Graphics;

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  private _elapsed = 0;
  private _fadeAlpha = 1; // starts fully black, fades out
  private _fadeGfx!: Graphics;
  private _particles: EmberParticle[] = [];
  private _menuItems: string[] = ['Load Last Save', 'Return to Title'];
  private _selectedIndex = 0;
  private _menuTexts: Text[] = [];

  private static readonly PARTICLE_COUNT = 50;

  // ------------------------------------------------------------------
  // Configurable death cause
  // ------------------------------------------------------------------

  /** Static property to set the cause of death before pushing the scene. */
  public static causeOfDeath = 'Slain by unknown forces';

  private readonly _deathCause: string;

  constructor(causeOfDeath?: string) {
    super('GameOverScene');
    this._deathCause = causeOfDeath ?? GameOverScene.causeOfDeath;
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  public async init(): Promise<void> {
    const w = this.engine.width;
    const h = this.engine.height;

    // --- Dark red gradient background ---
    this._bgGfx = new Graphics();
    this._drawBackground(w, h);
    this.container.addChild(this._bgGfx);

    // --- Particle layer (behind text) ---
    this._particleGfx = new Graphics();
    this.container.addChild(this._particleGfx);
    this._spawnParticles(w, h);

    // --- "GAME OVER" title ---
    this._gameOverText = new Text({
      text: 'GAME OVER',
      style: new TextStyle({
        fontFamily: 'Georgia, "Palatino Linotype", serif',
        fontSize: 72,
        fontWeight: 'bold',
        fill: 0xcc2222,
        stroke: { color: 0x220000, width: 6 },
        letterSpacing: 10,
        dropShadow: {
          color: '#ff0000',
          blur: 20,
          distance: 0,
          alpha: 0.3,
        },
      }),
    });
    this._gameOverText.anchor.set(0.5, 0.5);
    this._gameOverText.position.set(w / 2, h * 0.2);
    this.container.addChild(this._gameOverText);

    // --- Cause of death ---
    this._causeText = new Text({
      text: this._deathCause,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 18,
        fontStyle: 'italic',
        fill: 0x884444,
        letterSpacing: 2,
      }),
    });
    this._causeText.anchor.set(0.5, 0);
    this._causeText.position.set(w / 2, h * 0.2 + 54);
    this.container.addChild(this._causeText);

    // --- Stats summary ---
    this._statsContainer = new Container();
    this._statsContainer.position.set(w / 2, h * 0.42);
    this.container.addChild(this._statsContainer);
    this._buildStats();

    // --- Menu options ---
    this._menuContainer = new Container();
    this._menuContainer.position.set(w / 2, h * 0.68);
    this.container.addChild(this._menuContainer);
    this._buildMenu();

    // --- Fade-from-black overlay ---
    this._fadeGfx = new Graphics();
    this._fadeGfx.rect(0, 0, w, h).fill(0x000000);
    this._fadeAlpha = 1;
    this.container.addChild(this._fadeGfx);
  }

  public update(dt: number): void {
    this._elapsed += dt;
    const w = this.engine.width;
    const h = this.engine.height;

    // --- Fade from black ---
    if (this._fadeAlpha > 0) {
      this._fadeAlpha = Math.max(0, this._fadeAlpha - dt * 0.8);
      this._fadeGfx.clear();
      this._fadeGfx.rect(0, 0, w, h).fill({ color: 0x000000, alpha: this._fadeAlpha });
    }

    // --- Pulse the GAME OVER text ---
    const pulse = 1.0 + 0.03 * Math.sin(this._elapsed * 2.5);
    this._gameOverText.scale.set(pulse);
    this._gameOverText.alpha = 0.85 + 0.15 * Math.sin(this._elapsed * 1.8);

    // --- Update ember particles ---
    this._particleGfx.clear();
    for (const p of this._particles) {
      p.y += p.vy * dt;
      p.x += p.vx * dt + Math.sin(this._elapsed * 1.5 + p.rotation) * 0.3 * dt * 60;
      p.rotation += p.rotSpeed * dt;

      const alphaFlicker = 0.5 + 0.5 * Math.sin(this._elapsed * 2 + p.rotation);
      const drawAlpha = p.alpha * alphaFlicker;

      // Draw particle as a small grey/orange ember
      const isEmber = p.alpha > 0.4;
      const color = isEmber ? 0x884433 : 0x666666;
      this._particleGfx
        .rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size * 1.5)
        .fill({ color, alpha: drawAlpha });

      // Wrap
      if (p.y > h + 20) {
        p.y = -10 - Math.random() * 30;
        p.x = Math.random() * w;
      }
    }

    // --- Menu navigation ---
    const input = this.engine.input;

    if (input.isActionJustPressed('moveUp')) {
      this._selectedIndex =
        (this._selectedIndex - 1 + this._menuItems.length) % this._menuItems.length;
      this._updateMenuStyles();
    }

    if (input.isActionJustPressed('moveDown')) {
      this._selectedIndex = (this._selectedIndex + 1) % this._menuItems.length;
      this._updateMenuStyles();
    }

    if (input.isActionJustPressed('interact')) {
      this._onMenuSelect();
    }
  }

  public fixedUpdate(_dt: number): void {
    // No fixed-rate logic.
  }

  public render(_alpha: number): void {
    // Dynamic rendering handled in update.
  }

  public override async exit(): Promise<void> {
    this._particles.length = 0;
  }

  public override destroy(): void {
    this._particles.length = 0;
    this._menuTexts.length = 0;
    super.destroy();
  }

  // ------------------------------------------------------------------
  // Background
  // ------------------------------------------------------------------

  private _drawBackground(w: number, h: number): void {
    const bands = 20;
    const bandH = h / bands;

    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const r = Math.round(0x10 + (0x1a - 0x10) * t);
      const g = Math.round(0x02 + (0x04 - 0x02) * t);
      const b = Math.round(0x02 + (0x06 - 0x02) * t);
      const color = (r << 16) | (g << 8) | b;
      this._bgGfx.rect(0, i * bandH, w, bandH + 1).fill(color);
    }

    // Vignette darkening
    const edgeH = h * 0.25;
    this._bgGfx.rect(0, 0, w, edgeH).fill({ color: 0x000000, alpha: 0.3 });
    this._bgGfx.rect(0, h - edgeH, w, edgeH).fill({ color: 0x000000, alpha: 0.4 });

    // Blood-red accent lines
    this._bgGfx.rect(0, 0, w, 2).fill({ color: 0x880000, alpha: 0.5 });
    this._bgGfx.rect(0, h - 2, w, 2).fill({ color: 0x880000, alpha: 0.5 });
  }

  // ------------------------------------------------------------------
  // Particles
  // ------------------------------------------------------------------

  private _spawnParticles(w: number, h: number): void {
    for (let i = 0; i < GameOverScene.PARTICLE_COUNT; i++) {
      this._particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 15,
        vy: 15 + Math.random() * 30,
        size: 1 + Math.random() * 3,
        alpha: 0.15 + Math.random() * 0.4,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 2,
      });
    }
  }

  // ------------------------------------------------------------------
  // Stats summary
  // ------------------------------------------------------------------

  private _buildStats(): void {
    const headerText = new Text({
      text: 'Journey Summary',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 16,
        fill: 0x884444,
        letterSpacing: 2,
      }),
    });
    headerText.anchor.set(0.5, 0);
    this._statsContainer.addChild(headerText);

    const stats = [
      { label: 'Time Played', value: '1h 23m' },
      { label: 'Enemies Defeated', value: '47' },
      { label: 'Level Reached', value: '8' },
    ];

    for (let i = 0; i < stats.length; i++) {
      const stat = stats[i];
      const y = 30 + i * 26;

      const labelText = new Text({
        text: `${stat.label}:`,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 12,
          fill: 0x888888,
        }),
      });
      labelText.anchor.set(1, 0);
      labelText.position.set(-10, y);
      this._statsContainer.addChild(labelText);

      const valText = new Text({
        text: stat.value,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 12,
          fontWeight: 'bold',
          fill: 0xcc8888,
        }),
      });
      valText.position.set(10, y);
      this._statsContainer.addChild(valText);
    }
  }

  // ------------------------------------------------------------------
  // Menu
  // ------------------------------------------------------------------

  private _buildMenu(): void {
    this._menuTexts = [];

    for (let i = 0; i < this._menuItems.length; i++) {
      const y = i * 50;
      const isSelected = i === this._selectedIndex;

      const menuText = new Text({
        text: this._menuItems[i],
        style: new TextStyle({
          fontFamily: 'Georgia, serif',
          fontSize: 20,
          fill: isSelected ? 0xffaaaa : 0x884444,
          letterSpacing: 2,
        }),
      });
      menuText.anchor.set(0.5, 0.5);
      menuText.position.set(0, y);
      menuText.scale.set(isSelected ? 1.1 : 1.0);
      this._menuContainer.addChild(menuText);
      this._menuTexts.push(menuText);
    }

    // Selection arrow indicator
    this._updateMenuStyles();
  }

  private _updateMenuStyles(): void {
    for (let i = 0; i < this._menuTexts.length; i++) {
      const isSelected = i === this._selectedIndex;
      const text = this._menuTexts[i];
      text.style.fill = isSelected ? 0xffaaaa : 0x884444;
      text.scale.set(isSelected ? 1.1 : 1.0);
    }
  }

  private _onMenuSelect(): void {
    const selected = this._menuItems[this._selectedIndex];

    if (selected === 'Return to Title') {
      void import('@/scenes/TitleScene').then(({ TitleScene }) => {
        void this.engine.scenes.replace(new TitleScene());
      });
    }

    if (selected === 'Load Last Save') {
      // Placeholder: would load saved game state
      // For now, also return to title
      void import('@/scenes/TitleScene').then(({ TitleScene }) => {
        void this.engine.scenes.replace(new TitleScene());
      });
    }
  }
}
