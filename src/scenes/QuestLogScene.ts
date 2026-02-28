import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';

// ---------------------------------------------------------------------------
// Quest data types
// ---------------------------------------------------------------------------

type QuestType = 'main' | 'side' | 'bounty';
type QuestStatus = 'active' | 'completed' | 'failed';

interface QuestObjective {
  text: string;
  completed: boolean;
}

interface QuestReward {
  xp: number;
  gold: number;
  items: string[];
}

interface QuestDef {
  id: string;
  name: string;
  type: QuestType;
  status: QuestStatus;
  description: string;
  objectives: QuestObjective[];
  rewards: QuestReward;
}

// ---------------------------------------------------------------------------
// Display constants
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<QuestType, number> = {
  main:   0xffd700,
  side:   0xbbbbcc,
  bounty: 0xff4444,
};

const TYPE_ICONS: Record<QuestType, string> = {
  main:   '!',
  side:   '!',
  bounty: '\u2620', // skull
};

const STATUS_COLORS: Record<QuestStatus, number> = {
  active:    0xffd700,
  completed: 0x44cc44,
  failed:    0x884444,
};

const TAB_LABELS: QuestStatus[] = ['active', 'completed', 'failed'];

// ---------------------------------------------------------------------------
// Mock quest data
// ---------------------------------------------------------------------------

const MOCK_QUESTS: QuestDef[] = [
  // Main quests
  {
    id: 'mq-1',
    name: 'The Corruption Spreads',
    type: 'main',
    status: 'active',
    description:
      'A dark corruption is spreading across the Elderwood. The Elder has asked you to investigate the source of the blight and put an end to it before the forest is consumed.',
    objectives: [
      { text: 'Speak with Elder Oakworth', completed: true },
      { text: 'Investigate the Blighted Grove', completed: true },
      { text: 'Defeat the Corruption Source', completed: false },
      { text: 'Return to Elder Oakworth', completed: false },
    ],
    rewards: { xp: 500, gold: 150, items: ['Elderwood Staff'] },
  },
  {
    id: 'mq-2',
    name: 'The Forgotten Shrine',
    type: 'main',
    status: 'active',
    description:
      'Ancient texts speak of a shrine hidden deep within the Hollow Oak Caves. Finding it may reveal the key to cleansing the corruption.',
    objectives: [
      { text: 'Find the entrance to the Hollow Oak Caves', completed: true },
      { text: 'Navigate to the Forgotten Shrine', completed: false },
      { text: 'Activate the shrine seal', completed: false },
    ],
    rewards: { xp: 750, gold: 200, items: ['Shrine Blessing'] },
  },
  // Side quests
  {
    id: 'sq-1',
    name: 'The Missing Farmer',
    type: 'side',
    status: 'active',
    description:
      "Farmer Bramble's son hasn't returned from the eastern fields. He fears the boy wandered into the spider caves.",
    objectives: [
      { text: 'Speak to Farmer Bramble', completed: true },
      { text: 'Search the eastern fields', completed: false },
      { text: 'Rescue the missing boy', completed: false },
    ],
    rewards: { xp: 200, gold: 50, items: ["Farmer's Thanks"] },
  },
  {
    id: 'sq-2',
    name: 'Herb Gathering',
    type: 'side',
    status: 'completed',
    description:
      'The herbalist Selene needs moonpetal flowers for her potions. Collect 5 from the forest clearings.',
    objectives: [
      { text: 'Collect 5 Moonpetal Flowers (5/5)', completed: true },
      { text: 'Return to Selene', completed: true },
    ],
    rewards: { xp: 100, gold: 30, items: ['3x Health Potion'] },
  },
  // Bounties
  {
    id: 'bq-1',
    name: 'Goblin Menace',
    type: 'bounty',
    status: 'active',
    description:
      "The Adventurer's Guild has posted a bounty on the goblin raiders terrorising travellers on the eastern road.",
    objectives: [{ text: 'Defeat 10 Goblin Raiders (4/10)', completed: false }],
    rewards: { xp: 300, gold: 80, items: [] },
  },
  {
    id: 'bq-2',
    name: 'Spider Nest Cleanup',
    type: 'bounty',
    status: 'failed',
    description:
      'Clear out the spider nest near the village. The nest has since expanded and is now beyond recovery.',
    objectives: [
      { text: 'Clear the spider nest (Failed - nest expanded)', completed: false },
    ],
    rewards: { xp: 250, gold: 60, items: [] },
  },
  {
    id: 'sq-3',
    name: 'Lost Heirloom',
    type: 'side',
    status: 'completed',
    description:
      'An old woman in the village lost her family heirloom somewhere in the ruins to the north.',
    objectives: [
      { text: 'Search the Northern Ruins', completed: true },
      { text: 'Return the heirloom to Martha', completed: true },
    ],
    rewards: { xp: 150, gold: 40, items: ['Ring of Minor Luck'] },
  },
];

