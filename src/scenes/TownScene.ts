import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';
import { DialogueBox } from '@/ui/DialogueBox';

// ---------------------------------------------------------------------------
// Building definitions
// ---------------------------------------------------------------------------

interface BuildingDef {
  id: string;
  name: string;
  icon: string;
  color: number;
  description: string;
}

const BUILDINGS: BuildingDef[] = [
  { id: 'inn', name: 'Inn', icon: 'I', color: 0xcd853f, description: 'Rest and recover HP/MP.' },
  { id: 'shop', name: 'General Store', icon: 'S', color: 0x228b22, description: 'Buy and sell items.' },
  { id: 'blacksmith', name: 'Blacksmith', icon: 'B', color: 0x808080, description: 'Repair and upgrade equipment.' },
  { id: 'temple', name: 'Temple', icon: 'T', color: 0xffd700, description: 'Healing and blessings.' },
  { id: 'tavern', name: 'Tavern', icon: 'V', color: 0x8b4513, description: 'Hear rumors and hire companions.' },
  { id: 'guild', name: 'Adventurer Guild', icon: 'G', color: 0x4169e1, description: 'Accept quests and bounties.' },
];

// ---------------------------------------------------------------------------
// NPC definitions
// ---------------------------------------------------------------------------

interface TownNPC {
  id: string;
  name: string;
  role: string;
  color: number;
}

const TOWN_NPCS: TownNPC[] = [
  { id: 'elder-oakworth', name: 'Elder Oakworth', role: 'Quest Giver', color: 0xdaa520 },
  { id: 'farmer-bramble', name: 'Farmer Bramble', role: 'Villager', color: 0x8fbc8f },
  { id: 'guard-captain', name: 'Guard Captain Reeves', role: 'Guard', color: 0x808080 },
  { id: 'merchant-tilda', name: 'Merchant Tilda', role: 'Merchant', color: 0x228b22 },
];

// ---------------------------------------------------------------------------
// TownScene
// ---------------------------------------------------------------------------

/**
 * Town interaction scene.
 *
 * Provides a simple interior view of a town with:
 * - Town name header.
 * - Grid of building buttons (inn, shop, blacksmith, etc.).
 * - NPC list on right side.
 * - "Leave Town" button.
 *
 * Clicking a building opens its service interface.
 */
export class TownScene extends Scene {
  // ------------------------------------------------------------------
  // Display objects
  // ------------------------------------------------------------------

  private _bg!: Graphics;
  private _headerText!: Text;
  private _buildingGrid!: Container;
  private _npcList!: Container;
  private _leaveButton!: Container;
  private _serviceOverlay!: Container;
  private _torchGfx!: Graphics;
  private _dialogueBox!: DialogueBox;

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  /** Currently open service panel (null when none). */
  public get activeService(): string | null { return this._activeService_; }
  private _activeService_: string | null = null;
  private _elapsed: number = 0;
  private _townId: string;
  private _townName: string;

