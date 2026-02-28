import { Container, Graphics, Text, TextStyle } from 'pixi.js';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/** A selectable dialogue choice. */
export interface DialogueChoice {
  /** Text shown on the button. */
  text: string;
  /** If `true`, the choice is greyed out and cannot be selected. */
  locked?: boolean;
  /** Shown as a prefix when locked, e.g. "[Strength 10]". */
  requirement?: string;
}

/** Portrait definition (placeholder colour block + name). */
export interface PortraitDef {
  /** Hex colour used for the placeholder block. */
  color: number;
}

// ------------------------------------------------------------------
// Style constants
// ------------------------------------------------------------------

const PANEL_BG = 0x111122;
const PANEL_ALPHA = 0.92;
const BORDER_COLOR = 0x886622;
const GOLDEN = 0xffd700;
const PORTRAIT_SIZE = 96;
const CHOICE_BG = 0x1a1a2e;
const CHOICE_HOVER = 0x2a2a44;
const TYPEWRITER_CPS = 30; // characters per second
const SLIDE_DURATION = 0.25; // seconds

// ------------------------------------------------------------------
// DialogueBox
// ------------------------------------------------------------------

/**
 * Full-width bottom-of-screen dialogue panel.
 *
 * Features typewriter text reveal, speaker portrait placeholder,
 * optional choice buttons with condition locking, and slide-in/out
 * animation. All rendering uses PixiJS Graphics + Text.
 */
export class DialogueBox {
  /** Root container. */
  public readonly container: Container = new Container();

  // Internal state
  private _visible = false;
  private _screenW: number;
  private _screenH: number;
  private _panelHeight: number;

  // Panel graphics
  private readonly _panel: Graphics = new Graphics();
  private readonly _portraitBox: Graphics = new Graphics();
  private readonly _portraitName: Text;
  private readonly _textDisplay: Text;
  private readonly _choicesContainer: Container = new Container();

  // Typewriter state
  private _fullText = '';
  private _revealedCount = 0;
  private _charTimer = 0;
  private _typewriterDone = true;

  // Choices
  private _choices: DialogueChoice[] = [];
  private _choiceWidgets: Container[] = [];

  /** Index of the currently selected choice (-1 = none). */
  public get selectedChoiceIndex(): number {
    return this._internalSelectedChoice;
  }
  private _internalSelectedChoice = -1;

  // Slide animation
  private _slideProgress = 0; // 0 = hidden (below screen), 1 = fully shown
  private _slideDir: 'in' | 'out' | 'none' = 'none';

