import { describe, it, expect, beforeEach } from 'vitest';
import {
  Inventory,
  createEmptyInventoryState,
  BAG_SIZE,
  EquipSlot,
  type ItemLookup,
} from '@/rpg/InventorySystem';

// ---------------------------------------------------------------------------
// Mock ItemLookup
// ---------------------------------------------------------------------------

const ITEMS: Record<string, {
  stackable: boolean;
  maxStack: number;
  equipSlot: EquipSlot | null;
  twoHanded: boolean;
  type: string;
  rarity: string;
}> = {
  'health-potion': { stackable: true, maxStack: 10, equipSlot: null, twoHanded: false, type: 'consumable', rarity: 'common' },
  'iron-sword': { stackable: false, maxStack: 1, equipSlot: EquipSlot.WEAPON, twoHanded: false, type: 'weapon', rarity: 'common' },
  'great-axe': { stackable: false, maxStack: 1, equipSlot: EquipSlot.WEAPON, twoHanded: true, type: 'weapon', rarity: 'rare' },
  'iron-shield': { stackable: false, maxStack: 1, equipSlot: EquipSlot.OFFHAND, twoHanded: false, type: 'weapon', rarity: 'common' },
  'leather-armor': { stackable: false, maxStack: 1, equipSlot: EquipSlot.ARMOR, twoHanded: false, type: 'armor', rarity: 'uncommon' },
  'magic-gem': { stackable: true, maxStack: 5, equipSlot: null, twoHanded: false, type: 'material', rarity: 'epic' },
};

