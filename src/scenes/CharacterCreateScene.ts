import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';
import { FadeTransition } from '@/ui/TransitionEffects';
import { buildCharacterVisual, type ClassId, type PlayerData, type PlayerStats } from '@/entities/PlayerEntity';

// ---------------------------------------------------------------------------
// Class definitions (display data for the creation screen)
// ---------------------------------------------------------------------------

interface ClassInfo {
  id: ClassId;
  name: string;
  description: string;
  baseStats: PlayerStats;
  color: number;
  available: boolean;
}

const CLASSES: ClassInfo[] = [
  {
    id: 'knight', name: 'Knight',
    description: 'A stalwart warrior clad in heavy armor.\nMasters of melee combat.',
    baseStats: { str: 16, int: 8, wis: 10, dex: 10, con: 14, cha: 10 },
    color: 0xc0c0c0, available: true,
  },
  {
    id: 'paladin', name: 'Paladin',
    description: 'Holy warriors who balance martial prowess\nwith divine magic.',
    baseStats: { str: 14, int: 10, wis: 14, dex: 8, con: 12, cha: 12 },
    color: 0xffd700, available: true,
  },
  {
    id: 'ranger', name: 'Ranger',
    description: 'Skilled hunters who strike from afar.\nCommunion with nature.',
    baseStats: { str: 10, int: 10, wis: 14, dex: 16, con: 10, cha: 8 },
    color: 0x228b22, available: true,
  },
  {
    id: 'sorcerer', name: 'Sorcerer',
    description: 'Masters of the arcane arts.\nDevastating at range but fragile.',
    baseStats: { str: 6, int: 18, wis: 12, dex: 10, con: 8, cha: 10 },
    color: 0x8b00ff, available: true,
  },
  {
    id: 'cleric', name: 'Cleric',
    description: 'Devoted priests who channel divine power\nto mend wounds.',
    baseStats: { str: 10, int: 10, wis: 16, dex: 8, con: 14, cha: 12 },
    color: 0xf0f0f0, available: true,
  },
  {
    id: 'rogue', name: 'Rogue',
    description: 'Shadow-dwelling tricksters who strike\nfrom the darkness.',
    baseStats: { str: 10, int: 10, wis: 8, dex: 16, con: 10, cha: 14 },
    color: 0x808080, available: true,
  },
  {
    id: 'barbarian', name: 'Barbarian',
    description: 'Unique class — only Crag Hack\nembodies this savage fighting style.',
    baseStats: { str: 18, int: 6, wis: 7, dex: 14, con: 16, cha: 12 },
    color: 0x8b4513, available: false,
  },
];

// Pre-generated names per class.
const PRE_NAMES: Record<ClassId, string[]> = {
  knight: ['Roland', 'Gavin', 'Aldric', 'Theron'],
  paladin: ['Lysara', 'Cedric', 'Elowen', 'Darius'],
  ranger: ['Sylvan', 'Fenna', 'Kael', 'Mira'],
  sorcerer: ['Arcturus', 'Vex', 'Isolde', 'Zephyr'],
  cleric: ['Seraphina', 'Tomlin', 'Aria', 'Brother Caius'],
  rogue: ['Shadow', 'Jinx', 'Nyx', 'Valen'],
  barbarian: ['Crag Hack'],
};

const STAT_LABELS: Array<{ key: keyof PlayerStats; label: string }> = [
  { key: 'str', label: 'STR' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'cha', label: 'CHA' },
];

// ---------------------------------------------------------------------------
// Character slot state
// ---------------------------------------------------------------------------

interface CharacterSlot {
  name: string;
  classId: ClassId | null;
  bonusPoints: Record<keyof PlayerStats, number>;
  remainingPoints: number;
}

// ---------------------------------------------------------------------------
// CharacterCreateScene
// ---------------------------------------------------------------------------

/**
 * Party creation scene where the player assembles a party of 4 characters.
 *
 * UI layout:
 * - Left panel: 4 character slots.
 * - Center: class selection grid (6 playable classes).
 * - Right: stat display, class description, equipment preview.
 * - Bottom: "Begin Adventure" button.
 *
 * All UI built with PixiJS Graphics + Text.
 */
