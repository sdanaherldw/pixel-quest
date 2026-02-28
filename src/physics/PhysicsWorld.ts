// ============================================================================
// PhysicsWorld.ts — planck-js (Box2D) wrapper for side-scrolling platformer
// physics with fixed timestep, one-way platforms, and collision callbacks.
// ============================================================================

import { World, Body, Vec2, Box, Contact, Fixture } from 'planck-js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Conversion factor: 32 pixels = 1 meter in the physics simulation. */
export const PIXELS_PER_METER = 32;

/** Fixed physics timestep targeting 60 Hz. */
const FIXED_TIMESTEP = 1 / 60;

/** Default gravity for snappy platformer feel (m/s^2). */
const DEFAULT_GRAVITY = 20;

/** Velocity iterations per step (Box2D solver). */
const VELOCITY_ITERATIONS = 8;

/** Position iterations per step (Box2D solver). */
const POSITION_ITERATIONS = 3;

// ---------------------------------------------------------------------------
// Collision categories (bitmask)
// ---------------------------------------------------------------------------

export enum CollisionCategory {
  GROUND = 0x0001,
  PLAYER = 0x0002,
  ENEMY = 0x0004,
  PROJECTILE = 0x0008,
  PLATFORM = 0x0010,
  TRIGGER = 0x0020,
  ITEM = 0x0040,
}

// ---------------------------------------------------------------------------
// PhysicsBodyDef
// ---------------------------------------------------------------------------

export interface PhysicsBodyDef {
  x: number;              // pixels
  y: number;              // pixels
  width: number;          // pixels
  height: number;         // pixels
  type: 'static' | 'dynamic' | 'kinematic';
  category: CollisionCategory;
  mask: number;           // collision mask (bitwise OR of CollisionCategory values)
  friction?: number;
  restitution?: number;
  density?: number;
  fixedRotation?: boolean;
  userData?: unknown;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Convert pixel value to meters. */
function px2m(px: number): number {
  return px / PIXELS_PER_METER;
}

/** Convert meter value to pixels. */
function m2px(m: number): number {
  return m * PIXELS_PER_METER;
}

/** Marker key stored on one-way platform fixtures. */
const ONE_WAY_PLATFORM_KEY = '__oneWayPlatform';

/** Marker key for body string ID stored in user data. */
const BODY_ID_KEY = '__physicsBodyId';

/** Extract the string body ID from a planck-js Body. */
function getBodyId(body: Body): string | undefined {
  const ud = body.getUserData() as Record<string, unknown> | null;
  if (ud && typeof ud === 'object' && BODY_ID_KEY in ud) {
    return ud[BODY_ID_KEY] as string;
  }
  return undefined;
}

/** Extract the string body ID from a planck-js Fixture (via its body). */
function getFixtureBodyId(fixture: Fixture): string | undefined {
  return getBodyId(fixture.getBody());
}

/** Check whether a fixture belongs to a one-way platform. */
function isOneWayPlatform(fixture: Fixture): boolean {
  const ud = fixture.getUserData() as Record<string, unknown> | null;
  return ud != null && ud[ONE_WAY_PLATFORM_KEY] === true;
}

// ---------------------------------------------------------------------------
// GroundTracker — per-body ground contact counting
// ---------------------------------------------------------------------------

class GroundTracker {
  /** Maps bodyId -> count of active ground contacts. */
  private counts: Map<string, number> = new Map();

  increment(bodyId: string): void {
    this.counts.set(bodyId, (this.counts.get(bodyId) ?? 0) + 1);
  }

  decrement(bodyId: string): void {
    const current = this.counts.get(bodyId) ?? 0;
    if (current <= 1) {
      this.counts.delete(bodyId);
    } else {
      this.counts.set(bodyId, current - 1);
    }
  }

  isOnGround(bodyId: string): boolean {
    return (this.counts.get(bodyId) ?? 0) > 0;
  }

  remove(bodyId: string): void {
    this.counts.delete(bodyId);
  }

