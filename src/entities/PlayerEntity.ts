import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Entity } from '@/engine/ecs/Entity';
import { ComponentType } from '@/engine/ecs/Component';
import type { World } from '@/engine/ecs/World';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Class identifiers matching classes.json. */
export type ClassId =
  | 'knight'
  | 'paladin'
  | 'ranger'
  | 'sorcerer'
  | 'cleric'
  | 'rogue'
  | 'barbarian';

/** Equipment slot snapshot used by the player entity. */
export interface EquipmentSlots {
  weapon?: string;
  offhand?: string;
  armor?: string;
  helmet?: string;
  boots?: string;
  amulet?: string;
  belt?: string;
  accessory1?: string;
  accessory2?: string;
}

/** Spellbook snapshot. */
export interface SpellBook {
  knownSpells: string[];
  equippedSpells: string[];
}

/** Primary stat block for the player. */
export interface PlayerStats {
  str: number;
  int: number;
  wis: number;
  dex: number;
  con: number;
  cha: number;
}

/** Data required to create a player entity. */
export interface PlayerData {
  name: string;
  classId: ClassId;
  level: number;
  stats: PlayerStats;
  equipment: EquipmentSlots;
  spellBook: SpellBook;
}

/** Facing direction enum. */
export type FacingDirection = 'left' | 'right' | 'up' | 'down';

// ---------------------------------------------------------------------------
// Class color mapping
// ---------------------------------------------------------------------------

const CLASS_COLORS: Record<ClassId, number> = {
  knight: 0xc0c0c0, // silver
  paladin: 0xffd700, // gold
  ranger: 0x228b22, // green
  sorcerer: 0x8b00ff, // purple
  cleric: 0xf0f0f0, // white
  rogue: 0x404040, // dark grey
  barbarian: 0x8b4513, // brown
};

const SKIN_COLOR = 0xdeb887;
const OUTLINE_COLOR = 0x000000;

// ---------------------------------------------------------------------------
// Visual builder helpers
// ---------------------------------------------------------------------------

/**
 * Build a procedural character visual using PixiJS Graphics.
 *
 * The visual is a Container with Graphics children representing
 * body, head, arms, legs, and an optional weapon indicator.
 *
 * @param classId  Class identifier for coloring.
 * @param scale    Scale factor (1.0 = standard player size).
 * @returns A Container with the character visual.
 */