export class CharacterCreateScene extends Scene {
  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  private _slots: CharacterSlot[] = [];
  private _activeSlotIndex: number = 0;
  private _nameCounter: Record<ClassId, number> = {} as Record<ClassId, number>;

  // ------------------------------------------------------------------
  // Display containers
  // ------------------------------------------------------------------

  private _bg!: Graphics;
  private _titleText!: Text;
  private _leftPanel!: Container;
  private _centerPanel!: Container;
  private _rightPanel!: Container;
  private _beginButton!: Container;
  private _previewContainer!: Container;
  private _previewVisual: Container | null = null;

  // ------------------------------------------------------------------
  // Layout constants
  // ------------------------------------------------------------------

  private readonly _slotWidth = 160;
  private readonly _slotHeight = 60;

  constructor() {
    super('CharacterCreateScene');
    for (const cls of CLASSES) {
      this._nameCounter[cls.id] = 0;
    }
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  public async init(): Promise<void> {
    const w = this.engine.width;
    const h = this.engine.height;

    // Initialize 4 empty slots.
    for (let i = 0; i < 4; i++) {
      this._slots.push({
        name: '',
        classId: null,
        bonusPoints: { str: 0, int: 0, wis: 0, dex: 0, con: 0, cha: 0 },
        remainingPoints: 5,
      });
    }

    // --- Dark parchment background ---
    this._bg = new Graphics();
    this._drawBackground(w, h);
    this.container.addChild(this._bg);

    // --- Title ---
    this._titleText = new Text({
      text: 'CREATE YOUR PARTY',
      style: new TextStyle({
        fontFamily: 'Georgia, "Palatino Linotype", serif',
        fontSize: 32,
        fontWeight: 'bold',
        fill: 0xffd700,
        stroke: { color: 0x1a0800, width: 4 },
        letterSpacing: 4,
      }),
    });
    this._titleText.anchor.set(0.5, 0);
    this._titleText.position.set(w / 2, 20);
    this.container.addChild(this._titleText);

    // --- Left panel: character slots ---
    this._leftPanel = new Container();
    this._leftPanel.label = 'left-panel';
    this._leftPanel.position.set(20, 80);
    this.container.addChild(this._leftPanel);
    this._buildSlotPanel();

    // --- Center panel: class selection grid ---
    this._centerPanel = new Container();
    this._centerPanel.label = 'center-panel';
    this._centerPanel.position.set(200, 80);
    this.container.addChild(this._centerPanel);
    this._buildClassGrid();

    // --- Right panel: stat display and description ---
    this._rightPanel = new Container();
    this._rightPanel.label = 'right-panel';
    this._rightPanel.position.set(w - 320, 80);
    this.container.addChild(this._rightPanel);

    // Character preview.
    this._previewContainer = new Container();
    this._previewContainer.label = 'preview';
    this._previewContainer.position.set(w - 200, h - 220);
    this.container.addChild(this._previewContainer);

    this._buildRightPanel();

    // --- Begin Adventure button ---
    this._beginButton = new Container();
    this._beginButton.label = 'begin-btn';
    this.container.addChild(this._beginButton);
    this._buildBeginButton(w, h);

    this._refreshUI();
  }

  public update(_dt: number): void {
    // No per-frame logic needed; UI is event-driven.
  }

  public fixedUpdate(_dt: number): void {
    // No fixed-step logic.
  }

  public render(_alpha: number): void {
    // Re-layout on resize.
    const w = this.engine.width;
    const h = this.engine.height;

    this._bg.clear();
    this._drawBackground(w, h);
    this._titleText.position.set(w / 2, 20);
    this._rightPanel.position.set(w - 320, 80);
    this._previewContainer.position.set(w - 200, h - 220);
    this._buildBeginButton(w, h);
  }

  public override destroy(): void {
    if (this._previewVisual) {
      this._previewVisual.destroy({ children: true });
      this._previewVisual = null;
    }
    this._slots.length = 0;
    super.destroy();
  }

  // ------------------------------------------------------------------
  // Background
  // ------------------------------------------------------------------

  private _drawBackground(w: number, h: number): void {
    // Dark parchment gradient.
    const bands = 12;
    const bandH = h / bands;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const r = Math.round(0x12 + (0x1a - 0x12) * t);
      const g = Math.round(0x0e + (0x14 - 0x0e) * t);
      const b = Math.round(0x08 + (0x0e - 0x08) * t);
      const color = (r << 16) | (g << 8) | b;
      this._bg.rect(0, i * bandH, w, bandH + 1).fill(color);
    }

    // Golden border.
    this._bg.rect(0, 0, w, h).stroke({ color: 0x8b6914, width: 3, alpha: 0.6 });
    this._bg.rect(4, 4, w - 8, h - 8).stroke({ color: 0xdaa520, width: 1, alpha: 0.3 });
  }

