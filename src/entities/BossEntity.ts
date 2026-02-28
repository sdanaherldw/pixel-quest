import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Entity } from '@/engine/ecs/Entity';
import { ComponentType } from '@/engine/ecs/Component';
import type { World } from '@/engine/ecs/World';
import {
  buildEnemyHPBar,
  updateEnemyHPBar as updateBaseHPBar,
  type EnemyBehavior,
  type EnemyStats,
  type EnemySpriteConfig,
} from './EnemyEntity';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Phase definition for a boss encounter. */
export interface BossPhase {
  name: string;
  hpThreshold: number;
  abilities: string[];
  behavior: string;
  enrageTimer?: number;
  statBoost?: Record<string, number>;
  visualChange?: string;
}

/** Data required to create a boss entity. */
export interface BossData {
  id: string;
  name: string;
  level: number;
  stats: EnemyStats;
  behavior: EnemyBehavior;
  abilities: string[];
  lootTable: string;
  sprite: EnemySpriteConfig;
  phases: BossPhase[];
  dialogue?: {
    intro?: string;
    phase2?: string;
    phase3?: string;
    defeat?: string;
  };
}

/** Boss-specific component stored on the entity. */
export interface BossComponent {
  id: string;
  name: string;
  level: number;
  behavior: EnemyBehavior;
  abilities: string[];
  lootTable: string;
  phases: BossPhase[];
  currentPhaseIndex: number;
  dialogue: BossData['dialogue'];
  visual: Container;
  screenHPBar: Container;
  phaseNameText: Text;
  aiState: 'idle' | 'intro' | 'fighting' | 'phase_transition' | 'enraged' | 'defeated';
  aiTimer: number;
  enrageTimer: number;
  animTimer: number;
}

// ---------------------------------------------------------------------------
// Boss visual builders
// ---------------------------------------------------------------------------

type BossVisualBuilder = (root: Container, sprite: EnemySpriteConfig) => void;

