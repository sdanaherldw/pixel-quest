// ---------------------------------------------------------------------------
// ProjectileSystem.ts — Projectile management for ranged attacks and spells
// ---------------------------------------------------------------------------
// Pure TypeScript — no PixiJS dependencies.  Rendering is handled separately.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Enums & Constants
// ---------------------------------------------------------------------------

/** Pre-defined projectile archetypes. */
export enum ProjectileType {
  ARROW = 'arrow',
  FIREBALL = 'fireball',
  ICE_SHARD = 'ice_shard',
  LIGHTNING_BOLT = 'lightning_bolt',
  SHADOW_BOLT = 'shadow_bolt',
  HOLY_BEAM = 'holy_beam',
}

/** Movement behaviour of the projectile. */
export enum ProjectileBehavior {
  STRAIGHT = 'straight',
  HOMING = 'homing',
  ARC = 'arc',
}

/** Default pool size. */
const DEFAULT_POOL_SIZE = 100;
/** Homing turn rate in radians per second. */
const HOMING_TURN_RATE = 4.0;
/** Gravity for arc projectiles (pixels/s^2). */
const ARC_GRAVITY = 400;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Visual description for the rendering layer (consumed, not rendered here). */
export interface ProjectileVisual {
  color: number;
  size: number;
  trailLength: number;
  trailColor: number;
  glow: boolean;
}

/** Target information for homing projectiles. */
export interface HomingTarget {
  x: number;
  y: number;
}

/** A single projectile entity. */
export interface Projectile {
  /** Unique id within the pool. */
  id: number;
  /** Whether this slot is currently in use. */
  active: boolean;

  // -- Spatial --
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  rotation: number;

  // -- Combat --
  damage: number;
  damageType: string; // matches DamageType from CombatManager
  sourceId: string;
  /** Seconds remaining before the projectile expires. */
  lifespan: number;
  /** If true the projectile continues through targets. */
  piercing: boolean;
  /** If true the projectile deals area damage on hit. */
  aoe: boolean;
  aoeRadius: number;

  // -- Behaviour --
  type: ProjectileType;
  behavior: ProjectileBehavior;
  visual: ProjectileVisual;
  /** For homing projectiles, the current target position. */
  homingTarget: HomingTarget | null;

  // -- Callbacks --
  /**
   * Optional callback invoked when the projectile hits a target.
   * Receives the target id and the projectile instance.
   */
  onHit: ((targetId: string, projectile: Projectile) => void) | null;
}

/** Configuration accepted by `spawn()`. */
export interface ProjectileSpawnConfig {
  x: number;
  y: number;
  /** Direction angle in radians. */
  angle: number;
  speed?: number;
  damage: number;
  damageType: string;
  sourceId: string;
  lifespan?: number;
  piercing?: boolean;
  aoe?: boolean;
  aoeRadius?: number;
  type?: ProjectileType;
  behavior?: ProjectileBehavior;
  homingTarget?: HomingTarget | null;
  onHit?: ((targetId: string, projectile: Projectile) => void) | null;
}

/** Collision target — a minimal rectangle that can be tested against. */
export interface CollisionTarget {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The team / group so that friendly-fire can be prevented. */
  team: string;
}

/** Returned when a collision is detected. */
export interface ProjectileHit {
  projectileId: number;
  targetId: string;
  damage: number;
  damageType: string;
  sourceId: string;
  aoe: boolean;
  aoeRadius: number;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Projectile archetype definitions
// ---------------------------------------------------------------------------

interface ProjectileArchetype {
  speed: number;
  behavior: ProjectileBehavior;
  visual: ProjectileVisual;
  lifespan: number;
  piercing: boolean;
  aoe: boolean;
  aoeRadius: number;
}

const ARCHETYPES: Record<ProjectileType, ProjectileArchetype> = {
  [ProjectileType.ARROW]: {
    speed: 500,
    behavior: ProjectileBehavior.STRAIGHT,
    visual: { color: 0x8b4513, size: 4, trailLength: 0, trailColor: 0x000000, glow: false },
    lifespan: 2.0,
    piercing: false,
    aoe: false,
    aoeRadius: 0,
  },
  [ProjectileType.FIREBALL]: {
    speed: 300,
    behavior: ProjectileBehavior.STRAIGHT,
    visual: { color: 0xff4500, size: 10, trailLength: 8, trailColor: 0xff8c00, glow: true },
    lifespan: 3.0,
    piercing: false,
    aoe: true,
    aoeRadius: 48,
  },
  [ProjectileType.ICE_SHARD]: {
    speed: 400,
    behavior: ProjectileBehavior.STRAIGHT,
    visual: { color: 0x00bfff, size: 6, trailLength: 4, trailColor: 0x87cefa, glow: true },
    lifespan: 2.5,
    piercing: true,
    aoe: false,
    aoeRadius: 0,
  },
  [ProjectileType.LIGHTNING_BOLT]: {
    speed: 800,
    behavior: ProjectileBehavior.STRAIGHT,
    visual: { color: 0xffff00, size: 5, trailLength: 12, trailColor: 0xffd700, glow: true },
    lifespan: 1.0,
    piercing: true,
    aoe: false,
    aoeRadius: 0,
  },
  [ProjectileType.SHADOW_BOLT]: {
    speed: 350,
    behavior: ProjectileBehavior.HOMING,
    visual: { color: 0x4b0082, size: 8, trailLength: 10, trailColor: 0x800080, glow: true },
    lifespan: 4.0,
    piercing: false,
    aoe: false,
    aoeRadius: 0,
  },
  [ProjectileType.HOLY_BEAM]: {
    speed: 600,
    behavior: ProjectileBehavior.STRAIGHT,
    visual: { color: 0xfffacd, size: 7, trailLength: 6, trailColor: 0xffffff, glow: true },
    lifespan: 2.0,
    piercing: true,
    aoe: true,
    aoeRadius: 32,
  },
};

// ---------------------------------------------------------------------------
// ProjectileSystem
// ---------------------------------------------------------------------------

/**
 * Manages all in-flight projectiles using an object pool for efficiency.
 *
 * The system is responsible for movement, lifespan, and collision detection.
 * The rendering layer reads position / visual data each frame to draw the
 * projectiles — this class does *not* touch PixiJS.
 */
export class ProjectileSystem {
  // -----------------------------------------------------------------------
  // Pool
  // -----------------------------------------------------------------------

