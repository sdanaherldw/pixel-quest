import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';

// ---------------------------------------------------------------------------
// Spell school definitions
// ---------------------------------------------------------------------------

interface SpellSchool {
  id: string;
  name: string;
  color: number;
}

const SPELL_SCHOOLS: SpellSchool[] = [
  { id: 'fire',      name: 'Fire',      color: 0xff4400 },
  { id: 'ice',       name: 'Ice',       color: 0x00ccff },
  { id: 'lightning', name: 'Lightning', color: 0xffff00 },
  { id: 'holy',      name: 'Holy',      color: 0xffd700 },
  { id: 'healing',   name: 'Healing',   color: 0x00ff88 },
  { id: 'nature',    name: 'Nature',    color: 0x22aa22 },
  { id: 'shadow',    name: 'Shadow',    color: 0x8800aa },
  { id: 'utility',   name: 'Utility',   color: 0xaaaaaa },
];

// ---------------------------------------------------------------------------
// Spell data
// ---------------------------------------------------------------------------

interface SpellDef {
  id: string;
  name: string;
  school: string;
  level: number;
  mpCost: number;
  damage: string;
  cooldown: string;
  description: string;
}

const MOCK_SPELLS: SpellDef[] = [
  // Fire
  { id: 'fireball',       name: 'Fireball',        school: 'fire',      level: 1, mpCost: 12, damage: '25-35 fire',      cooldown: '4s',  description: 'Hurls a ball of fire that explodes on impact, damaging all enemies in the area.' },
  { id: 'flame-wave',     name: 'Flame Wave',      school: 'fire',      level: 3, mpCost: 20, damage: '40-55 fire',      cooldown: '8s',  description: 'A sweeping wave of flame that scorches everything in its path.' },
  { id: 'inferno',        name: 'Inferno',         school: 'fire',      level: 5, mpCost: 35, damage: '80-100 fire',     cooldown: '15s', description: 'Summons a devastating pillar of hellfire at the target location.' },
  // Ice
  { id: 'frost-bolt',     name: 'Frost Bolt',      school: 'ice',       level: 1, mpCost: 10, damage: '18-28 ice',       cooldown: '3s',  description: 'A shard of ice that chills the target, slowing movement by 30%.' },
  { id: 'blizzard',       name: 'Blizzard',        school: 'ice',       level: 4, mpCost: 28, damage: '35-50 ice/tick',  cooldown: '12s', description: 'Conjures a howling blizzard that damages and freezes enemies over time.' },
  // Lightning
  { id: 'shock',          name: 'Shock',           school: 'lightning', level: 1, mpCost: 8,  damage: '15-22 lightning', cooldown: '2s',  description: 'An instant jolt of electricity. Chains to a second target for half damage.' },
  { id: 'thunderstorm',   name: 'Thunderstorm',    school: 'lightning', level: 5, mpCost: 40, damage: '70-90 lightning', cooldown: '20s', description: 'Calls down a furious thunderstorm over a wide area.' },
  // Holy
  { id: 'smite',          name: 'Smite',           school: 'holy',      level: 2, mpCost: 16, damage: '30-40 holy',      cooldown: '6s',  description: 'Strikes an undead or demonic foe with searing holy energy.' },
  { id: 'divine-shield',  name: 'Divine Shield',   school: 'holy',      level: 4, mpCost: 30, damage: 'N/A (shield)',    cooldown: '25s', description: 'Surrounds the caster with a golden barrier that absorbs 200 damage.' },
  // Healing
  { id: 'heal',           name: 'Heal',            school: 'healing',   level: 1, mpCost: 12, damage: 'Heals 40-60',     cooldown: '5s',  description: 'Bathes an ally in divine light, restoring health.' },
  { id: 'rejuvenate',     name: 'Rejuvenate',      school: 'healing',   level: 2, mpCost: 10, damage: 'Heals 8/tick',    cooldown: '6s',  description: 'Infuses an ally with vital energy, regenerating health over 12 seconds.' },
  // Nature
  { id: 'entangle',       name: 'Entangle',        school: 'nature',    level: 2, mpCost: 14, damage: 'N/A (root)',      cooldown: '10s', description: 'Roots spring from the ground, immobilising all enemies in the area for 5 seconds.' },
  { id: 'thorn-wall',     name: 'Thorn Wall',      school: 'nature',    level: 3, mpCost: 18, damage: '10/tick nature',  cooldown: '14s', description: 'Creates a barrier of razor-sharp thorns that damages enemies who pass through.' },
  // Shadow
  { id: 'shadow-bolt',    name: 'Shadow Bolt',     school: 'shadow',    level: 1, mpCost: 11, damage: '22-30 shadow',    cooldown: '3s',  description: 'A bolt of dark energy that weakens the target\'s defences.' },
  { id: 'drain-life',     name: 'Drain Life',      school: 'shadow',    level: 3, mpCost: 18, damage: '20-30 shadow',    cooldown: '8s',  description: 'Siphons life from the target, healing the caster for the damage dealt.' },
  // Utility
  { id: 'teleport',       name: 'Teleport',        school: 'utility',   level: 3, mpCost: 25, damage: 'N/A',             cooldown: '30s', description: 'Instantly transports the caster to the last visited waypoint.' },
  { id: 'detect-magic',   name: 'Detect Magic',    school: 'utility',   level: 1, mpCost: 5,  damage: 'N/A',             cooldown: '10s', description: 'Reveals hidden magical objects and traps within a 20-metre radius.' },
];

