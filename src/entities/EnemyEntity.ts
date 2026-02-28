import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Entity } from '@/engine/ecs/Entity';
import { ComponentType } from '@/engine/ecs/Component';
import type { World } from '@/engine/ecs/World';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Enemy behavior patterns. */
export type EnemyBehavior =
  | 'patrol-slow'
  | 'fly-swoop'
  | 'chase-aggressive'
  | 'melee-aggressive'
  | 'melee-tactical'
  | 'ranged-support'
  | 'ranged-dodge'
  | 'ambush-ceiling'
  | 'stationary-guard';

/** Enemy stat block. */
export interface EnemyStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  int?: number;
}

/** Sprite configuration from enemies.json. */
export interface EnemySpriteConfig {
  base: string;
  variant: string;
  width: number;
  height: number;
}

/** Data required to create an enemy entity. */
export interface EnemyData {
  id: string;
  name: string;
  level: number;
  stats: EnemyStats;
  behavior: EnemyBehavior;
  abilities: string[];
  lootTable: string;
  sprite: EnemySpriteConfig;
}

/** Enemy-specific component stored on the entity. */
export interface EnemyComponent {
  id: string;
  name: string;
  level: number;
  behavior: EnemyBehavior;
  abilities: string[];
  lootTable: string;
  visual: Container;
  hpBarContainer: Container;
  aiState: 'idle' | 'patrol' | 'chase' | 'attack' | 'flee' | 'stunned';
  aiTimer: number;
  patrolOriginX: number;
  patrolOriginY: number;
  animTimer: number;
}

// ---------------------------------------------------------------------------
// Enemy visual builders (procedural shapes by type)
// ---------------------------------------------------------------------------

/**
 * Build a procedural enemy visual based on the sprite config "base" field.
 * Each enemy type has a distinct silhouette built from Graphics primitives.
 */
export function buildEnemyVisual(sprite: EnemySpriteConfig): Container {
  const root = new Container();
  root.label = `enemy-${sprite.base}`;

  const builder = ENEMY_VISUAL_BUILDERS[sprite.base];
  if (builder) {
    builder(root, sprite);
  } else {
    // Fallback: generic colored rectangle.
    const gfx = new Graphics();
    gfx.rect(-sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height)
      .fill(0xff0000);
    root.addChild(gfx);
  }

  return root;
}

type VisualBuilder = (root: Container, sprite: EnemySpriteConfig) => void;

