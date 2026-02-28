import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';
import { World } from '@/engine/ecs/World';
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
import {
  EnemyEntity,
  updateEnemyHPBar,
  type EnemyData,
  type EnemyComponent,
} from '@/entities/EnemyEntity';

// ---------------------------------------------------------------------------
// Platform definition
// ---------------------------------------------------------------------------

interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Damage number floating text
// ---------------------------------------------------------------------------

interface DamageNumber {
  text: Text;
  x: number;
  y: number;
  vy: number;
  life: number;
}

// ---------------------------------------------------------------------------
// DungeonScene
// ---------------------------------------------------------------------------

/**
 * Side-scrolling dungeon scene with platform-based movement.
 *
 * Features:
 * - Gravity-based physics with ground checks.
 * - Platform layout generation.
 * - Enemy spawning and AI updates.
 * - Jump, attack, and melee combat.
 * - Damage number popups.
 * - Parallax background layers.
 * - Exit portal back to overworld.
 */
export class DungeonScene extends Scene {
  // ------------------------------------------------------------------
  // World / ECS
  // ------------------------------------------------------------------

  private _world!: World;
  private _playerEntity!: Entity;
  private _enemyEntities: Entity[] = [];

  // ------------------------------------------------------------------
  // Physics constants
  // ------------------------------------------------------------------

  private readonly _gravity: number = 800;
  private readonly _jumpVelocity: number = -350;
  private readonly _moveSpeed: number = 200;

  // ------------------------------------------------------------------
  // Level layout
  // ------------------------------------------------------------------

  private _platforms: Platform[] = [];
  private _platformGfx!: Graphics;
  private _levelWidth: number = 3000;
  private _levelHeight: number = 800;

  // ------------------------------------------------------------------
  // Exit zone
  // ------------------------------------------------------------------

  private _exitZone: Platform = { x: 0, y: 0, width: 0, height: 0 };
  private _exitGfx!: Graphics;

  // ------------------------------------------------------------------
  // Player state
  // ------------------------------------------------------------------

  private _isGrounded: boolean = false;
  private _prevPlayerX: number = 0;
  private _prevPlayerY: number = 0;

  // ------------------------------------------------------------------
  // Visual
  // ------------------------------------------------------------------

  private _bgLayers: Graphics[] = [];
  private _damageNumbers: DamageNumber[] = [];
  private _damageContainer!: Container;

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------

  private _uiContainer!: Container;
  private _dungeonNameText!: Text;
  private _playerHPBar!: Container;

  // ------------------------------------------------------------------
  // Config
  // ------------------------------------------------------------------

  private _elapsed: number = 0;
  private _playerData: PlayerData;

  constructor(playerData?: PlayerData) {
    super('DungeonScene');
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
    this._world = new World();

    // --- Parallax background layers ---
    this._buildBackground();

    // --- Generate platforms ---
    this._generatePlatforms();
    this._platformGfx = new Graphics();
    this._drawPlatforms();
    this.container.addChild(this._platformGfx);

    // --- Exit zone ---
    this._exitZone = {
      x: this._levelWidth - 80,
      y: this._levelHeight - 200,
      width: 64,
      height: 80,
    };
    this._exitGfx = new Graphics();
    this._drawExitZone();
    this.container.addChild(this._exitGfx);

    // --- Damage number container ---
    this._damageContainer = new Container();
    this._damageContainer.label = 'damage-numbers';
    this.container.addChild(this._damageContainer);

    // --- Spawn player ---
    const spawnX = 100;
    const spawnY = this._levelHeight - 200;
    this._playerEntity = PlayerEntity.create(this._world, this._playerData, spawnX, spawnY);

    const playerSprite = this._playerEntity.getComponent(ComponentType.Sprite);
    if (playerSprite?.container) {
      this.container.addChild(playerSprite.container);
    }

    this._prevPlayerX = spawnX;
    this._prevPlayerY = spawnY;

    // --- Spawn enemies ---
    this._spawnEnemies();

    // --- UI ---
    this._buildUI();

    // --- Camera ---
    this.engine.camera.follow(
      { x: spawnX, y: spawnY },
      { lerp: 0.15, deadZoneX: 80, deadZoneY: 40 },
    );
    this.engine.camera.worldBounds = {
      x: 0,
      y: 0,
      width: this._levelWidth,
      height: this._levelHeight,
    };
    this.engine.camera.lookAt(spawnX, spawnY);
  }

  // ------------------------------------------------------------------
  // Fixed update — physics
  // ------------------------------------------------------------------