const BOSS_VISUAL_BUILDERS: Record<string, BossVisualBuilder> = {
  // ---- Spider Queen: large spider body, glowing red eyes, web particles ----
  spider: (root, sprite) => {
    const gfx = new Graphics();
    const hw = sprite.width / 2;
    const hh = sprite.height / 2;

    // Shadow
    gfx.ellipse(0, hh + 6, hw * 0.6, 6).fill({ color: 0x000000, alpha: 0.3 });

    // Abdomen (large rear section)
    gfx.ellipse(0, 6, hw * 0.55, hh * 0.5).fill(0x2d1b1b);
    gfx.ellipse(0, 6, hw * 0.55, hh * 0.5).stroke({ color: 0x1b0000, width: 2 });

    // Red hourglass pattern on abdomen
    gfx
      .moveTo(-4, 4)
      .lineTo(0, 0)
      .lineTo(4, 4)
      .lineTo(0, 8)
      .closePath()
      .fill(0xcc0000);

    // Cephalothorax (front section)
    gfx.ellipse(0, -hh * 0.25, hw * 0.35, hh * 0.3).fill(0x3e1f1f);
    gfx.ellipse(0, -hh * 0.25, hw * 0.35, hh * 0.3).stroke({ color: 0x1b0000, width: 1.5 });

    // 8 legs (4 per side, long and segmented)
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 4; i++) {
        const baseAngle = (i - 1.5) * 0.35 + Math.PI * 0.5;
        const startX = side * hw * 0.2;
        const startY = -hh * 0.1 + i * 4;
        const kneeX = startX + side * (hw * 0.5 + i * 3);
        const kneeY = startY - 8 + i * 2;
        const tipX = kneeX + side * (hw * 0.3);
        const tipY = hh * 0.6 + i * 2;

        gfx
          .moveTo(startX, startY)
          .lineTo(kneeX, kneeY)
          .lineTo(tipX, tipY)
          .stroke({ color: 0x3e1f1f, width: 2 });

        // Void for lint: baseAngle used for variation.
        void baseAngle;
      }
    }

    // Eyes: cluster of glowing red eyes
    const eyePositions = [
      { x: -6, y: -hh * 0.35, r: 3 },
      { x: 6, y: -hh * 0.35, r: 3 },
      { x: -3, y: -hh * 0.45, r: 2 },
      { x: 3, y: -hh * 0.45, r: 2 },
      { x: -8, y: -hh * 0.3, r: 1.5 },
      { x: 8, y: -hh * 0.3, r: 1.5 },
    ];
    for (const eye of eyePositions) {
      gfx.circle(eye.x, eye.y, eye.r + 1).fill({ color: 0xff0000, alpha: 0.3 });
      gfx.circle(eye.x, eye.y, eye.r).fill(0xff0000);
      gfx.circle(eye.x - 0.5, eye.y - 0.5, eye.r * 0.4).fill(0xffffff);
    }

    // Fangs
    gfx
      .moveTo(-3, -hh * 0.15)
      .lineTo(-2, -hh * 0.15 + 6)
      .lineTo(-1, -hh * 0.15)
      .closePath()
      .fill(0xccccaa);
    gfx
      .moveTo(1, -hh * 0.15)
      .lineTo(2, -hh * 0.15 + 6)
      .lineTo(3, -hh * 0.15)
      .closePath()
      .fill(0xccccaa);

    // Web particle effect (simple radial lines)
    const webGfx = new Graphics();
    webGfx.label = 'web-particles';
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const len = hw * 0.8 + Math.random() * 10;
      webGfx
        .moveTo(0, 0)
        .lineTo(Math.cos(angle) * len, Math.sin(angle) * len)
        .stroke({ color: 0xcccccc, width: 0.5, alpha: 0.15 });
    }
    root.addChild(webGfx);

    root.addChild(gfx);
  },

  // ---- Corrupted Sentinel: massive stone figure, glowing runes ----
  sentinel: (root, sprite) => {
    const gfx = new Graphics();
    const hw = sprite.width / 2;
    const hh = sprite.height / 2;

    // Shadow
    gfx.ellipse(0, hh + 6, hw * 0.5, 6).fill({ color: 0x000000, alpha: 0.3 });

    // Legs (thick stone pillars)
    gfx.rect(-hw * 0.35, hh * 0.3, hw * 0.25, hh * 0.7).fill(0x4a4a4a);
    gfx.rect(hw * 0.1, hh * 0.3, hw * 0.25, hh * 0.7).fill(0x4a4a4a);
    gfx.rect(-hw * 0.35, hh * 0.3, hw * 0.25, hh * 0.7).stroke({ color: 0x333333, width: 1 });
    gfx.rect(hw * 0.1, hh * 0.3, hw * 0.25, hh * 0.7).stroke({ color: 0x333333, width: 1 });

    // Body (massive stone torso)
    gfx.rect(-hw * 0.4, -hh * 0.4, hw * 0.8, hh * 0.7).fill(0x555555);
    gfx.rect(-hw * 0.4, -hh * 0.4, hw * 0.8, hh * 0.7).stroke({ color: 0x333333, width: 2 });

    // Crack lines on body
    gfx.moveTo(-hw * 0.2, -hh * 0.3).lineTo(-hw * 0.1, hh * 0.2).stroke({ color: 0x333333, width: 1 });
    gfx.moveTo(hw * 0.1, -hh * 0.2).lineTo(hw * 0.2, hh * 0.1).stroke({ color: 0x333333, width: 1 });

    // Arms (thick stone blocks)
    gfx.rect(-hw * 0.4 - hw * 0.2, -hh * 0.3, hw * 0.2, hh * 0.5).fill(0x4a4a4a);
    gfx.rect(hw * 0.4, -hh * 0.3, hw * 0.2, hh * 0.5).fill(0x4a4a4a);

    // Head (angular stone helmet)
    gfx
      .moveTo(-hw * 0.25, -hh * 0.4)
      .lineTo(0, -hh * 0.75)
      .lineTo(hw * 0.25, -hh * 0.4)
      .closePath()
      .fill(0x666666);
    gfx
      .moveTo(-hw * 0.25, -hh * 0.4)
      .lineTo(0, -hh * 0.75)
      .lineTo(hw * 0.25, -hh * 0.4)
      .closePath()
      .stroke({ color: 0x333333, width: 2 });

    // Glowing runes on the body
    const runeGfx = new Graphics();
    runeGfx.label = 'runes';
    const runeColor = 0x6a0dad;
    // Rune symbols (simple geometric marks)
    runeGfx.circle(-hw * 0.15, -hh * 0.1, 3).fill({ color: runeColor, alpha: 0.6 });
    runeGfx.circle(hw * 0.15, -hh * 0.1, 3).fill({ color: runeColor, alpha: 0.6 });
    runeGfx.rect(-2, -hh * 0.25, 4, 8).fill({ color: runeColor, alpha: 0.4 });
    // Glow around runes
    runeGfx.circle(-hw * 0.15, -hh * 0.1, 6).fill({ color: runeColor, alpha: 0.15 });
    runeGfx.circle(hw * 0.15, -hh * 0.1, 6).fill({ color: runeColor, alpha: 0.15 });
    root.addChild(runeGfx);

    // Eyes (glowing purple slits)
    gfx.rect(-hw * 0.12, -hh * 0.55, hw * 0.08, 3).fill(0x9b59b6);
    gfx.rect(hw * 0.04, -hh * 0.55, hw * 0.08, 3).fill(0x9b59b6);

    // Crumbling particles container (placeholder)
    const crumbleGfx = new Graphics();
    crumbleGfx.label = 'crumble-particles';
    for (let i = 0; i < 6; i++) {
      const px = (Math.random() - 0.5) * hw;
      const py = hh * 0.3 + Math.random() * 10;
      crumbleGfx.rect(px, py, 2, 2).fill({ color: 0x888888, alpha: 0.4 });
    }
    root.addChild(crumbleGfx);

    root.addChild(gfx);
  },

  // ---- Forest Guardian: huge tree-like form, vine tentacles ----
  guardian: (root, sprite) => {
    const gfx = new Graphics();
    const hw = sprite.width / 2;
    const hh = sprite.height / 2;

    // Shadow
    gfx.ellipse(0, hh + 8, hw * 0.5, 8).fill({ color: 0x000000, alpha: 0.3 });

    // Massive root base
    for (let i = -2; i <= 2; i++) {
      const rx = i * hw * 0.2;
      const rw = 8 + Math.abs(i) * 2;
      gfx.rect(rx - rw / 2, hh * 0.4, rw, hh * 0.6).fill(0x3e2723);
    }

    // Trunk
    gfx.rect(-hw * 0.3, -hh * 0.3, hw * 0.6, hh * 0.7).fill(0x4e342e);
    gfx.rect(-hw * 0.3, -hh * 0.3, hw * 0.6, hh * 0.7).stroke({ color: 0x3e2723, width: 2 });

    // Bark texture
    for (let i = 0; i < 5; i++) {
      const lx = (Math.random() - 0.5) * hw * 0.5;
      const ly = -hh * 0.2 + Math.random() * hh * 0.5;
      gfx.moveTo(lx, ly).lineTo(lx + (Math.random() - 0.5) * 6, ly + 15).stroke({ color: 0x3e2723, width: 1 });
    }

    // Massive crown / canopy
    gfx.circle(0, -hh * 0.45, hw * 0.5).fill(0x1b5e20);
    gfx.circle(-hw * 0.2, -hh * 0.5, hw * 0.35).fill(0x2e7d32);
    gfx.circle(hw * 0.15, -hh * 0.55, hw * 0.3).fill(0x388e3c);
    gfx.circle(-hw * 0.1, -hh * 0.65, hw * 0.2).fill(0x43a047);

    // Vine tentacle arms
    const vineGfx = new Graphics();
    vineGfx.label = 'vine-arms';
    // Left vine
    vineGfx
      .moveTo(-hw * 0.3, -hh * 0.1)
      .bezierCurveTo(-hw * 0.6, -hh * 0.3, -hw * 0.8, 0, -hw * 0.7, hh * 0.2)
      .stroke({ color: 0x2e7d32, width: 4 });
    // Right vine
    vineGfx
      .moveTo(hw * 0.3, -hh * 0.1)
      .bezierCurveTo(hw * 0.6, -hh * 0.3, hw * 0.8, 0, hw * 0.7, hh * 0.2)
      .stroke({ color: 0x2e7d32, width: 4 });

    // Small leaves on vines
    vineGfx.circle(-hw * 0.65, -hh * 0.15, 4).fill(0x43a047);
    vineGfx.circle(-hw * 0.75, hh * 0.1, 3).fill(0x388e3c);
    vineGfx.circle(hw * 0.65, -hh * 0.15, 4).fill(0x43a047);
    vineGfx.circle(hw * 0.75, hh * 0.1, 3).fill(0x388e3c);
    root.addChild(vineGfx);

    // Eyes: ancient amber, large
    gfx.circle(-hw * 0.1, -hh * 0.25, 4).fill({ color: 0xffcc00, alpha: 0.3 });
    gfx.circle(-hw * 0.1, -hh * 0.25, 3).fill(0xffcc00);
    gfx.circle(-hw * 0.11, -hh * 0.26, 1.5).fill(0x000000);

    gfx.circle(hw * 0.1, -hh * 0.25, 4).fill({ color: 0xffcc00, alpha: 0.3 });
    gfx.circle(hw * 0.1, -hh * 0.25, 3).fill(0xffcc00);
    gfx.circle(hw * 0.09, -hh * 0.26, 1.5).fill(0x000000);

    // Nature/corruption dual aura
    const auraGfx = new Graphics();
    auraGfx.label = 'boss-aura';
    // Nature aura (green)
    auraGfx.circle(-hw * 0.2, hh * 0.1, hw * 0.6).fill({ color: 0x00ff00, alpha: 0.05 });
    // Corruption aura (purple)
    auraGfx.circle(hw * 0.2, -hh * 0.1, hw * 0.5).fill({ color: 0x8b00ff, alpha: 0.05 });
    root.addChildAt(auraGfx, 0);

    root.addChild(gfx);
  },
};