const ENEMY_VISUAL_BUILDERS: Record<string, VisualBuilder> = {
  // ---- Slime: wobbly circle (green) ----
  slime: (root, sprite) => {
    const gfx = new Graphics();
    const r = Math.min(sprite.width, sprite.height) / 2;

    // Body: slightly squished circle
    gfx.ellipse(0, 2, r, r * 0.75).fill(0x32cd32);
    gfx.ellipse(0, 2, r, r * 0.75).stroke({ color: 0x228b22, width: 1.5 });

    // Highlight
    gfx.ellipse(-r * 0.3, -r * 0.15, r * 0.25, r * 0.2).fill({ color: 0xffffff, alpha: 0.3 });

    // Eyes: two small dark dots
    gfx.circle(-3, -2, 2).fill(0x111111);
    gfx.circle(3, -2, 2).fill(0x111111);

    // Shadow
    gfx.ellipse(0, r * 0.75 + 3, r * 0.8, 3).fill({ color: 0x000000, alpha: 0.2 });

    root.addChild(gfx);
  },

  // ---- Bat: small triangle with wings (brown) ----
  bat: (root, sprite) => {
    const gfx = new Graphics();
    const hw = sprite.width / 2;
    const hh = sprite.height / 2;

    // Body: small oval
    gfx.ellipse(0, 0, 5, 6).fill(0x4a2a0a);

    // Left wing
    gfx
      .moveTo(-3, -2)
      .lineTo(-hw, -hh)
      .lineTo(-hw + 4, 0)
      .lineTo(-hw, hh * 0.5)
      .lineTo(-3, 3)
      .closePath()
      .fill(0x5c3a1a);

    // Right wing
    gfx
      .moveTo(3, -2)
      .lineTo(hw, -hh)
      .lineTo(hw - 4, 0)
      .lineTo(hw, hh * 0.5)
      .lineTo(3, 3)
      .closePath()
      .fill(0x5c3a1a);

    // Eyes: red dots
    gfx.circle(-2, -2, 1.5).fill(0xff0000);
    gfx.circle(2, -2, 1.5).fill(0xff0000);

    root.addChild(gfx);
  },

  // ---- Wolf: elongated shape with legs (grey) ----
  wolf: (root, sprite) => {
    const gfx = new Graphics();
    const hw = sprite.width / 2;

    // Body: elongated oval
    gfx.ellipse(0, 0, hw, 8).fill(0x808080);
    gfx.ellipse(0, 0, hw, 8).stroke({ color: 0x555555, width: 1 });

    // Head: circle at front
    gfx.circle(hw - 4, -2, 6).fill(0x909090);
    gfx.circle(hw - 4, -2, 6).stroke({ color: 0x555555, width: 1 });

    // Snout
    gfx.ellipse(hw + 2, -1, 4, 3).fill(0x707070);

    // Eyes
    gfx.circle(hw - 2, -4, 1.5).fill(0xffcc00);

    // Ears
    gfx
      .moveTo(hw - 7, -7)
      .lineTo(hw - 4, -12)
      .lineTo(hw - 1, -7)
      .closePath()
      .fill(0x808080);

    // Legs
    const legGfx = new Graphics();
    legGfx.label = 'wolf-legs';
    legGfx.rect(-hw + 4, 6, 3, 8).fill(0x707070);
    legGfx.rect(-hw + 10, 6, 3, 8).fill(0x707070);
    legGfx.rect(hw - 12, 6, 3, 8).fill(0x707070);
    legGfx.rect(hw - 6, 6, 3, 8).fill(0x707070);

    // Tail
    gfx
      .moveTo(-hw, -2)
      .lineTo(-hw - 6, -8)
      .lineTo(-hw - 3, -5)
      .closePath()
      .fill(0x808080);

    // Shadow
    gfx.ellipse(0, 16, hw * 0.7, 3).fill({ color: 0x000000, alpha: 0.2 });

    root.addChild(gfx);
    root.addChild(legGfx);
  },

  // ---- Goblin: small humanoid (green skin) ----
  goblin: (root, _sprite) => {
    const gfx = new Graphics();

    // Shadow
    gfx.ellipse(0, 16, 8, 3).fill({ color: 0x000000, alpha: 0.2 });

    // Legs
    gfx.rect(-4, 6, 3, 8).fill(0x228b22);
    gfx.rect(1, 6, 3, 8).fill(0x228b22);

    // Body
    gfx.rect(-5, -6, 10, 12).fill(0x4a6a1a);
    gfx.rect(-5, -6, 10, 12).stroke({ color: 0x222222, width: 1 });

    // Arms
    gfx.rect(-8, -4, 3, 8).fill(0x228b22);
    gfx.rect(5, -4, 3, 8).fill(0x228b22);

    // Head
    gfx.circle(0, -10, 5).fill(0x32cd32);
    gfx.circle(0, -10, 5).stroke({ color: 0x222222, width: 1 });

    // Eyes (yellow beady)
    gfx.circle(-2, -11, 1.5).fill(0xffff00);
    gfx.circle(2, -11, 1.5).fill(0xffff00);

    // Ears (pointed)
    gfx
      .moveTo(-4, -12)
      .lineTo(-8, -14)
      .lineTo(-5, -10)
      .closePath()
      .fill(0x32cd32);
    gfx
      .moveTo(4, -12)
      .lineTo(8, -14)
      .lineTo(5, -10)
      .closePath()
      .fill(0x32cd32);

    root.addChild(gfx);
  },

  // ---- Spider: round body with 8 legs (dark brown) ----
  spider: (root, sprite) => {
    const gfx = new Graphics();
    const r = Math.min(sprite.width, sprite.height) / 2 - 2;

    // Shadow
    gfx.ellipse(0, r + 4, r * 0.8, 3).fill({ color: 0x000000, alpha: 0.2 });

    // Body: round
    gfx.circle(0, 0, r).fill(0x3e2723);
    gfx.circle(0, 0, r).stroke({ color: 0x1b0000, width: 1 });

    // Abdomen pattern
    gfx.circle(0, 2, r * 0.5).fill({ color: 0x4e342e, alpha: 0.4 });

    // 8 legs (4 per side)
    const legLen = r + 6;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 4; i++) {
        const angle = ((i - 1.5) * 0.4 + (side > 0 ? 0 : Math.PI)) + Math.PI * 0.5;
        const kneeX = Math.cos(angle) * (r - 1) * side;
        const kneeY = Math.sin(angle) * (r - 1);
        const tipX = kneeX + Math.cos(angle + 0.3 * side) * legLen * 0.6;
        const tipY = kneeY + Math.abs(Math.sin(angle)) * legLen * 0.4 + legLen * 0.3;

        gfx
          .moveTo(Math.cos(angle) * r * 0.3 * side, Math.sin(angle) * r * 0.3)
          .lineTo(kneeX, kneeY)
          .lineTo(tipX, tipY)
          .stroke({ color: 0x3e2723, width: 1.5 });
      }
    }

    // Eyes: multiple red dots
    gfx.circle(-3, -r * 0.4, 1.5).fill(0xff0000);
    gfx.circle(3, -r * 0.4, 1.5).fill(0xff0000);
    gfx.circle(-1.5, -r * 0.55, 1).fill(0xff3333);
    gfx.circle(1.5, -r * 0.55, 1).fill(0xff3333);

    root.addChild(gfx);
  },

  // ---- Treant: large trunk with branch arms (dark green) ----
  treant: (root, sprite) => {
    const gfx = new Graphics();
    const hw = sprite.width / 2;
    const hh = sprite.height / 2;

    // Shadow
    gfx.ellipse(0, hh + 4, hw * 0.6, 5).fill({ color: 0x000000, alpha: 0.2 });

    // Roots (legs)
    gfx.rect(-hw * 0.4, hh * 0.5, 6, hh * 0.5).fill(0x5d4037);
    gfx.rect(hw * 0.4 - 6, hh * 0.5, 6, hh * 0.5).fill(0x5d4037);
    gfx.rect(-3, hh * 0.6, 6, hh * 0.4).fill(0x5d4037);

    // Trunk (body)
    gfx.rect(-hw * 0.35, -hh * 0.4, hw * 0.7, hh * 0.9).fill(0x4e342e);
    gfx.rect(-hw * 0.35, -hh * 0.4, hw * 0.7, hh * 0.9).stroke({ color: 0x3e2723, width: 2 });

    // Bark texture lines
    gfx.moveTo(-hw * 0.2, -hh * 0.3).lineTo(-hw * 0.15, hh * 0.3).stroke({ color: 0x3e2723, width: 1 });
    gfx.moveTo(hw * 0.1, -hh * 0.2).lineTo(hw * 0.15, hh * 0.4).stroke({ color: 0x3e2723, width: 1 });

    // Crown (canopy)
    gfx.circle(0, -hh * 0.5, hw * 0.55).fill(0x1b5e20);
    gfx.circle(-hw * 0.2, -hh * 0.45, hw * 0.3).fill(0x2e7d32);
    gfx.circle(hw * 0.15, -hh * 0.55, hw * 0.25).fill(0x388e3c);

    // Branch arms
    gfx.rect(-hw * 0.35 - 10, -hh * 0.15, 12, 5).fill(0x5d4037);
    gfx.rect(hw * 0.35 - 2, -hh * 0.2, 12, 5).fill(0x5d4037);

    // Leaves on branch tips
    gfx.circle(-hw * 0.35 - 12, -hh * 0.15 + 2, 5).fill(0x2e7d32);
    gfx.circle(hw * 0.35 + 12, -hh * 0.2 + 2, 5).fill(0x2e7d32);

    // Eyes: glowing amber dots in trunk
    gfx.circle(-5, -hh * 0.2, 2.5).fill(0xffcc00);
    gfx.circle(5, -hh * 0.2, 2.5).fill(0xffcc00);

    root.addChild(gfx);
  },

  // ---- Corrupted Elf: humanoid with purple glow ----
  elf: (root, _sprite) => {
    const gfx = new Graphics();

    // Purple glow aura
    gfx.circle(0, 0, 18).fill({ color: 0x8b00ff, alpha: 0.1 });

    // Shadow
    gfx.ellipse(0, 18, 8, 3).fill({ color: 0x000000, alpha: 0.2 });

    // Legs
    gfx.rect(-3, 8, 3, 10).fill(0x2d1b4e);
    gfx.rect(1, 8, 3, 10).fill(0x2d1b4e);

    // Body (slender)
    gfx.rect(-5, -8, 10, 16).fill(0x3d2b5e);
    gfx.rect(-5, -8, 10, 16).stroke({ color: 0x6a0dad, width: 1 });

    // Arms
    gfx.rect(-8, -6, 3, 10).fill(0x2d1b4e);
    gfx.rect(5, -6, 3, 10).fill(0x2d1b4e);

    // Head
    gfx.circle(0, -13, 5).fill(0xc8a2c8);
    gfx.circle(0, -13, 5).stroke({ color: 0x6a0dad, width: 1 });

    // Ears (pointed, elven)
    gfx
      .moveTo(-4, -15)
      .lineTo(-10, -18)
      .lineTo(-5, -12)
      .closePath()
      .fill(0xc8a2c8);
    gfx
      .moveTo(4, -15)
      .lineTo(10, -18)
      .lineTo(5, -12)
      .closePath()
      .fill(0xc8a2c8);

    // Eyes (glowing purple)
    gfx.circle(-2, -14, 1.5).fill(0xcc00ff);
    gfx.circle(2, -14, 1.5).fill(0xcc00ff);

    root.addChild(gfx);
  },

  // ---- Bandit: humanoid with dark clothes ----
  human: (root, _sprite) => {
    const gfx = new Graphics();

    // Shadow
    gfx.ellipse(0, 18, 8, 3).fill({ color: 0x000000, alpha: 0.2 });

    // Legs
    gfx.rect(-4, 8, 3, 10).fill(0x333333);
    gfx.rect(1, 8, 3, 10).fill(0x333333);

    // Body
    gfx.rect(-6, -7, 12, 15).fill(0x444444);
    gfx.rect(-6, -7, 12, 15).stroke({ color: 0x222222, width: 1 });

    // Arms
    gfx.rect(-9, -5, 3, 10).fill(0x444444);
    gfx.rect(6, -5, 3, 10).fill(0x444444);

    // Head
    gfx.circle(0, -12, 5).fill(SKIN_COLOR);
    gfx.circle(0, -12, 5).stroke({ color: 0x222222, width: 1 });

    // Mask/hood
    gfx.rect(-5, -14, 10, 4).fill({ color: 0x222222, alpha: 0.7 });

    // Eyes
    gfx.circle(-2, -12, 1.5).fill(0xdddddd);
    gfx.circle(2, -12, 1.5).fill(0xdddddd);

    // Weapon (dagger in hand)
    gfx.rect(8, -3, 2, 10).fill(0xaaaaaa);

    root.addChild(gfx);
  },
};