  clear(): void {
    this.counts.clear();
  }
}

// ---------------------------------------------------------------------------
// PhysicsWorld
// ---------------------------------------------------------------------------

export class PhysicsWorld {
  private world: World;
  private bodies: Map<string, Body> = new Map();
  private contactCallbacks: Map<string, (otherId: string, contact: Contact) => void> =
    new Map();
  private groundTracker: GroundTracker = new GroundTracker();
  private accumulator = 0;

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  constructor(gravity?: number) {
    const g = gravity ?? DEFAULT_GRAVITY;
    this.world = new World(Vec2(0, g));

    this.setupContactListener();
  }

  // -----------------------------------------------------------------------
  // Contact listener (begin/end + pre-solve for one-way platforms)
  // -----------------------------------------------------------------------

  private setupContactListener(): void {
    // Pre-solve: disable contacts for one-way platforms when the player is
    // moving upward (jumping through from below).
    this.world.on('pre-solve', (contact: Contact) => {
      const fixtureA = contact.getFixtureA();
      const fixtureB = contact.getFixtureB();

      const aOneWay = isOneWayPlatform(fixtureA);
      const bOneWay = isOneWayPlatform(fixtureB);

      if (!aOneWay && !bOneWay) return;

      // Determine which fixture is the platform and which is the other body
      const platformFixture = aOneWay ? fixtureA : fixtureB;
      const otherFixture = aOneWay ? fixtureB : fixtureA;

      const otherBody = otherFixture.getBody();
      const platformBody = platformFixture.getBody();

      // Get the world manifold to check approach direction
      const worldManifold = contact.getWorldManifold(null);
      if (!worldManifold) {
        return;
      }

      // Get the relative velocity at the contact point.
      // We only want to allow contact when the other body is moving downward
      // (positive Y in our world = downward) and is above the platform.
      const otherPos = otherBody.getPosition();
      const platformPos = platformBody.getPosition();

      // If the other body's bottom is above the platform's top, allow contact.
      // Otherwise, disable it (the body is passing through from below/side).
      const otherHalfH = this.getFixtureHalfHeight(otherFixture);
      const platformHalfH = this.getFixtureHalfHeight(platformFixture);

      const otherBottom = otherPos.y + otherHalfH;
      const platformTop = platformPos.y - platformHalfH;

      // Small tolerance to prevent jittering at the edge
      const tolerance = 0.05;

      // If the body's bottom is significantly above the platform top,
      // and moving downward, allow collision.
      const velocity = otherBody.getLinearVelocity();

      if (otherBottom > platformTop + tolerance || velocity.y < 0) {
        contact.setEnabled(false);
      }
    });

    // Begin contact: track ground contacts and dispatch callbacks.
    this.world.on('begin-contact', (contact: Contact) => {
      const fixtureA = contact.getFixtureA();
      const fixtureB = contact.getFixtureB();

      const idA = getFixtureBodyId(fixtureA);
      const idB = getFixtureBodyId(fixtureB);

      // Ground tracking: if one fixture is GROUND or PLATFORM category, the
      // other body gains a ground contact.
      this.trackGroundContact(fixtureA, fixtureB, idA, idB, true);

      // Dispatch callbacks
      if (idA && idB) {
        const cbA = this.contactCallbacks.get(idA);
        if (cbA) cbA(idB, contact);

        const cbB = this.contactCallbacks.get(idB);
        if (cbB) cbB(idA, contact);
      }
    });

    // End contact: decrement ground contact counts.
    this.world.on('end-contact', (contact: Contact) => {
      const fixtureA = contact.getFixtureA();
      const fixtureB = contact.getFixtureB();

      const idA = getFixtureBodyId(fixtureA);
      const idB = getFixtureBodyId(fixtureB);

      this.trackGroundContact(fixtureA, fixtureB, idA, idB, false);
    });
  }

  /** Increment or decrement ground contact counts for the relevant body. */
  private trackGroundContact(
    fixtureA: Fixture,
    fixtureB: Fixture,
    idA: string | undefined,
    idB: string | undefined,
    isBegin: boolean,
  ): void {
    const catA = fixtureA.getFilterCategoryBits();
    const catB = fixtureB.getFilterCategoryBits();

    const groundCategories =
      CollisionCategory.GROUND | CollisionCategory.PLATFORM;

    // If A is ground/platform, B gets the ground contact (and vice versa).
    if ((catA & groundCategories) !== 0 && idB) {
      if (isBegin) this.groundTracker.increment(idB);
      else this.groundTracker.decrement(idB);
    }

    if ((catB & groundCategories) !== 0 && idA) {
      if (isBegin) this.groundTracker.increment(idA);
      else this.groundTracker.decrement(idA);
    }
  }