export function buildCharacterVisual(
  classId: ClassId,
  scale: number = 1.0,
): Container {
  const root = new Container();
  root.label = 'character-visual';

  const color = CLASS_COLORS[classId] ?? 0xc0c0c0;

  // All measurements are in "local" units; the root is scaled at the end.
  const bodyW = 14;
  const bodyH = 16;
  const headR = 6;
  const armW = 4;
  const armH = 12;
  const legW = 5;
  const legH = 10;

  // --- Shadow ---
  const shadow = new Graphics();
  shadow.ellipse(0, bodyH / 2 + legH + 2, 10, 3).fill({ color: 0x000000, alpha: 0.25 });
  root.addChild(shadow);

  // --- Legs ---
  const leftLeg = new Graphics();
  leftLeg.rect(-legW - 1, bodyH / 2, legW, legH).fill(color);
  leftLeg.rect(-legW - 1, bodyH / 2, legW, legH).stroke({ color: OUTLINE_COLOR, width: 1 });
  leftLeg.label = 'left-leg';
  root.addChild(leftLeg);

  const rightLeg = new Graphics();
  rightLeg.rect(1, bodyH / 2, legW, legH).fill(color);
  rightLeg.rect(1, bodyH / 2, legW, legH).stroke({ color: OUTLINE_COLOR, width: 1 });
  rightLeg.label = 'right-leg';
  root.addChild(rightLeg);

  // --- Body ---
  const body = new Graphics();
  body.rect(-bodyW / 2, -bodyH / 2, bodyW, bodyH).fill(color);
  body.rect(-bodyW / 2, -bodyH / 2, bodyW, bodyH).stroke({ color: OUTLINE_COLOR, width: 1 });
  body.label = 'body';
  root.addChild(body);

  // --- Arms ---
  const leftArm = new Graphics();
  leftArm.rect(-bodyW / 2 - armW, -bodyH / 2 + 2, armW, armH).fill(color);
  leftArm.rect(-bodyW / 2 - armW, -bodyH / 2 + 2, armW, armH).stroke({ color: OUTLINE_COLOR, width: 1 });
  leftArm.label = 'left-arm';
  root.addChild(leftArm);

  const rightArm = new Graphics();
  rightArm.rect(bodyW / 2, -bodyH / 2 + 2, armW, armH).fill(color);
  rightArm.rect(bodyW / 2, -bodyH / 2 + 2, armW, armH).stroke({ color: OUTLINE_COLOR, width: 1 });
  rightArm.label = 'right-arm';
  root.addChild(rightArm);

  // --- Head ---
  const head = new Graphics();
  head.circle(0, -bodyH / 2 - headR, headR).fill(SKIN_COLOR);
  head.circle(0, -bodyH / 2 - headR, headR).stroke({ color: OUTLINE_COLOR, width: 1 });
  head.label = 'head';
  root.addChild(head);

  // --- Weapon indicator (small colored shape on right arm) ---
  const weapon = new Graphics();
  weapon.label = 'weapon';
  if (classId === 'knight' || classId === 'paladin' || classId === 'barbarian') {
    // Sword / axe: small rectangle
    weapon.rect(bodyW / 2 + armW - 1, -bodyH / 2 - 2, 3, 14).fill(0x888888);
    weapon.rect(bodyW / 2 + armW - 1, -bodyH / 2 - 2, 3, 14).stroke({ color: OUTLINE_COLOR, width: 1 });
  } else if (classId === 'ranger') {
    // Bow: small arc
    weapon
      .moveTo(bodyW / 2 + armW + 2, -bodyH / 2)
      .lineTo(bodyW / 2 + armW + 6, -bodyH / 2 + 6)
      .lineTo(bodyW / 2 + armW + 2, -bodyH / 2 + 12)
      .stroke({ color: 0x8b4513, width: 2 });
  } else if (classId === 'sorcerer' || classId === 'cleric') {
    // Staff: tall thin rectangle
    weapon.rect(bodyW / 2 + armW, -bodyH / 2 - 6, 2, 20).fill(0x8b4513);
    weapon.circle(bodyW / 2 + armW + 1, -bodyH / 2 - 8, 3).fill(0x00ccff);
  } else if (classId === 'rogue') {
    // Dagger: small triangle
    weapon
      .moveTo(bodyW / 2 + armW + 1, -bodyH / 2 + 2)
      .lineTo(bodyW / 2 + armW + 5, -bodyH / 2 + 8)
      .lineTo(bodyW / 2 + armW - 1, -bodyH / 2 + 8)
      .closePath()
      .fill(0xcccccc);
  }
  root.addChild(weapon);

  root.scale.set(scale);
  return root;
}

// ---------------------------------------------------------------------------
// Walk animation helper
// ---------------------------------------------------------------------------

/** Frame data for a simple 4-frame walk cycle. */
const WALK_OFFSETS = [
  { leftLegY: 0, rightLegY: 2, leftArmY: 1, rightArmY: -1 },
  { leftLegY: 2, rightLegY: 0, leftArmY: -1, rightArmY: 1 },
  { leftLegY: 0, rightLegY: -2, leftArmY: -1, rightArmY: 1 },
  { leftLegY: -2, rightLegY: 0, leftArmY: 1, rightArmY: -1 },
];

/**
 * Apply a walk animation frame to a character visual built by
 * {@link buildCharacterVisual}.
 *
 * @param visual  The character Container.
 * @param frame   Frame index (0-3). Values are wrapped automatically.
 */
