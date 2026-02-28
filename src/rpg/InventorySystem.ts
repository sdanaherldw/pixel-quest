/**
 * InventorySystem.ts — Inventory and equipment slot management.
 *
 * Fixed-size bag (28 slots) plus 9 equipment slots. Gold is tracked
 * separately. All state is JSON-serializable for save/load.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BAG_SIZE = 28;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum EquipSlot {
  HEAD = 'head',
  AMULET = 'amulet',
  WEAPON = 'weapon',
  OFFHAND = 'offhand',
  ARMOR = 'armor',
  BELT = 'belt',
  BOOTS = 'boots',
  RING_1 = 'ring_1',
  RING_2 = 'ring_2',
}

// ---------------------------------------------------------------------------
// Interfaces (JSON-serializable)
// ---------------------------------------------------------------------------

export interface InventorySlot {
  itemId: string;
  quantity: number;
  slotIndex: number;
}

export interface EquippedItem {
  itemId: string;
  slot: EquipSlot;
}

export interface InventoryState {
  characterId: string;
  bag: (InventorySlot | null)[];
  equipped: Partial<Record<EquipSlot, EquippedItem>>;
  gold: number;
}

/**
 * Minimal item info the inventory system needs for stacking and validation.
 * Provided by the caller so the inventory system stays decoupled from
 * EquipmentSystem.
 */
export interface ItemLookup {
  exists(itemId: string): boolean;
  isStackable(itemId: string): boolean;
  maxStack(itemId: string): number;
  getEquipSlot(itemId: string): EquipSlot | null;
  isTwoHanded(itemId: string): boolean;
  canEquip(itemId: string, classId: string, level: number): boolean;
  getItemType(itemId: string): string;
  getItemRarity(itemId: string): string;
}

// ---------------------------------------------------------------------------
// Sort priority
// ---------------------------------------------------------------------------

const TYPE_SORT_ORDER: Record<string, number> = {
  weapon: 0,
  armor: 1,
  accessory: 2,
  consumable: 3,
  material: 4,
  quest: 5,
};

const RARITY_SORT_ORDER: Record<string, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  uncommon: 3,
  common: 4,
};

// ---------------------------------------------------------------------------
// Inventory class
// ---------------------------------------------------------------------------

export class Inventory {
  private state: InventoryState;

  constructor(state: InventoryState) {
    // Deep-clone the incoming state.
    this.state = {
      characterId: state.characterId,
      bag: state.bag.map((s) => (s ? { ...s } : null)),
      equipped: { ...state.equipped },
      gold: state.gold,
    };
    // Ensure bag is exactly BAG_SIZE
    while (this.state.bag.length < BAG_SIZE) {
      this.state.bag.push(null);
    }
  }

  // -----------------------------------------------------------------------
  // Bag operations
  // -----------------------------------------------------------------------

  /**
   * Add an item (or stack) to the bag.
   * Returns the number of items that could NOT be added (0 = all added).
   */
  addItem(itemId: string, quantity: number, lookup: ItemLookup): number {
    if (quantity <= 0) return 0;
    if (!lookup.exists(itemId)) return quantity;

    let remaining = quantity;

    // If stackable, try to merge into existing stacks first.
    if (lookup.isStackable(itemId)) {
      const maxStack = lookup.maxStack(itemId);
      for (const slot of this.state.bag) {
        if (remaining <= 0) break;
        if (slot && slot.itemId === itemId && slot.quantity < maxStack) {
          const spaceInSlot = maxStack - slot.quantity;
          const toAdd = Math.min(remaining, spaceInSlot);
          slot.quantity += toAdd;
          remaining -= toAdd;
        }
      }
    }

    // Fill empty slots with whatever remains.
    const maxStack = lookup.isStackable(itemId) ? lookup.maxStack(itemId) : 1;
    for (let i = 0; i < this.state.bag.length && remaining > 0; i++) {
      if (this.state.bag[i] === null) {
        const toAdd = Math.min(remaining, maxStack);
        this.state.bag[i] = { itemId, quantity: toAdd, slotIndex: i };
        remaining -= toAdd;
      }
    }

    return remaining;
  }

  /**
   * Remove a quantity of an item from the bag.
   * Returns the number actually removed.
   */
  removeItem(itemId: string, quantity: number): number {
    let toRemove = quantity;
    let removed = 0;

    for (let i = 0; i < this.state.bag.length && toRemove > 0; i++) {
      const slot = this.state.bag[i];
      if (slot && slot.itemId === itemId) {
        const take = Math.min(toRemove, slot.quantity);
        slot.quantity -= take;
        toRemove -= take;
        removed += take;
        if (slot.quantity <= 0) {
          this.state.bag[i] = null;
        }
      }
    }

    return removed;
  }

