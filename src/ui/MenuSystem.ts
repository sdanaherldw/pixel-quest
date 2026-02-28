import { Container, Graphics, Text, TextStyle } from 'pixi.js';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/** A single menu option with its callback. */
export interface MenuOption {
  label: string;
  /** Called when the option is selected. */
  action: () => void;
  /** If `true`, the option is greyed out and not selectable. */
  disabled?: boolean;
}

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const OVERLAY_COLOR = 0x000000;
const OVERLAY_ALPHA = 0.65;
const PANEL_BG = 0x111122;
const PANEL_ALPHA = 0.95;
const PANEL_W = 320;
const OPTION_H = 44;
const OPTION_GAP = 4;
const GOLDEN = 0xffd700;
const BORDER_COLOR = 0x886622;
const FONT_FAMILY = 'serif';

// ------------------------------------------------------------------
// MenuSystem
// ------------------------------------------------------------------

/**
 * Full-screen pause / ESC menu with keyboard and pointer navigation.
 *
 * Displays a dark semi-transparent overlay behind a centred panel of
 * menu options. Supports up/down arrow navigation, enter to select,
 * and ESC to close.
 */
export class MenuSystem {
  /** Root container — add to the UI layer. */
  public readonly container: Container = new Container();

  private _open = false;
  private _screenW: number;
  private _screenH: number;

  // Overlay
  private readonly _overlay: Graphics = new Graphics();

  // Panel
  private readonly _panel: Container = new Container();
  private readonly _panelBg: Graphics = new Graphics();

  // Options
  private _options: MenuOption[] = [];
  private _optionWidgets: Container[] = [];
  private _selectedIndex = 0;

  // Callbacks
  private _onClose: (() => void) | null = null;

