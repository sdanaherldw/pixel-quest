import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Entity } from './Entity';
import { World } from './World';
import { System } from './System';
import { Query } from './Query';
import { ComponentType } from './Component';
import type { TransformComponent, VelocityComponent } from './Component';

// ---------------------------------------------------------------------------
// Test system implementations
// ---------------------------------------------------------------------------

class MovementSystem extends System {
  public readonly requiredComponents = [ComponentType.Transform, ComponentType.Velocity] as const;
  public priority = 0;
  public lastEntities: Entity[] = [];

  public update(_dt: number, entities: Entity[]): void {
    this.lastEntities = entities;
    for (const entity of entities) {
      const t = entity.getComponent<typeof ComponentType.Transform>(ComponentType.Transform)!;
      const v = entity.getComponent<typeof ComponentType.Velocity>(ComponentType.Velocity)!;
      (t as TransformComponent).x += (v as VelocityComponent).vx * _dt;
      (t as TransformComponent).y += (v as VelocityComponent).vy * _dt;
    }
  }
}

class HealthSystem extends System {
  public readonly requiredComponents = [ComponentType.Health] as const;
  public priority = 10;
  public updateCount = 0;

  public update(_dt: number, _entities: Entity[]): void {
    this.updateCount++;
  }
}

// ---------------------------------------------------------------------------
// Entity tests
// ---------------------------------------------------------------------------

