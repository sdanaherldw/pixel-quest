import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';
import { CodexSystem, CodexCategory, type CodexEntry } from '@/rpg/CodexSystem';

// ---------------------------------------------------------------------------
// CodexScene
// ---------------------------------------------------------------------------

const CATEGORY_META: Array<{ category: CodexCategory; label: string; color: number }> = [
  { category: CodexCategory.BESTIARY,   label: 'Bestiary',   color: 0xff4444 },
  { category: CodexCategory.LORE,       label: 'Lore',       color: 0xddcc88 },
  { category: CodexCategory.ITEMS,      label: 'Items',      color: 0x44cc44 },
  { category: CodexCategory.SPELLS,     label: 'Spells',     color: 0x4488ff },
  { category: CodexCategory.REGIONS,    label: 'Regions',    color: 0x88cc44 },
  { category: CodexCategory.CHARACTERS, label: 'Characters', color: 0xcc88ff },
];

/**
 * In-game encyclopedia / codex overlay.
 *
 * Left panel: category tabs with completion bars.
 * Centre panel: list of discovered entries in the selected category.
 * Right panel: detail view for the selected entry.
 * ESC closes the overlay.
 */
export class CodexScene extends Scene {
  private _overlay!: Graphics;
  private _categoryList!: Container;
  private _entryList!: Container;
  private _detailPanel!: Container;
  private _progressText!: Text;

  private _codex!: CodexSystem;
  private _selectedCategoryIdx: number = 0;
  private _selectedEntryIdx: number = 0;
  private _currentEntries: CodexEntry[] = [];

  constructor(codex?: CodexSystem) {
    super('CodexScene');
    // Allow injection for testing; falls back to a new instance
    this._codex = codex ?? new CodexSystem();
  }

