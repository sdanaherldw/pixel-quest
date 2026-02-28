import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';
import { World as ECSWorld } from '@/engine/ecs/World';
import type { Entity } from '@/engine/ecs/Entity';
import { ComponentType } from '@/engine/ecs/Component';
import type { TransformComponent, VelocityComponent, HealthComponent } from '@/engine/ecs/Component';
import {
  PlayerEntity,
  applyWalkFrame,
  applyFacing,
  type PlayerData,
  type PlayerComponent,
} from '@/entities/PlayerEntity';
import { NPCEntity, updateQuestIndicator, type NPCComponent } from '@/entities/NPCEntity';

// ---------------------------------------------------------------------------
// Tile types
// ---------------------------------------------------------------------------

const enum TileType {
  Grass = 0,
  Dirt = 1,
  Water = 2,
  Mountain = 3,
  Forest = 4,
  Sand = 5,
  Path = 6,
}

const TILE_COLORS: Record<TileType, number> = {
  [TileType.Grass]: 0x4a8c3f,
  [TileType.Dirt]: 0x8b7355,
  [TileType.Water]: 0x3366aa,
  [TileType.Mountain]: 0x666666,
  [TileType.Forest]: 0x2d5a27,
  [TileType.Sand]: 0xc2b280,
  [TileType.Path]: 0xa09070,
};

const BLOCKED_TILES = new Set<TileType>([TileType.Water, TileType.Mountain]);

// ---------------------------------------------------------------------------
// Transition zones
// ---------------------------------------------------------------------------

interface TransitionZone {
  x: number;
  y: number;
  width: number;
  height: number;
  targetScene: string;
  label: string;
}

// ---------------------------------------------------------------------------
// OverworldScene
// ---------------------------------------------------------------------------

/**
 * Main overworld scene for top-down exploration.
 *
 * Features:
 * - Procedural terrain grid with gradient-colored tiles.
 * - 8-directional player movement.
 * - Tile-based collision (blocks water/mountain).
 * - NPC interaction zones with prompts.
 * - Camera following the player.
 * - UI overlay: area name, minimap, party HP bars, quick bar.
 */
export class OverworldScene extends Scene {
  // ------------------------------------------------------------------
  // World / ECS
  // ------------------------------------------------------------------

  private _world!: ECSWorld;
  private _playerEntity!: Entity;

  // ------------------------------------------------------------------
  // Terrain
  // ------------------------------------------------------------------

  private _tileSize: number = 32;
  private _mapCols: number = 80;
  private _mapRows: number = 60;
  private _tiles: TileType[][] = [];
  private _terrainGfx!: Graphics;

  // ------------------------------------------------------------------
  // Transition zones
  // ------------------------------------------------------------------

  private _transitionZones: TransitionZone[] = [];
  private _transitionGfx!: Graphics;

  // ------------------------------------------------------------------
  // Player state
  // ------------------------------------------------------------------

  private _prevPlayerX: number = 0;
  private _prevPlayerY: number = 0;
  private _playerSpeed: number = 150;
  private _elapsed: number = 0;

  // ------------------------------------------------------------------
  // NPC entities
  // ------------------------------------------------------------------

  private _npcEntities: Entity[] = [];

  // ------------------------------------------------------------------
  // UI elements
  // ------------------------------------------------------------------

  private _uiContainer!: Container;
  private _areaNameText!: Text;
  private _minimapContainer!: Container;
  private _minimapGfx!: Graphics;
  private _minimapPlayerDot!: Graphics;
  private _partyHPContainer!: Container;
  private _quickBarContainer!: Container;

  // ------------------------------------------------------------------
  // Config
  // ------------------------------------------------------------------

  private _areaName: string = 'Elderwood Forest';
  private _playerData: PlayerData;

