import { Container, Graphics, Text, TextStyle } from 'pixi.js';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/** Notification category. */
export type NotificationType =
  | 'quest'
  | 'item'
  | 'levelup'
  | 'achievement'
  | 'warning';

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const MAX_VISIBLE = 3;
const AUTO_DISMISS = 4; // seconds
const SLIDE_DURATION = 0.3; // seconds
const NOTIF_WIDTH = 320;
const NOTIF_HEIGHT = 64;
const NOTIF_GAP = 8;
const PANEL_BG = 0x111122;
const PANEL_ALPHA = 0.92;
const ICON_SIZE = 40;

/** Border colour per notification type. */
const TYPE_BORDER: Record<NotificationType, number> = {
  quest: 0xffd700,
  item: 0xcccccc, // overridden per rarity
  levelup: 0xffd700,
  achievement: 0x9944ff,
  warning: 0xff3333,
};

/** Icon placeholder colour per type. */
const TYPE_ICON_COLOR: Record<NotificationType, number> = {
  quest: 0xeebb44,
  item: 0x888888,
  levelup: 0xffd700,
  achievement: 0x9944ff,
  warning: 0xff3333,
};

// ------------------------------------------------------------------
// Internal notification entry
// ------------------------------------------------------------------

interface NotifEntry {
  container: Container;
  /** Total age in seconds. */
  age: number;
  /** Slide animation progress 0-1 (1 = fully shown). */
  slideIn: number;
  /** Slide-out progress 0-1 (0 = visible, 1 = fully gone). */
  slideOut: number;
  /** Whether we've started dismissing. */
  dismissing: boolean;
}

// ------------------------------------------------------------------
// Notifications
// ------------------------------------------------------------------

/**
 * Toast notification system.
 *
 * Notifications slide in from the top-right, stack vertically (max 3),
 * and auto-dismiss after 4 seconds. Newer notifications push older
 * ones upward.
 */
export class Notifications {
  /** Root container — add to the UI layer. */
  public readonly container: Container = new Container();

  private _screenW: number;
  private _screenH: number;

  /** Active notification entries (newest last). */
  private readonly _entries: NotifEntry[] = [];

