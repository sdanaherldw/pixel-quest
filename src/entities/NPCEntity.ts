import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Entity } from '@/engine/ecs/Entity';
import { ComponentType } from '@/engine/ecs/Component';
import type { World } from '@/engine/ecs/World';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** NPC role determines visual appearance and interaction behavior. */
export type NPCRole =
  | 'quest_giver'
  | 'merchant'
  | 'innkeeper'
  | 'guard'
  | 'villager';

/** Quest indicator state for NPCs. */
export type QuestIndicator = 'none' | 'available' | 'turn_in';

/** Data required to create an NPC entity. */
export interface NPCData {
  id: string;
  name: string;
  dialogueId: string;
  portrait: string;
  position: { x: number; y: number };
  role: NPCRole;
}

/** NPC-specific component stored on the entity. */
export interface NPCComponent {
  id: string;
  name: string;
  dialogueId: string;
  portrait: string;
  role: NPCRole;
  questIndicator: QuestIndicator;
  interactionRadius: number;
  isPlayerInRange: boolean;
  visual: Container;
  indicatorGfx: Container;
  promptText: Text;
}

// ---------------------------------------------------------------------------
// Role-based color mapping
// ---------------------------------------------------------------------------

const ROLE_COLORS: Record<NPCRole, number> = {
  quest_giver: 0xdaa520, // golden
  merchant: 0x228b22,    // green
  innkeeper: 0xcd853f,   // warm brown
  guard: 0x808080,       // grey
  villager: 0x8fbc8f,    // soft green
};

const SKIN_COLOR = 0xdeb887;
const OUTLINE_COLOR = 0x222222;

// ---------------------------------------------------------------------------
// Visual builder
// ---------------------------------------------------------------------------

function buildNPCVisual(role: NPCRole): Container {
  const root = new Container();
  root.label = 'npc-visual';

  const color = ROLE_COLORS[role];
  const bodyW = 12;
  const bodyH = 14;
  const headR = 5;

  // --- Shadow ---
  const shadow = new Graphics();
  shadow.ellipse(0, bodyH / 2 + 8, 8, 3).fill({ color: 0x000000, alpha: 0.2 });
  root.addChild(shadow);

  // --- Legs (static, NPCs don't walk) ---
  const legs = new Graphics();
  legs.rect(-4, bodyH / 2, 3, 8).fill(color);
  legs.rect(1, bodyH / 2, 3, 8).fill(color);
  legs.rect(-4, bodyH / 2, 3, 8).stroke({ color: OUTLINE_COLOR, width: 1 });
  legs.rect(1, bodyH / 2, 3, 8).stroke({ color: OUTLINE_COLOR, width: 1 });
  root.addChild(legs);

  // --- Body ---
  const body = new Graphics();
  body.rect(-bodyW / 2, -bodyH / 2, bodyW, bodyH).fill(color);
  body.rect(-bodyW / 2, -bodyH / 2, bodyW, bodyH).stroke({ color: OUTLINE_COLOR, width: 1 });
  root.addChild(body);

  // --- Arms ---
  const arms = new Graphics();
  arms.rect(-bodyW / 2 - 3, -bodyH / 2 + 2, 3, 10).fill(color);
  arms.rect(bodyW / 2, -bodyH / 2 + 2, 3, 10).fill(color);
  arms.rect(-bodyW / 2 - 3, -bodyH / 2 + 2, 3, 10).stroke({ color: OUTLINE_COLOR, width: 1 });
  arms.rect(bodyW / 2, -bodyH / 2 + 2, 3, 10).stroke({ color: OUTLINE_COLOR, width: 1 });
  root.addChild(arms);

  // --- Head ---
  const head = new Graphics();
  head.circle(0, -bodyH / 2 - headR, headR).fill(SKIN_COLOR);
  head.circle(0, -bodyH / 2 - headR, headR).stroke({ color: OUTLINE_COLOR, width: 1 });
  root.addChild(head);

  // --- Role-specific decorations ---
  const decor = new Graphics();
  switch (role) {
    case 'merchant': {
      // Small sack/bag next to body
      decor.circle(bodyW / 2 + 6, bodyH / 2 - 2, 4).fill(0x8b4513);
      decor.circle(bodyW / 2 + 6, bodyH / 2 - 2, 4).stroke({ color: OUTLINE_COLOR, width: 1 });
      break;
    }
    case 'guard': {
      // Spear on the right side
      decor.rect(bodyW / 2 + 4, -bodyH / 2 - 10, 2, 28).fill(0x666666);
      decor.moveTo(bodyW / 2 + 3, -bodyH / 2 - 10)
        .lineTo(bodyW / 2 + 5, -bodyH / 2 - 16)
        .lineTo(bodyW / 2 + 7, -bodyH / 2 - 10)
        .closePath()
        .fill(0xaaaaaa);
      break;
    }
    case 'innkeeper': {
      // Mug in hand
      decor.rect(-bodyW / 2 - 7, -bodyH / 2 + 6, 4, 5).fill(0x8b4513);
      decor.rect(-bodyW / 2 - 7, -bodyH / 2 + 6, 4, 5).stroke({ color: OUTLINE_COLOR, width: 1 });
      break;
    }
    default:
      break;
  }
  root.addChild(decor);

  return root;
}

