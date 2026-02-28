import { Container, Graphics, Text, TextStyle } from 'pixi.js';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/** Per-character data supplied to the HUD each frame. */
export interface PartyMemberData {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  /** Index of the active (player-controlled) character. */
  isActive: boolean;
  statusEffects?: StatusEffectData[];
}

/** A single status effect icon with remaining duration. */
export interface StatusEffectData {
  id: string;
  name: string;
  /** Remaining duration in seconds. */
  duration: number;
  /** Hex colour used for the icon placeholder. */
  color: number;
}

/** Data for a single quick-bar slot. */
export interface QuickSlotData {
  /** Slot index 0-7. */
  index: number;
  /** Display name. */
  name?: string;
  /** Hex colour for the icon placeholder. */
  iconColor?: number;
  /** Cooldown remaining 0-1 (0 = ready). */
  cooldownFraction?: number;
}

/** Lightweight entity marker for the minimap. */
export interface MinimapEntity {
  x: number;
  y: number;
  type: 'player' | 'enemy' | 'npc' | 'town';
}

// ------------------------------------------------------------------
// Style constants
// ------------------------------------------------------------------

const PANEL_BG = 0x111122;
const PANEL_BORDER = 0x886622;
const GOLDEN = 0xffd700;
const BAR_WIDTH = 130;
const BAR_HEIGHT = 10;
const MEMBER_SPACING = 80;
const SLOT_SIZE = 48;
const SLOT_GAP = 6;
const MINIMAP_SIZE = 120;

// ------------------------------------------------------------------
// Helper: HP bar colour
// ------------------------------------------------------------------

function hpColor(ratio: number): number {
  if (ratio > 0.6) return 0x44cc44;
  if (ratio > 0.3) return 0xcccc22;
  return 0xcc3333;
}

// ------------------------------------------------------------------
// HUD
// ------------------------------------------------------------------

/**
 * In-game heads-up display for the overworld and dungeon scenes.
 *
 * All elements are rendered with PixiJS Graphics and Text and are
 * anchored to screen edges so they remain in position after resize.
 */
export class HUD {
  /** Root container added to the engine UI layer. */
  public readonly container: Container = new Container();

  // Sub-containers
  private readonly _partyPanel: Container = new Container();
  private readonly _quickBar: Container = new Container();
  private readonly _minimapContainer: Container = new Container();
  private readonly _areaNameContainer: Container = new Container();
  private readonly _goldContainer: Container = new Container();
  private readonly _statusPanel: Container = new Container();

  // Stored dimensions for layout
  private _screenW: number;
  private _screenH: number;

  // Area name fade timer
  private _areaNameTimer: number = 0;
  private _areaNameText: Text;

  // Gold display
  private _goldText: Text;

  // Party member widgets (rebuilt on update)
  private _memberWidgets: Container[] = [];

  // Quick slot widgets
  private _slotWidgets: Container[] = [];