  constructor(screenW: number = 1280, screenH: number = 720) {
    this._screenW = screenW;
    this._screenH = screenH;

    this.container.label = 'MenuSystem';
    this.container.visible = false;
    this.container.eventMode = 'static';

    // Overlay blocks input to game beneath
    this._overlay.eventMode = 'static';
    this.container.addChild(this._overlay);

    this._panel.addChild(this._panelBg);
    this.container.addChild(this._panel);
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Open the menu with a list of options.
   *
   * @param options Menu items to display.
   * @param onClose Called when the menu is closed via ESC or Resume.
   */
  public show(options?: MenuOption[], onClose?: () => void): void {
    this._onClose = onClose ?? null;

    // Default RPG menu options if none provided
    this._options = options ?? this._defaultOptions();

    this._open = true;
    this.container.visible = true;
    this._selectedIndex = 0;

    this._drawOverlay();
    this._buildPanel();
    this._highlightSelected();
  }

  /** Close the menu. */
  public hide(): void {
    this._open = false;
    this.container.visible = false;
    if (this._onClose) {
      this._onClose();
      this._onClose = null;
    }
  }

  /** Returns whether the menu is open. */
  public isOpen(): boolean {
    return this._open;
  }

  /** Move selection up. */
  public navigateUp(): void {
    if (!this._open) return;
    this._selectedIndex--;
    if (this._selectedIndex < 0) {
      this._selectedIndex = this._options.length - 1;
    }
    // Skip disabled
    let tries = this._options.length;
    while (this._options[this._selectedIndex].disabled && tries > 0) {
      this._selectedIndex--;
      if (this._selectedIndex < 0) this._selectedIndex = this._options.length - 1;
      tries--;
    }
    this._highlightSelected();
  }

  /** Move selection down. */
  public navigateDown(): void {
    if (!this._open) return;
    this._selectedIndex++;
    if (this._selectedIndex >= this._options.length) {
      this._selectedIndex = 0;
    }
    // Skip disabled
    let tries = this._options.length;
    while (this._options[this._selectedIndex].disabled && tries > 0) {
      this._selectedIndex++;
      if (this._selectedIndex >= this._options.length) this._selectedIndex = 0;
      tries--;
    }
    this._highlightSelected();
  }

  /** Activate the currently selected option. */
  public confirmSelection(): void {
    if (!this._open) return;
    const opt = this._options[this._selectedIndex];
    if (opt && !opt.disabled) {
      opt.action();
    }
  }

  /** Handle window resize. */
  public resize(w: number, h: number): void {
    this._screenW = w;
    this._screenH = h;
    if (this._open) {
      this._drawOverlay();
      this._buildPanel();
      this._highlightSelected();
    }
  }

  /** Clean up. */
  public destroy(): void {
    this.container.destroy({ children: true });
  }

  // ------------------------------------------------------------------
  // Internal
  // ------------------------------------------------------------------

  private _defaultOptions(): MenuOption[] {
    return [
      { label: 'Resume', action: () => this.hide() },
      { label: 'Inventory', action: () => { /* placeholder */ } },
      { label: 'Spell Book', action: () => { /* placeholder */ }, disabled: true },
      { label: 'Quest Log', action: () => { /* placeholder */ }, disabled: true },
      { label: 'Map', action: () => { /* placeholder */ }, disabled: true },
      { label: 'Options', action: () => { /* placeholder */ }, disabled: true },
      { label: 'Save Game', action: () => { /* placeholder */ } },
      { label: 'Load Game', action: () => { /* placeholder */ } },
      { label: 'Quit to Title', action: () => { /* placeholder */ } },
    ];
  }

  private _drawOverlay(): void {
    this._overlay.clear();
    this._overlay.rect(0, 0, this._screenW, this._screenH).fill({
      color: OVERLAY_COLOR,
      alpha: OVERLAY_ALPHA,
    });
  }

  private _buildPanel(): void {
    // Clear old option widgets
    for (const w of this._optionWidgets) {
      this._panel.removeChild(w);
      w.destroy({ children: true });
    }
    this._optionWidgets = [];

    const panelH =
      this._options.length * (OPTION_H + OPTION_GAP) + OPTION_GAP + 40;

    // Centre panel
    this._panel.x = (this._screenW - PANEL_W) / 2;
    this._panel.y = (this._screenH - panelH) / 2;

    // Panel background
    this._panelBg.clear();
    this._panelBg.roundRect(0, 0, PANEL_W, panelH, 8).fill({
      color: PANEL_BG,
      alpha: PANEL_ALPHA,
    });
    this._panelBg.roundRect(0, 0, PANEL_W, panelH, 8).stroke({
      color: BORDER_COLOR,
      width: 2,
    });

    // Title
    const title = new Text({
      text: 'Realms of Conquest',
      style: new TextStyle({
        fontFamily: FONT_FAMILY,
        fontSize: 20,
        fontWeight: 'bold',
        fill: GOLDEN,
      }),
    });
    title.anchor.set(0.5, 0);
    title.x = PANEL_W / 2;
    title.y = 12;
    this._panel.addChild(title);
    this._optionWidgets.push(title as unknown as Container);

    // Option buttons
    for (let i = 0; i < this._options.length; i++) {
      const opt = this._options[i];
      const btn = new Container();
      btn.x = 16;
      btn.y = 42 + i * (OPTION_H + OPTION_GAP);
      btn.eventMode = 'static';
      btn.cursor = opt.disabled ? 'default' : 'pointer';

      const bg = new Graphics();
      bg.roundRect(0, 0, PANEL_W - 32, OPTION_H, 4).fill({
        color: 0x1a1a2e,
        alpha: 0.9,
      });
      bg.roundRect(0, 0, PANEL_W - 32, OPTION_H, 4).stroke({
        color: opt.disabled ? 0x333344 : 0x444466,
        width: 1,
      });
      bg.label = 'option-bg';
      btn.addChild(bg);

      const label = new Text({
        text: opt.label,
        style: new TextStyle({
          fontFamily: FONT_FAMILY,
          fontSize: 17,
          fill: opt.disabled ? 0x555566 : 0xdddddd,
        }),
      });
      label.anchor.set(0.5, 0.5);
      label.x = (PANEL_W - 32) / 2;
      label.y = OPTION_H / 2;
      label.label = 'option-label';
      btn.addChild(label);

      // Pointer events
      if (!opt.disabled) {
        const idx = i;
        btn.on('pointerover', () => {
          this._selectedIndex = idx;
          this._highlightSelected();
        });
        btn.on('pointertap', () => {
          this._selectedIndex = idx;
          this.confirmSelection();
        });
      }

      this._panel.addChild(btn);
      this._optionWidgets.push(btn);
    }
  }

  /** Visual highlight for the selected option. */
  private _highlightSelected(): void {
    // Start at index 1 because index 0 is the title text
    for (let i = 0; i < this._options.length; i++) {
      const widget = this._optionWidgets[i + 1]; // +1 to skip title
      if (!widget) continue;

      const bg = widget.getChildByLabel('option-bg') as Graphics | null;
      const label = widget.getChildByLabel('option-label') as Text | null;
      const opt = this._options[i];

      if (!bg || !label) continue;

      bg.clear();

      if (i === this._selectedIndex && !opt.disabled) {
        bg.roundRect(0, 0, PANEL_W - 32, OPTION_H, 4).fill({
          color: 0x2a2a44,
          alpha: 0.95,
        });
        bg.roundRect(0, 0, PANEL_W - 32, OPTION_H, 4).stroke({
          color: GOLDEN,
          width: 2,
        });
        (label.style as TextStyle).fill = 0xffffff;
      } else {
        bg.roundRect(0, 0, PANEL_W - 32, OPTION_H, 4).fill({
          color: 0x1a1a2e,
          alpha: 0.9,
        });
        bg.roundRect(0, 0, PANEL_W - 32, OPTION_H, 4).stroke({
          color: opt.disabled ? 0x333344 : 0x444466,
          width: 1,
        });
        (label.style as TextStyle).fill = opt.disabled ? 0x555566 : 0xdddddd;
      }
    }
  }
}