// ---------------------------------------------------------------------------
// Quest indicator builder
// ---------------------------------------------------------------------------

function buildQuestIndicator(): Container {
  const container = new Container();
  container.label = 'quest-indicator';
  container.visible = false;

  // The indicator will be drawn dynamically based on state.
  // We just provide the container here.

  return container;
}

/**
 * Update the quest indicator visual.
 *
 * @param indicator  The indicator container.
 * @param state      Current quest indicator state.
 * @param elapsed    Total elapsed time for animation (bob effect).
 */
export function updateQuestIndicator(
  indicator: Container,
  state: QuestIndicator,
  elapsed: number,
): void {
  // Clear old children.
  indicator.removeChildren();

  if (state === 'none') {
    indicator.visible = false;
    return;
  }

  indicator.visible = true;

  const gfx = new Graphics();
  const bobY = Math.sin(elapsed * 3) * 3;
  const y = -38 + bobY;

  if (state === 'available') {
    // Yellow "!" exclamation mark
    const style = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 16,
      fontWeight: 'bold',
      fill: 0xffdd00,
      stroke: { color: 0x000000, width: 3 },
    });
    const text = new Text({ text: '!', style });
    text.anchor.set(0.5, 0.5);
    text.y = y;
    indicator.addChild(text);

    // Subtle glow circle behind it.
    gfx.circle(0, y, 10).fill({ color: 0xffdd00, alpha: 0.15 });
    indicator.addChildAt(gfx, 0);
  } else if (state === 'turn_in') {
    // Silver/blue "?" question mark
    const style = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 16,
      fontWeight: 'bold',
      fill: 0x88bbff,
      stroke: { color: 0x000000, width: 3 },
    });
    const text = new Text({ text: '?', style });
    text.anchor.set(0.5, 0.5);
    text.y = y;
    indicator.addChild(text);

    gfx.circle(0, y, 10).fill({ color: 0x88bbff, alpha: 0.15 });
    indicator.addChildAt(gfx, 0);
  }
}

// ---------------------------------------------------------------------------
// NPC entity factory
// ---------------------------------------------------------------------------

export const NPCEntity = {
  /**
   * Create an NPC entity and register it with the world.
   *
   * The entity carries:
   *   Transform, Sprite, Collider, Tag, NPC
   *
   * NPCs have a circular interaction zone. When the player enters the
   * zone, a "Press E to talk" prompt appears.
   *
   * @param world  The ECS world.
   * @param data   NPC creation data.
   * @returns The newly created Entity.
   */
  create(world: World, data: NPCData): Entity {
    const visual = buildNPCVisual(data.role);
    const indicatorContainer = buildQuestIndicator();
    visual.addChild(indicatorContainer);

    // --- Name label above the head ---
    const nameLabel = new Text({
      text: data.name,
      style: new TextStyle({
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 9,
        fill: ROLE_COLORS[data.role],
        stroke: { color: 0x000000, width: 2 },
      }),
    });
    nameLabel.anchor.set(0.5, 1);
    nameLabel.y = -26;
    visual.addChild(nameLabel);

    // --- "Press E to talk" prompt (hidden by default) ---
    const promptText = new Text({
      text: 'Press E to talk',
      style: new TextStyle({
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 10,
        fill: 0xffffcc,
        stroke: { color: 0x000000, width: 2 },
      }),
    });
    promptText.anchor.set(0.5, 0);
    promptText.y = 28;
    promptText.visible = false;
    visual.addChild(promptText);

    const interactionRadius = 60;

    const entity = world
      .createEntity()
      .addComponent(ComponentType.Transform, {
        x: data.position.x,
        y: data.position.y,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      })
      .addComponent(ComponentType.Sprite, {
        container: visual,
        textureId: `npc-${data.role}`,
        anchorX: 0.5,
        anchorY: 0.5,
        width: 24,
        height: 32,
      })
      .addComponent(ComponentType.Collider, {
        type: 'circle',
        width: interactionRadius * 2,
        height: interactionRadius * 2,
        offsetX: 0,
        offsetY: 0,
        isTrigger: true,
      })
      .addComponent(ComponentType.Tag, {
        tags: new Set(['npc', data.role]),
      })
      .addComponent('NPC', {
        id: data.id,
        name: data.name,
        dialogueId: data.dialogueId,
        portrait: data.portrait,
        role: data.role,
        questIndicator: data.role === 'quest_giver' ? 'available' : 'none',
        interactionRadius,
        isPlayerInRange: false,
        visual,
        indicatorGfx: indicatorContainer,
        promptText,
      } satisfies NPCComponent);

    visual.position.set(data.position.x, data.position.y);

    return entity;
  },
};