  constructor(playerData?: PlayerData) {
    super('OverworldScene');
    this._playerData = playerData ?? {
      name: 'Hero',
      classId: 'knight',
      level: 1,
      stats: { str: 14, int: 8, wis: 10, dex: 10, con: 12, cha: 10 },
      equipment: {},
      spellBook: { knownSpells: [], equippedSpells: [] },
    };
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  public async init(): Promise<void> {
    this._world = new ECSWorld();

    // --- Generate terrain ---
    this._generateTerrain();
    this._terrainGfx = new Graphics();
    this._drawTerrain();
    this.container.addChild(this._terrainGfx);

    // --- Transition zones ---
    this._transitionGfx = new Graphics();
    this._setupTransitionZones();
    this._drawTransitionZones();
    this.container.addChild(this._transitionGfx);

    // --- Create player entity ---
    const spawnX = this._mapCols * this._tileSize / 2;
    const spawnY = this._mapRows * this._tileSize / 2;

    this._playerEntity = PlayerEntity.create(
      this._world,
      this._playerData,
      spawnX,
      spawnY,
    );

    const playerSprite = this._playerEntity.getComponent(ComponentType.Sprite);
    if (playerSprite?.container) {
      this.container.addChild(playerSprite.container);
    }

    this._prevPlayerX = spawnX;
    this._prevPlayerY = spawnY;

    // --- Create NPC entities ---
    this._createNPCs(spawnX, spawnY);

    // --- UI ---
    this._buildUI();

    // --- Camera ---
    this.engine.camera.follow(
      { x: spawnX, y: spawnY },
      { lerp: 0.12, deadZoneX: 30, deadZoneY: 20 },
    );
    this.engine.camera.worldBounds = {
      x: 0,
      y: 0,
      width: this._mapCols * this._tileSize,
      height: this._mapRows * this._tileSize,
    };
    this.engine.camera.lookAt(spawnX, spawnY);
  }

  // ------------------------------------------------------------------
  // Fixed update — physics / movement
  // ------------------------------------------------------------------

  public fixedUpdate(dt: number): void {
    const input = this.engine.input;
    const transform = this._playerEntity.getComponent(ComponentType.Transform) as TransformComponent;
    const velocity = this._playerEntity.getComponent(ComponentType.Velocity) as VelocityComponent;
    const playerComp = this._playerEntity.getComponent('Player') as PlayerComponent;

    this._prevPlayerX = transform.x;
    this._prevPlayerY = transform.y;

    // --- 8-directional movement ---
    let dx = 0;
    let dy = 0;
    if (input.isActionActive('moveLeft'))  dx -= 1;
    if (input.isActionActive('moveRight')) dx += 1;
    if (input.isActionActive('moveUp'))    dy -= 1;
    if (input.isActionActive('moveDown'))  dy += 1;

    // Normalize diagonal.
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }

    // Determine facing direction.
    if (len > 0) {
      if (Math.abs(dx) > Math.abs(dy)) {
        playerComp.facing = dx < 0 ? 'left' : 'right';
      } else {
        playerComp.facing = dy < 0 ? 'up' : 'down';
      }
    }

    // Sprint modifier.
    const speed = input.isActionActive('dodge') ? this._playerSpeed * 1.8 : this._playerSpeed;

    velocity.vx = dx * speed;
    velocity.vy = dy * speed;

    // Proposed new position.
    let newX = transform.x + velocity.vx * dt;
    let newY = transform.y + velocity.vy * dt;

    // --- Tile-based collision ---
    // Check the tile at the proposed position's bounding corners.
    const halfW = 8;
    const halfH = 12;

    // X-axis check.
    if (this._isTileBlocked(newX - halfW, transform.y - halfH) ||
        this._isTileBlocked(newX + halfW, transform.y - halfH) ||
        this._isTileBlocked(newX - halfW, transform.y + halfH) ||
        this._isTileBlocked(newX + halfW, transform.y + halfH)) {
      newX = transform.x;
    }

    // Y-axis check.
    if (this._isTileBlocked(newX - halfW, newY - halfH) ||
        this._isTileBlocked(newX + halfW, newY - halfH) ||
        this._isTileBlocked(newX - halfW, newY + halfH) ||
        this._isTileBlocked(newX + halfW, newY + halfH)) {
      newY = transform.y;
    }

    // Clamp to world bounds.
    const worldW = this._mapCols * this._tileSize;
    const worldH = this._mapRows * this._tileSize;
    newX = Math.max(halfW, Math.min(worldW - halfW, newX));
    newY = Math.max(halfH, Math.min(worldH - halfH, newY));

    transform.x = newX;
    transform.y = newY;

    // --- Walk animation ---
    if (len > 0) {
      playerComp.walkTimer += dt;
      if (playerComp.walkTimer >= 0.15) {
        playerComp.walkTimer = 0;
        playerComp.walkFrame = (playerComp.walkFrame + 1) % 4;
      }
      applyWalkFrame(playerComp.visual, playerComp.walkFrame);
    } else {
      playerComp.walkFrame = 0;
      playerComp.walkTimer = 0;
      applyWalkFrame(playerComp.visual, 0);
    }

    applyFacing(playerComp.visual, playerComp.facing);

    // --- Update camera follow target ---
    this.engine.camera.follow(
      { x: transform.x, y: transform.y },
      { lerp: 0.12, deadZoneX: 30, deadZoneY: 20 },
    );

    // --- Check transition zones ---
    for (const zone of this._transitionZones) {
      if (
        transform.x >= zone.x &&
        transform.x <= zone.x + zone.width &&
        transform.y >= zone.y &&
        transform.y <= zone.y + zone.height
      ) {
        this._onTransition(zone);
        break;
      }
    }
  }