  private readonly _pool: Projectile[];

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  constructor(poolSize: number = DEFAULT_POOL_SIZE) {
    this._pool = [];
    for (let i = 0; i < poolSize; i++) {
      this._pool.push(this.createBlank(i));
    }
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** All currently active projectiles (read-only snapshot). */
  public getActive(): readonly Projectile[] {
    return this._pool.filter((p) => p.active);
  }

  /** Total number of active projectiles. */
  public get activeCount(): number {
    let count = 0;
    for (const p of this._pool) {
      if (p.active) count++;
    }
    return count;
  }

  // -----------------------------------------------------------------------
  // Spawn
  // -----------------------------------------------------------------------

  /**
   * Fire a new projectile.  Returns the projectile instance or `null` if the
   * pool is exhausted.
   */
  public spawn(config: ProjectileSpawnConfig): Projectile | null {
    const slot = this.findInactive();
    if (!slot) return null;

    const type = config.type ?? ProjectileType.ARROW;
    const archetype = ARCHETYPES[type];
    const speed = config.speed ?? archetype.speed;
    const behavior = config.behavior ?? archetype.behavior;

    slot.active = true;
    slot.x = config.x;
    slot.y = config.y;
    slot.rotation = config.angle;
    slot.speed = speed;
    slot.vx = Math.cos(config.angle) * speed;
    slot.vy = Math.sin(config.angle) * speed;
    slot.damage = config.damage;
    slot.damageType = config.damageType;
    slot.sourceId = config.sourceId;
    slot.lifespan = config.lifespan ?? archetype.lifespan;
    slot.piercing = config.piercing ?? archetype.piercing;
    slot.aoe = config.aoe ?? archetype.aoe;
    slot.aoeRadius = config.aoeRadius ?? archetype.aoeRadius;
    slot.type = type;
    slot.behavior = behavior;
    slot.visual = { ...archetype.visual };
    slot.homingTarget = config.homingTarget ?? null;
    slot.onHit = config.onHit ?? null;

    return slot;
  }

  // -----------------------------------------------------------------------
  // Update
  // -----------------------------------------------------------------------

  /**
   * Advance all active projectiles by `dt` seconds.
   */
  public update(dt: number): void {
    for (const p of this._pool) {
      if (!p.active) continue;

      // Tick lifespan
      p.lifespan -= dt;
      if (p.lifespan <= 0) {
        this.deactivate(p);
        continue;
      }

      // Movement based on behavior
      switch (p.behavior) {
        case ProjectileBehavior.STRAIGHT:
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;

        case ProjectileBehavior.HOMING:
          this.updateHoming(p, dt);
          break;

        case ProjectileBehavior.ARC:
          this.updateArc(p, dt);
          break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Collision detection
  // -----------------------------------------------------------------------

  /**
   * Check all active projectiles against the provided list of collision
   * targets.  Returns an array of hits.  Deactivates non-piercing
   * projectiles on hit.
   *
   * For AoE projectiles, all targets within the `aoeRadius` of the impact
   * point are included in the returned hit list.
   *
   * @param targets Collision targets to test against.
   */
  public checkCollisions(targets: CollisionTarget[]): ProjectileHit[] {
    const hits: ProjectileHit[] = [];

    for (const p of this._pool) {
      if (!p.active) continue;

      for (const t of targets) {
        // Don't hit the source
        if (t.id === p.sourceId) continue;

        if (!this.pointInRect(p.x, p.y, t)) continue;

        // Direct hit
        const hit: ProjectileHit = {
          projectileId: p.id,
          targetId: t.id,
          damage: p.damage,
          damageType: p.damageType,
          sourceId: p.sourceId,
          aoe: p.aoe,
          aoeRadius: p.aoeRadius,
          x: p.x,
          y: p.y,
        };
        hits.push(hit);

        // Invoke onHit callback
        if (p.onHit) {
          p.onHit(t.id, p);
        }

        // AoE splash
        if (p.aoe && p.aoeRadius > 0) {
          for (const splash of targets) {
            if (splash.id === t.id) continue;
            if (splash.id === p.sourceId) continue;
            const dist = this.distanceToRect(p.x, p.y, splash);
            if (dist <= p.aoeRadius) {
              hits.push({
                projectileId: p.id,
                targetId: splash.id,
                damage: Math.floor(p.damage * 0.6), // AoE deals 60% damage
                damageType: p.damageType,
                sourceId: p.sourceId,
                aoe: true,
                aoeRadius: p.aoeRadius,
                x: p.x,
                y: p.y,
              });
            }
          }
        }

        // Non-piercing projectiles stop on first hit
        if (!p.piercing) {
          this.deactivate(p);
          break;
        }
      }
    }

    return hits;
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Deactivate all projectiles. */
  public clear(): void {
    for (const p of this._pool) {
      p.active = false;
    }
  }

  /** Deactivate all projectiles from a specific source. */
  public clearBySource(sourceId: string): void {
    for (const p of this._pool) {
      if (p.active && p.sourceId === sourceId) {
        p.active = false;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Render data (consumed by the rendering layer)
  // -----------------------------------------------------------------------

  /**
   * Returns an array of render descriptors for every active projectile.
   * The rendering system iterates this to draw projectiles without coupling
   * to the internal pool structure.
   */
  public getRenderData(): Array<{
    id: number;
    x: number;
    y: number;
    rotation: number;
    visual: ProjectileVisual;
    type: ProjectileType;
  }> {
    const out: Array<{
      id: number;
      x: number;
      y: number;
      rotation: number;
      visual: ProjectileVisual;
      type: ProjectileType;
    }> = [];
    for (const p of this._pool) {
      if (!p.active) continue;
      out.push({
        id: p.id,
        x: p.x,
        y: p.y,
        rotation: p.rotation,
        visual: p.visual,
        type: p.type,
      });
    }
    return out;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /** Create a blank (inactive) projectile for the pool. */
  private createBlank(id: number): Projectile {
    return {
      id,
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      speed: 0,
      rotation: 0,
      damage: 0,
      damageType: 'physical',
      sourceId: '',
      lifespan: 0,
      piercing: false,
      aoe: false,
      aoeRadius: 0,
      type: ProjectileType.ARROW,
      behavior: ProjectileBehavior.STRAIGHT,
      visual: { color: 0x000000, size: 0, trailLength: 0, trailColor: 0x000000, glow: false },
      homingTarget: null,
      onHit: null,
    };
  }

  /** Find the first inactive slot in the pool. */
  private findInactive(): Projectile | null {
    for (const p of this._pool) {
      if (!p.active) return p;
    }
    return null;
  }

  /** Return a projectile to the pool. */
  private deactivate(p: Projectile): void {
    p.active = false;
    p.onHit = null;
    p.homingTarget = null;
  }

  /** Homing movement: steer towards the target position. */
  private updateHoming(p: Projectile, dt: number): void {
    if (p.homingTarget) {
      const dx = p.homingTarget.x - p.x;
      const dy = p.homingTarget.y - p.y;
      const desiredAngle = Math.atan2(dy, dx);

      // Gradually steer
      let angleDiff = desiredAngle - p.rotation;
      // Normalize to [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      const steer = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), HOMING_TURN_RATE * dt);
      p.rotation += steer;
    }

    p.vx = Math.cos(p.rotation) * p.speed;
    p.vy = Math.sin(p.rotation) * p.speed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  /** Arc movement: parabolic trajectory with gravity. */
  private updateArc(p: Projectile, dt: number): void {
    p.vy += ARC_GRAVITY * dt; // gravity
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rotation = Math.atan2(p.vy, p.vx);
  }

  /** Simple point-in-rectangle test. */
  private pointInRect(px: number, py: number, rect: CollisionTarget): boolean {
    return (
      px >= rect.x &&
      px <= rect.x + rect.width &&
      py >= rect.y &&
      py <= rect.y + rect.height
    );
  }

  /** Distance from a point to the nearest edge of a rectangle. */
  private distanceToRect(px: number, py: number, rect: CollisionTarget): number {
    const cx = Math.max(rect.x, Math.min(px, rect.x + rect.width));
    const cy = Math.max(rect.y, Math.min(py, rect.y + rect.height));
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  }
}
