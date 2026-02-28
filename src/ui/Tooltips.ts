import { Container, Graphics, Text, TextStyle } from 'pixi.js';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/** Rarity tiers and their corresponding colours. */
export const RARITY_COLORS: Record<string, number> = {
  common: 0xcccccc,
  uncommon: 0x44cc44,
  rare: 0x4488ff,
  epic: 0xaa44ff,
  legendary: 0xffaa00,
  mythic: 0xff4444,
};

/** Stat modifier on an item. */
export interface ItemStat {
  name: string;
  value: number;
}

/** Effect entry on an item. */
export interface ItemEffect {
  description: string;
}

/** Definition passed to `showItem`. */
export interface ItemDef {
  name: string;
  rarity: string;
  type: string;
  subtype?: string;
  level: number;
  stats: ItemStat[];
  effects: ItemEffect[];
  description: string;
  value: number;
}

/** Definition passed to `showSpell`. */
export interface SpellDef {
  name: string;
  school: string;
  manaCost: number;
  castTime?: number;
  cooldown: number;
  damage?: number;
  healing?: number;
  description: string;
}

/** Skill node for `showSkill`. */
export interface SkillNodeDef {
  name: string;
  description: string;
  currentRank: number;
  maxRank: number;
  manaCost?: number;
  cooldown?: number;
  effects: string[];
}

// ------------------------------------------------------------------
// Style constants
// ------------------------------------------------------------------

const PANEL_BG = 0x111122;
const PANEL_ALPHA = 0.94;
const BORDER_COLOR = 0x886622;
const TOOLTIP_MAX_W = 280;
const PAD = 12;
const LINE_GAP = 4;
const FONT_FAMILY = 'serif';

// ------------------------------------------------------------------
// Tooltips
// ------------------------------------------------------------------

/**
 * Tooltip system for items, spells, and skill nodes.
 *
 * Rendered entirely with PixiJS Graphics + Text. Positions itself near
 * the cursor with smart edge-of-screen clamping so it never overflows
 * the viewport.
 */
export class Tooltips {
  /** Root container — add to the UI layer. */
  public readonly container: Container = new Container();

  private _screenW: number;
  private _screenH: number;

  // Current tooltip internals
  private readonly _bg: Graphics = new Graphics();
  private readonly _content: Container = new Container();