  // ------------------------------------------------------------------
  // Update — animations, interactions
  // ------------------------------------------------------------------

  public update(dt: number): void {
    this._elapsed += dt;

    // --- Overlay scene shortcuts ---
    if (this.engine.input.isActionJustPressed('inventory')) {
      void import('@/scenes/InventoryScene').then(({ InventoryScene }) => {
        void this.engine.scenes.push(new InventoryScene());
      });
      return;
    }
    if (this.engine.input.isActionJustPressed('spellbook')) {
      void import('@/scenes/SpellBookScene').then(({ SpellBookScene }) => {
        void this.engine.scenes.push(new SpellBookScene());
      });
      return;
    }
    if (this.engine.input.isActionJustPressed('questlog')) {
      void import('@/scenes/QuestLogScene').then(({ QuestLogScene }) => {
        void this.engine.scenes.push(new QuestLogScene());
      });
      return;
    }
    if (this.engine.input.isActionJustPressed('map')) {
      void import('@/scenes/MapScene').then(({ MapScene }) => {
        void this.engine.scenes.push(new MapScene());
      });
      return;
    }
    // Menu is handled via the UI MenuSystem overlay — not a scene push.

    const transform = this._playerEntity.getComponent(ComponentType.Transform) as TransformComponent;

    // --- NPC interaction checks ---
    for (const npcEntity of this._npcEntities) {
      const npcComp = npcEntity.getComponent('NPC') as NPCComponent;
      const npcTransform = npcEntity.getComponent(ComponentType.Transform) as TransformComponent;

      // Distance check.
      const distX = transform.x - npcTransform.x;
      const distY = transform.y - npcTransform.y;
      const dist = Math.sqrt(distX * distX + distY * distY);

      const wasInRange = npcComp.isPlayerInRange;
      npcComp.isPlayerInRange = dist <= npcComp.interactionRadius;

      // Show/hide prompt.
      npcComp.promptText.visible = npcComp.isPlayerInRange;

      // Handle interaction.
      if (npcComp.isPlayerInRange && this.engine.input.isActionJustPressed('interact')) {
        this._onNPCInteract(npcComp);
      }

      // Update quest indicator animation.
      updateQuestIndicator(npcComp.indicatorGfx, npcComp.questIndicator, this._elapsed);

      void wasInRange;
    }
  }