  constructor(townId?: string) {
    super('TownScene');
    this._townId = townId ?? 'oakworth';
    this._townName = this._resolveTownName(this._townId);
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  public async init(): Promise<void> {
    const w = this.engine.width;
    const h = this.engine.height;

    // --- Warm interior background ---
    this._bg = new Graphics();
    this._drawBackground(w, h);
    this.container.addChild(this._bg);

    // --- Torch-lit ambience overlay ---
    this._torchGfx = new Graphics();
    this.container.addChild(this._torchGfx);

    // --- Town name header ---
    this._headerText = new Text({
      text: this._townName,
      style: new TextStyle({
        fontFamily: 'Georgia, "Palatino Linotype", serif',
        fontSize: 28,
        fontWeight: 'bold',
        fill: 0xffd700,
        stroke: { color: 0x1a0800, width: 4 },
        letterSpacing: 4,
      }),
    });
    this._headerText.anchor.set(0.5, 0);
    this._headerText.position.set(w / 2, 16);
    this.container.addChild(this._headerText);

    // --- Building grid ---
    this._buildingGrid = new Container();
    this._buildingGrid.label = 'building-grid';
    this.container.addChild(this._buildingGrid);
    this._buildBuildingGrid(w, h);

    // --- NPC list (right side) ---
    this._npcList = new Container();
    this._npcList.label = 'npc-list';
    this.container.addChild(this._npcList);
    this._buildNPCList(w, h);

    // --- Leave Town button ---
    this._leaveButton = new Container();
    this._leaveButton.label = 'leave-btn';
    this.container.addChild(this._leaveButton);
    this._buildLeaveButton(w, h);

    // --- Service overlay (hidden by default) ---
    this._serviceOverlay = new Container();
    this._serviceOverlay.label = 'service-overlay';
    this._serviceOverlay.visible = false;
    this.container.addChild(this._serviceOverlay);

    // --- Dialogue box ---
    this._dialogueBox = new DialogueBox(w, h);
    this.engine.uiContainer.addChild(this._dialogueBox.container);
  }

  public update(dt: number): void {
    this._elapsed += dt;

    // Dialogue box takes priority when visible.
    this._dialogueBox.update(dt);
    if (this._dialogueBox.isVisible()) {
      if (
        this.engine.input.isActionJustPressed('interact') ||
        this.engine.input.isKeyJustPressed('Space')
      ) {
        this._dialogueBox.advance();
      }
      return;
    }

    // Animate torch flicker.
    this._drawTorchAmbience(this.engine.width, this.engine.height);
  }

  public fixedUpdate(_dt: number): void {
    // No fixed logic.
  }

  public render(_alpha: number): void {
    const w = this.engine.width;
    const h = this.engine.height;

    this._bg.clear();
    this._drawBackground(w, h);
    this._headerText.position.set(w / 2, 16);
  }

  // ------------------------------------------------------------------
  // Background
  // ------------------------------------------------------------------

  private _drawBackground(w: number, h: number): void {
    // Warm wooden interior.
    this._bg.rect(0, 0, w, h).fill(0x1a1208);

    // Wooden panel pattern.
    const plankW = 80;
    for (let x = 0; x < w; x += plankW) {
      const shade = 0x1a1208 + (x % (plankW * 2) === 0 ? 0x020201 : 0);
      this._bg.rect(x, 0, plankW, h).fill(shade);
      this._bg.moveTo(x, 0).lineTo(x, h).stroke({ color: 0x0e0a04, width: 1, alpha: 0.3 });
    }

    // Floor.
    this._bg.rect(0, h - 100, w, 100).fill(0x3a2a1a);
    for (let x = 0; x < w; x += 60) {
      this._bg.moveTo(x, h - 100).lineTo(x, h).stroke({ color: 0x2a1a0a, width: 1, alpha: 0.3 });
    }

    // Top header bar.
    this._bg.rect(0, 0, w, 60).fill({ color: 0x0a0604, alpha: 0.5 });
    this._bg.rect(0, 58, w, 2).fill({ color: 0xdaa520, alpha: 0.3 });
  }

  private _drawTorchAmbience(w: number, _h: number): void {
    this._torchGfx.clear();

    // Flickering warm light.
    const flicker = Math.sin(this._elapsed * 5) * 0.03 + Math.sin(this._elapsed * 7.3) * 0.02;
    const alpha = 0.04 + flicker;

    // Light sources at two positions.
    this._torchGfx.circle(w * 0.2, 100, 200).fill({ color: 0xff8c00, alpha });
    this._torchGfx.circle(w * 0.8, 100, 200).fill({ color: 0xff8c00, alpha });

    // Torch brackets (simple).
    for (const tx of [w * 0.2, w * 0.8]) {
      this._torchGfx.rect(tx - 3, 70, 6, 20).fill(0x444444);
      // Flame.
      const fy = 65 + Math.sin(this._elapsed * 8 + tx) * 3;
      this._torchGfx.circle(tx, fy, 5).fill({ color: 0xff6600, alpha: 0.7 });
      this._torchGfx.circle(tx, fy - 3, 3).fill({ color: 0xffcc00, alpha: 0.5 });
    }
  }

  // ------------------------------------------------------------------
  // Building grid
  // ------------------------------------------------------------------

  private _buildBuildingGrid(w: number, _h: number): void {
    this._buildingGrid.removeChildren();

    const cols = 3;
    const cellW = 160;
    const cellH = 80;
    const gap = 12;
    const gridW = cols * cellW + (cols - 1) * gap;
    const startX = (w * 0.55 - gridW) / 2;
    const startY = 90;

    this._buildingGrid.position.set(startX, startY);

    for (let i = 0; i < BUILDINGS.length; i++) {
      const bld = BUILDINGS[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * (cellW + gap);
      const y = row * (cellH + gap);

      const cell = new Container();
      cell.position.set(x, y);

      // Cell background.
      const bg = new Graphics();
      bg.roundRect(0, 0, cellW, cellH, 6).fill({ color: 0x1e180e, alpha: 0.85 });
      bg.roundRect(0, 0, cellW, cellH, 6).stroke({ color: bld.color, width: 1.5, alpha: 0.6 });
      cell.addChild(bg);

      // Icon circle.
      const icon = new Graphics();
      icon.circle(24, cellH / 2, 16).fill({ color: bld.color, alpha: 0.2 });
      icon.circle(24, cellH / 2, 16).stroke({ color: bld.color, width: 1 });
      cell.addChild(icon);

      const iconText = new Text({
        text: bld.icon,
        style: new TextStyle({
          fontFamily: 'Georgia, serif',
          fontSize: 16,
          fontWeight: 'bold',
          fill: bld.color,
        }),
      });
      iconText.anchor.set(0.5, 0.5);
      iconText.position.set(24, cellH / 2);
      cell.addChild(iconText);

      // Building name.
      const nameText = new Text({
        text: bld.name,
        style: new TextStyle({
          fontFamily: 'Georgia, serif',
          fontSize: 13,
          fill: 0xeeddaa,
        }),
      });
      nameText.position.set(48, 12);
      cell.addChild(nameText);

      // Description.
      const descText = new Text({
        text: bld.description,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: 0x888888,
          wordWrap: true,
          wordWrapWidth: cellW - 56,
        }),
      });
      descText.position.set(48, 32);
      cell.addChild(descText);

      // Click handler.
      cell.eventMode = 'static';
      cell.cursor = 'pointer';
      cell.on('pointerdown', () => {
        this._openService(bld.id);
      });

      // Hover effect.
      cell.on('pointerover', () => {
        bg.clear();
        bg.roundRect(0, 0, cellW, cellH, 6).fill({ color: 0x2a2210, alpha: 0.9 });
        bg.roundRect(0, 0, cellW, cellH, 6).stroke({ color: bld.color, width: 2 });
      });
      cell.on('pointerout', () => {
        bg.clear();
        bg.roundRect(0, 0, cellW, cellH, 6).fill({ color: 0x1e180e, alpha: 0.85 });
        bg.roundRect(0, 0, cellW, cellH, 6).stroke({ color: bld.color, width: 1.5, alpha: 0.6 });
      });

      this._buildingGrid.addChild(cell);
    }
  }

