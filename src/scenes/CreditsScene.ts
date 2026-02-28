import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';

// ---------------------------------------------------------------------------
// Credits data
// ---------------------------------------------------------------------------

interface CreditSection {
  heading: string;
  names: string[];
}

const CREDITS: CreditSection[] = [
  { heading: 'Realms of Conquest', names: ['A pixel RPG adventure'] },
  { heading: 'Game Design', names: ['Lead Designer'] },
  { heading: 'Programming', names: ['Engine & Systems', 'Combat & AI', 'UI & Scenes'] },
  { heading: 'Art Direction', names: ['Pixel Art', 'VFX & Particles', 'UI Design'] },
  { heading: 'Music & Sound', names: ['Composer', 'Sound Design'] },
  { heading: 'Writing', names: ['Narrative Design', 'Dialogue', 'Lore & World-building'] },
  { heading: 'Quality Assurance', names: ['Lead QA', 'Playtest Team'] },
  { heading: 'Special Thanks', names: ['PixiJS Team', 'Open Source Community', 'You, the player!'] },
];

// ---------------------------------------------------------------------------
// CreditsScene
// ---------------------------------------------------------------------------

/**
 * Scrolling credits overlay.
 *
 * Displays the credits as a vertically-scrolling list.
 * Press ESC or any action to close.
 */
export class CreditsScene extends Scene {
  private _overlay!: Graphics;
  private _scrollContainer!: Container;
  private _scrollY: number = 0;
  private _totalHeight: number = 0;
  private _speed: number = 40; // pixels per second

  constructor() {
    super('CreditsScene');
  }

  public async init(): Promise<void> {
    const w = this.engine.width;
    const h = this.engine.height;

    // Dark backdrop
    this._overlay = new Graphics();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.9 });
    this._overlay.eventMode = 'static';
    this.container.addChild(this._overlay);

    // Scrolling credits container
    this._scrollContainer = new Container();
    this._scrollContainer.position.set(w / 2, h);
    this.container.addChild(this._scrollContainer);

    let cursorY = 0;

    for (const section of CREDITS) {
      // Section heading
      const heading = new Text({
        text: section.heading,
        style: new TextStyle({
          fontFamily: 'Georgia, serif',
          fontSize: 20,
          fontWeight: 'bold',
          fill: 0xffd700,
          letterSpacing: 3,
        }),
      });
      heading.anchor.set(0.5, 0);
      heading.position.set(0, cursorY);
      this._scrollContainer.addChild(heading);
      cursorY += 34;

      // Names
      for (const name of section.names) {
        const nameText = new Text({
          text: name,
          style: new TextStyle({
            fontFamily: 'Georgia, serif',
            fontSize: 14,
            fill: 0xccbbaa,
          }),
        });
        nameText.anchor.set(0.5, 0);
        nameText.position.set(0, cursorY);
        this._scrollContainer.addChild(nameText);
        cursorY += 22;
      }

      cursorY += 30; // Gap between sections
    }

    // Final message
    const thanks = new Text({
      text: 'Thank you for playing!',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 24,
        fontWeight: 'bold',
        fill: 0xffd700,
        letterSpacing: 2,
      }),
    });
    thanks.anchor.set(0.5, 0);
    thanks.position.set(0, cursorY);
    this._scrollContainer.addChild(thanks);
    cursorY += 60;

    this._totalHeight = cursorY;
    this._scrollY = 0;
  }

  public update(dt: number): void {
    // Close on ESC
    if (this.engine.input.isActionJustPressed('openMenu')) {
      void this.engine.scenes.pop();
      return;
    }

    // Speed up on interact press
    if (this.engine.input.isActionJustPressed('interact')) {
      this._speed = 160;
    }
    this._scrollY += this._speed * dt;

    // Update scroll position
    const h = this.engine.height;
    this._scrollContainer.y = h - this._scrollY;

    // Auto-close when credits have fully scrolled
    if (this._scrollY > this._totalHeight + h) {
      void this.engine.scenes.pop();
    }
  }

  public fixedUpdate(_dt: number): void { /* no-op */ }

  public render(_alpha: number): void {
    const w = this.engine.width;
    const h = this.engine.height;
    this._overlay.clear();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.9 });
  }
}
