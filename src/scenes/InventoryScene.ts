import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';

// ---------------------------------------------------------------------------
// Item rarity colors
// ---------------------------------------------------------------------------

const RARITY_COLORS: Record<string, number> = {
  common: 0xffffff,
  uncommon: 0x1eff00,
  rare: 0x0070ff,
  epic: 0xa335ee,
  legendary: 0xff8000,
};

// ---------------------------------------------------------------------------
// Equipment slot definitions
// ---------------------------------------------------------------------------

interface EquipSlotDef {
  id: string;
  label: string;
  x: number;
  y: number;
}

const EQUIP_SLOTS: EquipSlotDef[] = [
  { id: 'helmet',    label: 'Helm',   x: 80, y: 0 },
  { id: 'amulet',    label: 'Amulet', x: 140, y: 20 },
  { id: 'weapon',    label: 'Weapon', x: 10, y: 80 },
  { id: 'armor',     label: 'Armor',  x: 80, y: 80 },
  { id: 'offhand',   label: 'Shield', x: 150, y: 80 },
  { id: 'belt',      label: 'Belt',   x: 80, y: 160 },
  { id: 'boots',     label: 'Boots',  x: 80, y: 220 },
  { id: 'accessory1', label: 'Ring 1', x: 10, y: 180 },
  { id: 'accessory2', label: 'Ring 2', x: 150, y: 180 },
];

// ---------------------------------------------------------------------------
// Placeholder item data
// ---------------------------------------------------------------------------

interface InventoryItem {
  id: string;
  name: string;
  rarity: string;
  description: string;
  slot?: string;
  stats?: string;
  levelReq?: number;
}

const PLACEHOLDER_ITEMS: InventoryItem[] = [
  { id: 'health-potion', name: 'Health Potion', rarity: 'common', description: 'Restores 50 HP.' },
  { id: 'mana-potion', name: 'Mana Potion', rarity: 'common', description: 'Restores 40 MP.' },
  { id: 'health-potion-2', name: 'Health Potion', rarity: 'common', description: 'Restores 50 HP.' },
  { id: 'rusty-sword', name: 'Rusty Sword', rarity: 'common', slot: 'weapon', stats: 'ATK +5', levelReq: 1, description: 'A battered old sword.' },
  { id: 'leather-armor', name: 'Leather Armor', rarity: 'common', slot: 'armor', stats: 'DEF +5, DEX +1', levelReq: 1, description: 'Simple leather armor.' },
  { id: 'flame-sword', name: 'Flame Sword', rarity: 'rare', slot: 'weapon', stats: 'ATK +18, STR +2', levelReq: 5, description: 'A sword imbued with fire.' },
  { id: 'wool-cloak', name: 'Enchanted Wool Cloak', rarity: 'uncommon', slot: 'armor', stats: 'DEF +4, CON +2', levelReq: 2, description: 'Warm in any weather.' },
  { id: 'slime-gel', name: 'Slime Gel', rarity: 'common', description: 'A glob of sticky slime gel.' },
];

// ---------------------------------------------------------------------------
// Stat display data (placeholder)
// ---------------------------------------------------------------------------

interface StatLine {
  label: string;
  value: string;
  color?: number;
}

const PLACEHOLDER_STATS: StatLine[] = [
  { label: 'STR', value: '16' },
  { label: 'INT', value: '8' },
  { label: 'WIS', value: '10' },
  { label: 'DEX', value: '10' },
  { label: 'CON', value: '14' },
  { label: 'CHA', value: '10' },
  { label: '', value: '' },
  { label: 'HP', value: '142', color: 0x00cc00 },
  { label: 'MP', value: '63', color: 0x4488ff },
  { label: 'ATK', value: '37', color: 0xff6644 },
  { label: 'DEF', value: '19', color: 0x8888ff },
  { label: 'SPD', value: '18.5' },
  { label: 'CRIT', value: '8.5%' },
  { label: 'DODGE', value: '6.0%' },
];

// ---------------------------------------------------------------------------
// InventoryScene
// ---------------------------------------------------------------------------