// ---------------------------------------------------------------------------
// SpellBookScene
// ---------------------------------------------------------------------------

/**
 * Full spell management overlay.
 *
 * Features:
 * - Semi-transparent dark backdrop over the game.
 * - Left panel: list of known spells grouped by school.
 * - Right panel: detailed spell view.
 * - Bottom: 8-slot spell bar for equipped spells.
 * - ESC / cancel closes the overlay.
 * - Keyboard navigable (up/down to browse, confirm to equip).
 */
export class SpellBookScene extends Scene {
  // ------------------------------------------------------------------
  // Display objects
  // ------------------------------------------------------------------

  private _overlay!: Graphics;
  private _schoolList!: Container;
  private _spellList!: Container;
  private _detailPanel!: Container;
  private _spellBar!: Container;

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  private _selectedSchoolIdx = 0;
  private _selectedSpellIdx = 0;
  private _equippedSpells: (SpellDef | null)[] = Array.from({ length: 8 }, () => null);
  private _currentSchoolSpells: SpellDef[] = [];

  constructor() {
    super('SpellBookScene');
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  public async init(): Promise<void> {
    const w = this.engine.width;
    const h = this.engine.height;

    // --- Semi-transparent dark backdrop ---
    this._overlay = new Graphics();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.78 });
    this.container.addChild(this._overlay);

    // --- Main panel background ---
    const panelW = Math.min(960, w - 40);
    const panelH = Math.min(600, h - 40);
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;

    const panelBg = new Graphics();
    panelBg
      .roundRect(panelX, panelY, panelW, panelH, 8)
      .fill({ color: 0x0e0c14, alpha: 0.95 });
    panelBg
      .roundRect(panelX, panelY, panelW, panelH, 8)
      .stroke({ color: 0x4466aa, width: 2 });
    this.container.addChild(panelBg);

