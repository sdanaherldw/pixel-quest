import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';
import { SaveManager, type SaveSlotInfo } from '@/engine/SaveManager';

// ---------------------------------------------------------------------------
// SaveLoadScene
// ---------------------------------------------------------------------------

type SaveLoadMode = 'save' | 'load';

/**
 * Save / Load overlay scene.
 *
 * Pushed on top of the current scene. Displays 4 save slots (0 = autosave,
 * 1-3 = manual). The player can save to or load from any slot.
 * Press ESC to close.
 */
export class SaveLoadScene extends Scene {
  private _overlay!: Graphics;
  private _slotContainer!: Container;
  private _statusText!: Text;

  private _mode: SaveLoadMode;
  private _slots: SaveSlotInfo[] = [];
  private _selectedSlot: number = 1;

  constructor(mode: SaveLoadMode = 'save') {
    super('SaveLoadScene');
    this._mode = mode;
  }

  public async init(): Promise<void> {
    const w = this.engine.width;
    const h = this.engine.height;

    // Semi-transparent backdrop
    this._overlay = new Graphics();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.75 });
    this._overlay.eventMode = 'static';
    this.container.addChild(this._overlay);

    // Panel
    const panelW = 500;
    const panelH = 400;
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;

    const panel = new Graphics();
    panel.roundRect(panelX, panelY, panelW, panelH, 8).fill({ color: 0x12100a, alpha: 0.95 });
    panel.roundRect(panelX, panelY, panelW, panelH, 8).stroke({ color: 0xdaa520, width: 2 });
    panel.eventMode = 'static';
    this.container.addChild(panel);

    // Title
    const title = new Text({
      text: this._mode === 'save' ? 'SAVE GAME' : 'LOAD GAME',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 22,
        fontWeight: 'bold',
        fill: 0xffd700,
        stroke: { color: 0x1a0800, width: 3 },
        letterSpacing: 4,
      }),
    });
    title.anchor.set(0.5, 0);
    title.position.set(w / 2, panelY + 14);
    this.container.addChild(title);

    // Close hint
    const hint = new Text({
      text: '[ESC] Close',
      style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 10, fill: 0x666666 }),
    });
    hint.anchor.set(1, 0);
    hint.position.set(panelX + panelW - 12, panelY + 18);
    this.container.addChild(hint);

    // Slot container
    this._slotContainer = new Container();
    this._slotContainer.position.set(panelX + 30, panelY + 60);
    this.container.addChild(this._slotContainer);

    // Status text
    this._statusText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 11, fill: 0x88ff88 }),
    });
    this._statusText.anchor.set(0.5, 0);
    this._statusText.position.set(w / 2, panelY + panelH - 40);
    this.container.addChild(this._statusText);

    // Load slot info and build UI
    await this._loadSlotInfo();
    this._buildSlots();
  }

  public update(_dt: number): void {
    if (this.engine.input.isActionJustPressed('openMenu')) {
      void this.engine.scenes.pop();
      return;
    }

    if (this.engine.input.isActionJustPressed('moveUp')) {
      this._selectedSlot = Math.max(0, this._selectedSlot - 1);
      this._buildSlots();
    }
    if (this.engine.input.isActionJustPressed('moveDown')) {
      this._selectedSlot = Math.min(3, this._selectedSlot + 1);
      this._buildSlots();
    }
    if (this.engine.input.isActionJustPressed('interact')) {
      void this._executeAction(this._selectedSlot);
    }
  }

  public fixedUpdate(_dt: number): void { /* no-op */ }

  public render(_alpha: number): void {
    const w = this.engine.width;
    const h = this.engine.height;
    this._overlay.clear();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.75 });
  }

  // ------------------------------------------------------------------
  // Private
  // ------------------------------------------------------------------

  private async _loadSlotInfo(): Promise<void> {
    try {
      this._slots = await SaveManager.instance.getSlotInfo();
    } catch (_err) {
      this._slots = Array.from({ length: 4 }, (_, i) => ({ slot: i, exists: false }));
    }
  }

  private _buildSlots(): void {
    this._slotContainer.removeChildren();

    const slotW = 440;
    const slotH = 64;

    for (let i = 0; i < 4; i++) {
      const info = this._slots[i] ?? { slot: i, exists: false };
      const isSelected = i === this._selectedSlot;
      const y = i * (slotH + 10);
      const slotLabel = i === 0 ? 'Autosave' : `Slot ${i}`;

      const row = new Container();
      row.position.set(0, y);

      const bg = new Graphics();
      bg.roundRect(0, 0, slotW, slotH, 4).fill({ color: isSelected ? 0x2a2210 : 0x151510, alpha: 0.9 });
      bg.roundRect(0, 0, slotW, slotH, 4).stroke({ color: isSelected ? 0xffd700 : 0x444444, width: isSelected ? 2 : 1 });
      row.addChild(bg);

      // Slot label
      const name = new Text({
        text: slotLabel,
        style: new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 14, fill: isSelected ? 0xffd700 : 0xaaaaaa }),
      });
      name.position.set(14, 8);
      row.addChild(name);

      // Slot details
      if (info.exists) {
        const details = new Text({
          text: `${info.playerName ?? '???'}  |  Lv ${info.level ?? '?'}  |  ${info.region ?? 'Unknown'}`,
          style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 10, fill: 0x888888 }),
        });
        details.position.set(14, 30);
        row.addChild(details);

        if (info.timestamp) {
          const date = new Date(info.timestamp);
          const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
          const timeText = new Text({
            text: timeStr,
            style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 9, fill: 0x666666 }),
          });
          timeText.position.set(14, 46);
          row.addChild(timeText);
        }
      } else {
        const emptyText = new Text({
          text: '- Empty -',
          style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 11, fill: 0x555555, fontStyle: 'italic' }),
        });
        emptyText.position.set(14, 30);
        row.addChild(emptyText);
      }

      // Click handler
      row.eventMode = 'static';
      row.cursor = 'pointer';
      row.on('pointerdown', () => {
        this._selectedSlot = i;
        this._buildSlots();
        void this._executeAction(i);
      });

      this._slotContainer.addChild(row);
    }
  }

  private async _executeAction(slot: number): Promise<void> {
    try {
      if (this._mode === 'save') {
        const success = await SaveManager.instance.saveGameState(slot);
        this._statusText.text = success ? `Saved to ${slot === 0 ? 'Autosave' : `Slot ${slot}`}!` : 'Save failed.';
        this._statusText.style.fill = success ? 0x88ff88 : 0xff6666;
        if (success) {
          await this._loadSlotInfo();
          this._buildSlots();
        }
      } else {
        const success = await SaveManager.instance.loadGameState(slot);
        if (success) {
          this._statusText.text = 'Loaded! Returning to game...';
          this._statusText.style.fill = 0x88ff88;
          // Pop back to the game scene
          void this.engine.scenes.pop();
        } else {
          this._statusText.text = slot === 0 ? 'No autosave data.' : `Slot ${slot} is empty.`;
          this._statusText.style.fill = 0xff6666;
        }
      }
    } catch (_err) {
      this._statusText.text = 'An error occurred.';
      this._statusText.style.fill = 0xff6666;
    }
  }
}