// ---------------------------------------------------------------------------
// Boss screen-space HP bar
// ---------------------------------------------------------------------------

/**
 * Build a boss HP bar intended to be displayed at the top of the screen.
 * This is a UI element, not a world-space element.
 *
 * @param bossName   The boss display name.
 * @param screenWidth  The screen width to centre the bar.
 * @returns A Container with the boss HP bar.
 */
function buildBossScreenHPBar(bossName: string, screenWidth: number): Container {
  const container = new Container();
  container.label = 'boss-hp-bar';

  const barWidth = Math.min(500, screenWidth * 0.6);
  const barHeight = 16;
  const barX = (screenWidth - barWidth) / 2;
  const barY = 20;

  // Background
  const bg = new Graphics();
  bg.roundRect(barX - 4, barY - 4, barWidth + 8, barHeight + 8, 4).fill({ color: 0x000000, alpha: 0.7 });
  bg.roundRect(barX, barY, barWidth, barHeight, 3).fill(0x1a0000);
  bg.roundRect(barX, barY, barWidth, barHeight, 3).stroke({ color: 0x660000, width: 1.5 });
  bg.label = 'boss-hp-bg';
  container.addChild(bg);

  // Fill
  const fill = new Graphics();
  fill.roundRect(barX + 1, barY + 1, barWidth - 2, barHeight - 2, 2).fill(0xcc0000);
  fill.label = 'boss-hp-fill';
  container.addChild(fill);

  // Boss name above the bar
  const nameText = new Text({
    text: bossName,
    style: new TextStyle({
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: 14,
      fontWeight: 'bold',
      fill: 0xff4444,
      stroke: { color: 0x000000, width: 3 },
      letterSpacing: 2,
    }),
  });
  nameText.anchor.set(0.5, 1);
  nameText.position.set(screenWidth / 2, barY - 6);
  container.addChild(nameText);

  return container;
}

