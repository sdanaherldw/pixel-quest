import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CombatManager,
  CombatState,
  CombatantTeam,
  DamageType,
  CombatEventType,
  GLOBAL_COOLDOWN,
} from './CombatManager';
import type { Combatant, EnemySpawnConfig, CombatStats, CombatPosition } from './CombatManager';

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

function makePosition(overrides: Partial<CombatPosition> = {}): CombatPosition {
  return { x: 0, y: 0, width: 32, height: 32, facingRight: true, ...overrides };
}

function makePartyCombatant(id: string, overrides: Partial<Combatant> = {}): Combatant {
  return {
    id,
    name: id,
    team: CombatantTeam.PARTY,
    stats: makeStats(),
    position: makePosition(),
    actionTimer: 0,
    actionInterval: 1,
    alive: true,
    statusEffectIds: [],
    weaknesses: [],
    resistances: [],
    cooldowns: new Map(),
    invincibilityTimer: 0,
    ...overrides,
  };
}

function makeEnemyConfig(id: string, overrides: Partial<EnemySpawnConfig> = {}): EnemySpawnConfig {
  return {
    enemyDataId: id,
    name: id,
    stats: makeStats({ hp: 50, maxHp: 50, def: 5 }),
    position: makePosition({ x: 100 }),
    weaknesses: [],
    resistances: [],
    ...overrides,
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

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('encounter lifecycle', () => {
    it('starts in IDLE state', () => {
      expect(cm.state).toBe(CombatState.IDLE);
    });

    it('transitions to ACTIVE on startCombat', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      expect(cm.state).toBe(CombatState.ACTIVE);
    });

    it('registers party and enemy combatants', () => {
      cm.startCombat(
        [makePartyCombatant('hero')],
        [makeEnemyConfig('slime'), makeEnemyConfig('bat')],
      );
      expect(cm.getCombatants().length).toBe(3);
      expect(cm.getAliveParty().length).toBe(1);
      expect(cm.getAliveEnemies().length).toBe(2);
    });

    it('emits COMBAT_START event', () => {
      const listener = vi.fn();
      cm.on(CombatEventType.COMBAT_START, listener);
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0].data).toEqual({
        partyCount: 1,
        enemyCount: 1,
      });
    });

    it('endCombat transitions to specified state', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      cm.endCombat(CombatState.IDLE);
      expect(cm.state).toBe(CombatState.IDLE);
    });

    it('emits COMBAT_END on endCombat', () => {
      const listener = vi.fn();
      cm.on(CombatEventType.COMBAT_END, listener);
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      cm.endCombat();
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // Pause / resume
  // -----------------------------------------------------------------------

  describe('pause / resume', () => {
    it('pauses from ACTIVE state', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      cm.setPaused(true);
      expect(cm.state).toBe(CombatState.PAUSED);
    });

    it('resumes from PAUSED state', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      cm.setPaused(true);
      cm.setPaused(false);
      expect(cm.state).toBe(CombatState.ACTIVE);
    });

    it('does nothing when pausing from non-ACTIVE state', () => {
      cm.setPaused(true);
      expect(cm.state).toBe(CombatState.IDLE);
    });
  });

  // -----------------------------------------------------------------------
  // Update loop
  // -----------------------------------------------------------------------

  describe('update', () => {
    it('does nothing when not ACTIVE', () => {
      cm.update(1);
      expect(cm.elapsed).toBe(0);
    });

    it('advances elapsed time', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      cm.update(0.5);
      expect(cm.elapsed).toBeCloseTo(0.5);
    });

    it('ticks action timers and emits ACTION_READY', () => {
      const hero = makePartyCombatant('hero', {
        stats: makeStats({ spd: 20 }),
      });
      cm.startCombat([hero], [makeEnemyConfig('slime')]);

      const listener = vi.fn();
      cm.on(CombatEventType.ACTION_READY, listener);

      // Tick enough time to fill the action timer (interval = 10/20 = 0.5s)
      cm.update(0.6);
      expect(listener).toHaveBeenCalled();
      const call = listener.mock.calls.find(
        (c) => (c[0] as { data: { combatantId: string } }).data.combatantId === 'hero',
      );
      expect(call).toBeDefined();
    });

    it('ticks down invincibility timers', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      const enemy = cm.getAliveEnemies()[0];
      enemy.invincibilityTimer = 1.0;
      cm.update(0.5);
      expect(enemy.invincibilityTimer).toBeCloseTo(0.5);
    });

    it('ticks down and removes expired cooldowns', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      cm.startCooldown('hero', 'fireball', 0.3);
      expect(cm.isAbilityReady('hero', 'fireball')).toBe(false);
      cm.update(0.5);
      expect(cm.isAbilityReady('hero', 'fireball')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Damage
  // -----------------------------------------------------------------------

  describe('dealDamage', () => {
    beforeEach(() => {
      // Seed Math.random to make tests deterministic
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    it('returns null for invalid attacker or target', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      expect(cm.dealDamage('nonexistent', 'hero', 10)).toBeNull();
    });

    it('returns null for dead target', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      const enemy = cm.getAliveEnemies()[0];
      enemy.alive = false;
      expect(cm.dealDamage('hero', enemy.id, 10)).toBeNull();
    });

    it('deals positive damage with diminishing returns DEF formula', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      const enemy = cm.getAliveEnemies()[0];
      const hpBefore = enemy.stats.hp;
      const result = cm.dealDamage('hero', enemy.id, 20);
      expect(result).not.toBeNull();
      expect(result!.finalDamage).toBeGreaterThan(0);
      expect(enemy.stats.hp).toBeLessThan(hpBefore);
    });

    it('applies minimum damage floor of 1', () => {
      // Very high DEF relative to ATK
      cm.startCombat(
        [makePartyCombatant('hero')],
        [makeEnemyConfig('tank', { stats: makeStats({ def: 9999, hp: 100, maxHp: 100 }) })],
      );
      const enemy = cm.getAliveEnemies()[0];
      const result = cm.dealDamage('hero', enemy.id, 1);
      expect(result).not.toBeNull();
      expect(result!.finalDamage).toBeGreaterThanOrEqual(1);
    });

    it('respects invincibility timer', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      const enemy = cm.getAliveEnemies()[0];
      enemy.invincibilityTimer = 1.0;
      const hpBefore = enemy.stats.hp;
      const result = cm.dealDamage('hero', enemy.id, 20);
      expect(result).not.toBeNull();
      expect(result!.finalDamage).toBe(0);
      expect(enemy.stats.hp).toBe(hpBefore);
    });

    it('applies elemental weakness multiplier', () => {
      cm.startCombat(
        [makePartyCombatant('hero')],
        [makeEnemyConfig('slime', { weaknesses: ['fire'] })],
      );
      const enemy = cm.getAliveEnemies()[0];
      const resultPhys = cm.dealDamage('hero', enemy.id, 20, DamageType.PHYSICAL)!;

      // Reset HP for fair comparison
      enemy.stats.hp = enemy.stats.maxHp;
      enemy.invincibilityTimer = 0;

      const resultFire = cm.dealDamage('hero', enemy.id, 20, DamageType.FIRE)!;
      // Fire should deal 1.5x more than physical (same base, weakness multiplier)
      expect(resultFire.finalDamage).toBeGreaterThan(resultPhys.finalDamage);
    });

    it('applies elemental resistance multiplier', () => {
      cm.startCombat(
        [makePartyCombatant('hero')],
        [makeEnemyConfig('slime', { resistances: ['ice'] })],
      );
      const enemy = cm.getAliveEnemies()[0];
      const resultPhys = cm.dealDamage('hero', enemy.id, 20, DamageType.PHYSICAL)!;

      enemy.stats.hp = enemy.stats.maxHp;
      enemy.invincibilityTimer = 0;

      const resultIce = cm.dealDamage('hero', enemy.id, 20, DamageType.ICE)!;
      expect(resultIce.finalDamage).toBeLessThan(resultPhys.finalDamage);
    });

    it('kills target and marks as not alive when HP reaches 0', () => {
      cm.startCombat(
        [makePartyCombatant('hero')],
        [makeEnemyConfig('slime', { stats: makeStats({ hp: 1, maxHp: 1, def: 0 }) })],
      );
      const enemy = cm.getAliveEnemies()[0];
      const result = cm.dealDamage('hero', enemy.id, 9999);
      expect(result).not.toBeNull();
      expect(result!.targetAlive).toBe(false);
      expect(enemy.alive).toBe(false);
      expect(enemy.stats.hp).toBe(0);
    });

    it('emits COMBATANT_DEFEATED when a combatant dies', () => {
      const listener = vi.fn();
      cm.on(CombatEventType.COMBATANT_DEFEATED, listener);
      cm.startCombat(
        [makePartyCombatant('hero')],
        [makeEnemyConfig('slime', { stats: makeStats({ hp: 1, maxHp: 1, def: 0 }) })],
      );
      const enemy = cm.getAliveEnemies()[0];
      cm.dealDamage('hero', enemy.id, 9999);
      expect(listener).toHaveBeenCalledOnce();
    });

    it('emits DAMAGE_DEALT event', () => {
      const listener = vi.fn();
      cm.on(CombatEventType.DAMAGE_DEALT, listener);
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      const enemy = cm.getAliveEnemies()[0];
      cm.dealDamage('hero', enemy.id, 20);
      expect(listener).toHaveBeenCalledOnce();
    });

    it('applies skill multiplier', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      const enemy = cm.getAliveEnemies()[0];
      const result1x = cm.dealDamage('hero', enemy.id, 20, DamageType.PHYSICAL, 1.0)!;

      enemy.stats.hp = enemy.stats.maxHp;
      enemy.invincibilityTimer = 0;

      const result2x = cm.dealDamage('hero', enemy.id, 20, DamageType.PHYSICAL, 2.0)!;
      expect(result2x.finalDamage).toBeGreaterThan(result1x.finalDamage);
    });
  });

  // -----------------------------------------------------------------------
  // Healing
  // -----------------------------------------------------------------------

  describe('applyHealing', () => {
    it('returns null for invalid combatants', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      expect(cm.applyHealing('nonexistent', 'hero', 10)).toBeNull();
    });

    it('heals up to maxHp (no overheal)', () => {
      const hero = makePartyCombatant('hero', {
        stats: makeStats({ hp: 50, maxHp: 100 }),
      });
      cm.startCombat([hero], [makeEnemyConfig('slime')]);
      const result = cm.applyHealing('hero', 'hero', 9999);
      expect(result).not.toBeNull();
      expect(result!.finalDamage).toBe(50); // effective heal amount
      expect(result!.isHealing).toBe(true);
      expect(cm.getCombatant('hero')!.stats.hp).toBe(100);
    });

    it('heals by exact amount when not at cap', () => {
      const hero = makePartyCombatant('hero', {
        stats: makeStats({ hp: 80, maxHp: 100 }),
      });
      cm.startCombat([hero], [makeEnemyConfig('slime')]);
      const result = cm.applyHealing('hero', 'hero', 10);
      expect(result!.finalDamage).toBe(10);
      expect(cm.getCombatant('hero')!.stats.hp).toBe(90);
    });

    it('emits HEALING_APPLIED event', () => {
      const listener = vi.fn();
      cm.on(CombatEventType.HEALING_APPLIED, listener);
      const hero = makePartyCombatant('hero', {
        stats: makeStats({ hp: 50, maxHp: 100 }),
      });
      cm.startCombat([hero], [makeEnemyConfig('slime')]);
      cm.applyHealing('hero', 'hero', 20);
      expect(listener).toHaveBeenCalledOnce();
    });

    it('returns null for dead target', () => {
      const hero = makePartyCombatant('hero', {
        stats: makeStats({ hp: 0 }),
      });
      cm.startCombat([hero], [makeEnemyConfig('slime')]);
      // startCombat sets alive = hp > 0, so hero is dead
      expect(cm.getCombatant('hero')!.alive).toBe(false);
      expect(cm.applyHealing('hero', 'hero', 10)).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Stat modifiers
  // -----------------------------------------------------------------------

  describe('modifyStat', () => {
    it('applies flat stat increase', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      cm.modifyStat('hero', 'atk', 10);
      expect(cm.getCombatant('hero')!.stats.atk).toBe(30);
    });

    it('clamps HP to new maxHp when maxHp is reduced', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      const hero = cm.getCombatant('hero')!;
      expect(hero.stats.hp).toBe(100);
      cm.modifyStat('hero', 'maxHp', -60);
      expect(hero.stats.maxHp).toBe(40);
      expect(hero.stats.hp).toBe(40);
    });

    it('recalculates action interval when SPD changes', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      const hero = cm.getCombatant('hero')!;
      const oldInterval = hero.actionInterval;
      cm.modifyStat('hero', 'spd', 10);
      expect(hero.actionInterval).toBeLessThan(oldInterval);
    });

    it('ignores unknown combatant', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      // Should not throw
      cm.modifyStat('ghost', 'atk', 10);
    });
  });

  // -----------------------------------------------------------------------
  // setHP
  // -----------------------------------------------------------------------

  describe('setHP', () => {
    it('sets HP directly and clamps to maxHp', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      cm.setHP('hero', 9999);
      expect(cm.getCombatant('hero')!.stats.hp).toBe(100);
    });

    it('sets HP to 0 and triggers defeat', () => {
      const listener = vi.fn();
      cm.on(CombatEventType.COMBATANT_DEFEATED, listener);
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      cm.setHP('hero', 0);
      expect(cm.getCombatant('hero')!.alive).toBe(false);
      expect(listener).toHaveBeenCalledOnce();
    });

    it('clamps negative HP to 0', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      cm.setHP('hero', -50);
      expect(cm.getCombatant('hero')!.stats.hp).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Cooldowns
  // -----------------------------------------------------------------------

  describe('cooldowns', () => {
    it('puts an ability on cooldown', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      cm.startCooldown('hero', 'fireball', 5);
      expect(cm.isAbilityReady('hero', 'fireball')).toBe(false);
    });

    it('isAbilityReady returns true when no cooldown', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      expect(cm.isAbilityReady('hero', 'fireball')).toBe(true);
    });

    it('isAbilityReady returns false for unknown combatant', () => {
      expect(cm.isAbilityReady('ghost', 'fireball')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Victory / Defeat
  // -----------------------------------------------------------------------

  describe('victory / defeat conditions', () => {
    it('transitions to VICTORY when all enemies die', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const listener = vi.fn();
      cm.on(CombatEventType.VICTORY, listener);
      cm.startCombat(
        [makePartyCombatant('hero')],
        [makeEnemyConfig('slime', { stats: makeStats({ hp: 1, maxHp: 1, def: 0 }) })],
      );
      const enemy = cm.getAliveEnemies()[0];
      cm.dealDamage('hero', enemy.id, 9999);
      // checkCombatEnd runs inside update(), so trigger it
      cm.update(0);
      expect(cm.state).toBe(CombatState.VICTORY);
      expect(listener).toHaveBeenCalledOnce();
    });

    it('transitions to DEFEAT when all party members die', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const listener = vi.fn();
      cm.on(CombatEventType.DEFEAT, listener);
      cm.startCombat(
        [makePartyCombatant('hero', { stats: makeStats({ hp: 1, maxHp: 1, def: 0 }) })],
        [makeEnemyConfig('slime')],
      );
      const enemy = cm.getAliveEnemies()[0];
      cm.dealDamage(enemy.id, 'hero', 9999);
      // checkCombatEnd runs inside update(), so trigger it
      cm.update(0);
      expect(cm.state).toBe(CombatState.DEFEAT);
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // Rewards
  // -----------------------------------------------------------------------

  describe('calculateRewards', () => {
    it('computes XP and gold from enemy reward fields', () => {
      cm.startCombat([makePartyCombatant('hero')], [
        makeEnemyConfig('slime', {
          stats: makeStats({ int: 10 }),
        }),
      ]);
      // Set explicit rewards on the enemy
      const enemy = cm.getAliveEnemies()[0];
      enemy.xpReward = 50;
      enemy.goldReward = 20;

      const rewards = cm.calculateRewards();
      expect(rewards.xp).toBe(50);
      expect(rewards.gold).toBe(20);
      expect(rewards.loot).toEqual([]);
    });

    it('falls back to stat-based estimate when no reward fields', () => {
      cm.startCombat([makePartyCombatant('hero')], [
        makeEnemyConfig('slime', { stats: makeStats({ int: 15 }) }),
      ]);
      const rewards = cm.calculateRewards();
      expect(rewards.xp).toBe(15); // max(1, int) = 15
      expect(rewards.gold).toBeGreaterThanOrEqual(0);
    });

    it('caches rewards on the manager', () => {
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      expect(cm.rewards).toBeNull();
      cm.calculateRewards();
      expect(cm.rewards).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Event system
  // -----------------------------------------------------------------------

  describe('event system', () => {
    it('on/off subscribe and unsubscribe', () => {
      const listener = vi.fn();
      cm.on(CombatEventType.STATE_CHANGED, listener);
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      expect(listener).toHaveBeenCalled();

      listener.mockClear();
      cm.off(CombatEventType.STATE_CHANGED, listener);
      cm.endCombat();
      expect(listener).not.toHaveBeenCalled();
    });

    it('multiple listeners can subscribe to the same event', () => {
      const l1 = vi.fn();
      const l2 = vi.fn();
      cm.on(CombatEventType.COMBAT_START, l1);
      cm.on(CombatEventType.COMBAT_START, l2);
      cm.startCombat([makePartyCombatant('hero')], [makeEnemyConfig('slime')]);
      expect(l1).toHaveBeenCalledOnce();
      expect(l2).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // GLOBAL_COOLDOWN export
  // -----------------------------------------------------------------------

  it('exports GLOBAL_COOLDOWN constant', () => {
    expect(GLOBAL_COOLDOWN).toBe(0.5);
  });
});
