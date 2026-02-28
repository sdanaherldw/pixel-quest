import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CombatManager,
  CombatantTeam,
  DamageType,
  CombatState,
  CombatEventType,
  type Combatant,
  type EnemySpawnConfig,
  type CombatStats,
  type CombatPosition,
} from '@/combat/CombatManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStats(overrides: Partial<CombatStats> = {}): CombatStats {
  return {
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    atk: 20,
    def: 10,
    spd: 10,
    int: 10,
    critChance: 0,
    critDamage: 1.5,
    dodgeChance: 0,
    ...overrides,
  };
}

function makePosition(): CombatPosition {
  return { x: 0, y: 0, width: 32, height: 32, facingRight: true };
}

function makePartyMember(id: string, overrides: Partial<CombatStats> = {}): Combatant {
  return {
    id,
    name: id,
    team: CombatantTeam.PARTY,
    stats: makeStats(overrides),
    position: makePosition(),
    actionTimer: 0,
    actionInterval: 1,
    alive: true,
    statusEffectIds: [],
    weaknesses: [],
    resistances: [],
    cooldowns: new Map(),
    invincibilityTimer: 0,
  };
}

function makeEnemyConfig(id: string, overrides: Partial<CombatStats> = {}): EnemySpawnConfig {
  return {
    enemyDataId: id,
    name: id,
    stats: makeStats(overrides),
    position: makePosition(),
    weaknesses: [],
    resistances: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CombatManager', () => {
  let cm: CombatManager;

  beforeEach(() => {
    cm = new CombatManager();
  });

  it('starts in IDLE state', () => {
    expect(cm.state).toBe(CombatState.IDLE);
  });

  it('transitions to ACTIVE when combat starts', () => {
    cm.startCombat([makePartyMember('hero')], [makeEnemyConfig('slime')]);
    expect(cm.state).toBe(CombatState.ACTIVE);
  });

  it('registers both party and enemy combatants', () => {
    cm.startCombat(
      [makePartyMember('hero'), makePartyMember('mage')],
      [makeEnemyConfig('slime'), makeEnemyConfig('bat')],
    );
    expect(cm.getCombatants().length).toBe(4);
    expect(cm.getAliveParty().length).toBe(2);
    expect(cm.getAliveEnemies().length).toBe(2);
  });

  it('deals positive damage with dealDamage', () => {
    cm.startCombat([makePartyMember('hero')], [makeEnemyConfig('slime')]);
    const enemy = cm.getAliveEnemies()[0];
    // Seed Math.random for deterministic dodge/crit: both set to 0 chance
    const result = cm.dealDamage('hero', enemy.id, 20, DamageType.PHYSICAL);
    expect(result).not.toBeNull();
    expect(result!.finalDamage).toBeGreaterThan(0);
    expect(result!.isDodged).toBe(false);
  });

  it('clamps healing to maxHp', () => {
    cm.startCombat([makePartyMember('hero', { hp: 80, maxHp: 100 })], [makeEnemyConfig('slime')]);
    const result = cm.applyHealing('hero', 'hero', 50);
    expect(result).not.toBeNull();
    expect(result!.finalDamage).toBe(20); // only 20 hp was missing
    expect(result!.isHealing).toBe(true);
    const hero = cm.getCombatant('hero')!;
    expect(hero.stats.hp).toBe(100);
  });

  it('triggers VICTORY when all enemies are dead', () => {
    const listener = vi.fn();
    cm.startCombat(
      [makePartyMember('hero', { atk: 9999, critChance: 0 })],
      [makeEnemyConfig('slime', { hp: 1, maxHp: 1, def: 0 })],
    );
    cm.on(CombatEventType.VICTORY, listener);

    const enemy = cm.getAliveEnemies()[0];
    cm.dealDamage('hero', enemy.id, 9999, DamageType.PHYSICAL);
    // checkCombatEnd runs inside update()
    cm.update(0.016);

    expect(cm.state).toBe(CombatState.VICTORY);
    expect(listener).toHaveBeenCalled();
  });

  it('triggers DEFEAT when all party members are dead', () => {
    const listener = vi.fn();
    cm.startCombat(
      [makePartyMember('hero', { hp: 1, maxHp: 1, def: 0, dodgeChance: 0 })],
      [makeEnemyConfig('slime', { atk: 9999 })],
    );
    cm.on(CombatEventType.DEFEAT, listener);

    const enemy = cm.getAliveEnemies()[0];
    cm.dealDamage(enemy.id, 'hero', 9999, DamageType.PHYSICAL);
    // checkCombatEnd runs inside update()
    cm.update(0.016);

    expect(cm.state).toBe(CombatState.DEFEAT);
    expect(listener).toHaveBeenCalled();
  });

  it('blocks damage during invincibility frames', () => {
    cm.startCombat([makePartyMember('hero')], [makeEnemyConfig('slime', { def: 0 })]);
    const enemy = cm.getAliveEnemies()[0];
    const hpBefore = enemy.stats.hp;

    // First hit applies damage + sets i-frames
    cm.dealDamage('hero', enemy.id, 20, DamageType.PHYSICAL);
    const hpAfterFirst = enemy.stats.hp;
    expect(hpAfterFirst).toBeLessThan(hpBefore);

    // Second hit should be blocked by i-frames (timer > 0)
    const result = cm.dealDamage('hero', enemy.id, 20, DamageType.PHYSICAL);
    expect(result).not.toBeNull();
    expect(result!.finalDamage).toBe(0);
    expect(enemy.stats.hp).toBe(hpAfterFirst);
  });

  it('ticks cooldowns down during update', () => {
    cm.startCombat([makePartyMember('hero')], [makeEnemyConfig('slime')]);
    cm.startCooldown('hero', 'fireball', 2.0);
    expect(cm.isAbilityReady('hero', 'fireball')).toBe(false);

    cm.update(1.0);
    expect(cm.isAbilityReady('hero', 'fireball')).toBe(false);

    cm.update(1.5);
    expect(cm.isAbilityReady('hero', 'fireball')).toBe(true);
  });

  it('fires ACTION_READY when action timer fills', () => {
    const listener = vi.fn();
    // SPD=20 => actionInterval = 10/20 = 0.5s
    cm.startCombat([makePartyMember('hero', { spd: 20 })], [makeEnemyConfig('slime')]);
    cm.on(CombatEventType.ACTION_READY, listener);

    cm.update(0.6); // should trigger at 0.5s

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CombatEventType.ACTION_READY,
        data: expect.objectContaining({ combatantId: 'hero' }),
      }),
    );
  });

  it('does not update when paused', () => {
    cm.startCombat([makePartyMember('hero')], [makeEnemyConfig('slime')]);
    cm.setPaused(true);
    expect(cm.state).toBe(CombatState.PAUSED);

    const elapsedBefore = cm.elapsed;
    cm.update(1.0);
    expect(cm.elapsed).toBe(elapsedBefore);
  });
});
