import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Entity } from '@/engine/ecs/Entity';
import { ComponentType } from '@/engine/ecs/Component';
import type { World } from '@/engine/ecs/World';
import {
  buildCharacterVisual,
  type ClassId,
  type PlayerStats,
  type EquipmentSlots,
  type FacingDirection,
} from './PlayerEntity';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** AI behavior command for companion. */
export type CompanionCommand =
  | 'follow'
  | 'aggressive'
  | 'defensive'
  | 'hold_position'
  | 'free_roam';

/** Data required to create a companion entity. */
export interface CompanionData {
  id: string;
  name: string;
  classId: ClassId;
  level: number;
  stats: PlayerStats;
  equipment: EquipmentSlots;
  command: CompanionCommand;
}

/** AI behavior component stored on companion entities. */
export interface AIBehaviorComponent {
  command: CompanionCommand;
  targetEntityId: number | null;
  followDistance: number;
  aggroRange: number;
  state: 'idle' | 'following' | 'attacking' | 'returning';
  stateTimer: number;
}

/** Companion-specific component. */
export interface CompanionComponent {
  id: string;
  name: string;
  classId: ClassId;
  level: number;
  stats: PlayerStats;
  equipment: EquipmentSlots;
  facing: FacingDirection;
  walkFrame: number;
  walkTimer: number;
  visual: Container;
  isCragHack: boolean;
}

// ---------------------------------------------------------------------------
// Crag Hack flame particle helpers
// ---------------------------------------------------------------------------