  constructor(screenW: number = 1280, screenH: number = 720) {
    this._screenW = screenW;
    this._screenH = screenH;

    this.container.label = 'Tooltips';
    this.container.visible = false;
    this.container.addChild(this._bg);
    this.container.addChild(this._content);
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /** Show an item tooltip near (x, y). */
  public showItem(item: ItemDef, x: number, y: number): void {
    this._clearContent();
    let cursorY = 0;

    const rarityColor = RARITY_COLORS[item.rarity] ?? 0xcccccc;

    // Name
    cursorY = this._addLine(item.name, {
      fontSize: 16,
      fontWeight: 'bold',
      fill: rarityColor,
    }, cursorY);

    // Type / Subtype
    const typeStr = item.subtype ? `${item.type} / ${item.subtype}` : item.type;
    cursorY = this._addLine(typeStr, { fontSize: 12, fill: 0x999999 }, cursorY);

    // Level requirement
    cursorY = this._addLine(`Requires Level ${item.level}`, {
      fontSize: 11,
      fill: 0xaaaaaa,
    }, cursorY);

    cursorY += LINE_GAP;

    // Stats
    for (const stat of item.stats) {
      const positive = stat.value >= 0;
      const prefix = positive ? '+' : '';
      cursorY = this._addLine(`${prefix}${stat.value} ${stat.name}`, {
        fontSize: 13,
        fill: positive ? 0x44cc44 : 0xff4444,
      }, cursorY);
    }

    if (item.stats.length > 0) cursorY += LINE_GAP;

    // Effects
    for (const effect of item.effects) {
      cursorY = this._addLine(effect.description, {
        fontSize: 12,
        fill: RARITY_COLORS['legendary'],
        wordWrap: true,
        wordWrapWidth: TOOLTIP_MAX_W - PAD * 2,
      }, cursorY);
    }

    if (item.effects.length > 0) cursorY += LINE_GAP;

    // Description
    cursorY = this._addLine(item.description, {
      fontSize: 11,
      fill: 0x888888,
      fontStyle: 'italic',
      wordWrap: true,
      wordWrapWidth: TOOLTIP_MAX_W - PAD * 2,
    }, cursorY);

    cursorY += LINE_GAP;

    // Sell value
    cursorY = this._addLine(`Sell: ${item.value} gold`, {
      fontSize: 11,
      fill: 0xffd700,
    }, cursorY);

    this._finalise(x, y, cursorY);
  }

  /** Show a spell tooltip near (x, y). */
  public showSpell(spell: SpellDef, x: number, y: number): void {
    this._clearContent();
    let cursorY = 0;

    // Name + School
    cursorY = this._addLine(spell.name, {
      fontSize: 16,
      fontWeight: 'bold',
      fill: 0xffffff,
    }, cursorY);

    cursorY = this._addLine(`School: ${spell.school}`, {
      fontSize: 12,
      fill: 0xaaaacc,
    }, cursorY);

    cursorY += LINE_GAP;

    // Mana cost
    cursorY = this._addLine(`Mana: ${spell.manaCost}`, {
      fontSize: 13,
      fill: 0x5599ff,
    }, cursorY);

    // Cast time
    if (spell.castTime !== undefined) {
      cursorY = this._addLine(`Cast time: ${spell.castTime}s`, {
        fontSize: 12,
        fill: 0xcccccc,
      }, cursorY);
    }

    // Cooldown
    cursorY = this._addLine(`Cooldown: ${spell.cooldown}s`, {
      fontSize: 12,
      fill: 0xcccccc,
    }, cursorY);

    cursorY += LINE_GAP;

    // Damage / Healing
    if (spell.damage !== undefined) {
      cursorY = this._addLine(`Damage: ${spell.damage}`, {
        fontSize: 13,
        fill: 0xff6644,
      }, cursorY);
    }
    if (spell.healing !== undefined) {
      cursorY = this._addLine(`Healing: ${spell.healing}`, {
        fontSize: 13,
        fill: 0x44cc44,
      }, cursorY);
    }

    cursorY += LINE_GAP;

    // Description
    cursorY = this._addLine(spell.description, {
      fontSize: 12,
      fill: 0xaaaaaa,
      wordWrap: true,
      wordWrapWidth: TOOLTIP_MAX_W - PAD * 2,
    }, cursorY);

    this._finalise(x, y, cursorY);
  }

  /** Show a skill tree node tooltip near (x, y). */
  public showSkill(node: SkillNodeDef, x: number, y: number): void {
    this._clearContent();
    let cursorY = 0;

    // Name
    cursorY = this._addLine(node.name, {
      fontSize: 16,
      fontWeight: 'bold',
      fill: 0xffffff,
    }, cursorY);

    // Rank
    cursorY = this._addLine(`Rank: ${node.currentRank} / ${node.maxRank}`, {
      fontSize: 12,
      fill: 0xcccc88,
    }, cursorY);

    cursorY += LINE_GAP;

    // Mana cost / Cooldown
    if (node.manaCost !== undefined) {
      cursorY = this._addLine(`Mana: ${node.manaCost}`, {
        fontSize: 12,
        fill: 0x5599ff,
      }, cursorY);
    }
    if (node.cooldown !== undefined) {
      cursorY = this._addLine(`Cooldown: ${node.cooldown}s`, {
        fontSize: 12,
        fill: 0xcccccc,
      }, cursorY);
    }

    cursorY += LINE_GAP;

    // Effects
    for (const effectLine of node.effects) {
      cursorY = this._addLine(effectLine, {
        fontSize: 12,
        fill: RARITY_COLORS['legendary'],
        wordWrap: true,
        wordWrapWidth: TOOLTIP_MAX_W - PAD * 2,
      }, cursorY);
    }

    if (node.effects.length > 0) cursorY += LINE_GAP;

    // Description
    cursorY = this._addLine(node.description, {
      fontSize: 11,
      fill: 0x888888,
      fontStyle: 'italic',
      wordWrap: true,
      wordWrapWidth: TOOLTIP_MAX_W - PAD * 2,
    }, cursorY);

    this._finalise(x, y, cursorY);
  }

  /** Hide the tooltip. */
  public hide(): void {
    this.container.visible = false;
  }

  /** Respond to window resize. */
  public resize(w: number, h: number): void {
    this._screenW = w;
    this._screenH = h;
  }

  /** Clean up. */
  public destroy(): void {
    this.container.destroy({ children: true });
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  private _clearContent(): void {
    this._content.removeChildren();
    this._bg.clear();
  }

  /** Add a styled text line and return the new Y cursor. */
  private _addLine(
    str: string,
    styleOverrides: Partial<TextStyle> & Record<string, unknown>,
    cursorY: number,
  ): number {
    const style = new TextStyle({
      fontFamily: FONT_FAMILY,
      fontSize: 13,
      fill: 0xffffff,
      ...styleOverrides,
    });
    const txt = new Text({ text: str, style });
    txt.x = 0;
    txt.y = cursorY;
    this._content.addChild(txt);
    return cursorY + txt.height + LINE_GAP;
  }

  /** Draw background, position tooltip near cursor, show. */
  private _finalise(cursorX: number, cursorY: number, contentH: number): void {
    const w = TOOLTIP_MAX_W;
    const h = contentH + PAD * 2;

    // Content offset
    this._content.x = PAD;
    this._content.y = PAD;

    // Background
    this._bg.clear();
    this._bg.roundRect(0, 0, w, h, 6).fill({ color: PANEL_BG, alpha: PANEL_ALPHA });
    this._bg.roundRect(0, 0, w, h, 6).stroke({ color: BORDER_COLOR, width: 2 });

    // Smart positioning
    const offset = 16;
    let tx = cursorX + offset;
    let ty = cursorY + offset;

    if (tx + w > this._screenW) {
      tx = cursorX - w - offset;
    }
    if (ty + h > this._screenH) {
      ty = cursorY - h - offset;
    }
    if (tx < 0) tx = 4;
    if (ty < 0) ty = 4;

    this.container.x = tx;
    this.container.y = ty;
    this.container.visible = true;
  }
}