const SKIN_COLOR = 0xdeb887;

// ---------------------------------------------------------------------------
// HP bar builder
// ---------------------------------------------------------------------------

/**
 * Build a small HP bar to float above an enemy.
 * Returns a Container with a background bar and a fill bar.
 */
export function buildEnemyHPBar(width: number = 30): Container {
  const container = new Container();
  container.label = 'hp-bar';

  const bgBar = new Graphics();
  bgBar.rect(-width / 2, 0, width, 4).fill(0x222222);
  bgBar.rect(-width / 2, 0, width, 4).stroke({ color: 0x000000, width: 1 });
  bgBar.label = 'hp-bg';
  container.addChild(bgBar);

  const fillBar = new Graphics();
  fillBar.rect(-width / 2 + 1, 1, width - 2, 2).fill(0xcc0000);
  fillBar.label = 'hp-fill';
  container.addChild(fillBar);

  return container;
}

/**
 * Update the HP bar fill to reflect current HP percentage.
 */
export function updateEnemyHPBar(
  hpBarContainer: Container,
  currentHP: number,
  maxHP: number,
  barWidth: number = 30,
): void {
  const fillBar = hpBarContainer.children.find(
    (c) => c.label === 'hp-fill',
  ) as Graphics | undefined;

  if (!fillBar) return;

  const pct = Math.max(0, Math.min(1, currentHP / maxHP));
  const innerWidth = (barWidth - 2) * pct;

  // Color based on HP percentage.
  let color = 0xcc0000;
  if (pct > 0.6) color = 0x00cc00;
  else if (pct > 0.3) color = 0xcccc00;

  fillBar.clear();
  if (innerWidth > 0) {
    fillBar.rect(-barWidth / 2 + 1, 1, innerWidth, 2).fill(color);
  }
}