interface FlameParticle {
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

/**
 * Create a container with a subtle flame particle effect for Crag Hack.
 * The particles are simple orange/red Graphics circles that drift upward
 * and fade out.
 */
function createFlameParticleContainer(): Container {
  const container = new Container();
  container.label = 'flame-particles';

  // Pre-spawn a pool of particles (they will be recycled).
  const particles: FlameParticle[] = [];
  const POOL_SIZE = 12;

  for (let i = 0; i < POOL_SIZE; i++) {
    const gfx = new Graphics();
    gfx.circle(0, 0, 2).fill({ color: 0xff4500, alpha: 0.6 });
    gfx.visible = false;
    container.addChild(gfx);

    particles.push({
      gfx,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0,
    });
  }

  // Store particle pool on the container for later update.
  (container as Container & { _particles: FlameParticle[] })._particles = particles;

  return container;
}

/**
 * Tick the flame particle effect.
 *
 * Call each frame with the elapsed dt to animate particles.
 */
export function updateFlameParticles(container: Container, dt: number): void {
  const particles = (container as Container & { _particles?: FlameParticle[] })._particles;
  if (!particles) return;

  for (const p of particles) {
    if (p.life <= 0) {
      // Respawn
      p.x = (Math.random() - 0.5) * 16;
      p.y = (Math.random() - 0.5) * 8 + 4;
      p.vx = (Math.random() - 0.5) * 20;
      p.vy = -(20 + Math.random() * 30);
      p.maxLife = 0.4 + Math.random() * 0.5;
      p.life = p.maxLife;

      // Randomize color between red/orange
      const color = Math.random() > 0.5 ? 0xff4500 : 0xff6600;
      p.gfx.clear();
      p.gfx.circle(0, 0, 1.5 + Math.random() * 1.5).fill({ color, alpha: 0.7 });
      p.gfx.visible = true;
    }

    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const t = Math.max(0, p.life / p.maxLife);
    p.gfx.alpha = t * 0.7;
    p.gfx.position.set(p.x, p.y);

    if (p.life <= 0) {
      p.gfx.visible = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Companion entity factory
// ---------------------------------------------------------------------------

export const CompanionEntity = {
  /**
   * Create a companion entity with AI behavior and register it with the world.
   *
   * Companions are slightly smaller than the player and have a colored aura
   * ring underneath. Crag Hack has a unique larger sprite with flame effects.
   *
   * @param world  The ECS world.
   * @param data   Companion creation data.
   * @param x      Initial world X.
   * @param y      Initial world Y.
   * @returns The newly created Entity.
   */
  create(world: World, data: CompanionData, x: number = 0, y: number = 0): Entity {
    const isCragHack = data.id === 'crag-hack';
    const visualScale = isCragHack ? 1.2 : 0.85;
    const visual = buildCharacterVisual(data.classId, visualScale);

    // --- Class-colored aura ring underneath ---
    const CLASS_AURA_COLORS: Record<ClassId, number> = {
      knight: 0xc0c0c0,
      paladin: 0xffd700,
      ranger: 0x228b22,
      sorcerer: 0x8b00ff,
      cleric: 0xf0f0f0,
      rogue: 0x404040,
      barbarian: 0x8b4513,
    };

    const auraColor = CLASS_AURA_COLORS[data.classId] ?? 0xffffff;
    const aura = new Graphics();
    const auraRadius = isCragHack ? 18 : 12;
    aura.ellipse(0, 14, auraRadius, 5).fill({ color: auraColor, alpha: 0.25 });
    aura.ellipse(0, 14, auraRadius + 2, 6).stroke({ color: auraColor, width: 1 });
    aura.label = 'aura';
    // Add aura behind everything else.
    visual.addChildAt(aura, 0);

    // --- Crag Hack special: larger body with brown/red colors, flame particles ---
    if (isCragHack) {
      // Override body tint with brownish-red.
      // The buildCharacterVisual already uses barbarian brown; add a red overlay.
      const redOverlay = new Graphics();
      redOverlay.rect(-10, -10, 20, 20).fill({ color: 0x8b0000, alpha: 0.15 });
      redOverlay.label = 'crag-overlay';
      visual.addChild(redOverlay);

      // Flame particle container.
      const flames = createFlameParticleContainer();
      visual.addChild(flames);
    }

    // --- Name label above character ---
    const nameLabel = new Text({
      text: data.name,
      style: new TextStyle({
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 9,
        fill: isCragHack ? 0xff8c00 : 0xaaccff,
        stroke: { color: 0x000000, width: 2 },
      }),
    });
    nameLabel.anchor.set(0.5, 1);
    nameLabel.y = isCragHack ? -34 : -24;
    visual.addChild(nameLabel);

    const maxHP = data.stats.con * 8 + data.level * 10;

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
        textureId: `companion-${data.classId}`,
        anchorX: 0.5,
        anchorY: 0.5,
        width: isCragHack ? 36 : 24,
        height: isCragHack ? 48 : 34,
      })
      .addComponent(ComponentType.Health, {
        current: maxHP,
        max: maxHP,
        regenRate: 0.3,
      })
      .addComponent(ComponentType.Collider, {
        type: 'box',
        width: isCragHack ? 28 : 18,
        height: isCragHack ? 36 : 28,
        offsetX: 0,
        offsetY: 4,
        isTrigger: false,
      })
      .addComponent(ComponentType.Input, { controlled: false })
      .addComponent(ComponentType.Animation, {
        currentAnim: 'idle',
        frame: 0,
        elapsed: 0,
        speed: 1,
      })
      .addComponent(ComponentType.Tag, {
        tags: new Set(['companion', isCragHack ? 'crag-hack' : 'party-member']),
      })
      .addComponent('AIBehavior', {
        command: data.command,
        targetEntityId: null,
        followDistance: 60,
        aggroRange: 150,
        state: 'idle',
        stateTimer: 0,
      } satisfies AIBehaviorComponent)
      .addComponent('Companion', {
        id: data.id,
        name: data.name,
        classId: data.classId,
        level: data.level,
        stats: { ...data.stats },
        equipment: { ...data.equipment },
        facing: 'down' as FacingDirection,
        walkFrame: 0,
        walkTimer: 0,
        visual,
        isCragHack,
      } satisfies CompanionComponent);

    visual.position.set(x, y);

    return entity;
  },
};