// ---------------------------------------------------------------------------
// QuestLogScene
// ---------------------------------------------------------------------------

/**
 * Quest tracking overlay.
 *
 * Features:
 * - Semi-transparent dark backdrop.
 * - Tab buttons: Active, Completed, Failed.
 * - Quest list with type icons (golden !, silver !, red skull).
 * - Detail panel with objectives (check/uncheck), description, rewards.
 * - ESC / cancel closes.
 */
export class QuestLogScene extends Scene {
  // ------------------------------------------------------------------
  // Display objects
  // ------------------------------------------------------------------

  private _overlay!: Graphics;
  private _tabContainer!: Container;
  private _questList!: Container;
  private _detailPanel!: Container;

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  private _activeTab: QuestStatus = 'active';
  private _selectedQuestIdx = 0;
  private _filteredQuests: QuestDef[] = [];

  constructor() {
    super('QuestLogScene');
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  public async init(): Promise<void> {
    const w = this.engine.width;
    const h = this.engine.height;

    // --- Dark backdrop ---
    this._overlay = new Graphics();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.78 });
    this.container.addChild(this._overlay);

    // --- Panel ---
    const panelW = Math.min(920, w - 40);
    const panelH = Math.min(580, h - 40);
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;

    const panelBg = new Graphics();
    panelBg
      .roundRect(panelX, panelY, panelW, panelH, 8)
      .fill({ color: 0x12100a, alpha: 0.95 });
    panelBg
      .roundRect(panelX, panelY, panelW, panelH, 8)
      .stroke({ color: 0xdaa520, width: 2 });
    this.container.addChild(panelBg);