  // Callback
  private _onChoiceSelected: ((index: number) => void) | null = null;
  private _onAdvance: (() => void) | null = null;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor(screenW: number = 1280, screenH: number = 720) {
    this._screenW = screenW;
    this._screenH = screenH;
    this._panelHeight = Math.round(screenH * 0.25);

    this.container.label = 'DialogueBox';
    this.container.visible = false;

    // Portrait name
    this._portraitName = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'serif',
        fontSize: 13,
        fontWeight: 'bold',
        fill: GOLDEN,
        align: 'center',
      }),
    });

    // Main text
    this._textDisplay = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'serif',
        fontSize: 18,
        fill: 0xeeeeee,
        wordWrap: true,
        wordWrapWidth: screenW - PORTRAIT_SIZE - 80,
        lineHeight: 26,
      }),
    });

    this._buildPanel();
    this.container.addChild(this._panel);
    this.container.addChild(this._portraitBox);
    this.container.addChild(this._portraitName);
    this.container.addChild(this._textDisplay);
    this.container.addChild(this._choicesContainer);

    // Place off-screen initially
    this.container.y = screenH;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Show dialogue with a speaker name, text, optional choices and portrait.
   */
  public show(
    speakerName: string,
    text: string,
    choices: DialogueChoice[] = [],
    portrait?: PortraitDef,
    onChoiceSelected?: (index: number) => void,
    onAdvance?: () => void,
  ): void {
    this._visible = true;
    this.container.visible = true;
    this._onChoiceSelected = onChoiceSelected ?? null;
    this._onAdvance = onAdvance ?? null;

    // Portrait
    this._portraitBox.clear();
    const portraitColor = portrait?.color ?? 0x555577;
    this._portraitBox.roundRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE, 4).fill(portraitColor);
    this._portraitBox.roundRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE, 4).stroke({
      color: BORDER_COLOR,
      width: 2,
    });
    this._portraitBox.x = 16;
    this._portraitBox.y = this._screenH - this._panelHeight + 16;

    // Speaker name
    this._portraitName.text = speakerName;
    this._portraitName.anchor.set(0.5, 0);
    this._portraitName.x = 16 + PORTRAIT_SIZE / 2;
    this._portraitName.y = this._screenH - this._panelHeight + PORTRAIT_SIZE + 20;

    // Text
    this._fullText = text;
    this._revealedCount = 0;
    this._charTimer = 0;
    this._typewriterDone = false;
    this._textDisplay.text = '';
    this._textDisplay.x = PORTRAIT_SIZE + 40;
    this._textDisplay.y = this._screenH - this._panelHeight + 18;
    (this._textDisplay.style as TextStyle).wordWrapWidth =
      this._screenW - PORTRAIT_SIZE - 80;

    // Choices
    this._choices = choices;
    this._buildChoices();

    // Slide in
    this._slideProgress = 0;
    this._slideDir = 'in';
  }

  /** Hide the dialogue box with a slide-out animation. */
  public hide(): void {
    this._slideDir = 'out';
    this._onChoiceSelected = null;
    this._onAdvance = null;
  }

  /** Returns whether the dialogue box is visible. */
  public isVisible(): boolean {
    return this._visible;
  }

  /**
   * Advance the typewriter or trigger the advance callback.
   * Call this on click / space press.
   */
  public advance(): void {
    if (!this._visible) return;

    if (!this._typewriterDone) {
      // Skip typewriter — reveal all text immediately
      this._revealedCount = this._fullText.length;
      this._textDisplay.text = this._fullText;
      this._typewriterDone = true;
      return;
    }

    // If no choices, advance to next dialogue
    if (this._choices.length === 0 && this._onAdvance) {
      this._onAdvance();
    }
  }

  /** Select a choice by index (0-based). */
  public selectChoice(index: number): void {
    if (index < 0 || index >= this._choices.length) return;
    if (this._choices[index].locked) return;
    this._internalSelectedChoice = index;
    if (this._onChoiceSelected) {
      this._onChoiceSelected(index);
    }
  }

  /**
   * Per-frame update. Drives typewriter and slide animation.
   * @param dt Frame delta in seconds.
   */
  public update(dt: number): void {
    // --- Slide animation ---
    if (this._slideDir === 'in') {
      this._slideProgress = Math.min(1, this._slideProgress + dt / SLIDE_DURATION);
      if (this._slideProgress >= 1) {
        this._slideDir = 'none';
      }
    } else if (this._slideDir === 'out') {
      this._slideProgress = Math.max(0, this._slideProgress - dt / SLIDE_DURATION);
      if (this._slideProgress <= 0) {
        this._slideDir = 'none';
        this._visible = false;
        this.container.visible = false;
      }
    }
    // ease quad out
    const t = 1 - (1 - this._slideProgress) * (1 - this._slideProgress);
    this.container.y = this._screenH - this._panelHeight * t;

    // --- Typewriter ---
    if (!this._typewriterDone) {
      this._charTimer += dt;
      const charsToReveal = Math.floor(this._charTimer * TYPEWRITER_CPS);
      if (charsToReveal > this._revealedCount) {
        this._revealedCount = Math.min(charsToReveal, this._fullText.length);
        this._textDisplay.text = this._fullText.substring(0, this._revealedCount);
        if (this._revealedCount >= this._fullText.length) {
          this._typewriterDone = true;
        }
      }
    }
  }

  /** Handle window resize. */
  public resize(w: number, h: number): void {
    this._screenW = w;
    this._screenH = h;
    this._panelHeight = Math.round(h * 0.25);
    this._buildPanel();
  }

  /** Clean up all display objects. */
  public destroy(): void {
    this.container.destroy({ children: true });
  }

  // ------------------------------------------------------------------
  // Internal: panel construction
  // ------------------------------------------------------------------

  private _buildPanel(): void {
    this._panel.clear();
    this._panel
      .rect(0, this._screenH - this._panelHeight, this._screenW, this._panelHeight)
      .fill({ color: PANEL_BG, alpha: PANEL_ALPHA });
    this._panel
      .rect(0, this._screenH - this._panelHeight, this._screenW, 3)
      .fill(BORDER_COLOR);
  }

  // ------------------------------------------------------------------
  // Internal: choice buttons
  // ------------------------------------------------------------------

  private _buildChoices(): void {
    // Clear old
    for (const w of this._choiceWidgets) {
      this._choicesContainer.removeChild(w);
      w.destroy({ children: true });
    }
    this._choiceWidgets = [];
    this._internalSelectedChoice = -1;

    if (this._choices.length === 0) return;

    const startY = this._screenH - this._panelHeight + this._panelHeight * 0.55;
    const choiceX = PORTRAIT_SIZE + 40;

    for (let i = 0; i < this._choices.length; i++) {
      const choice = this._choices[i];
      const btn = new Container();
      btn.x = choiceX;
      btn.y = startY + i * 38;
      btn.eventMode = 'static';
      btn.cursor = choice.locked ? 'not-allowed' : 'pointer';

      const choiceW = this._screenW - PORTRAIT_SIZE - 80;
      const bg = new Graphics();
      bg.roundRect(0, 0, choiceW, 32, 4).fill({
        color: choice.locked ? 0x111111 : CHOICE_BG,
        alpha: 0.9,
      });
      bg.roundRect(0, 0, choiceW, 32, 4).stroke({
        color: choice.locked ? 0x444444 : GOLDEN,
        width: 1,
      });
      bg.label = 'choice-bg';
      btn.addChild(bg);

      const displayText = choice.locked && choice.requirement
        ? `[${choice.requirement}] ${choice.text}`
        : `${i + 1}. ${choice.text}`;

      const label = new Text({
        text: displayText,
        style: new TextStyle({
          fontFamily: 'serif',
          fontSize: 15,
          fill: choice.locked ? 0x666666 : 0xeeeeee,
        }),
      });
      label.x = 10;
      label.y = 7;
      btn.addChild(label);

      // Hover effects
      if (!choice.locked) {
        const idx = i;
        btn.on('pointerover', () => {
          const bgGfx = btn.getChildByLabel('choice-bg') as Graphics | null;
          if (bgGfx) {
            bgGfx.clear();
            bgGfx.roundRect(0, 0, choiceW, 32, 4).fill({ color: CHOICE_HOVER, alpha: 0.95 });
            bgGfx.roundRect(0, 0, choiceW, 32, 4).stroke({ color: GOLDEN, width: 2 });
          }
        });
        btn.on('pointerout', () => {
          const bgGfx = btn.getChildByLabel('choice-bg') as Graphics | null;
          if (bgGfx) {
            bgGfx.clear();
            bgGfx.roundRect(0, 0, choiceW, 32, 4).fill({ color: CHOICE_BG, alpha: 0.9 });
            bgGfx.roundRect(0, 0, choiceW, 32, 4).stroke({ color: GOLDEN, width: 1 });
          }
        });
        btn.on('pointertap', () => {
          this.selectChoice(idx);
        });
      }

      this._choicesContainer.addChild(btn);
      this._choiceWidgets.push(btn);
    }
  }
}
