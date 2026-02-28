import { describe, it, expect, beforeEach } from 'vitest';
import { Entity } from '@/engine/ecs/Entity';
import { World } from '@/engine/ecs/World';
import { Query } from '@/engine/ecs/Query';
import { System } from '@/engine/ecs/System';

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

  it('adds and retrieves a component', () => {
    const e = new Entity();
    e.addComponent('Transform', { x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 });
    expect(e.hasComponent('Transform')).toBe(true);
    const t = e.getComponent('Transform') as { x: number; y: number };
    expect(t.x).toBe(10);
    expect(t.y).toBe(20);
  });

  it('removes a component', () => {
    const e = new Entity();
    e.addComponent('Health', { current: 100, max: 100, regenRate: 0 });
    expect(e.hasComponent('Health')).toBe(true);
    e.removeComponent('Health');
    expect(e.hasComponent('Health')).toBe(false);
    expect(e.getComponent('Health')).toBeUndefined();
  });

  it('increments version on component add/remove', () => {
    const e = new Entity();
    const v0 = e.version;
    e.addComponent('Velocity', { vx: 0, vy: 0 });
    expect(e.version).toBe(v0 + 1);
    e.removeComponent('Velocity');
    expect(e.version).toBe(v0 + 2);
  });

  it('does not increment version on redundant remove', () => {
    const e = new Entity();
    const v0 = e.version;
    e.removeComponent('NonExistent');
    expect(e.version).toBe(v0);
  });

  it('supports chained addComponent calls', () => {
    const e = new Entity();
    e.addComponent('Transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 })
      .addComponent('Velocity', { vx: 1, vy: 2 });
    expect(e.hasComponents('Transform', 'Velocity')).toBe(true);
  });

  it('reports correct componentCount', () => {
    const e = new Entity();
    expect(e.componentCount).toBe(0);
    e.addComponent('Transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    expect(e.componentCount).toBe(1);
    e.addComponent('Velocity', { vx: 0, vy: 0 });
    expect(e.componentCount).toBe(2);
  });

  it('creates entity with recycled ID via _createWithId', () => {
    const recycled = Entity._createWithId(42);
    expect(recycled.id).toBe(42);
    expect(recycled.active).toBe(true);
    expect(recycled.destroyed).toBe(false);
    expect(recycled.componentCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Query tests
// ---------------------------------------------------------------------------

describe('Query', () => {
  it('matches entities with required components', () => {
    const q = new Query(['Transform', 'Velocity']);
    const e = new Entity();
    e.addComponent('Transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    e.addComponent('Velocity', { vx: 0, vy: 0 });
    expect(q.match(e)).toBe(true);
  });

  it('rejects entities missing required components', () => {
    const q = new Query(['Transform', 'Velocity']);
    const e = new Entity();
    e.addComponent('Transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    expect(q.match(e)).toBe(false);
  });

  it('rejects entities with excluded components', () => {
    const q = new Query(['Transform'], ['Dead']);
    const e = new Entity();
    e.addComponent('Transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    e.addComponent('Dead', {});
    expect(q.match(e)).toBe(false);
  });

  it('rejects inactive entities', () => {
    const q = new Query(['Transform']);
    const e = new Entity();
    e.addComponent('Transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    e.active = false;
    expect(q.match(e)).toBe(false);
  });

  it('rejects destroyed entities', () => {
    const q = new Query(['Transform']);
    const e = new Entity();
    e.addComponent('Transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    e.destroyed = true;
    expect(q.match(e)).toBe(false);
  });

  it('caches results across calls when nothing changes', () => {
    const q = new Query(['Transform']);
    const e = new Entity();
    e.addComponent('Transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const entities = [e];

    const first = q.execute(entities);
    const second = q.execute(entities);
    // Should be the same reference (cache hit)
    expect(first).toBe(second);
  });

  it('invalidates cache when entities change', () => {
    const q = new Query(['Transform', 'Velocity']);
    const e = new Entity();
    e.addComponent('Transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const entities = [e];

    const first = q.execute(entities);
    expect(first.length).toBe(0);

    e.addComponent('Velocity', { vx: 1, vy: 1 });
    const second = q.execute(entities);
    expect(second.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// World tests
// ---------------------------------------------------------------------------

class CountingSystem extends System {
  public readonly requiredComponents = ['Transform'] as const;
  public updateCount = 0;
  public fixedUpdateCount = 0;
  public lastEntities: Entity[] = [];

  public update(_dt: number, entities: Entity[]): void {
    this.updateCount++;
    this.lastEntities = entities;
  }

  public override fixedUpdate(_dt: number, entities: Entity[]): void {
    this.fixedUpdateCount++;
    this.lastEntities = entities;
  }
}

describe('World', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  it('creates entities with unique IDs', () => {
    const a = world.createEntity();
    const b = world.createEntity();
    expect(a.id).not.toBe(b.id);
  });

  it('tracks entity count', () => {
    expect(world.entityCount).toBe(0);
    world.createEntity();
    world.createEntity();
    expect(world.entityCount).toBe(2);
  });

  it('retrieves entities by ID', () => {
    const e = world.createEntity();
    expect(world.getEntity(e.id)).toBe(e);
  });

  it('returns undefined for non-existent entity', () => {
    expect(world.getEntity(99999)).toBeUndefined();
  });

  it('defers destruction until flushDestroyed', () => {
    const e = world.createEntity();
    world.destroyEntity(e.id);
    // Still in the map (deferred)
    expect(world.entityCount).toBe(1);
    expect(e.destroyed).toBe(true);

    world.flushDestroyed();
    expect(world.entityCount).toBe(0);
  });

  it('recycles entity IDs after destruction', () => {
    const e1 = world.createEntity();
    const id1 = e1.id;
    world.destroyEntity(id1);
    world.flushDestroyed();

    const e2 = world.createEntity();
    expect(e2.id).toBe(id1);
    expect(e2.active).toBe(true);
    expect(e2.destroyed).toBe(false);
  });

  it('increments structural version on entity create and flush', () => {
    const v0 = world.structuralVersion;
    world.createEntity();
    expect(world.structuralVersion).toBe(v0 + 1);
    world.createEntity();
    expect(world.structuralVersion).toBe(v0 + 2);
  });

  it('runs systems in priority order', () => {
    const order: string[] = [];

    class SysA extends System {
      public readonly requiredComponents: readonly string[] = [];
      public update(): void { order.push('A'); }
    }
    class SysB extends System {
      public readonly requiredComponents: readonly string[] = [];
      public update(): void { order.push('B'); }
    }

    const a = new SysA();
    a.priority = 10;
    const b = new SysB();
    b.priority = 5;

    world.addSystem(a);
    world.addSystem(b);
    world.update(0.016);

    expect(order).toEqual(['B', 'A']);
  });

  it('passes only matching entities to systems', () => {
    const sys = new CountingSystem();
    world.addSystem(sys);

    const e1 = world.createEntity();
    e1.addComponent('Transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

    const e2 = world.createEntity();
    e2.addComponent('Velocity', { vx: 0, vy: 0 });

    world.update(0.016);

    expect(sys.lastEntities.length).toBe(1);
    expect(sys.lastEntities[0].id).toBe(e1.id);
  });

  it('skips disabled systems', () => {
    const sys = new CountingSystem();
    sys.enabled = false;
    world.addSystem(sys);

    world.createEntity().addComponent('Transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    world.update(0.016);

    expect(sys.updateCount).toBe(0);
  });

  it('clears all entities and systems', () => {
    const sys = new CountingSystem();
    world.addSystem(sys);
    world.createEntity();
    world.createEntity();

    world.clear();
    expect(world.entityCount).toBe(0);
    expect(world.systems.length).toBe(0);
  });

  describe('tag index', () => {
    it('looks up entities by tag after indexing', () => {
      const e = world.createEntity();
      e.addComponent('Tag', { tags: new Set(['player', 'hero']) });
      world.indexEntityTags(e);

      const byPlayer = world.getEntitiesByTag('player');
      expect(byPlayer.length).toBe(1);
      expect(byPlayer[0].id).toBe(e.id);

      const byHero = world.getEntitiesByTag('hero');
      expect(byHero.length).toBe(1);
    });

    it('returns empty array for unknown tag', () => {
      expect(world.getEntitiesByTag('nonexistent')).toEqual([]);
    });

    it('removes entity from tag index on destroy', () => {
      const e = world.createEntity();
      e.addComponent('Tag', { tags: new Set(['enemy']) });
      world.indexEntityTags(e);

      expect(world.getEntitiesByTag('enemy').length).toBe(1);

      world.destroyEntity(e.id);
      // After destroy (before flush), the entity is marked destroyed so getEntitiesByTag filters it
      expect(world.getEntitiesByTag('enemy').length).toBe(0);
    });
  });
});