  // ------------------------------------------------------------------
  // Render — interpolation, UI
  // ------------------------------------------------------------------

  public render(alpha: number): void {
    const transform = this._playerEntity.getComponent(ComponentType.Transform) as TransformComponent;
    const playerComp = this._playerEntity.getComponent('Player') as PlayerComponent;

    // Interpolated player position.
    const renderX = this._prevPlayerX + (transform.x - this._prevPlayerX) * alpha;
    const renderY = this._prevPlayerY + (transform.y - this._prevPlayerY) * alpha;
    playerComp.visual.position.set(renderX, renderY);

    // --- UI updates ---
    this._updateMinimap(transform.x, transform.y);
    this._updatePartyHP();
    this._layoutUI();
  }

  public async exit(): Promise<void> {
    // Clean up UI from engine's UI container.
    if (this._uiContainer.parent) {
      this._uiContainer.parent.removeChild(this._uiContainer);
    }
  }

  public override destroy(): void {
    this._world.clear();
    super.destroy();
  }

  // ------------------------------------------------------------------
  // Terrain generation
  // ------------------------------------------------------------------

  private _generateTerrain(): void {
    this._tiles = [];

    for (let row = 0; row < this._mapRows; row++) {
      const tileRow: TileType[] = [];
      for (let col = 0; col < this._mapCols; col++) {
        // Simple procedural: gradient-based terrain.
        const nx = col / this._mapCols;
        const ny = row / this._mapRows;

        // Distance from center.
        const cx = nx - 0.5;
        const cy = ny - 0.5;
        const dist = Math.sqrt(cx * cx + cy * cy);

        // Simple noise approximation using sin waves.
        const noise =
          Math.sin(col * 0.3 + row * 0.2) * 0.3 +
          Math.sin(col * 0.1 - row * 0.15) * 0.4 +
          Math.sin(col * 0.05 + row * 0.08) * 0.3;

        let tile: TileType;

        if (dist > 0.45) {
          tile = TileType.Mountain;
        } else if (dist > 0.38 && noise > 0.2) {
          tile = TileType.Mountain;
        } else if (noise < -0.35) {
          tile = TileType.Water;
        } else if (noise < -0.15) {
          tile = TileType.Sand;
        } else if (noise > 0.3) {
          tile = TileType.Forest;
        } else if (noise > 0.1) {
          tile = TileType.Dirt;
        } else {
          tile = TileType.Grass;
        }

        // Carve out paths near center.
        const pathDist = Math.abs(cx) + Math.abs(cy);
        if (pathDist < 0.05 || (Math.abs(cx) < 0.01 && Math.abs(cy) < 0.2) ||
            (Math.abs(cy) < 0.01 && Math.abs(cx) < 0.2)) {
          tile = TileType.Path;
        }

        tileRow.push(tile);
      }
      this._tiles.push(tileRow);
    }
  }

  private _drawTerrain(): void {
    const g = this._terrainGfx;
    g.clear();

    for (let row = 0; row < this._mapRows; row++) {
      for (let col = 0; col < this._mapCols; col++) {
        const tile = this._tiles[row][col];
        const color = TILE_COLORS[tile];
        const x = col * this._tileSize;
        const y = row * this._tileSize;

        g.rect(x, y, this._tileSize, this._tileSize).fill(color);

        // Subtle variation.
        const variation = ((col * 7 + row * 13) % 5) * 0.02;
        if (variation > 0.03) {
          g.rect(x, y, this._tileSize, this._tileSize)
            .fill({ color: 0x000000, alpha: variation });
        }
      }
    }

    // Grid lines (very subtle).
    for (let col = 0; col <= this._mapCols; col++) {
      g.moveTo(col * this._tileSize, 0)
        .lineTo(col * this._tileSize, this._mapRows * this._tileSize)
        .stroke({ color: 0x000000, width: 0.5, alpha: 0.08 });
    }
    for (let row = 0; row <= this._mapRows; row++) {
      g.moveTo(0, row * this._tileSize)
        .lineTo(this._mapCols * this._tileSize, row * this._tileSize)
        .stroke({ color: 0x000000, width: 0.5, alpha: 0.08 });
    }
  }

