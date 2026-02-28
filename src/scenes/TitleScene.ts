import { Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';
import { FadeTransition } from '@/ui/TransitionEffects';

// ---------------------------------------------------------------------------
// Particle type for golden sparkle motes
// ---------------------------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  life: number;
  maxLife: number;
}

// ---------------------------------------------------------------------------
// Torch flame definition
// ---------------------------------------------------------------------------

interface TorchFlame {
  x: number;
  y: number;
  flickers: { offsetX: number; offsetY: number; size: number; phase: number }[];
}

// ---------------------------------------------------------------------------
// TitleScene
// ---------------------------------------------------------------------------

/**
 * Gorgeous title screen for "Realms of Conquest".
 *
 * Features:
 * - Animated gradient sky background with shifting colours.
 * - Floating golden sparkle particle motes.
 * - Large golden title with glow effect.
 * - Subtitle "A Tale of Five Realms" fading in after 1 second.
 * - Keyboard-navigable menu: New Game, Continue (grayed), Options.
 * - Animated torch flames on both sides.
 * - Version text in bottom-right corner.
 */
export class TitleScene extends Scene {
  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  private readonly _menuItems: string[] = ['New Game', 'Continue', 'Options'];
  private _selectedIndex = 0;
  private _menuTexts: Text[] = [];
  private _subtitleText!: Text;
  private _elapsed = 0;
  private _particles: Particle[] = [];
  private _particleGfx!: Graphics;
  private _skyGfx!: Graphics;
  private _torchGfx!: Graphics;
  private _titleText!: Text;
  private _titleGlow!: Text;
  private _selectorGfx!: Graphics;
  private _torches: TorchFlame[] = [];
  private _screenW = 0;
  private _screenH = 0;

  constructor() {
    super('TitleScene');
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  public async init(): Promise<void> {
    this._screenW = this.engine.width;
    this._screenH = this.engine.height;

    // --- Animated gradient sky background ---
    this._skyGfx = new Graphics();
    this.container.addChild(this._skyGfx);
    this._drawSky(0);

    // --- Particle layer ---
    this._particleGfx = new Graphics();
    this.container.addChild(this._particleGfx);

    // --- Torch graphics layer ---
    this._torchGfx = new Graphics();
    this.container.addChild(this._torchGfx);

    // --- Setup torches on left and right sides ---
    this._torches = [
      {
        x: 80,
        y: this._screenH * 0.45,
        flickers: Array.from({ length: 6 }, () => ({
          offsetX: (Math.random() - 0.5) * 10,
          offsetY: -Math.random() * 20,
          size: 4 + Math.random() * 8,
          phase: Math.random() * Math.PI * 2,
        })),
      },
      {
        x: this._screenW - 80,
        y: this._screenH * 0.45,
        flickers: Array.from({ length: 6 }, () => ({
          offsetX: (Math.random() - 0.5) * 10,
          offsetY: -Math.random() * 20,
          size: 4 + Math.random() * 8,
          phase: Math.random() * Math.PI * 2,
        })),
      },
    ];

    // Draw torch bracket bases
    for (const torch of this._torches) {
      const base = new Graphics();
      base.rect(torch.x - 4, torch.y, 8, 60).fill(0x554433);
      base.rect(torch.x - 8, torch.y - 4, 16, 8).fill(0x665544);
      this.container.addChild(base);
    }

    // --- Title glow (rendered behind the main title for soft bloom) ---
    this._titleGlow = new Text({
      text: 'REALMS OF CONQUEST',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 56,
        fontWeight: 'bold',
        fill: 0xffaa00,
        letterSpacing: 4,
        align: 'center',
      }),
    });
    this._titleGlow.anchor.set(0.5);
    this._titleGlow.x = this._screenW / 2;
    this._titleGlow.y = this._screenH * 0.22;
    this._titleGlow.alpha = 0.4;
    this.container.addChild(this._titleGlow);