  public async init(): Promise<void> {
    const w = this.engine.width;
    const h = this.engine.height;

    // Semi-transparent backdrop
    this._overlay = new Graphics();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.78 });
    this._overlay.eventMode = 'static';
    this.container.addChild(this._overlay);

    // Panel
    const panelW = Math.min(960, w - 40);
    const panelH = Math.min(600, h - 40);
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;

    const panelBg = new Graphics();
    panelBg.roundRect(panelX, panelY, panelW, panelH, 8).fill({ color: 0x0e0c08, alpha: 0.95 });
    panelBg.roundRect(panelX, panelY, panelW, panelH, 8).stroke({ color: 0xdaa520, width: 2 });
    panelBg.eventMode = 'static';
    this.container.addChild(panelBg);

    // Title
    const title = new Text({
      text: 'CODEX',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 22,
        fontWeight: 'bold',
        fill: 0xffd700,
        stroke: { color: 0x1a0800, width: 3 },
        letterSpacing: 6,
      }),
    });
    title.anchor.set(0.5, 0);
    title.position.set(w / 2, panelY + 12);
    this.container.addChild(title);

    // Close hint
    const hint = new Text({
      text: '[ESC] Close',
      style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 10, fill: 0x555555 }),
    });
    hint.anchor.set(1, 0);
    hint.position.set(panelX + panelW - 12, panelY + 18);
    this.container.addChild(hint);

    // Overall progress
    this._progressText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 10, fill: 0x888888 }),
    });
    this._progressText.position.set(panelX + 14, panelY + panelH - 24);
    this.container.addChild(this._progressText);

    // Category list (left)
    this._categoryList = new Container();
    this._categoryList.position.set(panelX + 14, panelY + 50);
    this.container.addChild(this._categoryList);

    // Entry list (centre)
    this._entryList = new Container();
    this._entryList.position.set(panelX + 180, panelY + 50);
    this.container.addChild(this._entryList);

    // Detail panel (right)
    this._detailPanel = new Container();
    this._detailPanel.position.set(panelX + panelW - 310, panelY + 50);
    this.container.addChild(this._detailPanel);

    this._refreshEntries();
    this._buildAll();
  }

  public update(_dt: number): void {
    const input = this.engine.input;

    if (input.isActionJustPressed('openMenu')) {
      void this.engine.scenes.pop();
      return;
    }

    let catChanged = false;
    let entryChanged = false;

    // Navigate categories with left/right
    if (input.isActionJustPressed('moveLeft')) {
      this._selectedCategoryIdx =
        (this._selectedCategoryIdx - 1 + CATEGORY_META.length) % CATEGORY_META.length;
      catChanged = true;
    }
    if (input.isActionJustPressed('moveRight')) {
      this._selectedCategoryIdx =
        (this._selectedCategoryIdx + 1) % CATEGORY_META.length;
      catChanged = true;
    }

    // Navigate entries with up/down
    if (input.isActionJustPressed('moveUp') && this._selectedEntryIdx > 0) {
      this._selectedEntryIdx--;
      entryChanged = true;
    }
    if (
      input.isActionJustPressed('moveDown') &&
      this._selectedEntryIdx < this._currentEntries.length - 1
    ) {
      this._selectedEntryIdx++;
      entryChanged = true;
    }

    if (catChanged) {
      this._selectedEntryIdx = 0;
      this._refreshEntries();
      this._buildAll();
    } else if (entryChanged) {
      this._buildEntryList();
      this._buildDetailPanel();
    }
  }

  public fixedUpdate(_dt: number): void { /* no-op */ }

  public render(_alpha: number): void {
    const w = this.engine.width;
    const h = this.engine.height;
    this._overlay.clear();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.78 });
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private _refreshEntries(): void {
    const cat = CATEGORY_META[this._selectedCategoryIdx];
    this._currentEntries = this._codex
      .getEntriesByCategory(cat.category)
      .filter((e) => e.discovered);
  }

  private _buildAll(): void {
    this._buildCategoryList();
    this._buildEntryList();
    this._buildDetailPanel();
    this._updateProgress();
  }

  private _updateProgress(): void {
    const progress = this._codex.getProgress();
    this._progressText.text =
      `Overall: ${progress.discovered}/${progress.totalEntries} discovered (${progress.percentage}%)  |  ${progress.completed} completed`;
  }

  private _buildCategoryList(): void {
    this._categoryList.removeChildren();

    const tabW = 150;
    const tabH = 50;

    for (let i = 0; i < CATEGORY_META.length; i++) {
      const meta = CATEGORY_META[i];
      const isActive = i === this._selectedCategoryIdx;
      const y = i * (tabH + 6);
      const catProgress = this._codex.getCategoryProgress(meta.category);

      const tab = new Container();
      tab.position.set(0, y);

      const bg = new Graphics();
      bg.roundRect(0, 0, tabW, tabH, 4).fill({ color: isActive ? 0x1a1a10 : 0x0e0c08, alpha: 0.9 });
      bg.roundRect(0, 0, tabW, tabH, 4).stroke({ color: isActive ? meta.color : 0x333333, width: isActive ? 2 : 1 });
      tab.addChild(bg);

      // Category name
      const label = new Text({
        text: meta.label,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 12,
          fill: isActive ? meta.color : 0x888888,
        }),
      });
      label.position.set(10, 6);
      tab.addChild(label);

      // Count
      const count = new Text({
        text: `${catProgress.discovered}/${catProgress.totalEntries}`,
        style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 9, fill: 0x666666 }),
      });
      count.position.set(10, 24);
      tab.addChild(count);

      // Mini progress bar
      const barW = tabW - 20;
      const barBg = new Graphics();
      barBg.rect(10, 38, barW, 4).fill({ color: 0x1a1a1a });
      tab.addChild(barBg);

      if (catProgress.totalEntries > 0) {
        const fillW = barW * (catProgress.discovered / catProgress.totalEntries);
        const barFill = new Graphics();
        barFill.rect(10, 38, fillW, 4).fill({ color: meta.color, alpha: 0.7 });
        tab.addChild(barFill);
      }

      this._categoryList.addChild(tab);
    }
  }

  private _buildEntryList(): void {
    this._entryList.removeChildren();

    const meta = CATEGORY_META[this._selectedCategoryIdx];

    // Header
    const header = new Text({
      text: `${meta.label}`,
      style: new TextStyle({ fontFamily: 'Georgia, serif', fontSize: 14, fill: meta.color, letterSpacing: 1 }),
    });
    this._entryList.addChild(header);

    if (this._currentEntries.length === 0) {
      const empty = new Text({
        text: 'No entries discovered yet.',
        style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 11, fill: 0x555555, fontStyle: 'italic' }),
      });
      empty.position.set(0, 28);
      this._entryList.addChild(empty);
      return;
    }

    const rowH = 32;
    const rowW = 260;

    for (let i = 0; i < this._currentEntries.length; i++) {
      const entry = this._currentEntries[i];
      const isSelected = i === this._selectedEntryIdx;
      const y = 26 + i * (rowH + 4);

      const row = new Container();
      row.position.set(0, y);

      const bg = new Graphics();
      bg.roundRect(0, 0, rowW, rowH, 3).fill({ color: isSelected ? 0x1a1810 : 0x0c0a08, alpha: 0.85 });
      bg.roundRect(0, 0, rowW, rowH, 3).stroke({ color: isSelected ? meta.color : 0x333333, width: isSelected ? 1.5 : 1 });
      row.addChild(bg);

      // Completion dots
      const dotColors = [0x444444, 0x444444, 0x444444];
      for (let d = 0; d < 3; d++) {
        if (d < entry.completionLevel) dotColors[d] = meta.color;
      }
      for (let d = 0; d < 3; d++) {
        const dot = new Graphics();
        dot.circle(12 + d * 10, rowH / 2, 3).fill({ color: dotColors[d], alpha: d < entry.completionLevel ? 0.9 : 0.3 });
        row.addChild(dot);
      }

      // Entry name
      const nameText = new Text({
        text: entry.name,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fill: isSelected ? 0xeeddaa : 0xaaaaaa,
        }),
      });
      nameText.position.set(42, 8);
      row.addChild(nameText);

      this._entryList.addChild(row);
    }
  }

  private _buildDetailPanel(): void {
    this._detailPanel.removeChildren();

    if (this._currentEntries.length === 0 || this._selectedEntryIdx >= this._currentEntries.length) {
      const empty = new Text({
        text: 'Select an entry\nto view details.',
        style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 11, fill: 0x555555, fontStyle: 'italic', lineHeight: 18 }),
      });
      empty.position.set(10, 40);
      this._detailPanel.addChild(empty);
      return;
    }

    const entry = this._currentEntries[this._selectedEntryIdx];
    const meta = CATEGORY_META[this._selectedCategoryIdx];

    // Background
    const bg = new Graphics();
    bg.roundRect(0, 0, 290, 480, 6).fill({ color: 0x0e0c08, alpha: 0.8 });
    bg.roundRect(0, 0, 290, 480, 6).stroke({ color: meta.color, width: 1, alpha: 0.4 });
    this._detailPanel.addChild(bg);

    // Name
    const nameText = new Text({
      text: entry.name,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 18,
        fontWeight: 'bold',
        fill: meta.color,
        letterSpacing: 1,
      }),
    });
    nameText.position.set(12, 12);
    this._detailPanel.addChild(nameText);

    // Category + completion
    const completionLabels = ['Unknown', 'Basic', 'Detailed', 'Complete'];
    const catText = new Text({
      text: `${meta.label}  |  ${completionLabels[entry.completionLevel] ?? 'Unknown'}`,
      style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 10, fill: 0x888888 }),
    });
    catText.position.set(12, 36);
    this._detailPanel.addChild(catText);

    // Divider
    const divider = new Graphics();
    divider.moveTo(12, 54).lineTo(278, 54).stroke({ color: meta.color, width: 1, alpha: 0.3 });
    this._detailPanel.addChild(divider);

    // Description
    const descText = new Text({
      text: entry.description,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 12,
        fill: 0xaaaaaa,
        wordWrap: true,
        wordWrapWidth: 266,
        lineHeight: 18,
      }),
    });
    descText.position.set(12, 64);
    this._detailPanel.addChild(descText);

    // Sub-entries (revealed ones only)
    if (entry.subEntries && entry.subEntries.length > 0) {
      let subY = descText.y + descText.height + 16;

      for (const sub of entry.subEntries) {
        const text = sub.revealed
          ? `${sub.label}: ${sub.value}`
          : `${sub.label}: ???`;

        const subText = new Text({
          text,
          style: new TextStyle({
            fontFamily: '"Courier New", monospace',
            fontSize: 10,
            fill: sub.revealed ? 0xaaaaaa : 0x444444,
          }),
        });
        subText.position.set(12, subY);
        this._detailPanel.addChild(subText);
        subY += 16;
      }
    }

    // Tags
    if (entry.tags.length > 0) {
      const tagStr = entry.tags.join(', ');
      const tagText = new Text({
        text: `Tags: ${tagStr}`,
        style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 9, fill: 0x555555, fontStyle: 'italic' }),
      });
      tagText.position.set(12, 440);
      this._detailPanel.addChild(tagText);
    }

    // Discovery date
    if (entry.discoveredAt) {
      const date = new Date(entry.discoveredAt);
      const dateText = new Text({
        text: `Discovered: ${date.toLocaleDateString()}`,
        style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 9, fill: 0x555555 }),
      });
      dateText.position.set(12, 458);
      this._detailPanel.addChild(dateText);
    }
  }
}
