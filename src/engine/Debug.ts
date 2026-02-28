import { Container, Text, TextStyle, Graphics } from 'pixi.js';

import type { Engine } from './Engine';

// ------------------------------------------------------------------
// Configuration
// ------------------------------------------------------------------

/** Maximum number of on-screen log lines before the oldest are evicted. */
const MAX_LOG_LINES = 12;

/** How long (in seconds) a log line stays on screen. */
const LOG_LINE_TTL = 5;

/** Interval (in frames) between FPS counter refreshes. */
const FPS_UPDATE_INTERVAL = 15;

// ------------------------------------------------------------------
// Internal types
// ------------------------------------------------------------------

interface LogEntry {
  text: string;
  ttl: number;
}

// ------------------------------------------------------------------
// Debug
// ------------------------------------------------------------------

/**
 * Debug overlay rendered on top of the UI layer.
 *
 * Provides:
 * - **FPS counter** (averaged over a short window).
 * - **Entity count** (settable externally by the ECS or scene).
 * - **On-screen log** for transient debug messages.
 * - **Performance timings** for update and render phases.
 *
 * Toggle visibility at runtime with the **F3** key.
 */
export class Debug {
  // ------------------------------------------------------------------
  // Public state
  // ------------------------------------------------------------------

  /** Whether the overlay is visible.  Toggle with F3 or set directly. */
  public get enabled(): boolean {
    return this._enabled;
  }

  public set enabled(value: boolean) {
    this._enabled = value;
    this._container.visible = value;
  }

  /** Number of active entities – set externally by the ECS. */
  public entityCount: number = 0;

  // ------------------------------------------------------------------
  // Performance timing (written by Engine, read by overlay)
  // ------------------------------------------------------------------

  /** Time in ms spent in the last update phase. */
  public updateTimeMs: number = 0;

  /** Time in ms spent in the last render phase. */
  public renderTimeMs: number = 0;

  // ------------------------------------------------------------------
  // Private state
  // ------------------------------------------------------------------

  private readonly _engine: Engine;
  private readonly _container: Container;
  private _enabled: boolean = false;

  // --- FPS ---
  private _frames: number = 0;
  private _fpsAccumulator: number = 0;
  private _currentFps: number = 0;
  private _fpsText!: Text;

  // --- Stats ---
  private _statsText!: Text;

  // --- Log ---
  private readonly _logEntries: LogEntry[] = [];
  private _logText!: Text;

  // --- Background panel ---
  private _bgPanel!: Graphics;

  // --- Key listener ---
  private readonly _onKeyDown: (e: KeyboardEvent) => void;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor(engine: Engine) {
    this._engine = engine;

    this._container = new Container();
    this._container.label = 'debug-overlay';
    this._container.visible = false;

    // Ensure the overlay is always on top of the UI layer.
    this._container.zIndex = 999_999;

    this._buildDisplay();

    // Add to the engine's UI container (screen-space, unaffected by camera).
    engine.uiContainer.addChild(this._container);

    // F3 toggle.
    this._onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.enabled = !this._enabled;
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Print a transient message to the on-screen debug log.
   * Messages auto-expire after {@link LOG_LINE_TTL} seconds.
   */
  public log(message: string): void {
    this._logEntries.push({ text: message, ttl: LOG_LINE_TTL });

    // Evict oldest if over capacity.
    while (this._logEntries.length > MAX_LOG_LINES) {
      this._logEntries.shift();
    }
  }

  // ------------------------------------------------------------------
  // Per-frame hooks (called by Engine)
  // ------------------------------------------------------------------

  /**
   * Called once per frame with the real frame delta.
   * Updates FPS counter, expires log lines.
   */
  public update(dt: number): void {
    if (!this._enabled) return;

    // --- FPS ---
    this._frames++;
    this._fpsAccumulator += dt;

    if (this._frames >= FPS_UPDATE_INTERVAL) {
      this._currentFps = this._frames / this._fpsAccumulator;
      this._frames = 0;
      this._fpsAccumulator = 0;
    }

    // --- Expire log entries ---
    for (let i = this._logEntries.length - 1; i >= 0; i--) {
      this._logEntries[i].ttl -= dt;
      if (this._logEntries[i].ttl <= 0) {
        this._logEntries.splice(i, 1);
      }
    }
  }

  /** Called once per frame to refresh the overlay text objects. */
  public render(): void {
    if (!this._enabled) return;

    // FPS
    this._fpsText.text = `FPS: ${Math.round(this._currentFps)}`;

    // Stats
    const lines: string[] = [
      `Entities: ${this.entityCount}`,
      `Update:  ${this.updateTimeMs.toFixed(2)} ms`,
      `Render:  ${this.renderTimeMs.toFixed(2)} ms`,
      `Scenes:  ${this._engine.scenes.depth}`,
      `Zoom:    ${this._engine.camera.zoom.toFixed(2)}x`,
    ];
    this._statsText.text = lines.join('\n');

    // Log
    if (this._logEntries.length > 0) {
      this._logText.text = this._logEntries.map((e) => e.text).join('\n');
      this._logText.visible = true;
    } else {
      this._logText.visible = false;
    }

    // Resize the background panel to fit content.
    this._resizePanel();
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  /** Remove listeners and display objects. */
  public destroy(): void {
    window.removeEventListener('keydown', this._onKeyDown);
    this._container.destroy({ children: true });
  }

  // ------------------------------------------------------------------
  // Private – build display objects
  // ------------------------------------------------------------------

  private _buildDisplay(): void {
    const monoStyle = new TextStyle({
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 13,
      fill: 0x00ff88,
      letterSpacing: 0.5,
    });

    const fpsStyle = new TextStyle({
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 15,
      fontWeight: 'bold',
      fill: 0x00ff88,
      letterSpacing: 0.5,
    });

    // Semi-transparent background panel.
    this._bgPanel = new Graphics();
    this._container.addChild(this._bgPanel);

    // FPS counter.
    this._fpsText = new Text({ text: 'FPS: --', style: fpsStyle });
    this._fpsText.x = 8;
    this._fpsText.y = 8;
    this._container.addChild(this._fpsText);

    // Stats block.
    this._statsText = new Text({ text: '', style: monoStyle });
    this._statsText.x = 8;
    this._statsText.y = 30;
    this._container.addChild(this._statsText);

    // Log area (below stats).
    const logStyle = new TextStyle({
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 12,
      fill: 0xffff66,
      letterSpacing: 0.5,
    });
    this._logText = new Text({ text: '', style: logStyle });
    this._logText.x = 8;
    this._logText.y = 130;
    this._logText.visible = false;
    this._container.addChild(this._logText);
  }

  private _resizePanel(): void {
    // Determine the maximum width / height of visible text children.
    let maxW = 0;
    let maxH = 0;

    for (const child of this._container.children) {
      if (child === this._bgPanel) continue;
      if (!child.visible) continue;

      const bounds = child.getBounds();
      const right = bounds.x + bounds.width - this._container.x;
      const bottom = bounds.y + bounds.height - this._container.y;
      if (right > maxW) maxW = right;
      if (bottom > maxH) maxH = bottom;
    }

    this._bgPanel.clear();
    this._bgPanel.rect(0, 0, maxW + 16, maxH + 8);
    this._bgPanel.fill({ color: 0x000000, alpha: 0.65 });
  }
}