    // --- Title ---
    const titleText = new Text({
      text: 'QUEST LOG',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 24,
        fontWeight: 'bold',
        fill: 0xffd700,
        stroke: { color: 0x1a0800, width: 3 },
        letterSpacing: 6,
      }),
    });
    titleText.anchor.set(0.5, 0);
    titleText.position.set(w / 2, panelY + 12);
    this.container.addChild(titleText);

    // --- Close hint ---
    const closeHint = new Text({
      text: '[ESC] Close',
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 10,
        fill: 0x555555,
      }),
    });
    closeHint.anchor.set(1, 0);
    closeHint.position.set(panelX + panelW - 12, panelY + 18);
    this.container.addChild(closeHint);

    // --- Tab buttons ---
    this._tabContainer = new Container();
    this._tabContainer.position.set(panelX + 14, panelY + 48);
    this.container.addChild(this._tabContainer);

    // --- Quest list ---
    this._questList = new Container();
    this._questList.position.set(panelX + 14, panelY + 90);
    this.container.addChild(this._questList);

    // --- Detail panel ---
    this._detailPanel = new Container();
    this._detailPanel.position.set(panelX + 310, panelY + 48);
    this.container.addChild(this._detailPanel);

    // Initial build
    this._filterQuests();
    this._buildTabs();
    this._buildQuestList();
    this._buildDetailPanel();
  }

  public update(_dt: number): void {
    const input = this.engine.input;

    // Close
    if (input.isActionJustPressed('openMenu')) {
      void this.engine.scenes.pop();
      return;
    }

    let listChanged = false;

    // Navigate quest list
    if (input.isActionJustPressed('moveUp') && this._filteredQuests.length > 0) {
      this._selectedQuestIdx =
        (this._selectedQuestIdx - 1 + this._filteredQuests.length) %
        this._filteredQuests.length;
      listChanged = true;
    }

    if (input.isActionJustPressed('moveDown') && this._filteredQuests.length > 0) {
      this._selectedQuestIdx =
        (this._selectedQuestIdx + 1) % this._filteredQuests.length;
      listChanged = true;
    }

    // Switch tabs with left/right
    if (input.isActionJustPressed('moveLeft')) {
      const idx = TAB_LABELS.indexOf(this._activeTab);
      this._activeTab = TAB_LABELS[(idx - 1 + TAB_LABELS.length) % TAB_LABELS.length];
      this._selectedQuestIdx = 0;
      this._filterQuests();
      this._buildTabs();
      this._buildQuestList();
      this._buildDetailPanel();
      return;
    }

    if (input.isActionJustPressed('moveRight')) {
      const idx = TAB_LABELS.indexOf(this._activeTab);
      this._activeTab = TAB_LABELS[(idx + 1) % TAB_LABELS.length];
      this._selectedQuestIdx = 0;
      this._filterQuests();
      this._buildTabs();
      this._buildQuestList();
      this._buildDetailPanel();
      return;
    }

    if (listChanged) {
      this._buildQuestList();
      this._buildDetailPanel();
    }
  }

  public fixedUpdate(_dt: number): void {
    // No fixed-rate logic.
  }

  public render(_alpha: number): void {
    const w = this.engine.width;
    const h = this.engine.height;
    this._overlay.clear();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.78 });
  }

  public override destroy(): void {
    this._filteredQuests.length = 0;
    super.destroy();
  }

  // ------------------------------------------------------------------
  // Filtering
  // ------------------------------------------------------------------

  private _filterQuests(): void {
    this._filteredQuests = MOCK_QUESTS.filter((q) => q.status === this._activeTab);
  }

  // ------------------------------------------------------------------
  // Tab buttons
  // ------------------------------------------------------------------

  private _buildTabs(): void {
    this._tabContainer.removeChildren();

    const tabW = 90;
    const tabH = 30;
    const gap = 8;

    for (let i = 0; i < TAB_LABELS.length; i++) {
      const status = TAB_LABELS[i];
      const isActive = status === this._activeTab;
      const x = i * (tabW + gap);

      const label = status.charAt(0).toUpperCase() + status.slice(1);
      const count = MOCK_QUESTS.filter((q) => q.status === status).length;

      const tab = new Container();
      tab.position.set(x, 0);

      const bg = new Graphics();
      bg.roundRect(0, 0, tabW, tabH, 4)
        .fill({ color: isActive ? 0x2a2210 : 0x151510, alpha: isActive ? 0.95 : 0.5 });
      bg.roundRect(0, 0, tabW, tabH, 4)
        .stroke({
          color: isActive ? STATUS_COLORS[status] : 0x444444,
          width: isActive ? 2 : 1,
        });
      tab.addChild(bg);

      const tabText = new Text({
        text: `${label} (${count})`,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fill: isActive ? STATUS_COLORS[status] : 0x777777,
        }),
      });
      tabText.anchor.set(0.5, 0.5);
      tabText.position.set(tabW / 2, tabH / 2);
      tab.addChild(tabText);

      this._tabContainer.addChild(tab);
    }
  }

  // ------------------------------------------------------------------
  // Quest list
  // ------------------------------------------------------------------

  private _buildQuestList(): void {
    this._questList.removeChildren();

    if (this._filteredQuests.length === 0) {
      const emptyText = new Text({
        text: `No ${this._activeTab} quests.`,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 12,
          fill: 0x555555,
          fontStyle: 'italic',
        }),
      });
      emptyText.position.set(10, 20);
      this._questList.addChild(emptyText);
      return;
    }

    const rowH = 36;
    const rowW = 280;
    const gap = 4;

    for (let i = 0; i < this._filteredQuests.length; i++) {
      const quest = this._filteredQuests[i];
      const isSelected = i === this._selectedQuestIdx;
      const typeColor = TYPE_COLORS[quest.type];
      const y = i * (rowH + gap);

      const row = new Container();
      row.position.set(0, y);

      // Background
      const bg = new Graphics();
      bg.roundRect(0, 0, rowW, rowH, 3)
        .fill({ color: isSelected ? 0x2a2210 : 0x151510, alpha: isSelected ? 0.9 : 0.6 });
      bg.roundRect(0, 0, rowW, rowH, 3)
        .stroke({
          color: isSelected ? typeColor : 0x333333,
          width: isSelected ? 1.5 : 1,
        });
      row.addChild(bg);

      // Type icon
      const icon = new Text({
        text: TYPE_ICONS[quest.type],
        style: new TextStyle({
          fontFamily: 'Georgia, serif',
          fontSize: quest.type === 'bounty' ? 14 : 16,
          fontWeight: 'bold',
          fill: typeColor,
        }),
      });
      icon.anchor.set(0.5, 0.5);
      icon.position.set(16, rowH / 2);
      row.addChild(icon);

      // Quest name
      const nameText = new Text({
        text: quest.name,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fill: isSelected ? 0xffd700 : 0xbbbbbb,
        }),
      });
      nameText.position.set(30, 4);
      row.addChild(nameText);

      // Quest type label
      const typeLabel = new Text({
        text: quest.type === 'main' ? 'Main Quest' : quest.type === 'side' ? 'Side Quest' : 'Bounty',
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 8,
          fill: 0x666666,
        }),
      });
      typeLabel.position.set(30, 20);
      row.addChild(typeLabel);

      this._questList.addChild(row);
    }
  }

  // ------------------------------------------------------------------
  // Detail panel
  // ------------------------------------------------------------------

  private _buildDetailPanel(): void {
    this._detailPanel.removeChildren();

    if (this._filteredQuests.length === 0 || this._selectedQuestIdx >= this._filteredQuests.length) {
      const emptyText = new Text({
        text: 'Select a quest to\nview details.',
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 12,
          fill: 0x555555,
          fontStyle: 'italic',
          lineHeight: 18,
        }),
      });
      emptyText.position.set(20, 60);
      this._detailPanel.addChild(emptyText);
      return;
    }

    const quest = this._filteredQuests[this._selectedQuestIdx];
    const typeColor = TYPE_COLORS[quest.type];

    // Detail background
    const detailBg = new Graphics();
    detailBg
      .roundRect(0, 0, 580, 480, 6)
      .fill({ color: 0x0e0c08, alpha: 0.6 });
    detailBg
      .roundRect(0, 0, 580, 480, 6)
      .stroke({ color: typeColor, width: 1, alpha: 0.3 });
    this._detailPanel.addChild(detailBg);

    // Quest name
    const nameText = new Text({
      text: quest.name,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 20,
        fontWeight: 'bold',
        fill: 0xffd700,
        letterSpacing: 1,
      }),
    });
    nameText.position.set(16, 12);
    this._detailPanel.addChild(nameText);

    // Type and status badges
    const typeBadge = new Text({
      text: `[${quest.type === 'main' ? 'Main Quest' : quest.type === 'side' ? 'Side Quest' : 'Bounty'}]`,
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 10,
        fill: typeColor,
      }),
    });
    typeBadge.position.set(16, 38);
    this._detailPanel.addChild(typeBadge);

    const statusBadge = new Text({
      text: quest.status.toUpperCase(),
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 10,
        fontWeight: 'bold',
        fill: STATUS_COLORS[quest.status],
      }),
    });
    statusBadge.position.set(180, 38);
    this._detailPanel.addChild(statusBadge);

    // Divider
    const divider = new Graphics();
    divider
      .moveTo(16, 56)
      .lineTo(564, 56)
      .stroke({ color: typeColor, width: 1, alpha: 0.3 });
    this._detailPanel.addChild(divider);

    // Description
    const descText = new Text({
      text: quest.description,
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 12,
        fill: 0xaaaaaa,
        wordWrap: true,
        wordWrapWidth: 540,
        lineHeight: 18,
      }),
    });
    descText.position.set(16, 66);
    this._detailPanel.addChild(descText);

    // Objectives header
    const objHeaderY = 150;
    const objHeader = new Text({
      text: 'Objectives:',
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 12,
        fill: 0xdaa520,
      }),
    });
    objHeader.position.set(16, objHeaderY);
    this._detailPanel.addChild(objHeader);

    // Objective list with checkmarks and strikethrough
    for (let i = 0; i < quest.objectives.length; i++) {
      const obj = quest.objectives[i];
      const y = objHeaderY + 24 + i * 26;

      // Bullet / check marker
      const checkText = new Text({
        text: obj.completed ? '[x]' : '[ ]',
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fill: obj.completed ? 0x44cc44 : 0x888888,
        }),
      });
      checkText.position.set(24, y);
      this._detailPanel.addChild(checkText);

      // Objective text
      const objText = new Text({
        text: obj.text,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fill: obj.completed ? 0x44cc44 : 0xcccccc,
        }),
      });
      objText.position.set(60, y);
      this._detailPanel.addChild(objText);

      // Strikethrough line for completed objectives
      if (obj.completed) {
        const strikethrough = new Graphics();
        strikethrough
          .moveTo(60, y + 7)
          .lineTo(60 + objText.width, y + 7)
          .stroke({ color: 0x44cc44, width: 1, alpha: 0.5 });
        this._detailPanel.addChild(strikethrough);
      }
    }

    // Rewards section
    const rewardY = objHeaderY + 24 + quest.objectives.length * 26 + 16;

    const rewardDivider = new Graphics();
    rewardDivider
      .moveTo(16, rewardY)
      .lineTo(564, rewardY)
      .stroke({ color: 0x444444, width: 1, alpha: 0.3 });
    this._detailPanel.addChild(rewardDivider);

    const rewardHeader = new Text({
      text: 'Rewards:',
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 12,
        fill: 0xdaa520,
      }),
    });
    rewardHeader.position.set(16, rewardY + 10);
    this._detailPanel.addChild(rewardHeader);

    // XP
    const xpText = new Text({
      text: `${quest.rewards.xp} XP`,
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 11,
        fill: 0x88ff88,
      }),
    });
    xpText.position.set(24, rewardY + 32);
    this._detailPanel.addChild(xpText);

    // Gold
    const goldText = new Text({
      text: `${quest.rewards.gold} Gold`,
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 11,
        fill: 0xffd700,
      }),
    });
    goldText.position.set(120, rewardY + 32);
    this._detailPanel.addChild(goldText);

    // Items
    if (quest.rewards.items.length > 0) {
      const itemsText = new Text({
        text: quest.rewards.items.join(', '),
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fill: 0x4488ff,
        }),
      });
      itemsText.position.set(24, rewardY + 52);
      this._detailPanel.addChild(itemsText);
    }
  }
}
