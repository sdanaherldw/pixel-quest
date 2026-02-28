import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameState } from './GameState';
import type { PartyMember, PartyMemberStats, PartyMemberEquipment } from './GameState';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStats(overrides: Partial<PartyMemberStats> = {}): PartyMemberStats {
  return {
    hp: 100, maxHp: 100,
    mp: 50, maxMp: 50,
    str: 10, dex: 10, int: 10,
    vit: 10, cha: 10, luk: 10,
    atk: 20, def: 15, spd: 12,
    critChance: 5, critDamage: 1.5, dodgeChance: 2,
    ...overrides,
  };
}

function makeEquipment(overrides: Partial<PartyMemberEquipment> = {}): PartyMemberEquipment {
  return {
    weapon: null, armor: null, helmet: null, accessory: null, ring: null,
    ...overrides,
  };
}

function makeMember(id: string, overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    id,
    name: id,
    classId: 'knight',
    level: 1,
    xp: 0,
    xpToNext: 100,
    stats: makeStats(),
    equipment: makeEquipment(),
    equippedSpells: [],
    learnedSpells: [],
    skillPoints: 0,
    unlockedSkills: [],
    statusEffects: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GameState', () => {
  let gs: GameState;

  beforeEach(() => {
    gs = GameState.instance;
    gs.reset();
  });

  // -----------------------------------------------------------------------
  // Singleton
  // -----------------------------------------------------------------------

  describe('singleton', () => {
    it('returns the same instance', () => {
      expect(GameState.instance).toBe(gs);
    });
  });

  // -----------------------------------------------------------------------
  // newGame
  // -----------------------------------------------------------------------

  describe('newGame', () => {
    it('creates a party with one leader', () => {
      gs.newGame('Hero', 'knight');
      expect(gs.party.length).toBe(1);
      expect(gs.party[0].name).toBe('Hero');
      expect(gs.party[0].classId).toBe('knight');
      expect(gs.party[0].level).toBe(1);
    });

    it('sets starting region to elderwood', () => {
      gs.newGame('Hero', 'knight');
      expect(gs.currentRegion).toBe('elderwood');
      expect(gs.unlockedRegions).toContain('elderwood');
    });

    it('auto-adds leader to active party', () => {
      gs.newGame('Hero', 'knight');
      expect(gs.activePartyIds.length).toBe(1);
      expect(gs.activeParty.length).toBe(1);
    });

    it('applies class-specific base stats', () => {
      gs.newGame('Mage', 'sorcerer');
      const mage = gs.party[0];
      // Sorcerer has int: 18
      expect(mage.stats.int).toBe(18);
    });

    it('uses default stats for unknown class', () => {
      gs.newGame('Custom', 'unknown_class');
      const member = gs.party[0];
      // All stats default to 10
      expect(member.stats.str).toBe(10);
      expect(member.stats.dex).toBe(10);
    });
  });

  // -----------------------------------------------------------------------
  // Party operations
  // -----------------------------------------------------------------------

  describe('party operations', () => {
    it('addPartyMember adds and auto-activates up to 4', () => {
      gs.addPartyMember(makeMember('a'));
      gs.addPartyMember(makeMember('b'));
      gs.addPartyMember(makeMember('c'));
      gs.addPartyMember(makeMember('d'));
      gs.addPartyMember(makeMember('e'));
      expect(gs.party.length).toBe(5);
      expect(gs.activePartyIds.length).toBe(4);
    });

    it('removePartyMember removes from both party and active list', () => {
      gs.addPartyMember(makeMember('a'));
      gs.addPartyMember(makeMember('b'));
      gs.removePartyMember('a');
      expect(gs.party.length).toBe(1);
      expect(gs.activePartyIds).not.toContain('a');
    });

    it('getPartyMember retrieves by id', () => {
      gs.addPartyMember(makeMember('hero'));
      expect(gs.getPartyMember('hero')).toBeDefined();
      expect(gs.getPartyMember('hero')!.name).toBe('hero');
    });

    it('getPartyMember returns undefined for missing id', () => {
      expect(gs.getPartyMember('ghost')).toBeUndefined();
    });

    it('setActiveParty limits to 4 members', () => {
      gs.addPartyMember(makeMember('a'));
      gs.addPartyMember(makeMember('b'));
      gs.addPartyMember(makeMember('c'));
      gs.addPartyMember(makeMember('d'));
      gs.addPartyMember(makeMember('e'));
      gs.setActiveParty(['a', 'b', 'c', 'd', 'e']);
      expect(gs.activePartyIds.length).toBe(4);
    });

    it('emits party:changed event', () => {
      const listener = vi.fn();
      gs.events.on('party:changed', listener);
      gs.addPartyMember(makeMember('a'));
      expect(listener).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Level / XP
  // -----------------------------------------------------------------------

  describe('level and XP', () => {
    it('levelUp increments level, grants skill points, increases xpToNext', () => {
      gs.addPartyMember(makeMember('hero', { xp: 100, xpToNext: 100 }));
      gs.levelUp('hero');
      const hero = gs.getPartyMember('hero')!;
      expect(hero.level).toBe(2);
      expect(hero.skillPoints).toBe(1);
      expect(hero.xpToNext).toBe(150);
    });

    it('addXp triggers auto-levelup when threshold reached', () => {
      gs.addPartyMember(makeMember('hero', { xpToNext: 100 }));
      gs.addXp('hero', 250);
      const hero = gs.getPartyMember('hero')!;
      // 250 xp: level 1->2 at 100 xp, then level 2->3 at 150 xp (100 remaining)
      expect(hero.level).toBe(3);
    });

    it('emits party:levelup event', () => {
      const listener = vi.fn();
      gs.events.on('party:levelup', listener);
      gs.addPartyMember(makeMember('hero', { xp: 100, xpToNext: 100 }));
      gs.levelUp('hero');
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // Inventory
  // -----------------------------------------------------------------------

  describe('inventory', () => {
    it('addItem creates a new slot', () => {
      gs.addItem('potion', 3);
      expect(gs.inventory.length).toBe(1);
      expect(gs.getItemCount('potion')).toBe(3);
    });

    it('addItem stacks on existing slot', () => {
      gs.addItem('potion', 3);
      gs.addItem('potion', 2);
      expect(gs.inventory.length).toBe(1);
      expect(gs.getItemCount('potion')).toBe(5);
    });

    it('removeItem decreases quantity', () => {
      gs.addItem('potion', 5);
      const removed = gs.removeItem('potion', 2);
      expect(removed).toBe(true);
      expect(gs.getItemCount('potion')).toBe(3);
    });

    it('removeItem removes slot when quantity reaches 0', () => {
      gs.addItem('potion', 2);
      gs.removeItem('potion', 2);
      expect(gs.getItemCount('potion')).toBe(0);
      expect(gs.inventory.length).toBe(0);
    });

    it('removeItem returns false when insufficient quantity', () => {
      gs.addItem('potion', 1);
      expect(gs.removeItem('potion', 5)).toBe(false);
      expect(gs.getItemCount('potion')).toBe(1);
    });

    it('removeItem returns false for non-existent item', () => {
      expect(gs.removeItem('ghost_item')).toBe(false);
    });

    it('getItemCount returns 0 for missing item', () => {
      expect(gs.getItemCount('nothing')).toBe(0);
    });

    it('emits inventory:changed event on add', () => {
      const listener = vi.fn();
      gs.events.on('inventory:changed', listener);
      gs.addItem('potion', 1);
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // Gold
  // -----------------------------------------------------------------------

  describe('gold', () => {
    it('addGold increases balance', () => {
      gs.addGold(100);
      expect(gs.gold).toBe(100);
    });

    it('addGold clamps to 0 for negative amounts', () => {
      gs.addGold(50);
      gs.addGold(-200);
      expect(gs.gold).toBe(0);
    });

    it('spendGold decreases balance', () => {
      gs.addGold(100);
      expect(gs.spendGold(40)).toBe(true);
      expect(gs.gold).toBe(60);
    });

    it('spendGold returns false when insufficient', () => {
      gs.addGold(10);
      expect(gs.spendGold(50)).toBe(false);
      expect(gs.gold).toBe(10);
    });
  });

  // -----------------------------------------------------------------------
  // Quests
  // -----------------------------------------------------------------------

  describe('quest operations', () => {
    const objectives = [
      { id: 'obj1', current: 0, target: 5, completed: false },
      { id: 'obj2', current: 0, target: 1, completed: false },
    ];

    it('startQuest adds an active quest', () => {
      gs.startQuest('q1', 'elderwood', structuredClone(objectives));
      expect(gs.activeQuests.length).toBe(1);
      expect(gs.activeQuests[0].questId).toBe('q1');
    });

    it('startQuest is idempotent for same questId', () => {
      gs.startQuest('q1', 'elderwood', structuredClone(objectives));
      gs.startQuest('q1', 'elderwood', structuredClone(objectives));
      expect(gs.activeQuests.length).toBe(1);
    });

    it('completeQuest moves quest to completed list', () => {
      gs.startQuest('q1', 'elderwood', structuredClone(objectives));
      gs.completeQuest('q1');
      expect(gs.activeQuests.length).toBe(0);
      expect(gs.completedQuestIds).toContain('q1');
    });

    it('failQuest moves quest to failed list', () => {
      gs.startQuest('q1', 'elderwood', structuredClone(objectives));
      gs.failQuest('q1');
      expect(gs.activeQuests.length).toBe(0);
      expect(gs.failedQuestIds).toContain('q1');
    });

    it('updateQuestObjective updates progress and marks complete', () => {
      gs.startQuest('q1', 'elderwood', structuredClone(objectives));
      gs.updateQuestObjective('q1', 'obj1', 5);
      const quest = gs.activeQuests[0];
      const obj = quest.objectives.find((o) => o.id === 'obj1')!;
      expect(obj.current).toBe(5);
      expect(obj.completed).toBe(true);
    });

    it('emits quest events', () => {
      const started = vi.fn();
      const completed = vi.fn();
      const failed = vi.fn();
      gs.events.on('quest:started', started);
      gs.events.on('quest:completed', completed);
      gs.events.on('quest:failed', failed);

      gs.startQuest('q1', 'elderwood', structuredClone(objectives));
      expect(started).toHaveBeenCalledOnce();

      gs.completeQuest('q1');
      expect(completed).toHaveBeenCalledOnce();

      gs.startQuest('q2', 'elderwood', structuredClone(objectives));
      gs.failQuest('q2');
      expect(failed).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // World operations
  // -----------------------------------------------------------------------

  describe('world operations', () => {
    it('setRegion updates current region and unlocks it', () => {
      gs.setRegion('frostpeak');
      expect(gs.currentRegion).toBe('frostpeak');
      expect(gs.unlockedRegions).toContain('frostpeak');
    });

    it('setRegion does not duplicate region in unlocked list', () => {
      gs.setRegion('elderwood');
      gs.setRegion('elderwood');
      expect(gs.unlockedRegions.filter((r) => r === 'elderwood').length).toBe(1);
    });

    it('setPosition updates coordinates', () => {
      gs.setPosition(42, 84);
      expect(gs.currentPosition).toEqual({ x: 42, y: 84 });
    });

    it('setWorldFlag and getWorldFlag work together', () => {
      gs.setWorldFlag('bossDefeated', true);
      expect(gs.getWorldFlag('bossDefeated')).toBe(true);
      gs.setWorldFlag('counter', 5);
      expect(gs.getWorldFlag('counter')).toBe(5);
    });

    it('getWorldFlag returns undefined for missing key', () => {
      expect(gs.getWorldFlag('missing')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Time operations
  // -----------------------------------------------------------------------

  describe('time operations', () => {
    it('addPlaytime accumulates seconds', () => {
      gs.addPlaytime(60);
      gs.addPlaytime(30);
      expect(gs.playtimeSeconds).toBe(90);
    });

    it('setDayNightTime wraps at 1440', () => {
      gs.setDayNightTime(1500);
      expect(gs.dayNightTime).toBe(60);
    });

    it('advanceDayNightTime wraps correctly', () => {
      gs.setDayNightTime(1400);
      gs.advanceDayNightTime(100);
      expect(gs.dayNightTime).toBe(60);
    });
  });

  // -----------------------------------------------------------------------
  // Codex
  // -----------------------------------------------------------------------

  describe('codex operations', () => {
    it('discoverEnemy adds to list', () => {
      gs.discoverEnemy('slime');
      expect(gs.discoveredEnemies).toContain('slime');
    });

    it('discoverEnemy is idempotent', () => {
      gs.discoverEnemy('slime');
      gs.discoverEnemy('slime');
      expect(gs.discoveredEnemies.filter((e) => e === 'slime').length).toBe(1);
    });

    it('discoverItem adds to list', () => {
      gs.discoverItem('potion');
      expect(gs.discoveredItems).toContain('potion');
    });

    it('discoverLore adds to list', () => {
      gs.discoverLore('ancient_tablet');
      expect(gs.discoveredLore).toContain('ancient_tablet');
    });
  });

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  describe('serialization', () => {
    it('serialize returns a deep clone of state', () => {
      gs.newGame('Hero', 'knight');
      gs.addItem('potion', 5);
      gs.addGold(200);

      const snapshot = gs.serialize();
      expect(snapshot.party.length).toBe(1);
      expect(snapshot.gold).toBe(200);

      // Mutating snapshot should not affect GameState
      snapshot.gold = 9999;
      expect(gs.gold).toBe(200);
    });

    it('deserialize accepts valid data', () => {
      gs.newGame('Hero', 'knight');
      gs.addItem('potion', 5);
      const snapshot = gs.serialize();

      gs.reset();
      expect(gs.party.length).toBe(0);

      const ok = gs.deserialize(snapshot);
      expect(ok).toBe(true);
      expect(gs.party.length).toBe(1);
      expect(gs.getItemCount('potion')).toBe(5);
    });

    it('deserialize rejects invalid data', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ok = gs.deserialize({ garbage: true });
      expect(ok).toBe(false);
      spy.mockRestore();
    });

    it('emits state:loaded after successful deserialize', () => {
      gs.newGame('Hero', 'knight');
      const snapshot = gs.serialize();
      gs.reset();

      const listener = vi.fn();
      gs.events.on('state:loaded', listener);
      gs.deserialize(snapshot);
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  describe('reset', () => {
    it('clears all state back to empty', () => {
      gs.newGame('Hero', 'knight');
      gs.addItem('potion', 5);
      gs.addGold(500);
      gs.reset();
      expect(gs.party.length).toBe(0);
      expect(gs.inventory.length).toBe(0);
      expect(gs.gold).toBe(0);
      expect(gs.currentRegion).toBe('');
    });
  });
});