  // ------------------------------------------------------------------
  // NPC list
  // ------------------------------------------------------------------

  private _buildNPCList(w: number, h: number): void {
    this._npcList.removeChildren();
    this._npcList.position.set(w - 220, 90);

    const header = new Text({
      text: 'Townspeople',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 14,
        fill: 0xdaa520,
        letterSpacing: 1,
      }),
    });
    this._npcList.addChild(header);

    for (let i = 0; i < TOWN_NPCS.length; i++) {
      const npc = TOWN_NPCS[i];
      const y = 26 + i * 50;

      const row = new Container();
      row.position.set(0, y);

      const bg = new Graphics();
      bg.roundRect(0, 0, 200, 42, 4).fill({ color: 0x1a1610, alpha: 0.7 });
      bg.roundRect(0, 0, 200, 42, 4).stroke({ color: 0x333333, width: 1 });
      row.addChild(bg);

      // Color dot.
      const dot = new Graphics();
      dot.circle(14, 21, 5).fill(npc.color);
      row.addChild(dot);

      // Name.
      const nameText = new Text({
        text: npc.name,
        style: new TextStyle({
          fontFamily: 'Georgia, serif',
          fontSize: 11,
          fill: 0xeeddaa,
        }),
      });
      nameText.position.set(28, 6);
      row.addChild(nameText);

      // Role.
      const roleText = new Text({
        text: npc.role,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: npc.color,
        }),
      });
      roleText.position.set(28, 24);
      row.addChild(roleText);

      // Click handler.
      row.eventMode = 'static';
      row.cursor = 'pointer';
      row.on('pointerdown', () => {
        this._onNPCClick(npc);
      });
      row.on('pointerover', () => {
        bg.clear();
        bg.roundRect(0, 0, 200, 42, 4).fill({ color: 0x2a2210, alpha: 0.8 });
        bg.roundRect(0, 0, 200, 42, 4).stroke({ color: npc.color, width: 1 });
      });
      row.on('pointerout', () => {
        bg.clear();
        bg.roundRect(0, 0, 200, 42, 4).fill({ color: 0x1a1610, alpha: 0.7 });
        bg.roundRect(0, 0, 200, 42, 4).stroke({ color: 0x333333, width: 1 });
      });

      this._npcList.addChild(row);
    }

    void h;
  }

  // ------------------------------------------------------------------
  // Leave button
  // ------------------------------------------------------------------

  private _buildLeaveButton(w: number, h: number): void {
    this._leaveButton.removeChildren();

    const btnW = 180;
    const btnH = 40;
    this._leaveButton.position.set((w - btnW) / 2, h - 64);

    const bg = new Graphics();
    bg.roundRect(0, 0, btnW, btnH, 6).fill({ color: 0x1a1610, alpha: 0.85 });
    bg.roundRect(0, 0, btnW, btnH, 6).stroke({ color: 0x888888, width: 1.5 });
    this._leaveButton.addChild(bg);

    const text = new Text({
      text: 'Leave Town',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 16,
        fill: 0xccbbaa,
        letterSpacing: 2,
      }),
    });
    text.anchor.set(0.5, 0.5);
    text.position.set(btnW / 2, btnH / 2);
    this._leaveButton.addChild(text);

    this._leaveButton.eventMode = 'static';
    this._leaveButton.cursor = 'pointer';
    this._leaveButton.on('pointerdown', () => {
      this._leaveTown();
    });
  }

  // ------------------------------------------------------------------
  // Service overlay
  // ------------------------------------------------------------------

  private _openService(serviceId: string): void {
    this._activeService_ = serviceId;
    this._serviceOverlay.removeChildren();
    this._serviceOverlay.visible = true;

    const w = this.engine.width;
    const h = this.engine.height;

    // Dim background.
    const dim = new Graphics();
    dim.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.6 });
    dim.eventMode = 'static';
    dim.on('pointerdown', () => {
      this._closeService();
    });
    this._serviceOverlay.addChild(dim);

    // Service panel.
    const panelW = 400;
    const panelH = 300;
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;

    const panel = new Graphics();
    panel.roundRect(panelX, panelY, panelW, panelH, 8).fill({ color: 0x1e180e, alpha: 0.95 });
    panel.roundRect(panelX, panelY, panelW, panelH, 8).stroke({ color: 0xdaa520, width: 2 });
    panel.eventMode = 'static'; // Prevent click-through.
    this._serviceOverlay.addChild(panel);

    const building = BUILDINGS.find((b) => b.id === serviceId);
    if (!building) return;

    // Title.
    const title = new Text({
      text: building.name,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 20,
        fontWeight: 'bold',
        fill: building.color,
        letterSpacing: 2,
      }),
    });
    title.anchor.set(0.5, 0);
    title.position.set(w / 2, panelY + 16);
    this._serviceOverlay.addChild(title);

    // Service-specific content.
    switch (serviceId) {
      case 'inn':
        this._buildInnService(panelX, panelY, panelW, panelH);
        break;
      case 'shop':
        this._buildShopService(panelX, panelY, panelW, panelH);
        break;
      case 'blacksmith':
        this._buildBlacksmithService(panelX, panelY, panelW, panelH);
        break;
      default:
        this._buildGenericService(panelX, panelY, panelW, panelH, building);
        break;
    }

    // Close button.
    const closeBtn = new Container();
    closeBtn.position.set(panelX + panelW - 30, panelY + 8);
    const closeBg = new Graphics();
    closeBg.circle(0, 0, 12).fill({ color: 0x440000, alpha: 0.8 });
    closeBg.circle(0, 0, 12).stroke({ color: 0x880000, width: 1 });
    closeBtn.addChild(closeBg);
    const closeText = new Text({
      text: 'X',
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 12,
        fontWeight: 'bold',
        fill: 0xff6666,
      }),
    });
    closeText.anchor.set(0.5, 0.5);
    closeBtn.addChild(closeText);
    closeBtn.eventMode = 'static';
    closeBtn.cursor = 'pointer';
    closeBtn.on('pointerdown', () => {
      this._closeService();
    });
    this._serviceOverlay.addChild(closeBtn);
  }

  private _buildInnService(px: number, py: number, _pw: number, _ph: number): void {
    const desc = new Text({
      text: 'Rest at the inn to fully restore\nyour party\'s HP and MP.\n\nCost: 25 Gold',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 13,
        fill: 0xccbbaa,
        lineHeight: 20,
      }),
    });
    desc.position.set(px + 30, py + 60);
    this._serviceOverlay.addChild(desc);

    // Rest button.
    const restBtn = new Container();
    restBtn.position.set(px + 30, py + 180);
    const restBg = new Graphics();
    restBg.roundRect(0, 0, 120, 36, 4).fill({ color: 0x225522, alpha: 0.8 });
    restBg.roundRect(0, 0, 120, 36, 4).stroke({ color: 0x44aa44, width: 1.5 });
    restBtn.addChild(restBg);
    const restText = new Text({
      text: 'Rest',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 16,
        fill: 0x88ff88,
      }),
    });
    restText.anchor.set(0.5, 0.5);
    restText.position.set(60, 18);
    restBtn.addChild(restText);
    restBtn.eventMode = 'static';
    restBtn.cursor = 'pointer';
    restBtn.on('pointerdown', () => {
      this.engine.debug.log('Party rested at the inn. HP/MP fully restored!');
      this._closeService();
    });
    this._serviceOverlay.addChild(restBtn);
  }

  private _buildShopService(px: number, py: number, pw: number, _ph: number): void {
    const desc = new Text({
      text: 'Buy and sell goods.',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 13,
        fill: 0xccbbaa,
      }),
    });
    desc.position.set(px + 30, py + 60);
    this._serviceOverlay.addChild(desc);

    // Placeholder item list.
    const items = [
      { name: 'Health Potion', price: 25 },
      { name: 'Mana Potion', price: 30 },
      { name: 'Antidote', price: 15 },
      { name: 'Torch', price: 5 },
    ];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const y = py + 90 + i * 30;

      const row = new Graphics();
      row.rect(px + 30, y, pw - 60, 24).fill({ color: 0x1a1a1a, alpha: 0.5 });
      row.rect(px + 30, y, pw - 60, 24).stroke({ color: 0x333333, width: 1 });
      this._serviceOverlay.addChild(row);

      const nameText = new Text({
        text: item.name,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 10,
          fill: 0xdddddd,
        }),
      });
      nameText.position.set(px + 38, y + 5);
      this._serviceOverlay.addChild(nameText);

      const priceText = new Text({
        text: `${item.price}g`,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 10,
          fill: 0xffd700,
        }),
      });
      priceText.position.set(px + pw - 80, y + 5);
      this._serviceOverlay.addChild(priceText);

      // Buy button.
      const buyBtn = new Container();
      buyBtn.position.set(px + pw - 50, y + 2);
      const buyBg = new Graphics();
      buyBg.roundRect(0, 0, 36, 20, 3).fill({ color: 0x225522, alpha: 0.7 });
      buyBtn.addChild(buyBg);
      const buyText = new Text({
        text: 'Buy',
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 9,
          fill: 0x88ff88,
        }),
      });
      buyText.position.set(6, 3);
      buyBtn.addChild(buyText);
      buyBtn.eventMode = 'static';
      buyBtn.cursor = 'pointer';
      buyBtn.on('pointerdown', () => {
        this.engine.debug.log(`Bought ${item.name} for ${item.price}g`);
      });
      this._serviceOverlay.addChild(buyBtn);
    }
  }

  private _buildBlacksmithService(px: number, py: number, _pw: number, _ph: number): void {
    const desc = new Text({
      text: 'Repair and enhance your equipment.\n\n(Placeholder - repair service coming soon)',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 13,
        fill: 0xccbbaa,
        lineHeight: 20,
      }),
    });
    desc.position.set(px + 30, py + 60);
    this._serviceOverlay.addChild(desc);

    // Repair All button.
    const repairBtn = new Container();
    repairBtn.position.set(px + 30, py + 150);
    const repairBg = new Graphics();
    repairBg.roundRect(0, 0, 140, 36, 4).fill({ color: 0x333344, alpha: 0.8 });
    repairBg.roundRect(0, 0, 140, 36, 4).stroke({ color: 0x666688, width: 1 });
    repairBtn.addChild(repairBg);
    const repairText = new Text({
      text: 'Repair All (50g)',
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 12,
        fill: 0xaabbcc,
      }),
    });
    repairText.position.set(10, 10);
    repairBtn.addChild(repairText);
    repairBtn.eventMode = 'static';
    repairBtn.cursor = 'pointer';
    repairBtn.on('pointerdown', () => {
      this.engine.debug.log('All equipment repaired!');
    });
    this._serviceOverlay.addChild(repairBtn);
  }

  private _buildGenericService(
    px: number, py: number, _pw: number, _ph: number, building: BuildingDef,
  ): void {
    const desc = new Text({
      text: `${building.description}\n\n(More features coming soon)`,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 13,
        fill: 0xccbbaa,
        lineHeight: 20,
      }),
    });
    desc.position.set(px + 30, py + 60);
    this._serviceOverlay.addChild(desc);
  }

  private _closeService(): void {
    this._activeService_ = null;
    this._serviceOverlay.visible = false;
    this._serviceOverlay.removeChildren();
  }

  // ------------------------------------------------------------------
  // NPC interaction
  // ------------------------------------------------------------------

  private _onNPCClick(npc: TownNPC): void {
    const dialogueByRole: Record<string, string> = {
      'Quest Giver': 'Brave adventurer, the forest to the east grows dark with corruption. Will you investigate?',
      'Villager': 'The harvest has been poor this year. Strange creatures roam the fields at night...',
      'Guard': 'Stay vigilant, traveller. Reports of bandits on the northern road have increased.',
      'Merchant': 'Welcome! I have the finest goods in all the land. Care to browse my wares?',
    };

    const text = dialogueByRole[npc.role] ?? `Greetings, adventurer. I am ${npc.name}.`;

    this._dialogueBox.show(
      npc.name,
      text,
      undefined,
      { color: npc.color },
      undefined,
      undefined,
    );
  }

  // ------------------------------------------------------------------
  // Leave town
  // ------------------------------------------------------------------

  private _leaveTown(): void {
    this.engine.debug.log('Leaving town...');
    void import('./OverworldScene').then(({ OverworldScene }) => {
      void this.engine.scenes.replace(new OverworldScene());
    });
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /** The town identifier used to load this scene. */
  public get townId(): string {
    return this._townId;
  }

  public override async exit(): Promise<void> {
    this._dialogueBox.container.removeFromParent();
  }

  public override destroy(): void {
    this._closeService();
    this._dialogueBox.destroy();
    super.destroy();
  }

  private _resolveTownName(id: string): string {
    const names: Record<string, string> = {
      oakworth: 'Oakworth Village',
      haven: 'Haven Town',
      frostpeak: 'Frostpeak Settlement',
      scorchgate: 'Scorchgate Outpost',
      shadowmire: 'Shadowmire Hamlet',
    };
    return names[id] ?? `Town of ${id.charAt(0).toUpperCase() + id.slice(1)}`;
  }
}