  constructor(screenW: number = 1280, screenH: number = 720) {
    this._screenW = screenW;
    this._screenH = screenH;
    this.container.label = 'Notifications';
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Display a new toast notification.
   *
   * @param message Text to show.
   * @param type    Notification category (determines style).
   * @param iconColor Optional override for the icon placeholder colour.
   * @param borderColor Optional override for the border colour.
   */
  public show(
    message: string,
    type: NotificationType,
    iconColor?: number,
    borderColor?: number,
  ): void {
    const entry = this._createEntry(message, type, iconColor, borderColor);
    this._entries.push(entry);
    this.container.addChild(entry.container);

    // If more than MAX_VISIBLE, start dismissing the oldest
    while (this._countVisible() > MAX_VISIBLE) {
      const oldest = this._entries.find((e) => !e.dismissing);
      if (oldest) {
        oldest.dismissing = true;
      } else {
        break;
      }
    }
  }

  /** Clear all notifications immediately. */
  public clear(): void {
    for (const entry of this._entries) {
      this.container.removeChild(entry.container);
      entry.container.destroy({ children: true });
    }
    this._entries.length = 0;
  }

  /**
   * Per-frame update. Drives slide animations and auto-dismiss.
   *
   * @param dt Frame delta in seconds.
   */
  public update(dt: number): void {
    const toRemove: NotifEntry[] = [];

    for (const entry of this._entries) {
      entry.age += dt;

      // Slide in
      if (entry.slideIn < 1) {
        entry.slideIn = Math.min(1, entry.slideIn + dt / SLIDE_DURATION);
      }

      // Auto-dismiss
      if (entry.age >= AUTO_DISMISS && !entry.dismissing) {
        entry.dismissing = true;
      }

      // Slide out
      if (entry.dismissing) {
        entry.slideOut = Math.min(1, entry.slideOut + dt / SLIDE_DURATION);
        if (entry.slideOut >= 1) {
          toRemove.push(entry);
        }
      }
    }

    // Remove fully dismissed
    for (const entry of toRemove) {
      const idx = this._entries.indexOf(entry);
      if (idx !== -1) this._entries.splice(idx, 1);
      this.container.removeChild(entry.container);
      entry.container.destroy({ children: true });
    }

    // Position entries (stack from top-right downward)
    this._layoutEntries();
  }

  /** Handle window resize. */
  public resize(w: number, h: number): void {
    this._screenW = w;
    this._screenH = h;
  }

  /** Clean up. */
  public destroy(): void {
    this.container.destroy({ children: true });
    this._entries.length = 0;
  }

  // ------------------------------------------------------------------
  // Internal
  // ------------------------------------------------------------------

  private _countVisible(): number {
    return this._entries.filter((e) => !e.dismissing).length;
  }

  private _createEntry(
    message: string,
    type: NotificationType,
    iconColor?: number,
    borderColor?: number,
  ): NotifEntry {
    const c = new Container();

    const bColor = borderColor ?? TYPE_BORDER[type];
    const iColor = iconColor ?? TYPE_ICON_COLOR[type];

    // Background
    const bg = new Graphics();
    bg.roundRect(0, 0, NOTIF_WIDTH, NOTIF_HEIGHT, 6).fill({
      color: PANEL_BG,
      alpha: PANEL_ALPHA,
    });
    bg.roundRect(0, 0, NOTIF_WIDTH, NOTIF_HEIGHT, 6).stroke({
      color: bColor,
      width: 2,
    });

    // Level-up special: subtle golden burst background
    if (type === 'levelup') {
      bg.roundRect(2, 2, NOTIF_WIDTH - 4, NOTIF_HEIGHT - 4, 5).fill({
        color: 0xffd700,
        alpha: 0.08,
      });
    }

    c.addChild(bg);

    // Icon placeholder
    const icon = new Graphics();
    icon.roundRect(10, (NOTIF_HEIGHT - ICON_SIZE) / 2, ICON_SIZE, ICON_SIZE, 4).fill(iColor);
    c.addChild(icon);

    // Text
    const txt = new Text({
      text: message,
      style: new TextStyle({
        fontFamily: 'serif',
        fontSize: 14,
        fill: 0xeeeeee,
        wordWrap: true,
        wordWrapWidth: NOTIF_WIDTH - ICON_SIZE - 50,
      }),
    });
    txt.x = ICON_SIZE + 22;
    txt.y = (NOTIF_HEIGHT - txt.height) / 2;
    c.addChild(txt);

    // Close button
    const closeBtn = new Container();
    closeBtn.eventMode = 'static';
    closeBtn.cursor = 'pointer';
    const closeGfx = new Graphics();
    closeGfx.circle(0, 0, 8).fill({ color: 0x444466, alpha: 0.8 });
    closeBtn.addChild(closeGfx);

    const closeX = new Text({
      text: 'x',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 11,
        fill: 0xcccccc,
      }),
    });
    closeX.anchor.set(0.5, 0.5);
    closeBtn.addChild(closeX);

    closeBtn.x = NOTIF_WIDTH - 16;
    closeBtn.y = 14;
    c.addChild(closeBtn);

    const entry: NotifEntry = {
      container: c,
      age: 0,
      slideIn: 0,
      slideOut: 0,
      dismissing: false,
    };

    closeBtn.on('pointertap', () => {
      entry.dismissing = true;
    });

    return entry;
  }

  /** Position all active notifications stacking downward from top-right. */
  private _layoutEntries(): void {
    let stackY = 16;
    for (const entry of this._entries) {
      // Slide-in easing (ease-out quad)
      const tIn = 1 - (1 - entry.slideIn) * (1 - entry.slideIn);
      // Slide-out easing
      const tOut = entry.slideOut * entry.slideOut;

      // X: slide in from right edge
      const baseX = this._screenW - NOTIF_WIDTH - 16;
      const offX = NOTIF_WIDTH + 32;
      entry.container.x = baseX + offX * (1 - tIn) + offX * tOut;

      // Y: stack position (clamped so notifications stay on screen)
      entry.container.y = Math.min(stackY, this._screenH - NOTIF_HEIGHT - 8);
      entry.container.alpha = 1 - tOut;

      stackY += (NOTIF_HEIGHT + NOTIF_GAP) * tIn * (1 - tOut);
    }
  }
}