// ---------------------------------------------------------------------------
// Enemy entity factory
// ---------------------------------------------------------------------------

export const EnemyEntity = {
  /**
   * Create an enemy entity and register it with the world.
   *
   * The entity carries:
   *   Transform, Velocity, Sprite, Health, Collider, Animation, Tag, Enemy
   *
   * @param world  The ECS world.
   * @param data   Enemy creation data.
   * @param x      Initial world X.
   * @param y      Initial world Y.
   * @returns The newly created Entity.
   */
  create(world: World, data: EnemyData, x: number = 0, y: number = 0): Entity {
    const visual = buildEnemyVisual(data.sprite);

    // --- HP bar above enemy ---
    const hpBarWidth = Math.max(20, data.sprite.width);
    const hpBar = buildEnemyHPBar(hpBarWidth);
    hpBar.y = -(data.sprite.height / 2) - 10;
    visual.addChild(hpBar);

    // --- Level + name label ---
    const labelText = new Text({
      text: `Lv.${data.level} ${data.name}`,
      style: new TextStyle({
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 8,
        fill: 0xff6666,
        stroke: { color: 0x000000, width: 2 },
      }),
    });
    labelText.anchor.set(0.5, 1);
    labelText.y = -(data.sprite.height / 2) - 14;
    visual.addChild(labelText);

    const entity = world
      .createEntity()
      .addComponent(ComponentType.Transform, {
        x,
        y,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      })
      .addComponent(ComponentType.Velocity, { vx: 0, vy: 0 })
      .addComponent(ComponentType.Sprite, {
        container: visual,
        textureId: `enemy-${data.sprite.base}-${data.sprite.variant}`,
        anchorX: 0.5,
        anchorY: 0.5,
        width: data.sprite.width,
        height: data.sprite.height,
      })
      .addComponent(ComponentType.Health, {
        current: data.stats.hp,
        max: data.stats.hp,
        regenRate: 0,
      })
      .addComponent(ComponentType.Collider, {
        type: 'box',
        width: data.sprite.width * 0.8,
        height: data.sprite.height * 0.8,
        offsetX: 0,
        offsetY: 0,
        isTrigger: false,
      })
      .addComponent(ComponentType.Animation, {
        currentAnim: 'idle',
        frame: 0,
        elapsed: 0,
        speed: 1,
      })
      .addComponent(ComponentType.Tag, {
        tags: new Set(['enemy', data.sprite.base]),
      })
      .addComponent('Enemy', {
        id: data.id,
        name: data.name,
        level: data.level,
        behavior: data.behavior,
        abilities: [...data.abilities],
        lootTable: data.lootTable,
        visual,
        hpBarContainer: hpBar,
        aiState: 'idle',
        aiTimer: 0,
        patrolOriginX: x,
        patrolOriginY: y,
        animTimer: 0,
      } satisfies EnemyComponent);

    visual.position.set(x, y);

    return entity;
  },
};