  public fixedUpdate(dt: number): void {
    this._updatePlayer(dt);
    this._updateEnemies(dt);
    this._checkAttack();
    this._checkExitZone();
  }

  // ------------------------------------------------------------------
  // Update — visual effects
  // ------------------------------------------------------------------

  public update(dt: number): void {
    this._elapsed += dt;

    // Update damage numbers.
    for (let i = this._damageNumbers.length - 1; i >= 0; i--) {
      const dmg = this._damageNumbers[i];
      dmg.life -= dt;
      dmg.y += dmg.vy * dt;
      dmg.vy -= 100 * dt;
      dmg.text.position.set(dmg.x, dmg.y);
      dmg.text.alpha = Math.max(0, dmg.life / 1.0);

      if (dmg.life <= 0) {
        this._damageContainer.removeChild(dmg.text);
        dmg.text.destroy();
        this._damageNumbers.splice(i, 1);
      }
    }

    // Update enemy HP bars.
    for (const enemy of this._enemyEntities) {
      if (enemy.destroyed) continue;
      const health = enemy.getComponent(ComponentType.Health) as HealthComponent;
      const enemyComp = enemy.getComponent('Enemy') as EnemyComponent;
      updateEnemyHPBar(enemyComp.hpBarContainer, health.current, health.max);
    }

    // Update player HP bar UI.
    this._updatePlayerHPBar();
  }

  // ------------------------------------------------------------------
  // Render — interpolation, parallax
  // ------------------------------------------------------------------

  public render(alpha: number): void {
    const transform = this._playerEntity.getComponent(ComponentType.Transform) as TransformComponent;
    const playerComp = this._playerEntity.getComponent('Player') as PlayerComponent;

    // Interpolated position.
    const renderX = this._prevPlayerX + (transform.x - this._prevPlayerX) * alpha;
    const renderY = this._prevPlayerY + (transform.y - this._prevPlayerY) * alpha;
    playerComp.visual.position.set(renderX, renderY);

    // --- Parallax background ---
    const camX = this.engine.camera.x;
    for (let i = 0; i < this._bgLayers.length; i++) {
      const factor = 0.1 + i * 0.15;
      this._bgLayers[i].x = -camX * factor;
    }

    // Layout UI.
    this._layoutUI();
  }

  public async exit(): Promise<void> {
    if (this._uiContainer.parent) {
      this._uiContainer.parent.removeChild(this._uiContainer);
    }
  }

  public override destroy(): void {
    this._world.clear();
    for (const dmg of this._damageNumbers) {
      dmg.text.destroy();
    }
    this._damageNumbers.length = 0;
    super.destroy();
  }

  // ------------------------------------------------------------------
  // Background
  // ------------------------------------------------------------------

  private _buildBackground(): void {
    // Layer 0: deep dark blue gradient (sky).
    const sky = new Graphics();
    const bands = 20;
    const bandH = this._levelHeight / bands;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const r = Math.round(0x08 + (0x15 - 0x08) * t);
      const g = Math.round(0x08 + (0x12 - 0x08) * t);
      const b = Math.round(0x1a + (0x28 - 0x1a) * t);
      const color = (r << 16) | (g << 8) | b;
      sky.rect(0, i * bandH, this._levelWidth * 2, bandH + 1).fill(color);
    }
    this.container.addChild(sky);
    this._bgLayers.push(sky);

    // Layer 1: distant stone wall silhouette.
    const wall1 = new Graphics();
    for (let x = 0; x < this._levelWidth * 1.5; x += 60) {
      const h = 100 + Math.sin(x * 0.02) * 40 + Math.sin(x * 0.005) * 60;
      wall1.rect(x, this._levelHeight - h, 60, h).fill({ color: 0x1a1a25, alpha: 0.5 });
    }
    this.container.addChild(wall1);
    this._bgLayers.push(wall1);