  /** Get the half-height of a fixture (assumes Box shape). */
  private getFixtureHalfHeight(fixture: Fixture): number {
    const shape = fixture.getShape();
    if (shape.getType() === 'polygon') {
      // For a Box shape, Box2D stores halfWidth/halfHeight internally.
      // We approximate by checking the AABB.
      const aabb = fixture.getAABB(0);
      if (aabb) {
        const extents = aabb.getExtents();
        return extents.y;
      }
    }
    return 0;
  }

  // -----------------------------------------------------------------------
  // Stepping
  // -----------------------------------------------------------------------

  /**
   * Advance the physics simulation. Uses a fixed timestep accumulator to
   * ensure deterministic physics regardless of frame rate.
   * @param dt - elapsed time in seconds (e.g. from requestAnimationFrame).
   */
  step(dt: number): void {
    // Clamp dt to avoid spiral of death
    const clamped = Math.min(dt, 0.1);
    this.accumulator += clamped;

    while (this.accumulator >= FIXED_TIMESTEP) {
      this.world.step(FIXED_TIMESTEP, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
      this.accumulator -= FIXED_TIMESTEP;
    }
  }

  // -----------------------------------------------------------------------
  // Body creation
  // -----------------------------------------------------------------------

  /**
   * Create a physics body from a definition. Coordinates are in pixels and
   * are converted internally to meters.
   */
  createBody(id: string, def: PhysicsBodyDef): Body {
    // Remove existing body with the same ID if present
    if (this.bodies.has(id)) {
      this.removeBody(id);
    }

    const bodyType =
      def.type === 'static' ? 'static' : def.type === 'kinematic' ? 'kinematic' : 'dynamic';

    const body = this.world.createBody({
      type: bodyType,
      position: Vec2(px2m(def.x), px2m(def.y)),
      fixedRotation: def.fixedRotation ?? (def.type === 'dynamic'),
      userData: {
        [BODY_ID_KEY]: id,
        ...(def.userData != null
          ? typeof def.userData === 'object'
            ? (def.userData as Record<string, unknown>)
            : { value: def.userData }
          : {}),
      },
    });

    const halfW = px2m(def.width) / 2;
    const halfH = px2m(def.height) / 2;

    body.createFixture({
      shape: Box(halfW, halfH),
      density: def.density ?? (def.type === 'dynamic' ? 1.0 : 0),
      friction: def.friction ?? 0.3,
      restitution: def.restitution ?? 0,
      filterCategoryBits: def.category,
      filterMaskBits: def.mask,
    });

    this.bodies.set(id, body);
    return body;
  }

  /** Remove a body from the simulation. */
  removeBody(id: string): void {
    const body = this.bodies.get(id);
    if (body) {
      this.world.destroyBody(body);
      this.bodies.delete(id);
      this.contactCallbacks.delete(id);
      this.groundTracker.remove(id);
    }
  }

  /** Retrieve a body by its string ID. */
  getBody(id: string): Body | undefined {
    return this.bodies.get(id);
  }

  // -----------------------------------------------------------------------
  // Convenience creation methods
  // -----------------------------------------------------------------------

  /**
   * Create a static platform body. If `oneWay` is true, dynamic bodies can
   * jump through it from below.
   */
  createStaticPlatform(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    oneWay?: boolean,
  ): Body {
    // Remove existing body with the same ID if present
    if (this.bodies.has(id)) {
      this.removeBody(id);
    }

    const body = this.world.createBody({
      type: 'static',
      position: Vec2(px2m(x), px2m(y)),
      userData: { [BODY_ID_KEY]: id },
    });

    const halfW = px2m(width) / 2;
    const halfH = px2m(height) / 2;

    const fixture = body.createFixture({
      shape: Box(halfW, halfH),
      density: 0,
      friction: 0.5,
      restitution: 0,
      filterCategoryBits: oneWay ? CollisionCategory.PLATFORM : CollisionCategory.GROUND,
      filterMaskBits: 0xFFFF,
    });

    if (oneWay) {
      fixture.setUserData({ [ONE_WAY_PLATFORM_KEY]: true });
    }

    this.bodies.set(id, body);
    return body;
  }

  /**
   * Create a dynamic body (e.g. player, enemy) with fixed rotation.
   */
  createDynamicBody(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    category: CollisionCategory,
  ): Body {
    return this.createBody(id, {
      x,
      y,
      width,
      height,
      type: 'dynamic',
      category,
      mask: 0xFFFF,
      friction: 0.2,
      restitution: 0,
      density: 1.0,
      fixedRotation: true,
    });
  }

  /**
   * Create a kinematic (script-driven) platform body for moving platforms.
   */
  createKinematicPlatform(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Body {
    // Remove existing body with the same ID if present
    if (this.bodies.has(id)) {
      this.removeBody(id);
    }

    const body = this.world.createBody({
      type: 'kinematic',
      position: Vec2(px2m(x), px2m(y)),
      userData: { [BODY_ID_KEY]: id },
    });

    const halfW = px2m(width) / 2;
    const halfH = px2m(height) / 2;

    body.createFixture({
      shape: Box(halfW, halfH),
      density: 0,
      friction: 0.5,
      restitution: 0,
      filterCategoryBits: CollisionCategory.PLATFORM,
      filterMaskBits: 0xFFFF,
    });

    this.bodies.set(id, body);
    return body;
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  /** Check whether a body is currently touching a ground or platform surface. */
  isOnGround(bodyId: string): boolean {
    return this.groundTracker.isOnGround(bodyId);
  }

  /** Get body position in pixels. */
  getPosition(bodyId: string): { x: number; y: number } {
    const body = this.bodies.get(bodyId);
    if (!body) return { x: 0, y: 0 };
    const pos = body.getPosition();
    return { x: m2px(pos.x), y: m2px(pos.y) };
  }

  /** Set body position in pixels. */
  setPosition(bodyId: string, x: number, y: number): void {
    const body = this.bodies.get(bodyId);
    if (!body) return;
    body.setPosition(Vec2(px2m(x), px2m(y)));
  }

  /** Get body velocity in pixels per second. */
  getVelocity(bodyId: string): { vx: number; vy: number } {
    const body = this.bodies.get(bodyId);
    if (!body) return { vx: 0, vy: 0 };
    const vel = body.getLinearVelocity();
    return { vx: m2px(vel.x), vy: m2px(vel.y) };
  }

  /** Set body velocity in pixels per second. */
  setVelocity(bodyId: string, vx: number, vy: number): void {
    const body = this.bodies.get(bodyId);
    if (!body) return;
    body.setLinearVelocity(Vec2(px2m(vx), px2m(vy)));
  }

  /**
   * Apply a linear impulse to a body. Values are in pixel-mass units
   * (converted internally to meter-mass units).
   */
  applyImpulse(bodyId: string, fx: number, fy: number): void {
    const body = this.bodies.get(bodyId);
    if (!body) return;
    body.applyLinearImpulse(Vec2(px2m(fx), px2m(fy)), body.getWorldCenter());
  }

  // -----------------------------------------------------------------------
  // Callbacks
  // -----------------------------------------------------------------------

  /**
   * Register a callback to be invoked when the specified body begins
   * contact with another body.
   */
  onContact(bodyId: string, callback: (otherId: string, contact: Contact) => void): void {
    this.contactCallbacks.set(bodyId, callback);
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Destroy the entire physics world and release all resources. */
  destroy(): void {
    this.clear();
    // planck-js World doesn't have an explicit destroy, but clearing all
    // bodies effectively frees resources.
  }

  /** Remove all bodies and reset state without destroying the world. */
  clear(): void {
    // Destroy all bodies from the world
    for (const [, body] of this.bodies) {
      this.world.destroyBody(body);
    }
    this.bodies.clear();
    this.contactCallbacks.clear();
    this.groundTracker.clear();
    this.accumulator = 0;
  }
}