/**
 * Inventory and equipment overlay screen.
 *
 * Pushed on top of the current scene and rendered as an overlay.
 *
 * Layout:
 * - Semi-transparent dark background.
 * - Left: character paper doll with 9 equipment slots.
 * - Center: bag inventory grid (4x7 = 28 slots).
 * - Right: stat display.
 * - Tooltips on hover.
 * - Tab to switch party members.
 * - Gold display at bottom.
 * - Press I or Escape to close.
 */
export class InventoryScene extends Scene {
  // ------------------------------------------------------------------
  // Display objects
  // ------------------------------------------------------------------

  private _overlay!: Graphics;
  private _leftPanel!: Container;
  private _centerPanel!: Container;
  private _rightPanel!: Container;
  private _tooltipContainer!: Container;
  private _tabContainer!: Container;
  private _goldText!: Text;

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  private _activeTab: number = 0;
  private _partyNames: string[] = ['Roland', 'Lysara', 'Sylvan', 'Arcturus'];
  private _gold: number = 350;
  /** Currently hovered item for tooltip display. */
  public get hoveredItem(): InventoryItem | null {
    return this._hoveredItemRef;
  }
  private _hoveredItemRef: InventoryItem | null = null;

  constructor() {
    super('InventoryScene');
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  public async init(): Promise<void> {
    const w = this.engine.width;
    const h = this.engine.height;

    // --- Semi-transparent dark overlay ---
    this._overlay = new Graphics();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.7 });
    this._overlay.eventMode = 'static'; // Block input to scene below.
    this.container.addChild(this._overlay);

    // --- Main panel background ---
    const panelW = Math.min(900, w - 40);
    const panelH = Math.min(550, h - 40);
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;

    const panelBg = new Graphics();
    panelBg.roundRect(panelX, panelY, panelW, panelH, 8).fill({ color: 0x12100a, alpha: 0.95 });
    panelBg.roundRect(panelX, panelY, panelW, panelH, 8).stroke({ color: 0xdaa520, width: 2 });
    panelBg.eventMode = 'static'; // Prevent click-through.
    this.container.addChild(panelBg);

