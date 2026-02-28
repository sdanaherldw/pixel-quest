import { Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';
import { FadeTransition, DiamondTransition } from '@/ui/TransitionEffects';
import { PainterlyFilter } from '@/rendering/filters';
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
import { HUD, type PartyMemberData, type QuickSlotData, type MinimapEntity } from '@/ui/HUD';
import { DialogueBox } from '@/ui/DialogueBox';
import { MenuSystem, type MenuOption } from '@/ui/MenuSystem';
import { Notifications } from '@/ui/Notifications';
import { GameState } from '@/engine/GameState';

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
  // UI components
  // ------------------------------------------------------------------

  private _hud!: HUD;
  private _dialogueBox!: DialogueBox;
  private _menuSystem!: MenuSystem;
  private _notifications!: Notifications;

  /** Pre-computed minimap terrain colours (downsampled). */
  private _minimapColors: number[][] | null = null;

  /** Bound event listeners for cleanup. */
  private _boundEventHandlers: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

  // ------------------------------------------------------------------
  // Config
  // ------------------------------------------------------------------

  private _areaName: string = 'Elderwood Forest';
  private _playerData: PlayerData;

  // --- Visual filters ---
  private _painterlyFilter: PainterlyFilter | null = null;

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

    // --- UI components ---
    const w = this.engine.width;
    const h = this.engine.height;

    this._hud = new HUD(w, h);
    this.engine.uiContainer.addChild(this._hud.container);

    this._dialogueBox = new DialogueBox(w, h);
    this.engine.uiContainer.addChild(this._dialogueBox.container);

    this._menuSystem = new MenuSystem(w, h);
    this.engine.uiContainer.addChild(this._menuSystem.container);

    this._notifications = new Notifications(w, h);
    this.engine.uiContainer.addChild(this._notifications.container);

    // Pre-compute minimap terrain colours.
    this._minimapColors = this._buildMinimapColors();

    // Subscribe to GameState events for notifications.
    this._subscribeToEvents();

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

    // --- Painterly post-processing ---
    this._painterlyFilter = new PainterlyFilter();
    this._painterlyFilter.intensity = 0.15;
    this._painterlyFilter.textureResolution = [this.engine.width, this.engine.height];
    this.container.filters = [this._painterlyFilter];
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

    // --- Update UI components ---
    this._dialogueBox.update(dt);
    this._notifications.update(dt);

    // --- Update painterly filter time ---
    if (this._painterlyFilter) {
      this._painterlyFilter.time = this._elapsed;
    }

    // --- Menu system handles ESC ---
    if (this._menuSystem.isOpen()) {
      if (this.engine.input.isActionJustPressed('openMenu')) {
        this._menuSystem.hide();
      } else if (this.engine.input.isKeyJustPressed('ArrowUp')) {
        this._menuSystem.navigateUp();
      } else if (this.engine.input.isKeyJustPressed('ArrowDown')) {
        this._menuSystem.navigateDown();
      } else if (this.engine.input.isKeyJustPressed('Enter')) {
        this._menuSystem.confirmSelection();
      }
      return; // Block other input while menu is open.
    }

    // --- DialogueBox handles input when visible ---
    if (this._dialogueBox.isVisible()) {
      if (this.engine.input.isActionJustPressed('interact') ||
          this.engine.input.isKeyJustPressed('Space')) {
        this._dialogueBox.advance();
      }
      return; // Block other input during dialogue.
    }

    // --- Open menu on ESC ---
    if (this.engine.input.isActionJustPressed('openMenu')) {
      this._showMenu();
      return;
    }

    // --- Overlay scene shortcuts ---
    if (this.engine.input.isActionJustPressed('inventory')) {
      void import('@/scenes/InventoryScene').then(({ InventoryScene }) => {
        void this.engine.scenes.push(
          new InventoryScene(),
          new FadeTransition(0.3),
        );
      });
      return;
    }
    if (this.engine.input.isActionJustPressed('spellbook')) {
      void import('@/scenes/SpellBookScene').then(({ SpellBookScene }) => {
        void this.engine.scenes.push(
          new SpellBookScene(),
          new FadeTransition(0.3),
        );
      });
      return;
    }
    if (this.engine.input.isActionJustPressed('questlog')) {
      void import('@/scenes/QuestLogScene').then(({ QuestLogScene }) => {
        void this.engine.scenes.push(
          new QuestLogScene(),
          new FadeTransition(0.3),
        );
      });
      return;
    }
    if (this.engine.input.isActionJustPressed('map')) {
      void import('@/scenes/MapScene').then(({ MapScene }) => {
        void this.engine.scenes.push(
          new MapScene(),
          new FadeTransition(0.3),
        );
      });
      return;
    }

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
    const health = this._playerEntity.getComponent(ComponentType.Health) as HealthComponent;

    // Interpolated player position.
    const renderX = this._prevPlayerX + (transform.x - this._prevPlayerX) * alpha;
    const renderY = this._prevPlayerY + (transform.y - this._prevPlayerY) * alpha;
    playerComp.visual.position.set(renderX, renderY);

    // --- HUD update ---
    const gs = GameState.instance;
    const partyData: PartyMemberData[] = gs.party.length > 0
      ? gs.activeParty.map((m) => ({
          name: m.name,
          level: m.level,
          hp: m.stats.hp,
          maxHp: m.stats.maxHp,
          mp: m.stats.mp,
          maxMp: m.stats.maxMp,
          isActive: m.id === gs.activePartyIds[0],
        }))
      : [{
          name: playerComp.name,
          level: playerComp.level ?? 1,
          hp: health.current,
          maxHp: health.max,
          mp: 0,
          maxMp: 0,
          isActive: true,
        }];

    const quickSlots: QuickSlotData[] = [];
    for (let i = 0; i < 8; i++) {
      quickSlots.push({ index: i });
    }

    this._hud.update(partyData, this._areaName, gs.gold, quickSlots, 0);

    // --- Minimap ---
    const worldW = this._mapCols * this._tileSize;
    const worldH = this._mapRows * this._tileSize;
    const minimapEntities: MinimapEntity[] = [
      { x: (transform.x / worldW) * 120, y: (transform.y / worldH) * 120, type: 'player' },
    ];
    for (const npcEntity of this._npcEntities) {
      const npcT = npcEntity.getComponent(ComponentType.Transform) as TransformComponent;
      minimapEntities.push({
        x: (npcT.x / worldW) * 120,
        y: (npcT.y / worldH) * 120,
        type: 'npc',
      });
    }
    this._hud.updateMinimap(this._minimapColors, minimapEntities);
  }

  public async exit(): Promise<void> {
    // Unsubscribe GameState events.
    this._unsubscribeFromEvents();

    // Clean up UI components from engine's UI container.
    this._hud.container.parent?.removeChild(this._hud.container);
    this._dialogueBox.container.parent?.removeChild(this._dialogueBox.container);
    this._menuSystem.container.parent?.removeChild(this._menuSystem.container);
    this._notifications.container.parent?.removeChild(this._notifications.container);
  }

  public override destroy(): void {
    this._hud.destroy();
    this._dialogueBox.destroy();
    this._menuSystem.destroy();
    this._notifications.destroy();
    this._world.clear();
    this._npcEntities.length = 0;
    this._tiles.length = 0;
    this._transitionZones.length = 0;
    this._minimapColors = null;
    this._painterlyFilter = null;
    this.container.filters = [];
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
        void this.engine.scenes.replace(
          new TownScene(),
          new FadeTransition(0.5),
        );
      });
    } else if (zone.targetScene === 'DungeonScene') {
      void import('./DungeonScene').then(({ DungeonScene }) => {
        void this.engine.scenes.replace(
          new DungeonScene(),
          new DiamondTransition(0.6),
        );
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

    // Show dialogue via DialogueBox component.
    const npcColor = npc.role === 'quest_giver' ? 0xdaa520
      : npc.role === 'merchant' ? 0x228b22
      : npc.role === 'guard' ? 0x808080
      : 0x555577;

    this._dialogueBox.show(
      npc.name,
      `Hello, traveler. Welcome to ${this._areaName}.`,
      [],
      { color: npcColor },
      undefined,
      () => {
        this._dialogueBox.hide();
      },
    );
  }

  // ------------------------------------------------------------------
  // Menu
  // ------------------------------------------------------------------

  private _showMenu(): void {
    const options: MenuOption[] = [
      { label: 'Resume', action: () => this._menuSystem.hide() },
      {
        label: 'Inventory',
        action: () => {
          this._menuSystem.hide();
          void import('@/scenes/InventoryScene').then(({ InventoryScene }) => {
            void this.engine.scenes.push(new InventoryScene(), new FadeTransition(0.3));
          });
        },
      },
      {
        label: 'Spell Book',
        action: () => {
          this._menuSystem.hide();
          void import('@/scenes/SpellBookScene').then(({ SpellBookScene }) => {
            void this.engine.scenes.push(new SpellBookScene(), new FadeTransition(0.3));
          });
        },
      },
      {
        label: 'Quest Log',
        action: () => {
          this._menuSystem.hide();
          void import('@/scenes/QuestLogScene').then(({ QuestLogScene }) => {
            void this.engine.scenes.push(new QuestLogScene(), new FadeTransition(0.3));
          });
        },
      },
      {
        label: 'Map',
        action: () => {
          this._menuSystem.hide();
          void import('@/scenes/MapScene').then(({ MapScene }) => {
            void this.engine.scenes.push(new MapScene(), new FadeTransition(0.3));
          });
        },
      },
      {
        label: 'Save Game',
        action: () => {
          this._menuSystem.hide();
          void import('@/scenes/SaveLoadScene').then(({ SaveLoadScene }) => {
            void this.engine.scenes.push(new SaveLoadScene('save'), new FadeTransition(0.3));
          });
        },
      },
      {
        label: 'Load Game',
        action: () => {
          this._menuSystem.hide();
          void import('@/scenes/SaveLoadScene').then(({ SaveLoadScene }) => {
            void this.engine.scenes.push(new SaveLoadScene('load'), new FadeTransition(0.3));
          });
        },
      },
      {
        label: 'Settings',
        action: () => {
          this._menuSystem.hide();
          void import('@/scenes/SettingsScene').then(({ SettingsScene }) => {
            void this.engine.scenes.push(new SettingsScene(), new FadeTransition(0.3));
          });
        },
      },
      {
        label: 'Quit to Title',
        action: () => {
          this._menuSystem.hide();
          void import('@/scenes/TitleScene').then(({ TitleScene }) => {
            void this.engine.scenes.replace(new TitleScene(), new FadeTransition(0.5));
          });
        },
      },
    ];

    this._menuSystem.show(options);
  }

  // ------------------------------------------------------------------
  // Minimap helpers
  // ------------------------------------------------------------------

  private _buildMinimapColors(): number[][] {
    const step = Math.max(1, Math.floor(this._mapCols / 30));
    const rows: number[][] = [];
    for (let row = 0; row < this._mapRows; row += step) {
      const rowColors: number[] = [];
      for (let col = 0; col < this._mapCols; col += step) {
        rowColors.push(TILE_COLORS[this._tiles[row][col]]);
      }
      rows.push(rowColors);
    }
    return rows;
  }

  // ------------------------------------------------------------------
  // GameState event subscriptions for Notifications
  // ------------------------------------------------------------------

  private _subscribeToEvents(): void {
    const gs = GameState.instance;

    const onQuest = (questId: unknown) => {
      this._notifications.show(`New quest: ${questId}`, 'quest');
    };
    gs.events.on('quest:started', onQuest);
    this._boundEventHandlers.push({ event: 'quest:started', handler: onQuest });

    const onQuestComplete = (questId: unknown) => {
      this._notifications.show(`Quest complete: ${questId}`, 'quest');
    };
    gs.events.on('quest:completed', onQuestComplete);
    this._boundEventHandlers.push({ event: 'quest:completed', handler: onQuestComplete });

    const onLevelUp = (member: unknown) => {
      const m = member as { name?: string; level?: number };
      this._notifications.show(
        `${m.name ?? 'Party member'} reached level ${m.level ?? '?'}!`,
        'levelup',
      );
    };
    gs.events.on('party:levelup', onLevelUp);
    this._boundEventHandlers.push({ event: 'party:levelup', handler: onLevelUp });

    const onRegion = (regionId: unknown) => {
      this._notifications.show(`Entered: ${regionId}`, 'achievement');
    };
    gs.events.on('world:regionChanged', onRegion);
    this._boundEventHandlers.push({ event: 'world:regionChanged', handler: onRegion });

    const onInventory = (itemId: unknown, qty: unknown) => {
      const q = qty as number;
      if (q > 0) {
        this._notifications.show(`Obtained: ${itemId}`, 'item');
      }
    };
    gs.events.on('inventory:changed', onInventory);
    this._boundEventHandlers.push({ event: 'inventory:changed', handler: onInventory });
  }

  private _unsubscribeFromEvents(): void {
    const gs = GameState.instance;
    for (const { event, handler } of this._boundEventHandlers) {
      gs.events.off(event, handler);
    }
    this._boundEventHandlers.length = 0;
  }
}
