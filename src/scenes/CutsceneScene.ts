import { Graphics, Text, TextStyle } from 'pixi.js';
import gsap from 'gsap';

import { Scene } from '@/engine/Scene';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single step in a cutscene sequence. */
export interface CutsceneStep {
  /** Speaker name (shown above dialogue). Empty string for narration. */
  speaker: string;
  /** Dialogue text to display. */
  text: string;
  /** Portrait accent colour (optional). */
  portraitColor?: number;
  /** Duration in seconds before auto-advancing. 0 = wait for input. */
  duration?: number;
}

// ---------------------------------------------------------------------------
// CutsceneScene
// ---------------------------------------------------------------------------

/**
 * Full-screen cutscene scene with cinematic letterbox bars, sequential
 * dialogue steps, and optional auto-advance.
 *
 * Usage:
 * ```
 * const scene = new CutsceneScene([
 *   { speaker: '', text: 'The kingdom falls silent...' },
 *   { speaker: 'King Aldric', text: 'Our land needs heroes.', portraitColor: 0xffd700 },
 * ], () => { /* on complete * / });
 * engine.scenes.push(scene);
 * ```
 */
export class CutsceneScene extends Scene {
  private _overlay!: Graphics;
  private _topBar!: Graphics;
  private _bottomBar!: Graphics;
  private _portraitGfx!: Graphics;
  private _speakerText!: Text;
  private _dialogueText!: Text;
  private _promptText!: Text;

  private _steps: CutsceneStep[];
  private _currentStep: number = 0;
  private _stepTimer: number = 0;
  private _onComplete: (() => void) | null;
  private _letterboxH: number = 60;
  private _entered: boolean = false;

  constructor(steps: CutsceneStep[], onComplete?: () => void) {
    super('CutsceneScene');
    this._steps = steps;
    this._onComplete = onComplete ?? null;
  }

  public async init(): Promise<void> {
    const w = this.engine.width;
    const h = this.engine.height;

    // Black background
    this._overlay = new Graphics();
    this._overlay.rect(0, 0, w, h).fill(0x000000);
    this._overlay.eventMode = 'static';
    this.container.addChild(this._overlay);

    // Letterbox bars (start off-screen, animate in)
    this._topBar = new Graphics();
    this._topBar.rect(0, 0, w, this._letterboxH).fill(0x000000);
    this._topBar.position.set(0, -this._letterboxH);
    this.container.addChild(this._topBar);

    this._bottomBar = new Graphics();
    this._bottomBar.rect(0, 0, w, this._letterboxH).fill(0x000000);
    this._bottomBar.position.set(0, h);
    this.container.addChild(this._bottomBar);

    // Portrait placeholder (left side)
    this._portraitGfx = new Graphics();
    this._portraitGfx.position.set(60, h - this._letterboxH - 120);
    this.container.addChild(this._portraitGfx);

    // Speaker name
    this._speakerText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 16,
        fontWeight: 'bold',
        fill: 0xffd700,
        letterSpacing: 1,
      }),
    });
    this._speakerText.position.set(140, h - this._letterboxH - 120);
    this.container.addChild(this._speakerText);

    // Dialogue text
    this._dialogueText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 14,
        fill: 0xeeddcc,
        wordWrap: true,
        wordWrapWidth: w - 200,
        lineHeight: 22,
      }),
    });
    this._dialogueText.position.set(140, h - this._letterboxH - 90);
    this.container.addChild(this._dialogueText);

    // Advance prompt
    this._promptText = new Text({
      text: '[Space / Enter]',
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 10,
        fill: 0x666666,
      }),
    });
    this._promptText.anchor.set(1, 1);
    this._promptText.position.set(w - 30, h - this._letterboxH - 10);
    this.container.addChild(this._promptText);
  }

  public async enter(): Promise<void> {
    // Animate letterbox bars in
    const h = this.engine.height;
    await Promise.all([
      new Promise<void>((resolve) => {
        gsap.to(this._topBar, {
          y: 0,
          duration: 0.6,
          ease: 'power2.out',
          onComplete: resolve,
        });
      }),
      new Promise<void>((resolve) => {
        gsap.to(this._bottomBar, {
          y: h - this._letterboxH,
          duration: 0.6,
          ease: 'power2.out',
          onComplete: resolve,
        });
      }),
    ]);

    this._entered = true;
    this._showStep(0);
  }

  public update(dt: number): void {
    if (!this._entered) return;

    const step = this._steps[this._currentStep];
    if (!step) return;

    // Auto-advance timer
    if (step.duration && step.duration > 0) {
      this._stepTimer += dt;
      if (this._stepTimer >= step.duration) {
        this._advance();
        return;
      }
    }

    // Manual advance
    if (
      this.engine.input.isActionJustPressed('interact') ||
      this.engine.input.isKeyJustPressed('Space')
    ) {
      this._advance();
    }

    // Skip entire cutscene
    if (this.engine.input.isActionJustPressed('openMenu')) {
      this._finish();
    }

    // Pulse the prompt
    const pulse = Math.sin(Date.now() * 0.004) * 0.3 + 0.7;
    this._promptText.alpha = pulse;
  }

  public fixedUpdate(_dt: number): void { /* no-op */ }

  public render(_alpha: number): void {
    const w = this.engine.width;
    const h = this.engine.height;
    this._overlay.clear();
    this._overlay.rect(0, 0, w, h).fill(0x000000);
  }

  // ------------------------------------------------------------------
  // Private
  // ------------------------------------------------------------------

  private _showStep(index: number): void {
    if (index >= this._steps.length) {
      this._finish();
      return;
    }

    this._currentStep = index;
    this._stepTimer = 0;
    const step = this._steps[index];

    // Speaker
    this._speakerText.text = step.speaker || '';

    // Portrait
    this._portraitGfx.clear();
    if (step.speaker) {
      const color = step.portraitColor ?? 0x666666;
      this._portraitGfx.roundRect(0, 0, 64, 64, 6).fill({ color, alpha: 0.2 });
      this._portraitGfx.roundRect(0, 0, 64, 64, 6).stroke({ color, width: 2 });
    }

    // Dialogue
    this._dialogueText.text = step.text;

    // Prompt visibility
    this._promptText.visible = !step.duration || step.duration <= 0;

    // Fade-in effect
    this._dialogueText.alpha = 0;
    gsap.to(this._dialogueText, { alpha: 1, duration: 0.4 });
  }

  private _advance(): void {
    this._showStep(this._currentStep + 1);
  }

  private _finish(): void {
    this._onComplete?.();
    void this.engine.scenes.pop();
  }
}