/**
 * Update the boss screen HP bar to reflect current HP.
 */
export function updateBossScreenHPBar(
  container: Container,
  currentHP: number,
  maxHP: number,
  screenWidth: number,
): void {
  const fill = container.children.find((c) => c.label === 'boss-hp-fill') as Graphics | undefined;
  if (!fill) return;

  const barWidth = Math.min(500, screenWidth * 0.6);
  const barX = (screenWidth - barWidth) / 2;
  const barY = 20;
  const barHeight = 16;

  const pct = Math.max(0, Math.min(1, currentHP / maxHP));
  const fillWidth = (barWidth - 2) * pct;

  let color = 0xcc0000;
  if (pct > 0.6) color = 0xcc0000;
  else if (pct > 0.3) color = 0xcc6600;
  else color = 0xff0000;

  fill.clear();
  if (fillWidth > 0) {
    fill.roundRect(barX + 1, barY + 1, fillWidth, barHeight - 2, 2).fill(color);
    // Highlight on top half.
    fill.roundRect(barX + 2, barY + 2, fillWidth - 2, (barHeight - 4) / 2, 1)
      .fill({ color: 0xffffff, alpha: 0.15 });
  }
}

/**
 * Apply a phase visual change to the boss.
 * This modifies the visual container based on the phase's visualChange key.
 */
