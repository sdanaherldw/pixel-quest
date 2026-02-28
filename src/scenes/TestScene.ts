import { Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '../engine/Scene';

/**
 * A minimal test scene that demonstrates the engine is working:
 *
 * - Renders a grid background to show camera movement.
 * - Draws a coloured rectangle that moves with WASD / arrow keys.
 * - Camera follows the player rectangle with a dead zone.
 * - Title text rendered in the UI layer.
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

  // Display objects
  private _grid!: Graphics;
  private _titleText!: Text;
  private _controlsText!: Text;
  private _posText!: Text;

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
    // --- Grid background ---
    this._grid = new Graphics();
    this._drawGrid();
    this.container.addChild(this._grid);

    // --- Player rectangle ---
    this._player = new Graphics();
    this._player.rect(-16, -16, 32, 32).fill(0xff6b6b);
    this._player.rect(-12, -12, 24, 24).fill(0xfeca57);
    this._player.position.set(this._playerX, this._playerY);
    this.container.addChild(this._player);

    // --- UI (added to the engine's UI container so it's unaffected by camera) ---
    const uiContainer = this.engine.uiContainer;

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

    // Sprint.
    const speed = input.isActionActive('dodge') ? this._playerSpeed * 2 : this._playerSpeed;

    this._playerX += dx * speed * dt;
    this._playerY += dy * speed * dt;

    // Clamp to world.
    this._playerX = Math.max(16, Math.min(this._worldW - 16, this._playerX));
    this._playerY = Math.max(16, Math.min(this._worldH - 16, this._playerY));

    // Update camera follow target.
    this.engine.camera.follow(
      { x: this._playerX, y: this._playerY },
      { lerp: 0.12, deadZoneX: 40, deadZoneY: 30 },
    );
  }

  public update(_dt: number): void {
    // Shake on jump press (just to demo the shake system).
    if (this.engine.input.isActionJustPressed('jump')) {
      this.engine.camera.shake({ intensity: 6, duration: 0.25 });
    }
  }

  public render(alpha: number): void {
    // Interpolated player position for smooth rendering.
    const renderX = this._prevX + (this._playerX - this._prevX) * alpha;
    const renderY = this._prevY + (this._playerY - this._prevY) * alpha;
    this._player.position.set(renderX, renderY);

    // Update UI positions (in case of window resize).
    this._layoutUI();

    // Position display.
    this._posText.text = `X: ${Math.round(this._playerX)}  Y: ${Math.round(this._playerY)}`;
  }

  public async exit(): Promise<void> {
    // Remove UI elements we added to the engine's UI container.
    this._titleText.parent?.removeChild(this._titleText);
    this._controlsText.parent?.removeChild(this._controlsText);
    this._posText.parent?.removeChild(this._posText);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private _layoutUI(): void {
    const w = this.engine.width;
    this._titleText.position.set(w / 2, 16);
    this._controlsText.position.set(w / 2, 52);
    this._posText.position.set(w - 16, this.engine.height - 16);
  }

  private _drawGrid(): void {
    const g = this._grid;
    const step = 64;

    // Background fill.
    g.rect(0, 0, this._worldW, this._worldH).fill(0x16213e);

    // Grid lines.
    for (let x = 0; x <= this._worldW; x += step) {
      g.moveTo(x, 0).lineTo(x, this._worldH).stroke({ color: 0x1a1a4e, width: 1 });
    }
    for (let y = 0; y <= this._worldH; y += step) {
      g.moveTo(0, y).lineTo(this._worldW, y).stroke({ color: 0x1a1a4e, width: 1 });
    }

    // World border.
    g.rect(0, 0, this._worldW, this._worldH).stroke({ color: 0xff6b6b, width: 3 });

    // Origin marker.
    g.circle(this._worldW / 2, this._worldH / 2, 8).fill(0x00ff88);
  }
}