    // --- Main title ---
    this._titleText = new Text({
      text: 'REALMS OF CONQUEST',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 54,
        fontWeight: 'bold',
        fill: 0xffd700,
        stroke: { color: 0x442200, width: 3 },
        letterSpacing: 4,
        dropShadow: {
          color: 0xff8800,
          blur: 12,
          distance: 0,
          alpha: 0.6,
        },
        align: 'center',
      }),
    });
    this._titleText.anchor.set(0.5);
    this._titleText.x = this._screenW / 2;
    this._titleText.y = this._screenH * 0.22;
    this.container.addChild(this._titleText);

    // --- Subtitle (fades in after 1 second) ---
    this._subtitleText = new Text({
      text: 'A Tale of Five Realms',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 20,
        fontStyle: 'italic',
        fill: 0xccbbaa,
        letterSpacing: 2,
      }),
    });
    this._subtitleText.anchor.set(0.5);
    this._subtitleText.x = this._screenW / 2;
    this._subtitleText.y = this._screenH * 0.32;
    this._subtitleText.alpha = 0;
    this.container.addChild(this._subtitleText);

    // --- Menu selector arrows ---
    this._selectorGfx = new Graphics();
    this.container.addChild(this._selectorGfx);

    // --- Menu items ---
    const menuStartY = this._screenH * 0.52;
    const menuSpacing = 50;

    for (let i = 0; i < this._menuItems.length; i++) {
      const isDisabled = this._menuItems[i] === 'Continue';
      const menuText = new Text({
        text: this._menuItems[i],
        style: new TextStyle({
          fontFamily: 'Georgia, serif',
          fontSize: 28,
          fill: isDisabled ? 0x555555 : 0xddccbb,
          letterSpacing: 2,
        }),
      });
      menuText.anchor.set(0.5);
      menuText.x = this._screenW / 2;
      menuText.y = menuStartY + i * menuSpacing;
      this.container.addChild(menuText);
      this._menuTexts.push(menuText);
    }

    // --- Version text ---
    const versionText = new Text({
      text: 'v0.1.0',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0x666666,
      }),
    });
    versionText.anchor.set(1, 1);
    versionText.x = this._screenW - 16;
    versionText.y = this._screenH - 10;
    this.container.addChild(versionText);

    // --- Seed initial golden sparkle particles ---
    for (let i = 0; i < 40; i++) {
      this._spawnParticle();
    }
  }

  public update(dt: number): void {
    this._elapsed += dt * 1000; // convert seconds → ms for animation timing

    // --- Subtitle fade-in after 1 second ---
    if (this._elapsed > 1000 && this._subtitleText.alpha < 1) {
      this._subtitleText.alpha = Math.min(1, this._subtitleText.alpha + dt * 0.8);
    }

    // --- Animated sky ---
    this._drawSky(this._elapsed);

    // --- Torch animation ---
    this._drawTorches(this._elapsed);

    // --- Title glow pulse ---
    const glowScale = 1.0 + Math.sin(this._elapsed * 0.002) * 0.03;
    this._titleGlow.scale.set(glowScale);
    this._titleGlow.alpha = 0.3 + Math.sin(this._elapsed * 0.003) * 0.15;

    // --- Particle update ---
    this._particleGfx.clear();
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.life += dt * 60;

      const lifeRatio = p.life / p.maxLife;
      const fadeAlpha =
        lifeRatio < 0.1
          ? lifeRatio * 10
          : lifeRatio > 0.8
            ? (1 - lifeRatio) * 5
            : 1;
      const drawAlpha = p.alpha * fadeAlpha;

      if (p.life >= p.maxLife) {
        this._particles.splice(i, 1);
        this._spawnParticle();
        continue;
      }

      // Outer glow
      this._particleGfx
        .circle(p.x, p.y, p.size)
        .fill({ color: 0xffd700, alpha: drawAlpha * 0.6 });
      // Bright core
      this._particleGfx
        .circle(p.x, p.y, p.size * 0.5)
        .fill({ color: 0xffffaa, alpha: drawAlpha });
    }

    // --- Menu navigation ---
    const input = this.engine.input;

    if (input.isActionJustPressed('moveUp')) {
      this._selectedIndex =
        (this._selectedIndex - 1 + this._menuItems.length) % this._menuItems.length;
      // Skip Continue (disabled)
      if (this._menuItems[this._selectedIndex] === 'Continue') {
        this._selectedIndex =
          (this._selectedIndex - 1 + this._menuItems.length) % this._menuItems.length;
      }
    }

    if (input.isActionJustPressed('moveDown')) {
      this._selectedIndex = (this._selectedIndex + 1) % this._menuItems.length;
      if (this._menuItems[this._selectedIndex] === 'Continue') {
        this._selectedIndex = (this._selectedIndex + 1) % this._menuItems.length;
      }
    }

    // --- Update menu text styles ---
    for (let i = 0; i < this._menuTexts.length; i++) {
      const isDisabled = this._menuItems[i] === 'Continue';
      const isSelected = i === this._selectedIndex;
      const text = this._menuTexts[i];

      if (isDisabled) {
        text.style.fill = 0x555555;
      } else if (isSelected) {
        text.style.fill = 0xffd700;
      } else {
        text.style.fill = 0xddccbb;
      }
      text.scale.set(isSelected ? 1.1 : 1.0);
    }

    // --- Draw selector arrows around the selected item ---
    this._selectorGfx.clear();
    const selText = this._menuTexts[this._selectedIndex];
    const arrowBob = Math.sin(this._elapsed * 0.005) * 4;
    const arrowX1 = selText.x - selText.width * 0.55 - 24 + arrowBob;
    const arrowX2 = selText.x + selText.width * 0.55 + 24 - arrowBob;
    const arrowY = selText.y;

    // Left arrow
    this._selectorGfx
      .moveTo(arrowX1, arrowY)
      .lineTo(arrowX1 - 10, arrowY - 8)
      .lineTo(arrowX1 - 10, arrowY + 8)
      .closePath()
      .fill(0xffd700);

    // Right arrow
    this._selectorGfx
      .moveTo(arrowX2, arrowY)
      .lineTo(arrowX2 + 10, arrowY - 8)
      .lineTo(arrowX2 + 10, arrowY + 8)
      .closePath()
      .fill(0xffd700);

    // --- Confirm selection ---
    if (input.isActionJustPressed('interact')) {
      const selected = this._menuItems[this._selectedIndex];
      if (selected === 'New Game') {
        void import('@/scenes/CharacterCreateScene').then(
          ({ CharacterCreateScene }) => {
            void this.engine.scenes.push(
              new CharacterCreateScene(),
              new FadeTransition(0.5),
            );
          },
        );
      }
      // Continue and Options: no-op for now
    }
  }

  public fixedUpdate(_dt: number): void {
    // No fixed-rate logic needed.
  }

  public render(_alpha: number): void {
    // All rendering is handled in update via Graphics redraws.
  }

  public override async exit(): Promise<void> {
    this._particles.length = 0;
  }

  public override destroy(): void {
    this._particles.length = 0;
    this._menuTexts.length = 0;
    this._torches.length = 0;
    super.destroy();
  }

  // ------------------------------------------------------------------
  // Particle spawner
  // ------------------------------------------------------------------

  private _spawnParticle(): void {
    this._particles.push({
      x: Math.random() * this._screenW,
      y: Math.random() * this._screenH,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.2 - Math.random() * 0.4,
      alpha: Math.random() * 0.7 + 0.3,
      size: 1 + Math.random() * 2.5,
      life: 0,
      maxLife: 200 + Math.random() * 300,
    });
  }

  // ------------------------------------------------------------------
  // Animated gradient sky
  // ------------------------------------------------------------------

  private _drawSky(time: number): void {
    this._skyGfx.clear();

    const shift = Math.sin(time * 0.0003) * 0.15;
    const topR = Math.floor(10 + shift * 20);
    const topG = Math.floor(8 + shift * 15);
    const topB = Math.floor(30 + shift * 30);

    const botR = Math.floor(25 + shift * 30);
    const botG = Math.floor(15 + shift * 20);
    const botB = Math.floor(40 + shift * 25);

    const steps = 16;
    const stepH = this._screenH / steps;

    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const r = Math.floor(topR * (1 - t) + botR * t);
      const g = Math.floor(topG * (1 - t) + botG * t);
      const b = Math.floor(topB * (1 - t) + botB * t);
      const color = (r << 16) | (g << 8) | b;
      this._skyGfx.rect(0, i * stepH, this._screenW, stepH + 1).fill(color);
    }

    // Horizon glow
    const glowAlpha = 0.08 + Math.sin(time * 0.0005) * 0.04;
    this._skyGfx
      .rect(0, this._screenH * 0.7, this._screenW, this._screenH * 0.3)
      .fill({ color: 0x331500, alpha: glowAlpha });
  }

  // ------------------------------------------------------------------
  // Animated torch flames
  // ------------------------------------------------------------------

  private _drawTorches(time: number): void {
    this._torchGfx.clear();

    for (const torch of this._torches) {
      for (const flicker of torch.flickers) {
        const wave = Math.sin(time * 0.005 + flicker.phase);
        const wave2 = Math.cos(time * 0.007 + flicker.phase * 1.3);
        const fx = torch.x + flicker.offsetX + wave * 3;
        const fy = torch.y + flicker.offsetY + wave2 * 2 - 8;
        const size = flicker.size * (0.7 + wave * 0.3);
        const alpha = 0.5 + wave2 * 0.2;

        // Outer glow
        this._torchGfx
          .circle(fx, fy, size * 1.8)
          .fill({ color: 0xff4400, alpha: alpha * 0.2 });
        // Core flame
        this._torchGfx
          .circle(fx, fy, size)
          .fill({ color: 0xff8800, alpha: alpha * 0.6 });
        // Bright centre
        this._torchGfx
          .circle(fx, fy - 2, size * 0.4)
          .fill({ color: 0xffdd44, alpha: alpha * 0.8 });
      }
    }
  }
}