    // Layer 2: closer rock formations.
    const wall2 = new Graphics();
    for (let x = 0; x < this._levelWidth * 1.3; x += 40) {
      const h = 60 + Math.sin(x * 0.03 + 1) * 30 + Math.sin(x * 0.01) * 20;
      wall2.rect(x, this._levelHeight - h, 40, h).fill({ color: 0x222230, alpha: 0.4 });
    }
    this.container.addChild(wall2);
    this._bgLayers.push(wall2);
  }

  // ------------------------------------------------------------------
  // Platform generation
  // ------------------------------------------------------------------

  private _generatePlatforms(): void {
    this._platforms = [];

    // Ground floor.
    this._platforms.push({
      x: 0, y: this._levelHeight - 40,
      width: this._levelWidth, height: 40,
    });

    // Scattered platforms.
    const platformCount = 15;
    for (let i = 0; i < platformCount; i++) {
      const px = 200 + i * (this._levelWidth - 400) / platformCount + (Math.random() - 0.5) * 100;
      const py = this._levelHeight - 120 - Math.random() * 300;
      const pw = 80 + Math.random() * 120;

      this._platforms.push({ x: px, y: py, width: pw, height: 16 });
    }

    // Elevated platforms near the exit.
    this._platforms.push({
      x: this._levelWidth - 300,
      y: this._levelHeight - 180,
      width: 200,
      height: 16,
    });
    this._platforms.push({
      x: this._levelWidth - 200,
      y: this._levelHeight - 300,
      width: 150,
      height: 16,
    });
  }

  private _drawPlatforms(): void {
    const g = this._platformGfx;
    g.clear();

    for (const plat of this._platforms) {
      // Main platform.
      g.rect(plat.x, plat.y, plat.width, plat.height).fill(0x4a4a4a);
      g.rect(plat.x, plat.y, plat.width, plat.height).stroke({ color: 0x333333, width: 1 });

      // Top highlight.
      g.rect(plat.x, plat.y, plat.width, 2).fill(0x666666);

      // Stone texture (simple lines).
      for (let lx = plat.x + 15; lx < plat.x + plat.width; lx += 20 + Math.random() * 10) {
        g.moveTo(lx, plat.y + 2)
          .lineTo(lx, plat.y + plat.height)
          .stroke({ color: 0x3a3a3a, width: 1 });
      }
    }
  }

  private _drawExitZone(): void {
    const g = this._exitGfx;
    g.clear();

    const ez = this._exitZone;

    // Portal effect.
    g.rect(ez.x, ez.y, ez.width, ez.height)
      .fill({ color: 0x8844ff, alpha: 0.15 });
    g.rect(ez.x + 4, ez.y + 4, ez.width - 8, ez.height - 8)
      .fill({ color: 0xaa66ff, alpha: 0.1 });
    g.rect(ez.x, ez.y, ez.width, ez.height)
      .stroke({ color: 0x8844ff, width: 2, alpha: 0.6 });

    // Label.
    const label = new Text({
      text: 'EXIT',
      style: new TextStyle({
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 12,
        fill: 0xaa88ff,
        stroke: { color: 0x000000, width: 2 },
      }),
    });
    label.anchor.set(0.5, 1);
    label.position.set(ez.x + ez.width / 2, ez.y - 4);
    this.container.addChild(label);
  }

  // ------------------------------------------------------------------
  // Player physics
  // ------------------------------------------------------------------

  private _updatePlayer(dt: number): void {
    const input = this.engine.input;
    const transform = this._playerEntity.getComponent(ComponentType.Transform) as TransformComponent;
    const velocity = this._playerEntity.getComponent(ComponentType.Velocity) as VelocityComponent;
    const playerComp = this._playerEntity.getComponent('Player') as PlayerComponent;

    this._prevPlayerX = transform.x;
    this._prevPlayerY = transform.y;

    // --- Horizontal movement ---
    let dx = 0;
    if (input.isActionActive('moveLeft'))  dx -= 1;
    if (input.isActionActive('moveRight')) dx += 1;

    velocity.vx = dx * this._moveSpeed;

    // Facing.
    if (dx < 0) playerComp.facing = 'left';
    else if (dx > 0) playerComp.facing = 'right';

    // --- Gravity ---
    velocity.vy += this._gravity * dt;

    // --- Jump ---
    if (this._isGrounded && input.isActionJustPressed('jump')) {
      velocity.vy = this._jumpVelocity;
      this._isGrounded = false;
    }

    // Apply velocity.
    let newX = transform.x + velocity.vx * dt;
    let newY = transform.y + velocity.vy * dt;

    // --- Platform collision (simple AABB) ---
    const halfW = 8;
    const halfH = 16;
    this._isGrounded = false;

    for (const plat of this._platforms) {
      // Only check if moving downward.
      if (velocity.vy >= 0) {
        const playerBottom = newY + halfH;
        const prevBottom = transform.y + halfH;

        if (
          prevBottom <= plat.y &&
          playerBottom >= plat.y &&
          newX + halfW > plat.x &&
          newX - halfW < plat.x + plat.width
        ) {
          newY = plat.y - halfH;
          velocity.vy = 0;
          this._isGrounded = true;
        }
      }

      // Side collision with thick platforms (ground floor).
      if (plat.height > 20) {
        if (
          newY + halfH > plat.y &&
          newY - halfH < plat.y + plat.height
        ) {
          // Left side.
          if (transform.x + halfW <= plat.x && newX + halfW > plat.x) {
            newX = plat.x - halfW;
            velocity.vx = 0;
          }
          // Right side.
          if (transform.x - halfW >= plat.x + plat.width && newX - halfW < plat.x + plat.width) {
            newX = plat.x + plat.width + halfW;
            velocity.vx = 0;
          }
        }
      }
    }

    // Clamp to level bounds.
    newX = Math.max(halfW, Math.min(this._levelWidth - halfW, newX));
    if (newY > this._levelHeight + 100) {
      // Fell off: respawn at start.
      newX = 100;
      newY = this._levelHeight - 200;
      velocity.vy = 0;
    }

    transform.x = newX;
    transform.y = newY;

    // --- Walk animation ---
    if (Math.abs(dx) > 0 && this._isGrounded) {
      playerComp.walkTimer += dt;
      if (playerComp.walkTimer >= 0.12) {
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

    // Update camera.
    this.engine.camera.follow(
      { x: transform.x, y: transform.y },
      { lerp: 0.15, deadZoneX: 80, deadZoneY: 40 },
    );
  }

  // ------------------------------------------------------------------
  // Enemy AI
  // ------------------------------------------------------------------

  private _spawnEnemies(): void {
    const enemyDefs: Array<{ data: EnemyData; x: number; y: number }> = [
      {
        data: {
          id: 'forest-slime', name: 'Forest Slime', level: 1,
          stats: { hp: 20, atk: 5, def: 2, spd: 1.5 },
          behavior: 'patrol-slow', abilities: [], lootTable: 'slime-common',
          sprite: { base: 'slime', variant: 'green', width: 24, height: 20 },
        },
        x: 500, y: this._levelHeight - 80,
      },
      {
        data: {
          id: 'giant-bat', name: 'Giant Bat', level: 1,
          stats: { hp: 15, atk: 7, def: 1, spd: 4.0 },
          behavior: 'fly-swoop', abilities: ['sonic-screech'], lootTable: 'bat-common',
          sprite: { base: 'bat', variant: 'brown', width: 28, height: 20 },
        },
        x: 800, y: this._levelHeight - 250,
      },
      {
        data: {
          id: 'goblin-raider', name: 'Goblin Raider', level: 3,
          stats: { hp: 45, atk: 12, def: 5, spd: 3.0 },
          behavior: 'melee-aggressive', abilities: ['charge'], lootTable: 'goblin-common',
          sprite: { base: 'goblin', variant: 'raider', width: 24, height: 28 },
        },
        x: 1200, y: this._levelHeight - 80,
      },
      {
        data: {
          id: 'forest-spider', name: 'Forest Spider', level: 2,
          stats: { hp: 25, atk: 9, def: 4, spd: 3.5 },
          behavior: 'ambush-ceiling', abilities: ['web-shot'], lootTable: 'spider-common',
          sprite: { base: 'spider', variant: 'forest', width: 28, height: 24 },
        },
        x: 1800, y: this._levelHeight - 80,
      },
      {
        data: {
          id: 'wolf', name: 'Wolf', level: 2,
          stats: { hp: 30, atk: 10, def: 3, spd: 4.5 },
          behavior: 'chase-aggressive', abilities: ['lunge'], lootTable: 'wolf-common',
          sprite: { base: 'wolf', variant: 'grey', width: 32, height: 24 },
        },
        x: 2200, y: this._levelHeight - 80,
      },
    ];

    for (const def of enemyDefs) {
      const entity = EnemyEntity.create(this._world, def.data, def.x, def.y);
      this._enemyEntities.push(entity);

      const spriteComp = entity.getComponent(ComponentType.Sprite);
      if (spriteComp?.container) {
        this.container.addChild(spriteComp.container);
      }
    }
  }

  private _updateEnemies(dt: number): void {
    const playerTransform = this._playerEntity.getComponent(ComponentType.Transform) as TransformComponent;

    for (const enemy of this._enemyEntities) {
      if (enemy.destroyed) continue;

      const transform = enemy.getComponent(ComponentType.Transform) as TransformComponent;
      const velocity = enemy.getComponent(ComponentType.Velocity) as VelocityComponent;
      const enemyComp = enemy.getComponent('Enemy') as EnemyComponent;
      const health = enemy.getComponent(ComponentType.Health) as HealthComponent;

      // Skip dead enemies.
      if (health.current <= 0) {
        // Remove visual and mark for destruction.
        enemyComp.visual.visible = false;
        this._world.destroyEntity(enemy.id);
        continue;
      }

      // Simple AI based on behavior.
      enemyComp.aiTimer += dt;
      enemyComp.animTimer += dt;

      const distToPlayer = Math.abs(transform.x - playerTransform.x);

      switch (enemyComp.behavior) {
        case 'patrol-slow': {
          // Patrol back and forth around origin.
          const range = 80;
          const offset = Math.sin(enemyComp.aiTimer * 0.5) * range;
          const targetX = enemyComp.patrolOriginX + offset;
          velocity.vx = (targetX - transform.x) * 2;
          velocity.vy = 0;
          break;
        }
        case 'fly-swoop': {
          // Fly in a sine wave, swoop toward player if close.
          const flyY = enemyComp.patrolOriginY + Math.sin(enemyComp.aiTimer * 2) * 30;
          velocity.vy = (flyY - transform.y) * 3;
          if (distToPlayer < 200) {
            velocity.vx = (playerTransform.x - transform.x) > 0 ? 60 : -60;
          } else {
            velocity.vx = Math.sin(enemyComp.aiTimer) * 40;
          }
          break;
        }
        case 'chase-aggressive':
        case 'melee-aggressive': {
          // Chase player if within range.
          if (distToPlayer < 250) {
            const dir = playerTransform.x > transform.x ? 1 : -1;
            velocity.vx = dir * 80;
            enemyComp.aiState = 'chase';
          } else {
            // Return to origin.
            const toOrigin = enemyComp.patrolOriginX - transform.x;
            velocity.vx = Math.sign(toOrigin) * 40;
            enemyComp.aiState = 'patrol';
          }
          // Apply gravity.
          velocity.vy += this._gravity * dt;
          break;
        }
        case 'ambush-ceiling': {
          // Mostly stationary, lunges when player is close.
          if (distToPlayer < 120) {
            velocity.vx = (playerTransform.x - transform.x) * 1.5;
          } else {
            velocity.vx *= 0.9;
          }
          velocity.vy = 0;
          break;
        }
        default: {
          velocity.vx = 0;
          velocity.vy = 0;
          break;
        }
      }

      // Apply velocity (simple, no full platform collision for enemies).
      transform.x += velocity.vx * dt;
      transform.y += velocity.vy * dt;

      // Ground check for ground-based enemies.
      if (enemyComp.behavior !== 'fly-swoop') {
        for (const plat of this._platforms) {
          if (
            transform.y + 14 >= plat.y &&
            transform.y + 14 <= plat.y + plat.height + 10 &&
            transform.x > plat.x &&
            transform.x < plat.x + plat.width
          ) {
            transform.y = plat.y - 14;
            velocity.vy = 0;
            break;
          }
        }
      }

      // Update visual position.
      enemyComp.visual.position.set(transform.x, transform.y);
    }
  }

  // ------------------------------------------------------------------
  // Attack
  // ------------------------------------------------------------------

  private _checkAttack(): void {
    if (!this.engine.input.isActionJustPressed('attack')) return;

    const playerTransform = this._playerEntity.getComponent(ComponentType.Transform) as TransformComponent;
    const playerComp = this._playerEntity.getComponent('Player') as PlayerComponent;

    // Melee hitbox in front of player.
    const attackRange = 40;
    const attackDir = playerComp.facing === 'left' ? -1 : 1;
    const hitboxX = playerTransform.x + attackDir * attackRange / 2;

    // Camera shake for attack feel.
    this.engine.camera.shake({ intensity: 3, duration: 0.1 });

    for (const enemy of this._enemyEntities) {
      if (enemy.destroyed) continue;

      const eTransform = enemy.getComponent(ComponentType.Transform) as TransformComponent;
      const eHealth = enemy.getComponent(ComponentType.Health) as HealthComponent;

      const dist = Math.abs(eTransform.x - hitboxX) + Math.abs(eTransform.y - playerTransform.y);
      if (dist < attackRange + 20) {
        // Deal damage.
        const baseDamage = 8 + playerComp.stats.str * 2;
        const variance = 0.9 + Math.random() * 0.2;
        const damage = Math.round(baseDamage * variance);

        eHealth.current = Math.max(0, eHealth.current - damage);

        // Spawn damage number.
        this._spawnDamageNumber(eTransform.x, eTransform.y - 20, damage, false);

        // Screen shake on kill.
        if (eHealth.current <= 0) {
          this.engine.camera.shake({ intensity: 6, duration: 0.2 });
        }
      }
    }
  }

  private _spawnDamageNumber(x: number, y: number, amount: number, isHeal: boolean): void {
    const color = isHeal ? 0x00ff00 : 0xff4444;
    const text = new Text({
      text: isHeal ? `+${amount}` : `-${amount}`,
      style: new TextStyle({
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 14,
        fontWeight: 'bold',
        fill: color,
        stroke: { color: 0x000000, width: 3 },
      }),
    });
    text.anchor.set(0.5, 0.5);
    text.position.set(x, y);
    this._damageContainer.addChild(text);

    this._damageNumbers.push({
      text,
      x: x + (Math.random() - 0.5) * 10,
      y,
      vy: -80,
      life: 1.0,
    });
  }

  // ------------------------------------------------------------------
  // Exit zone check
  // ------------------------------------------------------------------

  private _checkExitZone(): void {
    const transform = this._playerEntity.getComponent(ComponentType.Transform) as TransformComponent;
    const ez = this._exitZone;

    if (
      transform.x >= ez.x &&
      transform.x <= ez.x + ez.width &&
      transform.y >= ez.y &&
      transform.y <= ez.y + ez.height
    ) {
      this.engine.debug.log('Exiting dungeon...');
      void import('./OverworldScene').then(({ OverworldScene }) => {
        void this.engine.scenes.replace(new OverworldScene(this._playerData));
      });
    }
  }

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------

  private _buildUI(): void {
    this._uiContainer = new Container();
    this._uiContainer.label = 'dungeon-ui';
    this.engine.uiContainer.addChild(this._uiContainer);

    // Dungeon name.
    this._dungeonNameText = new Text({
      text: 'Hollow Oak Caves',
      style: new TextStyle({
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 16,
        fill: 0xccbbaa,
        stroke: { color: 0x000000, width: 3 },
        letterSpacing: 2,
      }),
    });
    this._dungeonNameText.position.set(16, 12);
    this._uiContainer.addChild(this._dungeonNameText);

    // Player HP bar.
    this._playerHPBar = new Container();
    this._playerHPBar.label = 'player-hp-bar';
    this._uiContainer.addChild(this._playerHPBar);

    const health = this._playerEntity.getComponent(ComponentType.Health) as HealthComponent;
    const barWidth = 120;
    const barHeight = 14;

    const bg = new Graphics();
    bg.roundRect(0, 0, barWidth, barHeight, 3).fill(0x1a0000);
    bg.roundRect(0, 0, barWidth, barHeight, 3).stroke({ color: 0x660000, width: 1 });
    this._playerHPBar.addChild(bg);

    const fill = new Graphics();
    fill.roundRect(1, 1, barWidth - 2, barHeight - 2, 2).fill(0x00cc00);
    fill.label = 'hp-fill';
    this._playerHPBar.addChild(fill);

    const hpText = new Text({
      text: `${health.current}/${health.max}`,
      style: new TextStyle({
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 9,
        fill: 0xffffff,
      }),
    });
    hpText.anchor.set(0.5, 0.5);
    hpText.position.set(barWidth / 2, barHeight / 2);
    hpText.label = 'hp-text';
    this._playerHPBar.addChild(hpText);
  }

  private _updatePlayerHPBar(): void {
    const health = this._playerEntity.getComponent(ComponentType.Health) as HealthComponent;
    const barWidth = 120;
    const barHeight = 14;
    const pct = Math.max(0, Math.min(1, health.current / health.max));

    const fill = this._playerHPBar.children.find((c) => c.label === 'hp-fill') as Graphics | undefined;
    const hpText = this._playerHPBar.children.find((c) => c.label === 'hp-text') as Text | undefined;

    if (fill) {
      fill.clear();
      const color = pct > 0.6 ? 0x00cc00 : pct > 0.3 ? 0xcccc00 : 0xcc0000;
      fill.roundRect(1, 1, (barWidth - 2) * pct, barHeight - 2, 2).fill(color);
    }

    if (hpText) {
      hpText.text = `${Math.round(health.current)}/${health.max}`;
    }
  }

  private _layoutUI(): void {
    const w = this.engine.width;

    this._dungeonNameText.position.set(16, 12);
    this._playerHPBar.position.set(16, 36);

    void w;
  }
}