describe('Entity', () => {
  it('assigns unique IDs', () => {
    const a = new Entity();
    const b = new Entity();
    expect(a.id).not.toBe(b.id);
  });

  it('starts active and not destroyed', () => {
    const e = new Entity();
    expect(e.active).toBe(true);
    expect(e.destroyed).toBe(false);
  });

  describe('component operations', () => {
    it('addComponent / getComponent round-trip', () => {
      const e = new Entity();
      e.addComponent(ComponentType.Transform, {
        x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1,
      });
      const t = e.getComponent(ComponentType.Transform) as TransformComponent;
      expect(t.x).toBe(10);
      expect(t.y).toBe(20);
    });

    it('addComponent supports chaining', () => {
      const e = new Entity();
      const result = e
        .addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
        .addComponent(ComponentType.Velocity, { vx: 1, vy: 2 });
      expect(result).toBe(e);
    });

    it('hasComponent returns true for attached components', () => {
      const e = new Entity();
      e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      expect(e.hasComponent(ComponentType.Transform)).toBe(true);
      expect(e.hasComponent(ComponentType.Velocity)).toBe(false);
    });

    it('hasComponents checks multiple at once', () => {
      const e = new Entity();
      e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      e.addComponent(ComponentType.Velocity, { vx: 0, vy: 0 });
      expect(e.hasComponents(ComponentType.Transform, ComponentType.Velocity)).toBe(true);
      expect(e.hasComponents(ComponentType.Transform, ComponentType.Health)).toBe(false);
    });

    it('removeComponent removes the component', () => {
      const e = new Entity();
      e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      e.removeComponent(ComponentType.Transform);
      expect(e.hasComponent(ComponentType.Transform)).toBe(false);
      expect(e.getComponent(ComponentType.Transform)).toBeUndefined();
    });

    it('removeComponent is a no-op for missing component', () => {
      const e = new Entity();
      // Should not throw
      e.removeComponent(ComponentType.Transform);
    });

    it('version increments on add and remove', () => {
      const e = new Entity();
      const v0 = e.version;
      e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      expect(e.version).toBe(v0 + 1);
      e.removeComponent(ComponentType.Transform);
      expect(e.version).toBe(v0 + 2);
    });

    it('version does not change on no-op remove', () => {
      const e = new Entity();
      const v0 = e.version;
      e.removeComponent('NonExistent');
      expect(e.version).toBe(v0);
    });

    it('componentNames yields all attached component names', () => {
      const e = new Entity();
      e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      e.addComponent(ComponentType.Velocity, { vx: 0, vy: 0 });
      const names = [...e.componentNames];
      expect(names).toContain(ComponentType.Transform);
      expect(names).toContain(ComponentType.Velocity);
    });

    it('componentCount reflects attached count', () => {
      const e = new Entity();
      expect(e.componentCount).toBe(0);
      e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      expect(e.componentCount).toBe(1);
      e.addComponent(ComponentType.Velocity, { vx: 0, vy: 0 });
      expect(e.componentCount).toBe(2);
    });

    it('addComponent replaces existing component data', () => {
      const e = new Entity();
      e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      e.addComponent(ComponentType.Transform, { x: 99, y: 99, rotation: 0, scaleX: 1, scaleY: 1 });
      const t = e.getComponent(ComponentType.Transform) as TransformComponent;
      expect(t.x).toBe(99);
      expect(e.componentCount).toBe(1);
    });
  });

  describe('_createWithId', () => {
    it('creates entity with specific ID', () => {
      const e = Entity._createWithId(42);
      expect(e.id).toBe(42);
      expect(e.active).toBe(true);
      expect(e.destroyed).toBe(false);
      expect(e.componentCount).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Query tests
// ---------------------------------------------------------------------------

describe('Query', () => {
  it('matches entities with required components', () => {
    const q = new Query([ComponentType.Transform, ComponentType.Velocity]);
    const e = new Entity();
    e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    e.addComponent(ComponentType.Velocity, { vx: 0, vy: 0 });
    expect(q.match(e)).toBe(true);
  });

  it('rejects entities missing required components', () => {
    const q = new Query([ComponentType.Transform, ComponentType.Velocity]);
    const e = new Entity();
    e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    expect(q.match(e)).toBe(false);
  });

  it('rejects inactive entities', () => {
    const q = new Query([ComponentType.Transform]);
    const e = new Entity();
    e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    e.active = false;
    expect(q.match(e)).toBe(false);
  });

  it('rejects destroyed entities', () => {
    const q = new Query([ComponentType.Transform]);
    const e = new Entity();
    e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    e.destroyed = true;
    expect(q.match(e)).toBe(false);
  });

  it('respects excluded components', () => {
    const q = new Query([ComponentType.Transform], [ComponentType.Health]);
    const e1 = new Entity();
    e1.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

    const e2 = new Entity();
    e2.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    e2.addComponent(ComponentType.Health, { current: 100, max: 100, regenRate: 0 });

    expect(q.match(e1)).toBe(true);
    expect(q.match(e2)).toBe(false);
  });

  it('execute returns filtered list', () => {
    const q = new Query([ComponentType.Transform]);
    const e1 = new Entity();
    e1.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const e2 = new Entity();
    // e2 has no Transform

    const result = q.execute([e1, e2]);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(e1);
  });

  it('caches results and reuses across calls', () => {
    const q = new Query([ComponentType.Transform]);
    const e = new Entity();
    e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const entities = [e];

    const result1 = q.execute(entities, 1);
    const result2 = q.execute(entities, 1);
    expect(result1).toBe(result2); // same array reference
  });

  it('invalidates cache on structural version change', () => {
    const q = new Query([ComponentType.Transform]);
    const e1 = new Entity();
    e1.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const e2 = new Entity();
    e2.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

    // First execute: only e1
    const result1 = q.execute([e1], 1);
    expect(result1.length).toBe(1);

    // Structural version bumped and entity set changed: now e1 + e2
    const result2 = q.execute([e1, e2], 2);
    expect(result2.length).toBe(2);
  });

  it('explicit invalidate forces rebuild', () => {
    const q = new Query([ComponentType.Transform]);
    const e = new Entity();
    e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

    const result1 = q.execute([e], 1);
    expect(result1.length).toBe(1);

    // Remove the component — without invalidate the cache might be stale
    e.removeComponent(ComponentType.Transform);
    q.invalidate();
    const result2 = q.execute([e], 1);
    expect(result2.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// World tests
// ---------------------------------------------------------------------------

describe('World', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  // -----------------------------------------------------------------------
  // Entity management
  // -----------------------------------------------------------------------

  describe('entity management', () => {
    it('createEntity returns a new entity', () => {
      const e = world.createEntity();
      expect(e).toBeInstanceOf(Entity);
      expect(e.active).toBe(true);
    });

    it('getEntity retrieves by ID', () => {
      const e = world.createEntity();
      expect(world.getEntity(e.id)).toBe(e);
    });

    it('getEntity returns undefined for unknown ID', () => {
      expect(world.getEntity(99999)).toBeUndefined();
    });

    it('entities property lists all registered entities', () => {
      world.createEntity();
      world.createEntity();
      expect(world.entities.length).toBe(2);
    });

    it('entityCount reflects current count', () => {
      expect(world.entityCount).toBe(0);
      world.createEntity();
      expect(world.entityCount).toBe(1);
    });

    it('structuralVersion increments on createEntity', () => {
      const v0 = world.structuralVersion;
      world.createEntity();
      expect(world.structuralVersion).toBe(v0 + 1);
    });
  });

  // -----------------------------------------------------------------------
  // Deferred destruction
  // -----------------------------------------------------------------------

  describe('deferred destruction', () => {
    it('destroyEntity flags entity but does not remove immediately', () => {
      const e = world.createEntity();
      world.destroyEntity(e.id);
      expect(e.destroyed).toBe(true);
      expect(e.active).toBe(false);
      // Still in entities until flush
      expect(world.entityCount).toBe(1);
    });

    it('flushDestroyed removes flagged entities', () => {
      const e = world.createEntity();
      world.destroyEntity(e.id);
      world.flushDestroyed();
      expect(world.entityCount).toBe(0);
      expect(world.getEntity(e.id)).toBeUndefined();
    });

    it('flushDestroyed increments structural version', () => {
      const e = world.createEntity();
      world.destroyEntity(e.id);
      const v = world.structuralVersion;
      world.flushDestroyed();
      expect(world.structuralVersion).toBe(v + 1);
    });

    it('flushDestroyed is a no-op when nothing pending', () => {
      const v = world.structuralVersion;
      world.flushDestroyed();
      expect(world.structuralVersion).toBe(v);
    });

    it('destroyed entity IDs are recycled', () => {
      const e1 = world.createEntity();
      const id1 = e1.id;
      world.destroyEntity(id1);
      world.flushDestroyed();

      const e2 = world.createEntity();
      expect(e2.id).toBe(id1);
    });
  });

  // -----------------------------------------------------------------------
  // Tag index
  // -----------------------------------------------------------------------

  describe('tag index', () => {
    it('indexEntityTags makes entity findable by tag', () => {
      const e = world.createEntity();
      e.addComponent(ComponentType.Tag, { tags: new Set(['player', 'hero']) });
      world.indexEntityTags(e);

      const byPlayer = world.getEntitiesByTag('player');
      expect(byPlayer.length).toBe(1);
      expect(byPlayer[0]).toBe(e);

      const byHero = world.getEntitiesByTag('hero');
      expect(byHero.length).toBe(1);
    });

    it('getEntitiesByTag returns empty for unknown tag', () => {
      expect(world.getEntitiesByTag('nonexistent')).toEqual([]);
    });

    it('destroyEntity removes from tag index', () => {
      const e = world.createEntity();
      e.addComponent(ComponentType.Tag, { tags: new Set(['enemy']) });
      world.indexEntityTags(e);
      expect(world.getEntitiesByTag('enemy').length).toBe(1);

      world.destroyEntity(e.id);
      expect(world.getEntitiesByTag('enemy').length).toBe(0);
    });

    it('getEntitiesByTag excludes inactive/destroyed entities', () => {
      const e = world.createEntity();
      e.addComponent(ComponentType.Tag, { tags: new Set(['npc']) });
      world.indexEntityTags(e);
      e.active = false;
      expect(world.getEntitiesByTag('npc').length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // System management
  // -----------------------------------------------------------------------

  describe('system management', () => {
    it('addSystem registers and sorts by priority', () => {
      const health = new HealthSystem();
      const movement = new MovementSystem();

      // Add health (prio 10) first, then movement (prio 0)
      world.addSystem(health);
      world.addSystem(movement);

      expect(world.systems[0]).toBe(movement); // prio 0 first
      expect(world.systems[1]).toBe(health);   // prio 10 second
    });

    it('addSystem calls init on the system', () => {
      const sys = new MovementSystem();
      const initSpy = vi.spyOn(sys, 'init');
      world.addSystem(sys);
      expect(initSpy).toHaveBeenCalledOnce();
    });

    it('removeSystem calls destroy on the system', () => {
      const sys = new MovementSystem();
      const destroySpy = vi.spyOn(sys, 'destroy');
      world.addSystem(sys);
      world.removeSystem(sys);
      expect(destroySpy).toHaveBeenCalledOnce();
      expect(world.systems.length).toBe(0);
    });

    it('removeSystem is a no-op for unknown system', () => {
      const sys = new MovementSystem();
      world.removeSystem(sys); // should not throw
    });
  });

  // -----------------------------------------------------------------------
  // Update loop
  // -----------------------------------------------------------------------

  describe('update', () => {
    it('passes matching entities to system.update', () => {
      const sys = new MovementSystem();
      world.addSystem(sys);

      const e1 = world.createEntity();
      e1.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      e1.addComponent(ComponentType.Velocity, { vx: 10, vy: 0 });

      world.createEntity(); // no components, should not match

      world.update(1);
      expect(sys.lastEntities.length).toBe(1);
      expect(sys.lastEntities[0]).toBe(e1);
    });

    it('system.update modifies entity components', () => {
      const sys = new MovementSystem();
      world.addSystem(sys);

      const e = world.createEntity();
      e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      e.addComponent(ComponentType.Velocity, { vx: 10, vy: 5 });

      world.update(0.5);
      const t = e.getComponent(ComponentType.Transform) as TransformComponent;
      expect(t.x).toBeCloseTo(5);
      expect(t.y).toBeCloseTo(2.5);
    });

    it('skips disabled systems', () => {
      const sys = new HealthSystem();
      sys.enabled = false;
      world.addSystem(sys);
      world.createEntity().addComponent(ComponentType.Health, { current: 100, max: 100, regenRate: 0 });
      world.update(1);
      expect(sys.updateCount).toBe(0);
    });

    it('flushes destroyed entities at end of update', () => {
      world.addSystem(new MovementSystem());
      const e = world.createEntity();
      e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      e.addComponent(ComponentType.Velocity, { vx: 0, vy: 0 });
      world.destroyEntity(e.id);
      world.update(1);
      expect(world.entityCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Fixed update
  // -----------------------------------------------------------------------

  describe('fixedUpdate', () => {
    it('calls fixedUpdate on systems with matching entities', () => {
      const sys = new MovementSystem();
      const fixedSpy = vi.spyOn(sys, 'fixedUpdate');
      world.addSystem(sys);

      const e = world.createEntity();
      e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      e.addComponent(ComponentType.Velocity, { vx: 0, vy: 0 });

      world.fixedUpdate(1 / 60);
      expect(fixedSpy).toHaveBeenCalledOnce();
    });

    it('does not flush destroyed entities', () => {
      world.addSystem(new MovementSystem());
      const e = world.createEntity();
      e.addComponent(ComponentType.Transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
      e.addComponent(ComponentType.Velocity, { vx: 0, vy: 0 });
      world.destroyEntity(e.id);
      world.fixedUpdate(1 / 60);
      // Entity still registered (pending destroy)
      expect(world.entityCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Clear
  // -----------------------------------------------------------------------

  describe('clear', () => {
    it('removes all entities and systems', () => {
      world.addSystem(new MovementSystem());
      world.addSystem(new HealthSystem());
      world.createEntity();
      world.createEntity();

      world.clear();
      expect(world.entityCount).toBe(0);
      expect(world.systems.length).toBe(0);
    });

    it('calls destroy on all removed systems', () => {
      const sys = new MovementSystem();
      const destroySpy = vi.spyOn(sys, 'destroy');
      world.addSystem(sys);
      world.clear();
      expect(destroySpy).toHaveBeenCalledOnce();
    });

    it('clears tag index', () => {
      const e = world.createEntity();
      e.addComponent(ComponentType.Tag, { tags: new Set(['player']) });
      world.indexEntityTags(e);
      world.clear();
      expect(world.getEntitiesByTag('player')).toEqual([]);
    });
  });
});
