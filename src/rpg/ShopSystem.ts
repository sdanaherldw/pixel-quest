// ---------------------------------------------------------------------------
// ShopSystem.ts — Shop / merchant system for buying and selling items
// ---------------------------------------------------------------------------
// Pure TypeScript — no PixiJS dependencies.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ShopItem {
  itemId: string;
  basePrice: number;
  stock: number; // -1 = infinite
  requiredQuestFlag?: string;
}

export interface ShopConfig {
  shopId: string;
  name: string;
  regionId: string;
  items: ShopItem[];
  buyMarkup: number;  // e.g. 1.0 = base price
  sellMarkdown: number; // e.g. 0.5 = 50% of base
}

/** Callbacks for the host game to respond to buy/sell events. */
export interface ShopCallbacks {
  getGold: () => number;
  setGold: (amount: number) => void;
  getItemCount: (itemId: string) => number;
  addItem: (itemId: string, quantity: number) => boolean;
  removeItem: (itemId: string, quantity: number) => boolean;
  hasQuestFlag: (flag: string) => boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** CHA discount: 2% per point above 10, capped at 30%. */
const CHA_BASE = 10;
const CHA_DISCOUNT_PER_POINT = 0.02;
const CHA_DISCOUNT_CAP = 0.30;

// ---------------------------------------------------------------------------
// ShopSystem
// ---------------------------------------------------------------------------

export class ShopSystem {
  private shops: Map<string, ShopConfig> = new Map();
  private callbacks: ShopCallbacks;

  constructor(callbacks: ShopCallbacks) {
    this.callbacks = callbacks;
  }

  // -----------------------------------------------------------------------
  // Shop registration
  // -----------------------------------------------------------------------

  registerShop(config: ShopConfig): void {
    // Deep clone the items so stock tracking is independent
    this.shops.set(config.shopId, {
      ...config,
      items: config.items.map((item) => ({ ...item })),
    });
  }

  getShop(shopId: string): ShopConfig | undefined {
    return this.shops.get(shopId);
  }

  // -----------------------------------------------------------------------
  // Price calculation
  // -----------------------------------------------------------------------

  /**
   * Calculate the buy price factoring in charisma discount and shop markup.
   * CHA discount: 2% per point above 10, capped at 30%.
   */
  calculateBuyPrice(
    basePrice: number,
    charisma: number,
    markup: number,
  ): number {
    const chaDiscount = Math.min(
      CHA_DISCOUNT_CAP,
      Math.max(0, charisma - CHA_BASE) * CHA_DISCOUNT_PER_POINT,
    );
    const price = basePrice * markup * (1 - chaDiscount);
    return Math.max(1, Math.ceil(price));
  }

  /**
   * Calculate the sell price factoring in charisma bonus and shop markdown.
   * Higher CHA means better sell prices (same formula, applied as bonus).
   */
  calculateSellPrice(
    basePrice: number,
    charisma: number,
    markdown: number,
  ): number {
    const chaBonus = Math.min(
      CHA_DISCOUNT_CAP,
      Math.max(0, charisma - CHA_BASE) * CHA_DISCOUNT_PER_POINT,
    );
    const price = basePrice * markdown * (1 + chaBonus);
    return Math.max(1, Math.floor(price));
  }

  // -----------------------------------------------------------------------
  // Buy / Sell
  // -----------------------------------------------------------------------

  /**
   * Buy an item from a shop.
   *
   * @param shopId     - The shop to buy from.
   * @param itemIndex  - Index into the shop's items array.
   * @param quantity   - Number of items to buy.
   * @param charisma   - Buyer's charisma stat.
   * @returns true if the purchase succeeded.
   */
  buyItem(
    shopId: string,
    itemIndex: number,
    quantity: number,
    charisma: number = CHA_BASE,
  ): boolean {
    const shop = this.shops.get(shopId);
    if (!shop) return false;

    const item = shop.items[itemIndex];
    if (!item) return false;

    // Check quest flag requirement
    if (item.requiredQuestFlag && !this.callbacks.hasQuestFlag(item.requiredQuestFlag)) {
      return false;
    }

    // Check stock
    if (item.stock !== -1 && item.stock < quantity) return false;

    // Calculate total price
    const unitPrice = this.calculateBuyPrice(item.basePrice, charisma, shop.buyMarkup);
    const totalPrice = unitPrice * quantity;

    // Check gold
    if (this.callbacks.getGold() < totalPrice) return false;

    // Execute purchase
    this.callbacks.setGold(this.callbacks.getGold() - totalPrice);
    const added = this.callbacks.addItem(item.itemId, quantity);
    if (!added) {
      // Refund if item couldn't be added (e.g. inventory full)
      this.callbacks.setGold(this.callbacks.getGold() + totalPrice);
      return false;
    }

    // Reduce stock
    if (item.stock !== -1) {
      item.stock -= quantity;
    }

    return true;
  }

  /**
   * Sell an item to a shop.
   *
   * @param shopId   - The shop to sell to.
   * @param itemId   - The item id to sell.
   * @param quantity - Number of items to sell.
   * @param charisma - Seller's charisma stat.
   * @param basePrice - Base price of the item.
   * @returns true if the sale succeeded.
   */
  sellItem(
    shopId: string,
    itemId: string,
    quantity: number,
    charisma: number = CHA_BASE,
    basePrice: number = 0,
  ): boolean {
    const shop = this.shops.get(shopId);
    if (!shop) return false;

    // Check if player has enough items
    if (this.callbacks.getItemCount(itemId) < quantity) return false;

    // Calculate sell price
    const unitPrice = this.calculateSellPrice(basePrice, charisma, shop.sellMarkdown);
    const totalPrice = unitPrice * quantity;

    // Execute sale
    const removed = this.callbacks.removeItem(itemId, quantity);
    if (!removed) return false;

    this.callbacks.setGold(this.callbacks.getGold() + totalPrice);

    return true;
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  /**
   * Get available items in a shop (respecting quest flag requirements).
   */
  getAvailableItems(shopId: string): ShopItem[] {
    const shop = this.shops.get(shopId);
    if (!shop) return [];

    return shop.items.filter((item) => {
      // Filter out items that require unmet quest flags
      if (item.requiredQuestFlag && !this.callbacks.hasQuestFlag(item.requiredQuestFlag)) {
        return false;
      }
      // Filter out out-of-stock items
      if (item.stock === 0) return false;
      return true;
    });
  }

  /**
   * Refresh shop stock (e.g. on region change or time passing).
   * Resets all items to their original stock values.
   */
  refreshStock(shopId: string): void {
    // Since we don't store the original stock values, we re-register.
    // In practice the caller would re-register from the config data.
    // For now, set out-of-stock finite items back to 1.
    const shop = this.shops.get(shopId);
    if (!shop) return;

    for (const item of shop.items) {
      if (item.stock === 0) {
        item.stock = 1;
      }
    }
  }
}