    // --- Title ---
    const titleText = new Text({
      text: 'INVENTORY',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 22,
        fontWeight: 'bold',
        fill: 0xffd700,
        stroke: { color: 0x1a0800, width: 3 },
        letterSpacing: 4,
      }),
    });
    titleText.anchor.set(0.5, 0);
    titleText.position.set(w / 2, panelY + 10);
    this.container.addChild(titleText);

    // --- Close hint ---
    const closeHint = new Text({
      text: 'Press I or Esc to close',
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 10,
        fill: 0x666666,
      }),
    });
    closeHint.anchor.set(1, 0);
    closeHint.position.set(panelX + panelW - 12, panelY + 16);
    this.container.addChild(closeHint);

    // --- Tab container (party member tabs) ---
    this._tabContainer = new Container();
    this._tabContainer.position.set(panelX + 12, panelY + 40);
    this.container.addChild(this._tabContainer);
    this._buildTabs(panelW);

    // --- Left panel: equipment paper doll ---
    this._leftPanel = new Container();
    this._leftPanel.position.set(panelX + 20, panelY + 72);
    this.container.addChild(this._leftPanel);
    this._buildEquipmentPanel();

    // --- Center panel: inventory grid ---
    this._centerPanel = new Container();
    this._centerPanel.position.set(panelX + 220, panelY + 72);
    this.container.addChild(this._centerPanel);
    this._buildInventoryGrid();

    // --- Right panel: stats ---
    this._rightPanel = new Container();
    this._rightPanel.position.set(panelX + panelW - 180, panelY + 72);
    this.container.addChild(this._rightPanel);
    this._buildStatPanel();

    // --- Gold display ---
    this._goldText = new Text({
      text: `Gold: ${this._gold}`,
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 12,
        fill: 0xffd700,
      }),
    });
    this._goldText.position.set(panelX + 20, panelY + panelH - 30);
    this.container.addChild(this._goldText);

    // --- Tooltip container (rendered on top) ---
    this._tooltipContainer = new Container();
    this._tooltipContainer.visible = false;
    this.container.addChild(this._tooltipContainer);
  }

  public update(_dt: number): void {
    // Check for close input.
    if (
      this.engine.input.isKeyJustPressed('KeyI') ||
      this.engine.input.isActionJustPressed('openMenu')
    ) {
      void this.engine.scenes.pop();
    }
  }

  public fixedUpdate(_dt: number): void {
    // No fixed logic.
  }

  public render(_alpha: number): void {
    // Re-draw overlay on resize.
    const w = this.engine.width;
    const h = this.engine.height;
    this._overlay.clear();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.7 });
  }

  // ------------------------------------------------------------------
  // Tabs
  // ------------------------------------------------------------------

  private _buildTabs(panelW: number): void {
    this._tabContainer.removeChildren();

    for (let i = 0; i < this._partyNames.length; i++) {
      const isActive = i === this._activeTab;
      const tabW = 90;
      const x = i * (tabW + 6);

      const tab = new Container();
      tab.position.set(x, 0);

      const bg = new Graphics();
      bg.roundRect(0, 0, tabW, 24, 3).fill({ color: isActive ? 0x2a2210 : 0x151510, alpha: 0.9 });
      bg.roundRect(0, 0, tabW, 24, 3).stroke({ color: isActive ? 0xffd700 : 0x444444, width: isActive ? 1.5 : 1 });
      tab.addChild(bg);

      const text = new Text({
        text: this._partyNames[i],
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 10,
          fill: isActive ? 0xffd700 : 0x888888,
        }),
      });
      text.anchor.set(0.5, 0.5);
      text.position.set(tabW / 2, 12);
      tab.addChild(text);

      tab.eventMode = 'static';
      tab.cursor = 'pointer';
      tab.on('pointerdown', () => {
        this._activeTab = i;
        this._buildTabs(panelW);
      });

      this._tabContainer.addChild(tab);
    }
  }

  // ------------------------------------------------------------------
  // Equipment panel (paper doll)
  // ------------------------------------------------------------------

  private _buildEquipmentPanel(): void {
    this._leftPanel.removeChildren();

    // Paper doll background.
    const dollBg = new Graphics();
    dollBg.roundRect(0, 0, 190, 280, 4).fill({ color: 0x0e0c08, alpha: 0.7 });
    dollBg.roundRect(0, 0, 190, 280, 4).stroke({ color: 0x333333, width: 1 });
    this._leftPanel.addChild(dollBg);

    // Character silhouette (simple).
    const silhouette = new Graphics();
    silhouette.circle(95, 40, 18).fill({ color: 0x333333, alpha: 0.4 });   // Head
    silhouette.rect(82, 60, 26, 50).fill({ color: 0x333333, alpha: 0.3 }); // Body
    silhouette.rect(70, 65, 12, 40).fill({ color: 0x333333, alpha: 0.2 }); // Left arm
    silhouette.rect(108, 65, 12, 40).fill({ color: 0x333333, alpha: 0.2 }); // Right arm
    silhouette.rect(82, 110, 12, 45).fill({ color: 0x333333, alpha: 0.2 }); // Left leg
    silhouette.rect(96, 110, 12, 45).fill({ color: 0x333333, alpha: 0.2 }); // Right leg
    this._leftPanel.addChild(silhouette);

    // Equipment slots.
    const slotSize = 36;
    for (const slotDef of EQUIP_SLOTS) {
      const slotContainer = new Container();
      slotContainer.position.set(slotDef.x, slotDef.y);

      const bg = new Graphics();
      bg.rect(0, 0, slotSize, slotSize).fill({ color: 0x1a1a1a, alpha: 0.7 });
      bg.rect(0, 0, slotSize, slotSize).stroke({ color: 0x444444, width: 1 });
      slotContainer.addChild(bg);

      // Slot label.
      const label = new Text({
        text: slotDef.label,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 7,
          fill: 0x666666,
        }),
      });
      label.anchor.set(0.5, 0);
      label.position.set(slotSize / 2, slotSize + 1);
      slotContainer.addChild(label);

      // Check if any item is equipped in this slot.
      const equippedItem = PLACEHOLDER_ITEMS.find((item) => item.slot === slotDef.id);
      if (equippedItem) {
        const itemBg = new Graphics();
        const rarityColor = RARITY_COLORS[equippedItem.rarity] ?? 0xffffff;
        itemBg.rect(1, 1, slotSize - 2, slotSize - 2).fill({ color: rarityColor, alpha: 0.1 });
        itemBg.rect(1, 1, slotSize - 2, slotSize - 2).stroke({ color: rarityColor, width: 1 });
        slotContainer.addChild(itemBg);

        const itemName = new Text({
          text: equippedItem.name.charAt(0),
          style: new TextStyle({
            fontFamily: 'Georgia, serif',
            fontSize: 16,
            fontWeight: 'bold',
            fill: rarityColor,
          }),
        });
        itemName.anchor.set(0.5, 0.5);
        itemName.position.set(slotSize / 2, slotSize / 2);
        slotContainer.addChild(itemName);

        // Hover tooltip.
        slotContainer.eventMode = 'static';
        slotContainer.on('pointerover', (e) => {
          this._showTooltip(equippedItem, e.global.x, e.global.y);
        });
        slotContainer.on('pointerout', () => {
          this._hideTooltip();
        });
        slotContainer.on('pointerdown', () => {
          this.engine.debug.log(`Unequipped: ${equippedItem.name}`);
        });
        slotContainer.cursor = 'pointer';
      }

      this._leftPanel.addChild(slotContainer);
    }
  }

  // ------------------------------------------------------------------
  // Inventory grid
  // ------------------------------------------------------------------

  private _buildInventoryGrid(): void {
    this._centerPanel.removeChildren();

    const headerText = new Text({
      text: 'Bag',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 13,
        fill: 0xdaa520,
      }),
    });
    this._centerPanel.addChild(headerText);

    const cols = 4;
    const rows = 7;
    const cellSize = 40;
    const gap = 4;
    const startY = 22;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        const x = col * (cellSize + gap);
        const y = startY + row * (cellSize + gap);

        const cellContainer = new Container();
        cellContainer.position.set(x, y);

        const bg = new Graphics();
        bg.rect(0, 0, cellSize, cellSize).fill({ color: 0x1a1a1a, alpha: 0.6 });
        bg.rect(0, 0, cellSize, cellSize).stroke({ color: 0x333333, width: 1 });
        cellContainer.addChild(bg);

        // Place placeholder items.
        if (idx < PLACEHOLDER_ITEMS.length) {
          const item = PLACEHOLDER_ITEMS[idx];
          const rarityColor = RARITY_COLORS[item.rarity] ?? 0xffffff;

          const itemBg = new Graphics();
          itemBg.rect(1, 1, cellSize - 2, cellSize - 2).fill({ color: rarityColor, alpha: 0.08 });
          itemBg.rect(1, 1, cellSize - 2, cellSize - 2).stroke({ color: rarityColor, width: 1 });
          cellContainer.addChild(itemBg);

          const itemIcon = new Text({
            text: item.name.charAt(0),
            style: new TextStyle({
              fontFamily: 'Georgia, serif',
              fontSize: 16,
              fill: rarityColor,
            }),
          });
          itemIcon.anchor.set(0.5, 0.5);
          itemIcon.position.set(cellSize / 2, cellSize / 2);
          cellContainer.addChild(itemIcon);

          // Hover tooltip.
          cellContainer.eventMode = 'static';
          cellContainer.cursor = 'pointer';
          cellContainer.on('pointerover', (e) => {
            this._showTooltip(item, e.global.x, e.global.y);
          });
          cellContainer.on('pointermove', (e) => {
            this._moveTooltip(e.global.x, e.global.y);
          });
          cellContainer.on('pointerout', () => {
            this._hideTooltip();
          });
          cellContainer.on('pointerdown', () => {
            if (item.slot) {
              this.engine.debug.log(`Equipped: ${item.name}`);
            } else {
              this.engine.debug.log(`Used: ${item.name}`);
            }
          });
        }

        this._centerPanel.addChild(cellContainer);
      }
    }
  }

  // ------------------------------------------------------------------
  // Stats panel
  // ------------------------------------------------------------------

  private _buildStatPanel(): void {
    this._rightPanel.removeChildren();

    const headerText = new Text({
      text: 'Stats',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 13,
        fill: 0xdaa520,
      }),
    });
    this._rightPanel.addChild(headerText);

    for (let i = 0; i < PLACEHOLDER_STATS.length; i++) {
      const stat = PLACEHOLDER_STATS[i];
      if (!stat.label) continue;

      const y = 24 + i * 18;

      const labelText = new Text({
        text: `${stat.label}:`,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fill: 0xaaaaaa,
        }),
      });
      labelText.position.set(0, y);
      this._rightPanel.addChild(labelText);

      const valText = new Text({
        text: stat.value,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fontWeight: 'bold',
          fill: stat.color ?? 0xffffff,
        }),
      });
      valText.position.set(70, y);
      this._rightPanel.addChild(valText);
    }
  }

  // ------------------------------------------------------------------
  // Tooltip
  // ------------------------------------------------------------------

  private _showTooltip(item: InventoryItem, screenX: number, screenY: number): void {
    this._hoveredItemRef = item;
    this._tooltipContainer.removeChildren();
    this._tooltipContainer.visible = true;

    const rarityColor = RARITY_COLORS[item.rarity] ?? 0xffffff;
    const tooltipW = 220;
    let tooltipH = 70;

    // Build tooltip content to calculate height.
    const lines: Array<{ text: string; style: TextStyle; y: number }> = [];
    let yOffset = 8;

    // Name.
    lines.push({
      text: item.name,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 13,
        fontWeight: 'bold',
        fill: rarityColor,
      }),
      y: yOffset,
    });
    yOffset += 18;

    // Rarity.
    lines.push({
      text: item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1),
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 9,
        fill: rarityColor,
        fontStyle: 'italic',
      }),
      y: yOffset,
    });
    yOffset += 14;

    // Stats.
    if (item.stats) {
      lines.push({
        text: item.stats,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 10,
          fill: 0x88ff88,
        }),
        y: yOffset,
      });
      yOffset += 14;
    }

    // Level requirement.
    if (item.levelReq !== undefined) {
      lines.push({
        text: `Requires Level ${item.levelReq}`,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: 0xffaa00,
        }),
        y: yOffset,
      });
      yOffset += 14;
    }

    // Description.
    lines.push({
      text: item.description,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 10,
        fill: 0xaaaaaa,
        fontStyle: 'italic',
        wordWrap: true,
        wordWrapWidth: tooltipW - 16,
      }),
      y: yOffset,
    });
    yOffset += 16;

    tooltipH = yOffset + 8;

    // Background.
    const bg = new Graphics();
    bg.roundRect(0, 0, tooltipW, tooltipH, 4).fill({ color: 0x0a0a0a, alpha: 0.95 });
    bg.roundRect(0, 0, tooltipW, tooltipH, 4).stroke({ color: rarityColor, width: 1.5 });
    this._tooltipContainer.addChild(bg);

    // Text lines.
    for (const line of lines) {
      const text = new Text({ text: line.text, style: line.style });
      text.position.set(8, line.y);
      this._tooltipContainer.addChild(text);
    }

    this._moveTooltip(screenX, screenY);
  }

  private _moveTooltip(screenX: number, screenY: number): void {
    // Position tooltip near the cursor but keep it on screen.
    const w = this.engine.width;
    const h = this.engine.height;
    const ttW = 220;
    const ttH = this._tooltipContainer.height || 100;

    let tx = screenX + 16;
    let ty = screenY - 10;

    if (tx + ttW > w) tx = screenX - ttW - 8;
    if (ty + ttH > h) ty = h - ttH - 4;
    if (ty < 4) ty = 4;

    this._tooltipContainer.position.set(tx, ty);
  }

  private _hideTooltip(): void {
    this._hoveredItemRef = null;
    this._tooltipContainer.visible = false;
    this._tooltipContainer.removeChildren();
  }
}