    // --- Title ---
    const titleText = new Text({
      text: 'SPELL BOOK',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 24,
        fontWeight: 'bold',
        fill: 0x6688cc,
        stroke: { color: 0x0a0820, width: 3 },
        letterSpacing: 6,
      }),
    });
    titleText.anchor.set(0.5, 0);
    titleText.position.set(w / 2, panelY + 12);
    this.container.addChild(titleText);

    // --- Close hint ---
    const closeHint = new Text({
      text: '[ESC] Close',
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 10,
        fill: 0x555555,
      }),
    });
    closeHint.anchor.set(1, 0);
    closeHint.position.set(panelX + panelW - 12, panelY + 18);
    this.container.addChild(closeHint);

    // --- Left panel: school list ---
    this._schoolList = new Container();
    this._schoolList.position.set(panelX + 14, panelY + 50);
    this.container.addChild(this._schoolList);

    // --- Centre panel: spell list for selected school ---
    this._spellList = new Container();
    this._spellList.position.set(panelX + 150, panelY + 50);
    this.container.addChild(this._spellList);

    // --- Right panel: spell detail ---
    this._detailPanel = new Container();
    this._detailPanel.position.set(panelX + panelW - 290, panelY + 50);
    this.container.addChild(this._detailPanel);

    // --- Bottom: 8-slot spell bar ---
    this._spellBar = new Container();
    this._spellBar.position.set(w / 2 - 200, panelY + panelH - 60);
    this.container.addChild(this._spellBar);

    // Initial build
    this._updateSchoolSpells();
    this._buildSchoolList();
    this._buildSpellList();
    this._buildDetailPanel();
    this._buildSpellBar();
  }

  public update(_dt: number): void {
    const input = this.engine.input;

    // Close on ESC / cancel
    if (input.isActionJustPressed('openMenu')) {
      void this.engine.scenes.pop();
      return;
    }

    // Navigate schools (left/right or up/down when no spells in focus)
    let schoolChanged = false;
    let spellChanged = false;

    if (input.isActionJustPressed('moveUp')) {
      if (this._currentSchoolSpells.length > 0 && this._selectedSpellIdx > 0) {
        this._selectedSpellIdx--;
        spellChanged = true;
      } else {
        this._selectedSchoolIdx =
          (this._selectedSchoolIdx - 1 + SPELL_SCHOOLS.length) % SPELL_SCHOOLS.length;
        schoolChanged = true;
      }
    }

    if (input.isActionJustPressed('moveDown')) {
      if (
        this._currentSchoolSpells.length > 0 &&
        this._selectedSpellIdx < this._currentSchoolSpells.length - 1
      ) {
        this._selectedSpellIdx++;
        spellChanged = true;
      } else {
        this._selectedSchoolIdx =
          (this._selectedSchoolIdx + 1) % SPELL_SCHOOLS.length;
        schoolChanged = true;
      }
    }

    if (input.isActionJustPressed('moveLeft')) {
      this._selectedSchoolIdx =
        (this._selectedSchoolIdx - 1 + SPELL_SCHOOLS.length) % SPELL_SCHOOLS.length;
      schoolChanged = true;
    }

    if (input.isActionJustPressed('moveRight')) {
      this._selectedSchoolIdx =
        (this._selectedSchoolIdx + 1) % SPELL_SCHOOLS.length;
      schoolChanged = true;
    }

    if (schoolChanged) {
      this._selectedSpellIdx = 0;
      this._updateSchoolSpells();
      this._buildSchoolList();
      this._buildSpellList();
      this._buildDetailPanel();
    } else if (spellChanged) {
      this._buildSpellList();
      this._buildDetailPanel();
    }

    // Confirm to equip selected spell to first empty bar slot
    if (input.isActionJustPressed('interact') && this._currentSchoolSpells.length > 0) {
      const spell = this._currentSchoolSpells[this._selectedSpellIdx];
      const emptyIdx = this._equippedSpells.indexOf(null);
      if (emptyIdx !== -1) {
        this._equippedSpells[emptyIdx] = spell;
        this._buildSpellBar();
      }
    }
  }

  public fixedUpdate(_dt: number): void {
    // No fixed-rate logic.
  }

  public render(_alpha: number): void {
    // Resize overlay to cover screen
    const w = this.engine.width;
    const h = this.engine.height;
    this._overlay.clear();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.78 });
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private _updateSchoolSpells(): void {
    const school = SPELL_SCHOOLS[this._selectedSchoolIdx];
    this._currentSchoolSpells = MOCK_SPELLS.filter((s) => s.school === school.id);
  }

  // ------------------------------------------------------------------
  // School list (left panel)
  // ------------------------------------------------------------------

  private _buildSchoolList(): void {
    this._schoolList.removeChildren();

    const tabH = 40;
    const gap = 4;

    for (let i = 0; i < SPELL_SCHOOLS.length; i++) {
      const school = SPELL_SCHOOLS[i];
      const isActive = i === this._selectedSchoolIdx;
      const y = i * (tabH + gap);
      const spellCount = MOCK_SPELLS.filter((s) => s.school === school.id).length;

      const tab = new Container();
      tab.position.set(0, y);

      // Background
      const bg = new Graphics();
      bg.roundRect(0, 0, 120, tabH, 4)
        .fill({ color: isActive ? 0x1a1830 : 0x0c0a14, alpha: isActive ? 0.95 : 0.6 });
      bg.roundRect(0, 0, 120, tabH, 4)
        .stroke({ color: isActive ? school.color : 0x333333, width: isActive ? 2 : 1 });
      tab.addChild(bg);

      // Colour dot
      const dot = new Graphics();
      dot.circle(14, tabH / 2, 5).fill({ color: school.color, alpha: isActive ? 1 : 0.4 });
      tab.addChild(dot);

      // School name
      const nameText = new Text({
        text: school.name,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fill: isActive ? school.color : 0x777777,
        }),
      });
      nameText.position.set(26, 6);
      tab.addChild(nameText);

      // Spell count
      const countText = new Text({
        text: `${spellCount} spell${spellCount !== 1 ? 's' : ''}`,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: 0x555555,
        }),
      });
      countText.position.set(26, 22);
      tab.addChild(countText);

      this._schoolList.addChild(tab);
    }
  }

  // ------------------------------------------------------------------
  // Spell list (centre panel)
  // ------------------------------------------------------------------

  private _buildSpellList(): void {
    this._spellList.removeChildren();

    const school = SPELL_SCHOOLS[this._selectedSchoolIdx];

    // Header
    const header = new Text({
      text: `${school.name} Spells`,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 14,
        fill: school.color,
        letterSpacing: 1,
      }),
    });
    this._spellList.addChild(header);

    if (this._currentSchoolSpells.length === 0) {
      const emptyText = new Text({
        text: 'No spells learned.',
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fill: 0x555555,
          fontStyle: 'italic',
        }),
      });
      emptyText.position.set(0, 30);
      this._spellList.addChild(emptyText);
      return;
    }

    const rowH = 52;
    const rowW = 280;

    for (let i = 0; i < this._currentSchoolSpells.length; i++) {
      const spell = this._currentSchoolSpells[i];
      const isSelected = i === this._selectedSpellIdx;
      const y = 26 + i * (rowH + 4);

      const row = new Container();
      row.position.set(0, y);

      // Background
      const bg = new Graphics();
      bg.roundRect(0, 0, rowW, rowH, 4)
        .fill({ color: isSelected ? 0x1a1830 : 0x0e0c14, alpha: 0.85 });
      bg.roundRect(0, 0, rowW, rowH, 4)
        .stroke({ color: isSelected ? school.color : 0x333333, width: isSelected ? 2 : 1 });
      row.addChild(bg);

      // Colour accent bar
      const bar = new Graphics();
      bar.rect(2, 2, rowW - 4, 3).fill({ color: school.color, alpha: isSelected ? 0.6 : 0.25 });
      row.addChild(bar);

      // Selection indicator
      if (isSelected) {
        const indicator = new Text({
          text: '>',
          style: new TextStyle({
            fontFamily: '"Courier New", monospace',
            fontSize: 14,
            fontWeight: 'bold',
            fill: school.color,
          }),
        });
        indicator.position.set(6, 14);
        row.addChild(indicator);
      }

      // Spell name
      const nameText = new Text({
        text: spell.name,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 12,
          fill: isSelected ? 0xeeddaa : 0xbbbbbb,
        }),
      });
      nameText.position.set(22, 10);
      row.addChild(nameText);

      // Level and MP
      const infoText = new Text({
        text: `Lv ${spell.level}  |  ${spell.mpCost} MP  |  CD: ${spell.cooldown}`,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: 0x6688aa,
        }),
      });
      infoText.position.set(22, 30);
      row.addChild(infoText);

      this._spellList.addChild(row);
    }
  }

  // ------------------------------------------------------------------
  // Detail panel (right panel)
  // ------------------------------------------------------------------

  private _buildDetailPanel(): void {
    this._detailPanel.removeChildren();

    if (this._currentSchoolSpells.length === 0 || this._selectedSpellIdx >= this._currentSchoolSpells.length) {
      const emptyText = new Text({
        text: 'Select a spell\nto view details.',
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fill: 0x555555,
          fontStyle: 'italic',
          lineHeight: 18,
        }),
      });
      emptyText.position.set(10, 40);
      this._detailPanel.addChild(emptyText);
      return;
    }

    const spell = this._currentSchoolSpells[this._selectedSpellIdx];
    const school = SPELL_SCHOOLS.find((s) => s.id === spell.school);
    const schoolColor = school?.color ?? 0xffffff;

    // Background
    const detailBg = new Graphics();
    detailBg
      .roundRect(0, 0, 270, 430, 6)
      .fill({ color: 0x0e0c14, alpha: 0.8 });
    detailBg
      .roundRect(0, 0, 270, 430, 6)
      .stroke({ color: schoolColor, width: 1, alpha: 0.4 });
    this._detailPanel.addChild(detailBg);

    // Spell name
    const nameText = new Text({
      text: spell.name,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 18,
        fontWeight: 'bold',
        fill: schoolColor,
        letterSpacing: 1,
      }),
    });
    nameText.position.set(12, 12);
    this._detailPanel.addChild(nameText);

    // School label
    const schoolLabel = new Text({
      text: school ? school.name : spell.school,
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 10,
        fill: schoolColor,
        fontStyle: 'italic',
      }),
    });
    schoolLabel.position.set(12, 36);
    this._detailPanel.addChild(schoolLabel);

    // Divider
    const divider = new Graphics();
    divider.moveTo(12, 54).lineTo(258, 54).stroke({ color: schoolColor, width: 1, alpha: 0.3 });
    this._detailPanel.addChild(divider);

    // Description
    const descText = new Text({
      text: spell.description,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 11,
        fill: 0xaaaaaa,
        wordWrap: true,
        wordWrapWidth: 246,
        lineHeight: 16,
      }),
    });
    descText.position.set(12, 64);
    this._detailPanel.addChild(descText);

    // Stat lines
    const statStartY = 160;
    const stats: { label: string; value: string; color: number }[] = [
      { label: 'Level',    value: `${spell.level}`,   color: 0x88ff88 },
      { label: 'MP Cost',  value: `${spell.mpCost}`,  color: 0x4488ff },
      { label: 'Damage',   value: spell.damage,       color: 0xff6644 },
      { label: 'Cooldown', value: spell.cooldown,     color: 0xcc6644 },
      { label: 'School',   value: school?.name ?? '', color: schoolColor },
    ];

    for (let i = 0; i < stats.length; i++) {
      const stat = stats[i];
      const y = statStartY + i * 24;

      const labelText = new Text({
        text: `${stat.label}:`,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 10,
          fill: 0x888888,
        }),
      });
      labelText.position.set(12, y);
      this._detailPanel.addChild(labelText);

      const valText = new Text({
        text: stat.value,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 10,
          fontWeight: 'bold',
          fill: stat.color,
        }),
      });
      valText.position.set(100, y);
      this._detailPanel.addChild(valText);
    }

    // Equip hint
    const equipHint = new Text({
      text: '[Enter] Equip to spell bar',
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 10,
        fill: 0x666666,
      }),
    });
    equipHint.position.set(12, statStartY + stats.length * 24 + 20);
    this._detailPanel.addChild(equipHint);
  }

  // ------------------------------------------------------------------
  // Spell bar (bottom 8 slots)
  // ------------------------------------------------------------------

  private _buildSpellBar(): void {
    this._spellBar.removeChildren();

    const slotSize = 44;
    const gap = 6;
    const totalWidth = 8 * slotSize + 7 * gap;

    // Bar label
    const barLabel = new Text({
      text: 'Spell Bar',
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 10,
        fill: 0x666666,
      }),
    });
    barLabel.anchor.set(0.5, 1);
    barLabel.position.set(totalWidth / 2, -4);
    this._spellBar.addChild(barLabel);

    for (let slot = 0; slot < 8; slot++) {
      const x = slot * (slotSize + gap);
      const equipped = this._equippedSpells[slot];

      const slotContainer = new Container();
      slotContainer.position.set(x, 0);

      // Slot background
      const bg = new Graphics();
      bg.roundRect(0, 0, slotSize, slotSize, 4)
        .fill({ color: equipped ? 0x1a1830 : 0x0a0a10, alpha: 0.9 });

      if (equipped) {
        const school = SPELL_SCHOOLS.find((s) => s.id === equipped.school);
        const schoolColor = school?.color ?? 0x444444;
        bg.roundRect(0, 0, slotSize, slotSize, 4)
          .stroke({ color: schoolColor, width: 1.5 });
        // Colour accent
        bg.rect(2, 2, slotSize - 4, 3).fill({ color: schoolColor, alpha: 0.5 });
      } else {
        bg.roundRect(0, 0, slotSize, slotSize, 4)
          .stroke({ color: 0x333333, width: 1 });
      }
      slotContainer.addChild(bg);

      // Slot number
      const numText = new Text({
        text: `${slot + 1}`,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: 0x555555,
        }),
      });
      numText.position.set(3, 2);
      slotContainer.addChild(numText);

      // Equipped spell name (abbreviated)
      if (equipped) {
        const abbrName = equipped.name.length > 6
          ? equipped.name.substring(0, 5) + '.'
          : equipped.name;
        const spellText = new Text({
          text: abbrName,
          style: new TextStyle({
            fontFamily: '"Courier New", monospace',
            fontSize: 8,
            fill: 0xcccccc,
          }),
        });
        spellText.anchor.set(0.5);
        spellText.position.set(slotSize / 2, slotSize / 2 + 4);
        slotContainer.addChild(spellText);
      }

      this._spellBar.addChild(slotContainer);
    }
  }
}