export function applyWalkFrame(visual: Container, frame: number): void {
  const idx = ((frame % 4) + 4) % 4;
  const offsets = WALK_OFFSETS[idx];

  for (const child of visual.children) {
    if (!(child instanceof Graphics)) continue;
    switch (child.label) {
      case 'left-leg':
        child.y = offsets.leftLegY;
        break;
      case 'right-leg':
        child.y = offsets.rightLegY;
        break;
      case 'left-arm':
        child.y = offsets.leftArmY;
        break;
      case 'right-arm':
      case 'weapon':
        child.y = offsets.rightArmY;
        break;
    }
  }
}

/**
 * Apply a directional facing to a character visual.
 *
 * - left/right: flip scaleX.
 * - up/down: no horizontal flip (sprite always faces camera in top-down).
 *
 * @param visual    The character Container.
 * @param direction Facing direction.
 */
export function applyFacing(visual: Container, direction: FacingDirection): void {
  switch (direction) {
    case 'left':
      visual.scale.x = -Math.abs(visual.scale.x);
      break;
    case 'right':
      visual.scale.x = Math.abs(visual.scale.x);
      break;
    case 'up':
    case 'down':
      // Keep the current horizontal scale; up/down doesn't flip.
      break;
  }
}

// ---------------------------------------------------------------------------
// Player entity factory
// ---------------------------------------------------------------------------

/** Extra data stored on the entity as a custom component. */
export interface PlayerComponent {
  name: string;
  classId: ClassId;
  level: number;
  stats: PlayerStats;
  equipment: EquipmentSlots;
  spellBook: SpellBook;
  facing: FacingDirection;
  walkFrame: number;
  walkTimer: number;
  visual: Container;
}

export const PlayerEntity = {
  /**
   * Create a fully-composed player entity and register it with the world.
   *
   * The entity carries:
   *   Transform, Velocity, Sprite, Health, Collider, Input, Animation, Tag, Player
   *
   * @param world  The ECS world to register the entity in.
   * @param data   Player creation data.
   * @param x      Initial world X position.
   * @param y      Initial world Y position.
   * @returns The newly created Entity.
   */
  create(world: World, data: PlayerData, x: number = 0, y: number = 0): Entity {
    const visual = buildCharacterVisual(data.classId, 1.0);

    // Add a name label above the character.
    const nameLabel = new Text({
      text: data.name,
      style: new TextStyle({
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 10,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 2 },
      }),
    });
    nameLabel.anchor.set(0.5, 1);
    nameLabel.y = -28;
    visual.addChild(nameLabel);

    const maxHP = data.stats.con * 8 + data.level * 12;
    const _maxMP = data.stats.int * 6 + data.stats.wis * 3 + data.level * 5;
    void _maxMP; // reserved for future MP component

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
        textureId: `player-${data.classId}`,
        anchorX: 0.5,
        anchorY: 0.5,
        width: 28,
        height: 40,
      })
      .addComponent(ComponentType.Health, {
        current: maxHP,
        max: maxHP,
        regenRate: 0.5,
      })
      .addComponent(ComponentType.Collider, {
        type: 'box',
        width: 20,
        height: 32,
        offsetX: 0,
        offsetY: 4,
        isTrigger: false,
      })
      .addComponent(ComponentType.Input, { controlled: true })
      .addComponent(ComponentType.Animation, {
        currentAnim: 'idle',
        frame: 0,
        elapsed: 0,
        speed: 1,
      })
      .addComponent(ComponentType.Tag, { tags: new Set(['player']) })
      .addComponent('Player', {
        name: data.name,
        classId: data.classId,
        level: data.level,
        stats: { ...data.stats },
        equipment: { ...data.equipment },
        spellBook: { ...data.spellBook },
        facing: 'down' as FacingDirection,
        walkFrame: 0,
        walkTimer: 0,
        visual,
      } satisfies PlayerComponent);

    // Position the visual in world space.
    visual.position.set(x, y);

    return entity;
  },
};
