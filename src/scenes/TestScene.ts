import { Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '../engine/Scene';

/**
 * A minimal test scene that demonstrates the engine is working:
 *
 * - Renders a layered starfield background with gradient and subtle grid.
 * - Draws a character-like player with directional indicator and glow.
 * - Motion trail follows the player when moving.
 * - Camera follows the player rectangle with a dead zone.
 * - Title text rendered in the UI layer with panel, version, and typewriter text.
 * - Prints controls on screen.
 */
export class TestScene extends Scene {
  // Player
  private _player!: Graphics;
  private _playerX: number = 640;
  private _playerY: number = 360;
  private readonly _playerSpeed: number = 250; // px / s

  // Previous position for interpolation
  private _prevX: number = 640;
  private _prevY: number = 360;

  // Player direction (for directional indicator)
  private _facingX: number = 0;
  private _facingY: number = 1; // default: facing down

  // Trail effect
  private _trail!: Graphics;
  private _trailPositions: { x: number; y: number }[] = [];
  private readonly _trailMaxLength: number = 10;
  private _isMoving: boolean = false;

  // Stars / twinkle
  private _stars!: Graphics;
  private _starData: { x: number; y: number; r: number; baseAlpha: number; twinkle: boolean; twinkleSpeed: number }[] = [];
  private _elapsedTime: number = 0;

  // Display objects
  private _grid!: Graphics;
  private _titleText!: Text;
  private _controlsText!: Text;
  private _posText!: Text;
  private _titlePanel!: Graphics;
  private _versionText!: Text;
  private _flavorText!: Text;
  private _flavorFullString: string = 'Crag Hack awaits...';
  private _flavorIndex: number = 0;
  private _flavorTimer: number = 0;
  private readonly _flavorTypeSpeed: number = 0.07; // seconds per character

  // World size
  private readonly _worldW: number = 3200;
  private readonly _worldH: number = 2400;

  constructor() {
    super('TestScene');
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  public async init(): Promise<void> {
    // --- Gradient + Grid background ---
    this._grid = new Graphics();
    this._drawGrid();
    this.container.addChild(this._grid);

    // --- Stars layer ---
    this._stars = new Graphics();
    this._generateStarData();
    this._drawStars();
    this.container.addChild(this._stars);

    // --- Trail layer (drawn below player) ---
    this._trail = new Graphics();
    this.container.addChild(this._trail);

    // --- Player character ---
    this._player = new Graphics();
    this._drawPlayer();
    this._player.position.set(this._playerX, this._playerY);
    this.container.addChild(this._player);

    // --- UI (added to the engine's UI container so it's unaffected by camera) ---
    const uiContainer = this.engine.uiContainer;

    // Semi-transparent panel behind the title
    this._titlePanel = new Graphics();
    uiContainer.addChild(this._titlePanel);

    const titleStyle = new TextStyle({
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: 28,
      fontWeight: 'bold',
      fill: [0xffd700, 0xff8c00],
      stroke: { color: 0x000000, width: 4 },
      letterSpacing: 2,
    });
    this._titleText = new Text({
      text: 'Realms of Conquest',
      style: titleStyle,
    });
    this._titleText.anchor.set(0.5, 0);
    uiContainer.addChild(this._titleText);

    const subtitleStyle = new TextStyle({
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 14,
      fill: 0xaaaaaa,
    });
    this._controlsText = new Text({
      text: 'WASD / Arrows: Move  |  F3: Debug  |  Shift: Sprint',
      style: subtitleStyle,
    });
    this._controlsText.anchor.set(0.5, 0);
    uiContainer.addChild(this._controlsText);

    const posStyle = new TextStyle({
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 13,
      fill: 0x88ffaa,
    });
    this._posText = new Text({ text: '', style: posStyle });
    this._posText.anchor.set(1, 1);
    uiContainer.addChild(this._posText);

    // Version text in the bottom left
    const versionStyle = new TextStyle({
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 12,
      fill: 0x666688,
    });
    this._versionText = new Text({ text: 'v0.1.0 - Engine Test', style: versionStyle });
    this._versionText.anchor.set(0, 1);
    uiContainer.addChild(this._versionText);

    // Flavor text with typewriter effect
    const flavorStyle = new TextStyle({
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: 16,
      fontStyle: 'italic',
      fill: 0xccaa55,
    });
    this._flavorText = new Text({ text: '', style: flavorStyle });
    this._flavorText.anchor.set(0.5, 0);
    uiContainer.addChild(this._flavorText);

    // Position UI elements (will also be updated on resize via render).
    this._layoutUI();
  }

  public async enter(): Promise<void> {
    // Set up camera.
    this.engine.camera.follow(
      { get x() { return 0; }, get y() { return 0; } }, // placeholder, overridden in fixedUpdate
      { lerp: 0.12, deadZoneX: 40, deadZoneY: 30 },
    );
    this.engine.camera.worldBounds = {
      x: 0, y: 0, width: this._worldW, height: this._worldH,
    };
    this.engine.camera.lookAt(this._playerX, this._playerY);
  }

  // ------------------------------------------------------------------
  // Updates
  // ------------------------------------------------------------------

  public fixedUpdate(dt: number): void {
    const input = this.engine.input;

    // Save previous position for interpolation.
    this._prevX = this._playerX;
    this._prevY = this._playerY;

    // Movement.
    let dx = 0;
    let dy = 0;
    if (input.isActionActive('moveLeft'))  dx -= 1;
    if (input.isActionActive('moveRight')) dx += 1;
    if (input.isActionActive('moveUp'))    dy -= 1;
    if (input.isActionActive('moveDown'))  dy += 1;

    // Normalise diagonal.
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }

    // Track facing direction and movement state.
    this._isMoving = len > 0;
    if (this._isMoving) {
      this._facingX = dx;
      this._facingY = dy;
    }

    // Sprint.
    const speed = input.isActionActive('dodge') ? this._playerSpeed * 2 : this._playerSpeed;

    this._playerX += dx * speed * dt;
    this._playerY += dy * speed * dt;

    // Clamp to world.
    this._playerX = Math.max(16, Math.min(this._worldW - 16, this._playerX));
    this._playerY = Math.max(16, Math.min(this._worldH - 16, this._playerY));

    // Record trail position when moving.
    if (this._isMoving) {
      this._trailPositions.push({ x: this._playerX, y: this._playerY });
      if (this._trailPositions.length > this._trailMaxLength) {
        this._trailPositions.shift();
      }
    }

    // Update camera follow target.
    this.engine.camera.follow(
      { x: this._playerX, y: this._playerY },
      { lerp: 0.12, deadZoneX: 40, deadZoneY: 30 },
    );
  }

  public update(dt: number): void {
    // Shake on jump press (just to demo the shake system).
    if (this.engine.input.isActionJustPressed('jump')) {
      this.engine.camera.shake({ intensity: 6, duration: 0.25 });
    }

    // Accumulate elapsed time for twinkle animation.
    this._elapsedTime += dt;

    // Redraw twinkling stars.
    this._drawStars();

    // Typewriter effect for flavor text.
    if (this._flavorIndex < this._flavorFullString.length) {
      this._flavorTimer += dt;
      while (this._flavorTimer >= this._flavorTypeSpeed && this._flavorIndex < this._flavorFullString.length) {
        this._flavorTimer -= this._flavorTypeSpeed;
        this._flavorIndex++;
        this._flavorText.text = this._flavorFullString.substring(0, this._flavorIndex);
      }
    }

    // Clear trail when not moving (fade out).
    if (!this._isMoving && this._trailPositions.length > 0) {
      this._trailPositions.shift();
    }
  }

  public render(alpha: number): void {
    // Interpolated player position for smooth rendering.
    const renderX = this._prevX + (this._playerX - this._prevX) * alpha;
    const renderY = this._prevY + (this._playerY - this._prevY) * alpha;
    this._player.position.set(renderX, renderY);

    // Redraw player to update directional indicator.
    this._drawPlayer();

    // Redraw trail.
    this._drawTrail();

    // Update UI positions (in case of window resize).
    this._layoutUI();

    // Position display.
    this._posText.text = `X: ${Math.round(this._playerX)}  Y: ${Math.round(this._playerY)}`;
  }

  public async exit(): Promise<void> {
    // Remove UI elements we added to the engine's UI container.
    this._titlePanel.parent?.removeChild(this._titlePanel);
    this._titleText.parent?.removeChild(this._titleText);
    this._controlsText.parent?.removeChild(this._controlsText);
    this._posText.parent?.removeChild(this._posText);
    this._versionText.parent?.removeChild(this._versionText);
    this._flavorText.parent?.removeChild(this._flavorText);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private _layoutUI(): void {
    const w = this.engine.width;
    const h = this.engine.height;

    // Title panel background
    this._titlePanel.clear();
    const panelW = 420;
    const panelH = 56;
    this._titlePanel
      .roundRect((w - panelW) / 2, 8, panelW, panelH, 8)
      .fill({ color: 0x000000, alpha: 0.5 });

    this._titleText.position.set(w / 2, 16);
    this._controlsText.position.set(w / 2, 52);
    this._posText.position.set(w - 16, h - 16);

    // Version text: bottom left
    this._versionText.position.set(16, h - 16);

    // Flavor text: below controls
    this._flavorText.position.set(w / 2, 76);
  }

  private _drawGrid(): void {
    const g = this._grid;
    const step = 64;

    // Gradient background: deep navy at top to dark teal at bottom.
    // Approximate with horizontal bands.
    const bands = 48;
    const bandH = this._worldH / bands;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      // Lerp from #0a0a2e (top) to #0e1a2a (bottom).
      const r = Math.round(0x0a + (0x0e - 0x0a) * t);
      const gv = Math.round(0x0a + (0x1a - 0x0a) * t);
      const b = Math.round(0x2e + (0x2a - 0x2e) * t);
      const color = (r << 16) | (gv << 8) | b;
      g.rect(0, i * bandH, this._worldW, bandH + 1).fill(color);
    }

    // Subtle grid lines (low alpha).
    for (let x = 0; x <= this._worldW; x += step) {
      g.moveTo(x, 0).lineTo(x, this._worldH).stroke({ color: 0x1a1a4e, width: 1, alpha: 0.25 });
    }
    for (let y = 0; y <= this._worldH; y += step) {
      g.moveTo(0, y).lineTo(this._worldW, y).stroke({ color: 0x1a1a4e, width: 1, alpha: 0.25 });
    }

    // World border.
    g.rect(0, 0, this._worldW, this._worldH).stroke({ color: 0xff6b6b, width: 3 });

    // Origin marker.
    g.circle(this._worldW / 2, this._worldH / 2, 8).fill(0x00ff88);
  }

  private _generateStarData(): void {
    const count = 100;
    for (let i = 0; i < count; i++) {
      this._starData.push({
        x: Math.random() * this._worldW,
        y: Math.random() * this._worldH,
        r: 1 + Math.random() * 2, // radius 1-3px
        baseAlpha: 0.3 + Math.random() * 0.7, // alpha 0.3-1.0
        twinkle: Math.random() < 0.35, // ~35% of stars twinkle
        twinkleSpeed: 1.5 + Math.random() * 2.5, // varied twinkle speed
      });
    }
  }

  private _drawStars(): void {
    const g = this._stars;
    g.clear();

    for (const star of this._starData) {
      let alpha = star.baseAlpha;
      if (star.twinkle) {
        // Pulse alpha using a sine wave.
        alpha = star.baseAlpha * (0.5 + 0.5 * Math.sin(this._elapsedTime * star.twinkleSpeed));
        alpha = Math.max(0.1, alpha);
      }
      // Mix white and pale yellow: ~70% white, ~30% pale yellow.
      const color = Math.random() < 0.3 ? 0xffffcc : 0xffffff;
      g.circle(star.x, star.y, star.r).fill({ color, alpha });
    }
  }

  private _drawPlayer(): void {
    const g = this._player;
    g.clear();

    // --- Glow / aura (semi-transparent circle behind the character) ---
    g.circle(0, 0, 28).fill({ color: 0xffd700, alpha: 0.12 });
    g.circle(0, 0, 20).fill({ color: 0xffd700, alpha: 0.08 });

    // --- Body (gold rectangle centered on origin) ---
    const bodyW = 16;
    const bodyH = 20;
    g.rect(-bodyW / 2, -bodyH / 2 + 2, bodyW, bodyH).fill(0xffd700);

    // --- Head (warm red circle on top of body) ---
    g.circle(0, -bodyH / 2 - 2, 7).fill(0xff6b6b);

    // --- Directional indicator (small triangle/arrow showing facing) ---
    const arrowDist = 18;
    const ax = this._facingX * arrowDist;
    const ay = this._facingY * arrowDist;
    // Perpendicular for triangle width.
    const perpX = -this._facingY;
    const perpY = this._facingX;
    const arrowSize = 5;
    g.moveTo(ax + this._facingX * arrowSize, ay + this._facingY * arrowSize)
      .lineTo(ax + perpX * arrowSize, ay + perpY * arrowSize)
      .lineTo(ax - perpX * arrowSize, ay - perpY * arrowSize)
      .closePath()
      .fill({ color: 0xffffff, alpha: 0.8 });
  }

  private _drawTrail(): void {
    const g = this._trail;
    g.clear();

    if (this._trailPositions.length === 0) return;

    for (let i = 0; i < this._trailPositions.length; i++) {
      const pos = this._trailPositions[i];
      // Fade: oldest is most transparent, newest is most opaque.
      const t = (i + 1) / this._trailPositions.length;
      const alpha = t * 0.35;
      const radius = 3 + t * 3;
      g.circle(pos.x, pos.y, radius).fill({ color: 0xffd700, alpha });
    }
  }
}