const mockLookup: ItemLookup = {
  exists: (id) => id in ITEMS,
  isStackable: (id) => ITEMS[id]?.stackable ?? false,
  maxStack: (id) => ITEMS[id]?.maxStack ?? 1,
  getEquipSlot: (id) => ITEMS[id]?.equipSlot ?? null,
  isTwoHanded: (id) => ITEMS[id]?.twoHanded ?? false,
  canEquip: () => true,
  getItemType: (id) => ITEMS[id]?.type ?? 'misc',
  getItemRarity: (id) => ITEMS[id]?.rarity ?? 'common',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Inventory', () => {
  let inv: Inventory;

  beforeEach(() => {
    inv = new Inventory(createEmptyInventoryState('hero'));
  });

  describe('addItem', () => {
    it('adds a non-stackable item to the first empty slot', () => {
      const overflow = inv.addItem('iron-sword', 1, mockLookup);
      expect(overflow).toBe(0);
      expect(inv.countItem('iron-sword')).toBe(1);
    });

    it('stacks stackable items into one slot', () => {
      inv.addItem('health-potion', 5, mockLookup);
      inv.addItem('health-potion', 3, mockLookup);
      expect(inv.countItem('health-potion')).toBe(8);
      // Should be in a single slot since maxStack is 10
      const contents = inv.getContents();
      const potionSlots = contents.filter((s) => s.itemId === 'health-potion');
      expect(potionSlots.length).toBe(1);
    });

    it('splits into multiple slots when exceeding maxStack', () => {
      inv.addItem('health-potion', 15, mockLookup);
      const contents = inv.getContents();
      const potionSlots = contents.filter((s) => s.itemId === 'health-potion');
      expect(potionSlots.length).toBe(2);
      expect(inv.countItem('health-potion')).toBe(15);
    });

    it('returns overflow when bag is full', () => {
      // Fill all 28 slots with non-stackable items
      for (let i = 0; i < BAG_SIZE; i++) {
        inv.addItem('iron-sword', 1, mockLookup);
      }
      expect(inv.isFull()).toBe(true);
      const overflow = inv.addItem('iron-sword', 1, mockLookup);
      expect(overflow).toBe(1);
    });

    it('returns full quantity for non-existent items', () => {
      const overflow = inv.addItem('does-not-exist', 5, mockLookup);
      expect(overflow).toBe(5);
    });

    it('returns 0 for zero quantity', () => {
      const overflow = inv.addItem('health-potion', 0, mockLookup);
      expect(overflow).toBe(0);
    });
  });

  describe('removeItem', () => {
    it('removes items from a single slot', () => {
      inv.addItem('health-potion', 5, mockLookup);
      const removed = inv.removeItem('health-potion', 3);
      expect(removed).toBe(3);
      expect(inv.countItem('health-potion')).toBe(2);
    });

    it('removes items across multiple slots', () => {
      inv.addItem('health-potion', 10, mockLookup);
      inv.addItem('health-potion', 5, mockLookup);
      const removed = inv.removeItem('health-potion', 12);
      expect(removed).toBe(12);
      expect(inv.countItem('health-potion')).toBe(3);
    });

    it('clears slot when quantity reaches zero', () => {
      inv.addItem('iron-sword', 1, mockLookup);
      inv.removeItem('iron-sword', 1);
      expect(inv.countItem('iron-sword')).toBe(0);
      expect(inv.findItem('iron-sword')).toBe(-1);
    });

    it('returns 0 when removing item not in bag', () => {
      const removed = inv.removeItem('health-potion', 5);
      expect(removed).toBe(0);
    });
  });

  describe('equipment', () => {
    it('equips an item from bag to equipment slot', () => {
      inv.addItem('iron-sword', 1, mockLookup);
      const slotIdx = inv.findItem('iron-sword');
      const ok = inv.equip(slotIdx, EquipSlot.WEAPON, 'warrior', 1, mockLookup);
      expect(ok).toBe(true);
      expect(inv.getEquipped(EquipSlot.WEAPON)).not.toBeNull();
      expect(inv.getEquipped(EquipSlot.WEAPON)!.itemId).toBe('iron-sword');
      expect(inv.countItem('iron-sword')).toBe(0);
    });

    it('unequips item back to bag', () => {
      inv.addItem('iron-sword', 1, mockLookup);
      inv.equip(inv.findItem('iron-sword'), EquipSlot.WEAPON, 'warrior', 1, mockLookup);
      const ok = inv.unequip(EquipSlot.WEAPON, mockLookup);
      expect(ok).toBe(true);
      expect(inv.getEquipped(EquipSlot.WEAPON)).toBeNull();
      expect(inv.countItem('iron-sword')).toBe(1);
    });

    it('swaps equipped item when equipping a new one', () => {
      inv.addItem('iron-sword', 1, mockLookup);
      inv.addItem('leather-armor', 1, mockLookup);
      // Equip the sword first
      inv.equip(inv.findItem('iron-sword'), EquipSlot.WEAPON, 'warrior', 1, mockLookup);
      // Add another weapon and equip it
      inv.addItem('iron-sword', 1, mockLookup);
      inv.equip(inv.findItem('iron-sword'), EquipSlot.WEAPON, 'warrior', 1, mockLookup);
      // Old sword should be back in bag
      expect(inv.countItem('iron-sword')).toBe(1);
    });

    it('blocks offhand when two-handed weapon is equipped', () => {
      inv.addItem('great-axe', 1, mockLookup);
      inv.addItem('iron-shield', 1, mockLookup);
      inv.equip(inv.findItem('great-axe'), EquipSlot.WEAPON, 'warrior', 1, mockLookup);
      const ok = inv.equip(inv.findItem('iron-shield'), EquipSlot.OFFHAND, 'warrior', 1, mockLookup);
      expect(ok).toBe(false);
    });
  });

  describe('gold', () => {
    it('starts with 0 gold', () => {
      expect(inv.getGold()).toBe(0);
    });

    it('adds gold', () => {
      inv.addGold(100);
      expect(inv.getGold()).toBe(100);
    });

    it('removes gold when sufficient', () => {
      inv.addGold(100);
      expect(inv.removeGold(50)).toBe(true);
      expect(inv.getGold()).toBe(50);
    });

    it('rejects removal when insufficient gold', () => {
      inv.addGold(30);
      expect(inv.removeGold(50)).toBe(false);
      expect(inv.getGold()).toBe(30);
    });
  });

  describe('serialization', () => {
    it('round-trips state through getState', () => {
      inv.addItem('health-potion', 5, mockLookup);
      inv.addItem('iron-sword', 1, mockLookup);
      inv.addGold(250);

      const state = inv.getState();
      const restored = new Inventory(state);
      expect(restored.countItem('health-potion')).toBe(5);
      expect(restored.countItem('iron-sword')).toBe(1);
      expect(restored.getGold()).toBe(250);
    });
  });
});