export function applyPhaseVisualChange(
  visual: Container,
  phaseChange: string | undefined,
): void {
  if (!phaseChange) return;

  // Remove previous overlays.
  const existing = visual.children.filter((c) => c.label === 'phase-overlay');
  for (const child of existing) {
    visual.removeChild(child);
    child.destroy();
  }

  const overlay = new Graphics();
  overlay.label = 'phase-overlay';

  switch (phaseChange) {
    case 'dark-corruption-overlay':
      // Dark purple overlay.
      overlay.rect(-40, -50, 80, 100).fill({ color: 0x4b0082, alpha: 0.15 });
      break;
    case 'glowing-nature-rage':
      // Green + red pulsing overlay.
      overlay.circle(0, 0, 45).fill({ color: 0x00ff00, alpha: 0.08 });
      overlay.circle(0, -10, 30).fill({ color: 0xff4500, alpha: 0.06 });
      break;
    default:
      break;
  }

  visual.addChild(overlay);
}

// ---------------------------------------------------------------------------
// Boss entity factory
// ---------------------------------------------------------------------------

export const BossEntity = {
  /**
   * Create a boss entity and register it with the world.
   *
   * Bosses are larger versions of enemies with:
   * - Multiple HP bars (single bar with phase indicators)
   * - A screen-space HP bar at the top of the screen
   * - Phase transition support with visual changes
   * - Boss-specific procedural visuals
   *
   * @param world       The ECS world.
   * @param data        Boss creation data.
   * @param x           Initial world X.
   * @param y           Initial world Y.
   * @param screenWidth Screen width for positioning the boss HP bar.
   * @returns The newly created Entity.
   */
  create(
    world: World,
    data: BossData,
    x: number = 0,
    y: number = 0,
    screenWidth: number = 1280,
  ): Entity {
    // Build the boss visual using boss-specific or fallback enemy builders.
    const root = new Container();
    root.label = `boss-${data.id}`;

    const builder = BOSS_VISUAL_BUILDERS[data.sprite.base];
    if (builder) {
      builder(root, data.sprite);
    } else {
      // Fallback: large generic shape.
      const gfx = new Graphics();
      gfx.rect(-data.sprite.width / 2, -data.sprite.height / 2, data.sprite.width, data.sprite.height)
        .fill(0x880000);
      gfx.rect(-data.sprite.width / 2, -data.sprite.height / 2, data.sprite.width, data.sprite.height)
        .stroke({ color: 0x440000, width: 2 });
      root.addChild(gfx);
    }

    // --- World-space HP bar (small, above boss) ---
    const worldHPBar = buildEnemyHPBar(Math.max(30, data.sprite.width * 0.8));
    worldHPBar.y = -(data.sprite.height / 2) - 16;
    root.addChild(worldHPBar);

    // --- Level + name label ---
    const labelText = new Text({
      text: `Lv.${data.level} ${data.name}`,
      style: new TextStyle({
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 11,
        fontWeight: 'bold',
        fill: 0xff4444,
        stroke: { color: 0x000000, width: 3 },
      }),
    });
    labelText.anchor.set(0.5, 1);
    labelText.y = -(data.sprite.height / 2) - 20;
    root.addChild(labelText);

    // --- Screen-space boss HP bar (added to UI, not world) ---
    const screenHPBar = buildBossScreenHPBar(data.name, screenWidth);

    // --- Phase name text (below the screen HP bar) ---
    const phaseNameText = new Text({
      text: data.phases.length > 0 ? data.phases[0].name : '',
      style: new TextStyle({
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 11,
        fill: 0xffaa44,
        stroke: { color: 0x000000, width: 2 },
        letterSpacing: 1,
      }),
    });
    phaseNameText.anchor.set(0.5, 0);
    phaseNameText.position.set(screenWidth / 2, 44);
    screenHPBar.addChild(phaseNameText);

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
        container: root,
        textureId: `boss-${data.sprite.base}-${data.sprite.variant}`,
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
        width: data.sprite.width * 0.9,
        height: data.sprite.height * 0.9,
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
        tags: new Set(['enemy', 'boss', data.id]),
      })
      .addComponent('Boss', {
        id: data.id,
        name: data.name,
        level: data.level,
        behavior: data.behavior,
        abilities: [...data.abilities],
        lootTable: data.lootTable,
        phases: data.phases.map((p) => ({ ...p, abilities: [...p.abilities] })),
        currentPhaseIndex: 0,
        dialogue: data.dialogue ? { ...data.dialogue } : undefined,
        visual: root,
        screenHPBar,
        phaseNameText,
        aiState: 'idle',
        aiTimer: 0,
        enrageTimer: data.phases[0]?.enrageTimer ?? -1,
        animTimer: 0,
      } satisfies BossComponent);

    root.position.set(x, y);

    return entity;
  },
};

// Re-export the base HP bar updater for world-space bars.
export { updateBaseHPBar as updateWorldHPBar };