  private _isTileBlocked(worldX: number, worldY: number): boolean {
    const col = Math.floor(worldX / this._tileSize);
    const row = Math.floor(worldY / this._tileSize);

    if (col < 0 || col >= this._mapCols || row < 0 || row >= this._mapRows) {
      return true; // Out of bounds is blocked.
    }

    return BLOCKED_TILES.has(this._tiles[row][col]);
  }

  // ------------------------------------------------------------------
  // Transition zones
  // ------------------------------------------------------------------

  private _setupTransitionZones(): void {
    const cx = this._mapCols * this._tileSize / 2;
    const cy = this._mapRows * this._tileSize / 2;

    this._transitionZones = [
      {
        x: cx - 48, y: cy - 200,
        width: 96, height: 32,
        targetScene: 'TownScene',
        label: 'Town Gate',
      },
      {
        x: cx + 300, y: cy - 48,
        width: 32, height: 96,
        targetScene: 'DungeonScene',
        label: 'Dungeon Entrance',
      },
    ];
  }

  private _drawTransitionZones(): void {
    const g = this._transitionGfx;
    g.clear();

    for (const zone of this._transitionZones) {
      // Glowing portal effect.
      g.rect(zone.x, zone.y, zone.width, zone.height)
        .fill({ color: 0x4488ff, alpha: 0.15 });
      g.rect(zone.x, zone.y, zone.width, zone.height)
        .stroke({ color: 0x4488ff, width: 2, alpha: 0.5 });

      // Label.
      const label = new Text({
        text: zone.label,
        style: new TextStyle({
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: 10,
          fill: 0x88bbff,
          stroke: { color: 0x000000, width: 2 },
        }),
      });
      label.anchor.set(0.5, 1);
      label.position.set(zone.x + zone.width / 2, zone.y - 4);
      this.container.addChild(label);
    }
  }

  private _onTransition(zone: TransitionZone): void {
    // Placeholder: log the transition. Full scene switching handled by game logic.
    this.engine.debug.log(`Transition to: ${zone.targetScene}`);

    if (zone.targetScene === 'TownScene') {
      // Import dynamically to avoid circular deps at module level.
      void import('./TownScene').then(({ TownScene }) => {
        void this.engine.scenes.replace(new TownScene());
      });
    } else if (zone.targetScene === 'DungeonScene') {
      void import('./DungeonScene').then(({ DungeonScene }) => {
        void this.engine.scenes.replace(new DungeonScene());
      });
    }
  }

  // ------------------------------------------------------------------
  // NPC creation
  // ------------------------------------------------------------------

  private _createNPCs(centerX: number, centerY: number): void {
    const npcDefs = [
      {
        id: 'elder-oakworth',
        name: 'Elder Oakworth',
        dialogueId: 'elder-oakworth',
        portrait: 'elder-oakworth',
        position: { x: centerX - 80, y: centerY - 100 },
        role: 'quest_giver' as const,
      },
      {
        id: 'merchant-tilda',
        name: 'Merchant Tilda',
        dialogueId: 'merchant-tilda',
        portrait: 'merchant-tilda',
        position: { x: centerX + 60, y: centerY - 80 },
        role: 'merchant' as const,
      },
      {
        id: 'guard-captain',
        name: 'Guard Captain',
        dialogueId: 'guard-captain',
        portrait: 'guard-captain',
        position: { x: centerX - 40, y: centerY - 160 },
        role: 'guard' as const,
      },
      {
        id: 'innkeeper-bram',
        name: 'Innkeeper Bram',
        dialogueId: 'innkeeper-bram',
        portrait: 'innkeeper-bram',
        position: { x: centerX + 100, y: centerY - 120 },
        role: 'innkeeper' as const,
      },
    ];

    for (const def of npcDefs) {
      const entity = NPCEntity.create(this._world, def);
      this._npcEntities.push(entity);

      const spriteComp = entity.getComponent(ComponentType.Sprite);
      if (spriteComp?.container) {
        this.container.addChild(spriteComp.container);
      }
    }
  }