  // ------------------------------------------------------------------
  // Left panel: character slots
  // ------------------------------------------------------------------

  private _buildSlotPanel(): void {
    this._leftPanel.removeChildren();

    const headerText = new Text({
      text: 'Party Members',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 14,
        fill: 0xdaa520,
        letterSpacing: 1,
      }),
    });
    this._leftPanel.addChild(headerText);

    for (let i = 0; i < 4; i++) {
      const slotContainer = new Container();
      slotContainer.position.set(0, 24 + i * (this._slotHeight + 8));

      const isActive = i === this._activeSlotIndex;
      const slot = this._slots[i];

      // Slot background.
      const bg = new Graphics();
      bg.roundRect(0, 0, this._slotWidth, this._slotHeight, 4)
        .fill({ color: isActive ? 0x2a2210 : 0x1a1610, alpha: 0.8 });
      bg.roundRect(0, 0, this._slotWidth, this._slotHeight, 4)
        .stroke({ color: isActive ? 0xffd700 : 0x444444, width: isActive ? 2 : 1 });
      slotContainer.addChild(bg);

      // Slot index.
      const indexText = new Text({
        text: `${i + 1}`,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 12,
          fill: 0x888888,
        }),
      });
      indexText.position.set(6, 4);
      slotContainer.addChild(indexText);

      // Slot content.
      if (slot.classId) {
        const nameText = new Text({
          text: slot.name,
          style: new TextStyle({
            fontFamily: 'Georgia, serif',
            fontSize: 12,
            fill: 0xeeddaa,
          }),
        });
        nameText.position.set(20, 6);
        slotContainer.addChild(nameText);

        const classInfo = CLASSES.find((c) => c.id === slot.classId);
        if (classInfo) {
          const classText = new Text({
            text: classInfo.name,
            style: new TextStyle({
              fontFamily: '"Courier New", monospace',
              fontSize: 10,
              fill: classInfo.color,
            }),
          });
          classText.position.set(20, 24);
          slotContainer.addChild(classText);

          const pts = slot.remainingPoints;
          const ptsText = new Text({
            text: pts > 0 ? `${pts} pts left` : 'Ready',
            style: new TextStyle({
              fontFamily: '"Courier New", monospace',
              fontSize: 9,
              fill: pts > 0 ? 0xffaa00 : 0x00cc00,
            }),
          });
          ptsText.position.set(20, 40);
          slotContainer.addChild(ptsText);
        }
      } else {
        const emptyText = new Text({
          text: '(empty)',
          style: new TextStyle({
            fontFamily: '"Courier New", monospace',
            fontSize: 11,
            fill: 0x555555,
            fontStyle: 'italic',
          }),
        });
        emptyText.position.set(20, 20);
        slotContainer.addChild(emptyText);
      }

      // Click handler.
      slotContainer.eventMode = 'static';
      slotContainer.cursor = 'pointer';
      slotContainer.on('pointerdown', () => {
        this._activeSlotIndex = i;
        this._refreshUI();
      });

      this._leftPanel.addChild(slotContainer);
    }
  }

  // ------------------------------------------------------------------
  // Center panel: class grid
  // ------------------------------------------------------------------

  private _buildClassGrid(): void {
    this._centerPanel.removeChildren();

    const headerText = new Text({
      text: 'Choose a Class',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 14,
        fill: 0xdaa520,
        letterSpacing: 1,
      }),
    });
    this._centerPanel.addChild(headerText);

    const gridCols = 3;
    const cellW = 130;
    const cellH = 80;
    const gap = 8;

    for (let i = 0; i < CLASSES.length; i++) {
      const cls = CLASSES[i];
      const col = i % gridCols;
      const row = Math.floor(i / gridCols);
      const x = col * (cellW + gap);
      const y = 28 + row * (cellH + gap);

      const cell = new Container();
      cell.position.set(x, y);

      const isSelected = this._slots[this._activeSlotIndex].classId === cls.id;

      // Cell background.
      const bg = new Graphics();
      bg.roundRect(0, 0, cellW, cellH, 4)
        .fill({ color: cls.available ? 0x1a1610 : 0x0d0d0d, alpha: 0.8 });
      bg.roundRect(0, 0, cellW, cellH, 4)
        .stroke({
          color: isSelected ? 0xffd700 : cls.available ? cls.color : 0x333333,
          width: isSelected ? 2 : 1,
        });
      cell.addChild(bg);

      // Class color indicator bar at top.
      const colorBar = new Graphics();
      colorBar.rect(2, 2, cellW - 4, 4).fill({ color: cls.color, alpha: cls.available ? 0.8 : 0.3 });
      cell.addChild(colorBar);

      // Class name.
      const nameText = new Text({
        text: cls.name,
        style: new TextStyle({
          fontFamily: 'Georgia, serif',
          fontSize: 13,
          fontWeight: 'bold',
          fill: cls.available ? 0xeeddaa : 0x555555,
        }),
      });
      nameText.position.set(8, 12);
      cell.addChild(nameText);

      // Key stats summary.
      const statsStr = `STR:${cls.baseStats.str} INT:${cls.baseStats.int} DEX:${cls.baseStats.dex}`;
      const statsText = new Text({
        text: statsStr,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 8,
          fill: cls.available ? 0x999999 : 0x444444,
        }),
      });
      statsText.position.set(8, 32);
      cell.addChild(statsText);

      if (!cls.available) {
        const lockText = new Text({
          text: '[Locked]',
          style: new TextStyle({
            fontFamily: '"Courier New", monospace',
            fontSize: 9,
            fill: 0x663333,
            fontStyle: 'italic',
          }),
        });
        lockText.position.set(8, 50);
        cell.addChild(lockText);
      }

      // Click handler.
      if (cls.available) {
        cell.eventMode = 'static';
        cell.cursor = 'pointer';
        cell.on('pointerdown', () => {
          this._selectClass(cls);
        });
      }

      this._centerPanel.addChild(cell);
    }
  }

  // ------------------------------------------------------------------
  // Right panel: stats and description
  // ------------------------------------------------------------------

  private _buildRightPanel(): void {
    this._rightPanel.removeChildren();

    const slot = this._slots[this._activeSlotIndex];
    const classInfo = CLASSES.find((c) => c.id === slot.classId);

    // Header.
    const headerText = new Text({
      text: classInfo ? classInfo.name : 'Select a Class',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 16,
        fontWeight: 'bold',
        fill: classInfo ? classInfo.color : 0x888888,
        letterSpacing: 1,
      }),
    });
    this._rightPanel.addChild(headerText);

    if (!classInfo) return;

    // Description.
    const descText = new Text({
      text: classInfo.description,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 11,
        fill: 0xaaaaaa,
        wordWrap: true,
        wordWrapWidth: 280,
      }),
    });
    descText.position.set(0, 26);
    this._rightPanel.addChild(descText);

    // Stat allocation.
    const statsHeader = new Text({
      text: `Bonus Points: ${slot.remainingPoints}`,
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 11,
        fill: slot.remainingPoints > 0 ? 0xffaa00 : 0x00cc00,
      }),
    });
    statsHeader.position.set(0, 80);
    this._rightPanel.addChild(statsHeader);

    for (let si = 0; si < STAT_LABELS.length; si++) {
      const { key, label } = STAT_LABELS[si];
      const y = 100 + si * 24;
      const baseVal = classInfo.baseStats[key];
      const bonusVal = slot.bonusPoints[key];
      const total = baseVal + bonusVal;

      // Stat label.
      const statLabel = new Text({
        text: `${label}:`,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fill: 0xcccccc,
        }),
      });
      statLabel.position.set(0, y);
      this._rightPanel.addChild(statLabel);

      // Stat value.
      const valText = new Text({
        text: `${total}`,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 12,
          fontWeight: 'bold',
          fill: bonusVal > 0 ? 0x00ff88 : 0xffffff,
        }),
      });
      valText.position.set(50, y);
      this._rightPanel.addChild(valText);

      if (bonusVal > 0) {
        const bonusText = new Text({
          text: `(+${bonusVal})`,
          style: new TextStyle({
            fontFamily: '"Courier New", monospace',
            fontSize: 9,
            fill: 0x00cc66,
          }),
        });
        bonusText.position.set(74, y + 2);
        this._rightPanel.addChild(bonusText);
      }

      // + button.
      if (slot.remainingPoints > 0) {
        const plusBtn = new Container();
        plusBtn.position.set(110, y - 2);
        const plusBg = new Graphics();
        plusBg.roundRect(0, 0, 20, 18, 3).fill({ color: 0x225522, alpha: 0.8 });
        plusBg.roundRect(0, 0, 20, 18, 3).stroke({ color: 0x44aa44, width: 1 });
        plusBtn.addChild(plusBg);
        const plusText = new Text({
          text: '+',
          style: new TextStyle({
            fontFamily: '"Courier New", monospace',
            fontSize: 12,
            fill: 0x88ff88,
          }),
        });
        plusText.position.set(5, 0);
        plusBtn.addChild(plusText);

        plusBtn.eventMode = 'static';
        plusBtn.cursor = 'pointer';
        plusBtn.on('pointerdown', () => {
          if (slot.remainingPoints > 0) {
            slot.bonusPoints[key]++;
            slot.remainingPoints--;
            this._refreshUI();
          }
        });
        this._rightPanel.addChild(plusBtn);
      }

      // - button (only if bonus > 0).
      if (bonusVal > 0) {
        const minusBtn = new Container();
        minusBtn.position.set(134, y - 2);
        const minusBg = new Graphics();
        minusBg.roundRect(0, 0, 20, 18, 3).fill({ color: 0x552222, alpha: 0.8 });
        minusBg.roundRect(0, 0, 20, 18, 3).stroke({ color: 0xaa4444, width: 1 });
        minusBtn.addChild(minusBg);
        const minusText = new Text({
          text: '-',
          style: new TextStyle({
            fontFamily: '"Courier New", monospace',
            fontSize: 12,
            fill: 0xff8888,
          }),
        });
        minusText.position.set(6, 0);
        minusBtn.addChild(minusText);

        minusBtn.eventMode = 'static';
        minusBtn.cursor = 'pointer';
        minusBtn.on('pointerdown', () => {
          if (slot.bonusPoints[key] > 0) {
            slot.bonusPoints[key]--;
            slot.remainingPoints++;
            this._refreshUI();
          }
        });
        this._rightPanel.addChild(minusBtn);
      }
    }

    // Starting equipment placeholder.
    const equipHeader = new Text({
      text: 'Starting Equipment:',
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 10,
        fill: 0x888888,
      }),
    });
    equipHeader.position.set(0, 260);
    this._rightPanel.addChild(equipHeader);

    const equipText = new Text({
      text: this._getStartingEquipment(classInfo.id),
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 9,
        fill: 0x777777,
        wordWrap: true,
        wordWrapWidth: 280,
      }),
    });
    equipText.position.set(0, 278);
    this._rightPanel.addChild(equipText);
  }

  // ------------------------------------------------------------------
  // Preview
  // ------------------------------------------------------------------

  private _updatePreview(): void {
    // Remove old preview.
    if (this._previewVisual) {
      this._previewContainer.removeChild(this._previewVisual);
      this._previewVisual.destroy({ children: true });
      this._previewVisual = null;
    }

    const slot = this._slots[this._activeSlotIndex];
    if (!slot.classId) return;

    this._previewVisual = buildCharacterVisual(slot.classId, 2.0);
    this._previewContainer.addChild(this._previewVisual);
  }

  // ------------------------------------------------------------------
  // Begin button
  // ------------------------------------------------------------------

  private _buildBeginButton(w: number, h: number): void {
    this._beginButton.removeChildren();

    const allFilled = this._slots.every((s) => s.classId !== null);

    const btnW = 240;
    const btnH = 44;
    const btnX = (w - btnW) / 2;
    const btnY = h - 70;

    this._beginButton.position.set(btnX, btnY);

    const bg = new Graphics();
    bg.roundRect(0, 0, btnW, btnH, 6)
      .fill({ color: allFilled ? 0x2a1f0a : 0x151510, alpha: 0.9 });
    bg.roundRect(0, 0, btnW, btnH, 6)
      .stroke({ color: allFilled ? 0xffd700 : 0x444444, width: 2 });
    this._beginButton.addChild(bg);

    const btnText = new Text({
      text: 'Begin Adventure',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 18,
        fontWeight: 'bold',
        fill: allFilled ? 0xffd700 : 0x555555,
        letterSpacing: 2,
      }),
    });
    btnText.anchor.set(0.5, 0.5);
    btnText.position.set(btnW / 2, btnH / 2);
    this._beginButton.addChild(btnText);

    if (allFilled) {
      this._beginButton.eventMode = 'static';
      this._beginButton.cursor = 'pointer';
      this._beginButton.on('pointerdown', () => {
        this._beginAdventure();
      });
    } else {
      this._beginButton.eventMode = 'none';
    }
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  private _selectClass(cls: ClassInfo): void {
    const slot = this._slots[this._activeSlotIndex];
    slot.classId = cls.id;

    // Auto-generate a name.
    const names = PRE_NAMES[cls.id];
    const idx = this._nameCounter[cls.id] % names.length;
    slot.name = names[idx];
    this._nameCounter[cls.id]++;

    // Reset bonus points.
    slot.bonusPoints = { str: 0, int: 0, wis: 0, dex: 0, con: 0, cha: 0 };
    slot.remainingPoints = 5;

    this._refreshUI();
  }

  private _refreshUI(): void {
    this._buildSlotPanel();
    this._buildClassGrid();
    this._buildRightPanel();
    this._updatePreview();
    this._buildBeginButton(this.engine.width, this.engine.height);
  }

  private _beginAdventure(): void {
    // Build party data from slots.
    const partyData: PlayerData[] = this._slots
      .filter((s): s is CharacterSlot & { classId: ClassId } => s.classId !== null)
      .map((s) => {
        const classInfo = CLASSES.find((c) => c.id === s.classId)!;
        const stats: PlayerStats = {
          str: classInfo.baseStats.str + s.bonusPoints.str,
          int: classInfo.baseStats.int + s.bonusPoints.int,
          wis: classInfo.baseStats.wis + s.bonusPoints.wis,
          dex: classInfo.baseStats.dex + s.bonusPoints.dex,
          con: classInfo.baseStats.con + s.bonusPoints.con,
          cha: classInfo.baseStats.cha + s.bonusPoints.cha,
        };
        return {
          name: s.name,
          classId: s.classId,
          level: 1,
          stats,
          equipment: {},
          spellBook: { knownSpells: [], equippedSpells: [] },
        };
      });

    this.engine.debug.log(`Party created: ${partyData.map((p) => p.name).join(', ')}`);

    // Transition to overworld with the first character as leader.
    void import('./OverworldScene').then(({ OverworldScene }) => {
      void this.engine.scenes.replace(
        new OverworldScene(partyData[0]),
        new FadeTransition(0.7),
      );
    });
  }

  private _getStartingEquipment(classId: ClassId): string {
    const equipment: Record<ClassId, string> = {
      knight: 'Rusty Sword, Leather Armor, Wooden Shield',
      paladin: 'Iron Mace, Chain Mail, Wooden Shield',
      ranger: 'Short Bow, Leather Armor, Hunting Dagger',
      sorcerer: 'Apprentice Staff, Cloth Robe',
      cleric: 'Wooden Mace, Acolyte Robe, Prayer Beads',
      rogue: 'Rusty Dagger, Thief\'s Garb, Lockpick Set',
      barbarian: 'Battle Axe, Hide Armor',
    };
    return equipment[classId] ?? 'None';
  }
}