  /**
   * Equip an item from a bag slot into an equipment slot.
   * Returns true on success.
   */
  equip(
    slotIndex: number,
    equipSlot: EquipSlot,
    classId: string,
    level: number,
    lookup: ItemLookup,
  ): boolean {
    const bagSlot = this.state.bag[slotIndex];
    if (!bagSlot) return false;

    const itemId = bagSlot.itemId;

    // Validation
    if (!lookup.canEquip(itemId, classId, level)) return false;
    const itemEquipSlot = lookup.getEquipSlot(itemId);
    if (itemEquipSlot !== null && itemEquipSlot !== equipSlot) return false;

    // Two-handed weapons block the offhand slot.
    if (lookup.isTwoHanded(itemId) && equipSlot === EquipSlot.WEAPON) {
      // Must free offhand first if occupied.
      if (this.state.equipped[EquipSlot.OFFHAND]) {
        const unequipOk = this.unequip(EquipSlot.OFFHAND, lookup);
        if (!unequipOk) return false; // bag full
      }
    }

    // If equipping offhand, check if current weapon is two-handed.
    if (equipSlot === EquipSlot.OFFHAND) {
      const currentWeapon = this.state.equipped[EquipSlot.WEAPON];
      if (currentWeapon && lookup.isTwoHanded(currentWeapon.itemId)) {
        return false; // Cannot equip offhand with a two-handed weapon
      }
    }

    // Unequip current item in that slot first (swap to bag).
    if (this.state.equipped[equipSlot]) {
      const unequipOk = this.unequip(equipSlot, lookup);
      if (!unequipOk) return false; // bag full
    }

    // Remove one from the bag slot.
    bagSlot.quantity -= 1;
    if (bagSlot.quantity <= 0) {
      this.state.bag[slotIndex] = null;
    }

    // Place in equipment.
    this.state.equipped[equipSlot] = { itemId, slot: equipSlot };
    return true;
  }

  /**
   * Unequip an item from an equipment slot back into the bag.
   * Returns true on success, false if bag is full.
   */
  unequip(equipSlot: EquipSlot, lookup: ItemLookup): boolean {
    const equipped = this.state.equipped[equipSlot];
    if (!equipped) return true; // nothing to unequip

    // Find an empty bag slot.
    const overflow = this.addItem(equipped.itemId, 1, lookup);
    if (overflow > 0) return false; // bag full

    delete this.state.equipped[equipSlot];
    return true;
  }

  /** Get the item currently in an equipment slot, or null. */
  getEquipped(slot: EquipSlot): EquippedItem | null {
    return this.state.equipped[slot] ?? null;
  }

  /** Get all equipped items. */
  getAllEquipped(): EquippedItem[] {
    return Object.values(this.state.equipped).filter(
      (e): e is EquippedItem => e !== undefined,
    );
  }

  /** Get all non-null bag slots. */
  getContents(): InventorySlot[] {
    return this.state.bag.filter((s): s is InventorySlot => s !== null);
  }

  /** Get the full bag array including empty (null) slots. */
  getBag(): ReadonlyArray<InventorySlot | null> {
    return this.state.bag;
  }

  isFull(): boolean {
    return this.state.bag.every((s) => s !== null);
  }

  /**
   * Find the first bag slot index containing the given item.
   * Returns -1 if not found.
   */
  findItem(itemId: string): number {
    for (let i = 0; i < this.state.bag.length; i++) {
      if (this.state.bag[i]?.itemId === itemId) return i;
    }
    return -1;
  }

  /** Count total quantity of an item across all bag slots. */
  countItem(itemId: string): number {
    let total = 0;
    for (const slot of this.state.bag) {
      if (slot && slot.itemId === itemId) {
        total += slot.quantity;
      }
    }
    return total;
  }

  /** Sort bag contents by type, then rarity (best first), then name. */
  sort(lookup: ItemLookup): void {
    const items = this.getContents();
    items.sort((a, b) => {
      const typeA = TYPE_SORT_ORDER[lookup.getItemType(a.itemId)] ?? 99;
      const typeB = TYPE_SORT_ORDER[lookup.getItemType(b.itemId)] ?? 99;
      if (typeA !== typeB) return typeA - typeB;

      const rarA = RARITY_SORT_ORDER[lookup.getItemRarity(a.itemId)] ?? 99;
      const rarB = RARITY_SORT_ORDER[lookup.getItemRarity(b.itemId)] ?? 99;
      if (rarA !== rarB) return rarA - rarB;

      return a.itemId.localeCompare(b.itemId);
    });

    // Rebuild bag
    for (let i = 0; i < BAG_SIZE; i++) {
      if (i < items.length) {
        this.state.bag[i] = { ...items[i], slotIndex: i };
      } else {
        this.state.bag[i] = null;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Gold
  // -----------------------------------------------------------------------

  getGold(): number {
    return this.state.gold;
  }

  addGold(amount: number): void {
    this.state.gold = Math.max(0, this.state.gold + amount);
  }

  removeGold(amount: number): boolean {
    if (this.state.gold < amount) return false;
    this.state.gold -= amount;
    return true;
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  getState(): InventoryState {
    return {
      characterId: this.state.characterId,
      bag: this.state.bag.map((s) => (s ? { ...s } : null)),
      equipped: { ...this.state.equipped },
      gold: this.state.gold,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEmptyInventoryState(characterId: string): InventoryState {
  const bag: (InventorySlot | null)[] = [];
  for (let i = 0; i < BAG_SIZE; i++) {
    bag.push(null);
  }
  return {
    characterId,
    bag,
    equipped: {},
    gold: 0,
  };
}