  private _onNPCInteract(npc: NPCComponent): void {
    this.engine.debug.log(`Talking to: ${npc.name} (${npc.dialogueId})`);
    // Placeholder: full dialogue system integration goes here.
  }

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------

  private _buildUI(): void {
    this._uiContainer = new Container();
    this._uiContainer.label = 'overworld-ui';
    this.engine.uiContainer.addChild(this._uiContainer);

    // --- Area name text (top-left) ---
    this._areaNameText = new Text({
      text: this._areaName,
      style: new TextStyle({
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 18,
        fill: 0xeeddaa,
        stroke: { color: 0x000000, width: 3 },
        letterSpacing: 2,
      }),
    });
    this._areaNameText.position.set(16, 12);
    this._uiContainer.addChild(this._areaNameText);

    // --- Minimap (bottom-right) ---
    this._minimapContainer = new Container();
    this._minimapContainer.label = 'minimap';
    this._uiContainer.addChild(this._minimapContainer);

    // Minimap background.
    const minimapBg = new Graphics();
    minimapBg.rect(0, 0, 120, 90).fill({ color: 0x000000, alpha: 0.6 });
    minimapBg.rect(0, 0, 120, 90).stroke({ color: 0x555555, width: 1 });
    this._minimapContainer.addChild(minimapBg);

    // Minimap terrain.
    this._minimapGfx = new Graphics();
    this._drawMinimap();
    this._minimapContainer.addChild(this._minimapGfx);

    // Minimap player dot.
    this._minimapPlayerDot = new Graphics();
    this._minimapPlayerDot.circle(0, 0, 2).fill(0xffffff);
    this._minimapContainer.addChild(this._minimapPlayerDot);

    // --- Party HP bars (left side) ---
    this._partyHPContainer = new Container();
    this._partyHPContainer.label = 'party-hp';
    this._uiContainer.addChild(this._partyHPContainer);

    this._buildPartyHP();

    // --- Quick spell/item bar (bottom center) ---
    this._quickBarContainer = new Container();
    this._quickBarContainer.label = 'quick-bar';
    this._uiContainer.addChild(this._quickBarContainer);

    this._buildQuickBar();
  }

  private _drawMinimap(): void {
    const g = this._minimapGfx;
    g.clear();

    const scaleX = 118 / this._mapCols;
    const scaleY = 88 / this._mapRows;

    // Draw tiles at minimap scale (every Nth tile for performance).
    const step = Math.max(1, Math.floor(this._mapCols / 60));
    for (let row = 0; row < this._mapRows; row += step) {
      for (let col = 0; col < this._mapCols; col += step) {
        const tile = this._tiles[row][col];
        const color = TILE_COLORS[tile];
        g.rect(1 + col * scaleX, 1 + row * scaleY, scaleX * step, scaleY * step).fill(color);
      }
    }
  }

  private _updateMinimap(playerX: number, playerY: number): void {
    const scaleX = 118 / (this._mapCols * this._tileSize);
    const scaleY = 88 / (this._mapRows * this._tileSize);

    this._minimapPlayerDot.position.set(
      1 + playerX * scaleX,
      1 + playerY * scaleY,
    );
  }