  // Minimap internals
  private _minimapBg: Graphics = new Graphics();
  private _minimapContent: Graphics = new Graphics();

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor(screenW: number = 1280, screenH: number = 720) {
    this._screenW = screenW;
    this._screenH = screenH;

    this.container.label = 'HUD';
    this.container.eventMode = 'static';

    // Area name text (top centre)
    this._areaNameText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'serif',
        fontSize: 26,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 4 },
        align: 'center',
      }),
    });
    this._areaNameText.anchor.set(0.5, 0);
    this._areaNameContainer.addChild(this._areaNameText);

    // Gold text (top right)
    const coinIcon = new Graphics();
    coinIcon.circle(8, 8, 8).fill(GOLDEN);
    coinIcon.x = 0;
    coinIcon.y = 0;
    this._goldContainer.addChild(coinIcon);

    this._goldText = new Text({
      text: '0',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 18,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
      }),
    });
    this._goldText.x = 22;
    this._goldText.y = 0;
    this._goldContainer.addChild(this._goldText);

    // Build minimap frame
    this._buildMinimap();

    // Build quick-bar slots
    this._buildQuickBar();

    // Add all groups to root
    this.container.addChild(this._partyPanel);
    this.container.addChild(this._quickBar);
    this.container.addChild(this._minimapContainer);
    this.container.addChild(this._areaNameContainer);
    this.container.addChild(this._goldContainer);
    this.container.addChild(this._statusPanel);

    this._layout();
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Update HUD contents each frame.
   *
   * @param partyData  Array of party member info.
   * @param areaName   Current location name (set to trigger fade display).
   * @param gold       Current gold amount.
   * @param quickSlots Quick-bar slot data (up to 8).
   * @param dt         Frame delta in seconds.
   */
  public update(
    partyData: PartyMemberData[],
    areaName: string | null,
    gold: number,
    quickSlots: QuickSlotData[],
    dt: number,
  ): void {
    // --- Party panel ---
    this._rebuildPartyPanel(partyData);

    // --- Status effects (below party panel) ---
    this._rebuildStatusPanel(partyData);

    // --- Area name ---
    if (areaName !== null && areaName !== this._areaNameText.text) {
      this._areaNameText.text = areaName;
      this._areaNameContainer.alpha = 1;
      this._areaNameTimer = 3;
    }
    if (this._areaNameTimer > 0) {
      this._areaNameTimer -= dt;
      if (this._areaNameTimer <= 0.5 && this._areaNameTimer > 0) {
        this._areaNameContainer.alpha = this._areaNameTimer / 0.5;
      } else if (this._areaNameTimer <= 0) {
        this._areaNameContainer.alpha = 0;
      }
    }

    // --- Gold ---
    this._goldText.text = gold.toLocaleString();

    // --- Quick-bar cooldowns ---
    this._updateQuickBar(quickSlots);
  }

  /** Update the minimap display. */
  public updateMinimap(
    terrainColors: number[][] | null,
    entities: MinimapEntity[],
  ): void {
    this._minimapContent.clear();

    // Draw terrain grid
    if (terrainColors) {
      const rows = terrainColors.length;
      const cols = rows > 0 ? terrainColors[0].length : 0;
      const cellW = MINIMAP_SIZE / cols;
      const cellH = MINIMAP_SIZE / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          this._minimapContent
            .rect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5)
            .fill(terrainColors[r][c]);
        }
      }
    } else {
      this._minimapContent.rect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE).fill(0x224422);
    }

    // Draw entity dots
    for (const e of entities) {
      let dotColor = 0xffffff;
      let dotRadius = 2;
      switch (e.type) {
        case 'player':
          dotColor = GOLDEN;
          dotRadius = 3;
          break;
        case 'enemy':
          dotColor = 0xff3333;
          break;
        case 'npc':
          dotColor = 0x33ff33;
          break;
        case 'town':
          dotColor = 0xffffff;
          dotRadius = 4;
          break;
      }
      this._minimapContent.circle(e.x, e.y, dotRadius).fill(dotColor);
    }
  }

  /** Show the HUD. */
  public show(): void {
    this.container.visible = true;
  }

  /** Hide the HUD. */
  public hide(): void {
    this.container.visible = false;
  }

  /** Respond to a screen resize. */
  public resize(w: number, h: number): void {
    this._screenW = w;
    this._screenH = h;
    this._layout();
  }

  /** Clean up all display objects. */
  public destroy(): void {
    this.container.destroy({ children: true });
  }

  // ------------------------------------------------------------------
  // Layout
  // ------------------------------------------------------------------

  private _layout(): void {
    // Party panel – top-left
    this._partyPanel.x = 12;
    this._partyPanel.y = 12;

    // Status effects – below party panel
    this._statusPanel.x = 12;
    // y is set dynamically in _rebuildStatusPanel

    // Area name – top-centre
    this._areaNameContainer.x = this._screenW / 2;
    this._areaNameContainer.y = 16;

    // Gold – top-right
    this._goldContainer.x = this._screenW - 140;
    this._goldContainer.y = 16;

    // Quick bar – bottom-centre
    const totalBarW = 8 * SLOT_SIZE + 7 * SLOT_GAP;
    this._quickBar.x = (this._screenW - totalBarW) / 2;
    this._quickBar.y = this._screenH - SLOT_SIZE - 16;

    // Minimap – bottom-right
    this._minimapContainer.x = this._screenW - MINIMAP_SIZE - 16;
    this._minimapContainer.y = this._screenH - MINIMAP_SIZE - 16;
  }

  // ------------------------------------------------------------------
  // Party panel
  // ------------------------------------------------------------------

  private _rebuildPartyPanel(partyData: PartyMemberData[]): void {
    // Remove old widgets
    for (const w of this._memberWidgets) {
      this._partyPanel.removeChild(w);
      w.destroy({ children: true });
    }
    this._memberWidgets = [];

    for (let i = 0; i < partyData.length; i++) {
      const member = partyData[i];
      const widget = new Container();
      widget.y = i * MEMBER_SPACING;

      // Background panel
      const bg = new Graphics();
      bg.roundRect(0, 0, BAR_WIDTH + 24, 64, 4).fill({ color: PANEL_BG, alpha: 0.85 });
      if (member.isActive) {
        bg.roundRect(0, 0, BAR_WIDTH + 24, 64, 4).stroke({ color: GOLDEN, width: 2 });
      } else {
        bg.roundRect(0, 0, BAR_WIDTH + 24, 64, 4).stroke({ color: 0x444466, width: 1 });
      }
      widget.addChild(bg);

      // Name + Level
      const nameText = new Text({
        text: `${member.name}  Lv${member.level}`,
        style: new TextStyle({
          fontFamily: 'monospace',
          fontSize: 11,
          fill: member.isActive ? GOLDEN : 0xcccccc,
        }),
      });
      nameText.x = 6;
      nameText.y = 4;
      widget.addChild(nameText);

      // HP bar
      const hpRatio = member.maxHp > 0 ? member.hp / member.maxHp : 0;
      const hpBg = new Graphics();
      hpBg.rect(6, 22, BAR_WIDTH, BAR_HEIGHT).fill(0x222222);
      widget.addChild(hpBg);
      if (hpRatio > 0) {
        const hpFill = new Graphics();
        hpFill.rect(6, 22, BAR_WIDTH * hpRatio, BAR_HEIGHT).fill(hpColor(hpRatio));
        widget.addChild(hpFill);
      }
      const hpLabel = new Text({
        text: `${member.hp}/${member.maxHp}`,
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 9, fill: 0xffffff }),
      });
      hpLabel.x = 8;
      hpLabel.y = 22;
      widget.addChild(hpLabel);

      // MP bar
      const mpRatio = member.maxMp > 0 ? member.mp / member.maxMp : 0;
      const mpBg = new Graphics();
      mpBg.rect(6, 38, BAR_WIDTH, BAR_HEIGHT).fill(0x222222);
      widget.addChild(mpBg);
      if (mpRatio > 0) {
        const mpFill = new Graphics();
        mpFill.rect(6, 38, BAR_WIDTH * mpRatio, BAR_HEIGHT).fill(0x3366cc);
        widget.addChild(mpFill);
      }
      const mpLabel = new Text({
        text: `${member.mp}/${member.maxMp}`,
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 9, fill: 0xffffff }),
      });
      mpLabel.x = 8;
      mpLabel.y = 38;
      widget.addChild(mpLabel);

      this._partyPanel.addChild(widget);
      this._memberWidgets.push(widget);
    }
  }

  // ------------------------------------------------------------------
  // Status effects
  // ------------------------------------------------------------------

  private _rebuildStatusPanel(partyData: PartyMemberData[]): void {
    // Clear old status icons
    this._statusPanel.removeChildren();

    let offsetX = 0;
    for (const member of partyData) {
      if (!member.statusEffects) continue;
      for (const effect of member.statusEffects) {
        const icon = new Graphics();
        icon.roundRect(offsetX, 0, 28, 28, 3).fill({ color: effect.color, alpha: 0.8 });
        icon.roundRect(offsetX, 0, 28, 28, 3).stroke({ color: 0x666666, width: 1 });
        this._statusPanel.addChild(icon);

        const dur = new Text({
          text: `${Math.ceil(effect.duration)}`,
          style: new TextStyle({ fontFamily: 'monospace', fontSize: 9, fill: 0xffffff }),
        });
        dur.x = offsetX + 14;
        dur.y = 28;
        dur.anchor.set(0.5, 0);
        this._statusPanel.addChild(dur);

        offsetX += 32;
      }
    }

    // Position below party panel
    const partyBottom = 12 + this._memberWidgets.length * MEMBER_SPACING + 8;
    this._statusPanel.y = partyBottom;
  }

  // ------------------------------------------------------------------
  // Quick bar
  // ------------------------------------------------------------------

  private _buildQuickBar(): void {
    for (let i = 0; i < 8; i++) {
      const slot = new Container();
      slot.x = i * (SLOT_SIZE + SLOT_GAP);
      slot.y = 0;

      // Background
      const bg = new Graphics();
      bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 4).fill({ color: PANEL_BG, alpha: 0.85 });
      bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 4).stroke({ color: 0x444466, width: 1 });
      bg.label = 'slot-bg';
      slot.addChild(bg);

      // Key label
      const keyLabel = new Text({
        text: `${i + 1}`,
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: 0x999999 }),
      });
      keyLabel.x = 4;
      keyLabel.y = 2;
      keyLabel.label = 'key-label';
      slot.addChild(keyLabel);

      // Icon placeholder (filled later)
      const iconPlaceholder = new Graphics();
      iconPlaceholder.label = 'icon';
      slot.addChild(iconPlaceholder);

      // Cooldown overlay
      const cooldown = new Graphics();
      cooldown.label = 'cooldown';
      cooldown.alpha = 0.6;
      slot.addChild(cooldown);

      this._quickBar.addChild(slot);
      this._slotWidgets.push(slot);
    }
  }

  private _updateQuickBar(slots: QuickSlotData[]): void {
    for (const data of slots) {
      if (data.index < 0 || data.index >= 8) continue;
      const widget = this._slotWidgets[data.index];

      // Update icon colour
      const iconGfx = widget.getChildByLabel('icon') as Graphics | null;
      if (iconGfx) {
        iconGfx.clear();
        if (data.iconColor !== undefined) {
          iconGfx.roundRect(8, 14, SLOT_SIZE - 16, SLOT_SIZE - 22, 2).fill(data.iconColor);
        }
      }

      // Update cooldown sweep
      const cdGfx = widget.getChildByLabel('cooldown') as Graphics | null;
      if (cdGfx) {
        cdGfx.clear();
        const frac = data.cooldownFraction ?? 0;
        if (frac > 0) {
          const cx = SLOT_SIZE / 2;
          const cy = SLOT_SIZE / 2;
          const r = SLOT_SIZE / 2;
          const startAngle = -Math.PI / 2;
          const endAngle = startAngle + Math.PI * 2 * frac;
          cdGfx.moveTo(cx, cy);
          cdGfx.arc(cx, cy, r, startAngle, endAngle);
          cdGfx.lineTo(cx, cy);
          cdGfx.fill({ color: 0x000000, alpha: 0.7 });
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Minimap
  // ------------------------------------------------------------------

  private _buildMinimap(): void {
    // Border frame
    const frame = new Graphics();
    frame
      .roundRect(-3, -3, MINIMAP_SIZE + 6, MINIMAP_SIZE + 6, 4)
      .fill({ color: PANEL_BG, alpha: 0.85 });
    frame
      .roundRect(-3, -3, MINIMAP_SIZE + 6, MINIMAP_SIZE + 6, 4)
      .stroke({ color: PANEL_BORDER, width: 2 });
    this._minimapContainer.addChild(frame);

    // Background
    this._minimapBg.rect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE).fill(0x224422);
    this._minimapContainer.addChild(this._minimapBg);

    // Content layer (drawn dynamically)
    this._minimapContainer.addChild(this._minimapContent);
  }
}