  private _buildPartyHP(): void {
    const health = this._playerEntity.getComponent(ComponentType.Health) as HealthComponent;
    const playerComp = this._playerEntity.getComponent('Player') as PlayerComponent;

    const barWidth = 100;
    const barHeight = 12;
    const y = 0;

    // Name.
    const nameText = new Text({
      text: playerComp.name,
      style: new TextStyle({
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 10,
        fill: 0xffffff,
      }),
    });
    nameText.position.set(0, y);
    this._partyHPContainer.addChild(nameText);

    // HP bar background.
    const bg = new Graphics();
    bg.rect(0, y + 14, barWidth, barHeight).fill(0x222222);
    bg.rect(0, y + 14, barWidth, barHeight).stroke({ color: 0x444444, width: 1 });
    bg.label = 'hp-bg';
    this._partyHPContainer.addChild(bg);

    // HP bar fill.
    const fill = new Graphics();
    const pct = health.current / health.max;
    fill.rect(1, y + 15, (barWidth - 2) * pct, barHeight - 2).fill(0x00cc00);
    fill.label = 'hp-fill';
    this._partyHPContainer.addChild(fill);

    // HP text.
    const hpText = new Text({
      text: `${health.current}/${health.max}`,
      style: new TextStyle({
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 9,
        fill: 0xffffff,
      }),
    });
    hpText.anchor.set(0.5, 0.5);
    hpText.position.set(barWidth / 2, y + 14 + barHeight / 2);
    hpText.label = 'hp-text';
    this._partyHPContainer.addChild(hpText);
  }

  private _updatePartyHP(): void {
    const health = this._playerEntity.getComponent(ComponentType.Health) as HealthComponent;
    const barWidth = 100;
    const barHeight = 12;

    const fill = this._partyHPContainer.children.find((c) => c.label === 'hp-fill') as Graphics | undefined;
    const hpText = this._partyHPContainer.children.find((c) => c.label === 'hp-text') as Text | undefined;

    if (fill) {
      const pct = Math.max(0, Math.min(1, health.current / health.max));
      fill.clear();
      const color = pct > 0.6 ? 0x00cc00 : pct > 0.3 ? 0xcccc00 : 0xcc0000;
      fill.rect(1, 15, (barWidth - 2) * pct, barHeight - 2).fill(color);
    }

    if (hpText) {
      hpText.text = `${Math.round(health.current)}/${health.max}`;
    }
  }

  private _buildQuickBar(): void {
    const slotCount = 8;
    const slotSize = 32;
    const gap = 4;
    const totalWidth = slotCount * slotSize + (slotCount - 1) * gap;

    const bg = new Graphics();
    bg.roundRect(-4, -4, totalWidth + 8, slotSize + 8, 4).fill({ color: 0x000000, alpha: 0.5 });
    this._quickBarContainer.addChild(bg);

    for (let i = 0; i < slotCount; i++) {
      const x = i * (slotSize + gap);
      const slot = new Graphics();
      slot.rect(x, 0, slotSize, slotSize).fill({ color: 0x222222, alpha: 0.7 });
      slot.rect(x, 0, slotSize, slotSize).stroke({ color: 0x555555, width: 1 });
      this._quickBarContainer.addChild(slot);

      // Key number.
      const keyText = new Text({
        text: `${i + 1}`,
        style: new TextStyle({
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: 8,
          fill: 0x888888,
        }),
      });
      keyText.position.set(x + 2, 1);
      this._quickBarContainer.addChild(keyText);
    }
  }

  private _layoutUI(): void {
    const w = this.engine.width;
    const h = this.engine.height;

    // Area name: top-left.
    this._areaNameText.position.set(16, 12);

    // Minimap: bottom-right.
    this._minimapContainer.position.set(w - 136, h - 106);

    // Party HP: left side.
    this._partyHPContainer.position.set(16, 50);

    // Quick bar: bottom center.
    const barWidth = 8 * 32 + 7 * 4;
    this._quickBarContainer.position.set((w - barWidth) / 2, h - 48);
  }
}
