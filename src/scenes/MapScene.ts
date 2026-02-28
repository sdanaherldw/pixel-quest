import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';
import { WipeTransition } from '@/ui/TransitionEffects';

// ---------------------------------------------------------------------------
// Region definitions
// ---------------------------------------------------------------------------

interface RegionDef {
  id: string;
  name: string;
  color: number;
  x: number; // relative 0-1
  y: number; // relative 0-1
  unlocked: boolean;
  connections: string[];
}

const REGIONS: RegionDef[] = [
  {
    id: 'elderwood',
    name: 'Elderwood Forest',
    color: 0x22aa44,
    x: 0.3,
    y: 0.5,
    unlocked: true,
    connections: ['frostpeak', 'shadowmire', 'cindercore'],
  },
  {
    id: 'frostpeak',
    name: 'Frostpeak Mountains',
    color: 0x88ccff,
    x: 0.7,
    y: 0.22,
    unlocked: false,
    connections: ['elderwood', 'cindercore'],
  },
  {
    id: 'scorched',
    name: 'Scorched Wastes',
    color: 0xff8833,
    x: 0.72,
    y: 0.72,
    unlocked: false,
    connections: ['cindercore', 'shadowmire'],
  },
  {
    id: 'shadowmire',
    name: 'Shadowmire Swamp',
    color: 0x8844aa,
    x: 0.25,
    y: 0.75,
    unlocked: false,
    connections: ['elderwood', 'scorched'],
  },
  {
    id: 'cindercore',
    name: 'Cinder Core',
    color: 0xcc2222,
    x: 0.5,
    y: 0.48,
    unlocked: false,
    connections: ['elderwood', 'frostpeak', 'scorched'],
  },
];

// ---------------------------------------------------------------------------
// MapScene
// ---------------------------------------------------------------------------

/**
 * World map overlay.
 *
 * Features:
 * - Semi-transparent dark backdrop.
 * - "WORLD MAP" title.
 * - 5 region nodes drawn in a connected graph layout.
 * - Unlocked regions shown in full colour; locked regions dimmed with lock indicator.
 * - Current region highlighted with pulsing glow.
 * - Lines connecting regions.
 * - Navigate between unlocked regions (visual only for now).
 * - ESC / cancel closes.
 */
export class MapScene extends Scene {
  // ------------------------------------------------------------------
  // Display objects
  // ------------------------------------------------------------------

  private _overlay!: Graphics;
  private _connectionGfx!: Graphics;
  private _nodeContainer!: Container;
  private _glowGfx!: Graphics;

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  private _elapsed = 0;
  private _selectedRegionIdx = 0;
  private _currentRegionId = 'elderwood';

  // Computed pixel positions for regions
  private _regionPositions: { x: number; y: number }[] = [];
  private _mapX = 0;
  private _mapY = 0;
  private _mapW = 0;
  private _mapH = 0;

  constructor() {
    super('MapScene');
    // Start selection on the current region
    this._selectedRegionIdx = REGIONS.findIndex((r) => r.id === this._currentRegionId);
    if (this._selectedRegionIdx < 0) this._selectedRegionIdx = 0;
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  public async init(): Promise<void> {
    const w = this.engine.width;
    const h = this.engine.height;

    // --- Backdrop ---
    this._overlay = new Graphics();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.8 });
    this.container.addChild(this._overlay);

    // --- Panel ---
    const panelW = Math.min(860, w - 40);
    const panelH = Math.min(560, h - 40);
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;

    const panelBg = new Graphics();
    panelBg
      .roundRect(panelX, panelY, panelW, panelH, 8)
      .fill({ color: 0x0c0e14, alpha: 0.95 });
    panelBg
      .roundRect(panelX, panelY, panelW, panelH, 8)
      .stroke({ color: 0x556688, width: 2 });
    this.container.addChild(panelBg);

    // --- Title ---
    const titleText = new Text({
      text: 'WORLD MAP',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 24,
        fontWeight: 'bold',
        fill: 0x7799bb,
        stroke: { color: 0x0a0820, width: 3 },
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

    // --- Map area ---
    this._mapX = panelX + 30;
    this._mapY = panelY + 50;
    this._mapW = panelW - 60;
    this._mapH = panelH - 100;

    // Compute pixel positions for each region
    this._regionPositions = REGIONS.map((r) => ({
      x: this._mapX + r.x * this._mapW,
      y: this._mapY + r.y * this._mapH,
    }));

    // --- Connection lines layer ---
    this._connectionGfx = new Graphics();
    this.container.addChild(this._connectionGfx);

    // --- Pulsing glow layer ---
    this._glowGfx = new Graphics();
    this.container.addChild(this._glowGfx);

    // --- Node container ---
    this._nodeContainer = new Container();
    this.container.addChild(this._nodeContainer);

    this._drawConnections();
    this._buildNodes();
  }

  public update(dt: number): void {
    this._elapsed += dt;
    const input = this.engine.input;

    // Close on ESC
    if (input.isActionJustPressed('openMenu')) {
      void this.engine.scenes.pop();
      return;
    }

    // Navigate between unlocked regions
    let changed = false;

    if (input.isActionJustPressed('moveLeft') || input.isActionJustPressed('moveUp')) {
      let attempts = REGIONS.length;
      let idx = this._selectedRegionIdx;
      while (attempts > 0) {
        idx = (idx - 1 + REGIONS.length) % REGIONS.length;
        if (REGIONS[idx].unlocked) {
          this._selectedRegionIdx = idx;
          changed = true;
          break;
        }
        attempts--;
      }
    }

    if (input.isActionJustPressed('moveRight') || input.isActionJustPressed('moveDown')) {
      let attempts = REGIONS.length;
      let idx = this._selectedRegionIdx;
      while (attempts > 0) {
        idx = (idx + 1) % REGIONS.length;
        if (REGIONS[idx].unlocked) {
          this._selectedRegionIdx = idx;
          changed = true;
          break;
        }
        attempts--;
      }
    }

    if (changed) {
      this._buildNodes();
    }

    // Confirm region travel
    if (input.isActionJustPressed('interact')) {
      const selected = REGIONS[this._selectedRegionIdx];
      if (selected.unlocked && selected.id !== this._currentRegionId) {
        this._currentRegionId = selected.id;
        void this.engine.scenes.pop(new WipeTransition(0.5, 'left'));
      }
    }

    // Pulsing glow on current region
    this._drawGlow();
  }

  public fixedUpdate(_dt: number): void {
    // No fixed-rate logic.
  }

  public render(_alpha: number): void {
    const w = this.engine.width;
    const h = this.engine.height;
    this._overlay.clear();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.8 });
  }

  public override destroy(): void {
    this._regionPositions.length = 0;
    super.destroy();
  }

  // ------------------------------------------------------------------
  // Connection lines
  // ------------------------------------------------------------------

  private _drawConnections(): void {
    this._connectionGfx.clear();

    const drawn = new Set<string>();

    for (let i = 0; i < REGIONS.length; i++) {
      const region = REGIONS[i];
      const pos = this._regionPositions[i];

      for (const connId of region.connections) {
        const connIdx = REGIONS.findIndex((r) => r.id === connId);
        if (connIdx < 0) continue;

        // Avoid drawing the same connection twice
        const key = [Math.min(i, connIdx), Math.max(i, connIdx)].join('-');
        if (drawn.has(key)) continue;
        drawn.add(key);

        const connPos = this._regionPositions[connIdx];
        const bothUnlocked = region.unlocked && REGIONS[connIdx].unlocked;

        this._connectionGfx
          .moveTo(pos.x, pos.y)
          .lineTo(connPos.x, connPos.y)
          .stroke({
            color: bothUnlocked ? 0x556677 : 0x333344,
            width: bothUnlocked ? 2 : 1,
            alpha: bothUnlocked ? 0.6 : 0.25,
          });
      }
    }
  }

  // ------------------------------------------------------------------
  // Region nodes
  // ------------------------------------------------------------------

  private _buildNodes(): void {
    this._nodeContainer.removeChildren();

    for (let i = 0; i < REGIONS.length; i++) {
      const region = REGIONS[i];
      const pos = this._regionPositions[i];
      const isSelected = i === this._selectedRegionIdx;
      const isCurrent = region.id === this._currentRegionId;

      const nodeGroup = new Container();
      nodeGroup.position.set(pos.x, pos.y);

      const nodeRadius = 22;
      const nodeGfx = new Graphics();

      if (region.unlocked) {
        // Filled node
        nodeGfx
          .circle(0, 0, nodeRadius)
          .fill({ color: region.color, alpha: isSelected ? 0.5 : 0.3 });
        nodeGfx
          .circle(0, 0, nodeRadius)
          .stroke({ color: region.color, width: isSelected ? 3 : 2 });

        // Inner dot
        nodeGfx
          .circle(0, 0, 6)
          .fill({ color: region.color, alpha: 0.8 });
      } else {
        // Dimmed locked node
        nodeGfx
          .circle(0, 0, nodeRadius)
          .fill({ color: 0x222233, alpha: 0.4 });
        nodeGfx
          .circle(0, 0, nodeRadius)
          .stroke({ color: 0x444455, width: 1.5 });

        // Lock icon: small padlock shape
        // Lock body
        nodeGfx
          .rect(-5, -2, 10, 8)
          .fill({ color: 0x555566, alpha: 0.7 });
        // Lock shackle (arc approximated with lines)
        nodeGfx
          .moveTo(-4, -2)
          .lineTo(-4, -6)
          .lineTo(-3, -8)
          .lineTo(3, -8)
          .lineTo(4, -6)
          .lineTo(4, -2)
          .stroke({ color: 0x555566, width: 1.5 });
      }
      nodeGroup.addChild(nodeGfx);

      // "YOU ARE HERE" badge for the player's current region
      if (isCurrent) {
        const currentBadge = new Text({
          text: 'YOU ARE HERE',
          style: new TextStyle({
            fontFamily: '"Courier New", monospace',
            fontSize: 8,
            fontWeight: 'bold',
            fill: 0xffd700,
          }),
        });
        currentBadge.anchor.set(0.5, 0);
        currentBadge.position.set(0, -nodeRadius - 16);
        nodeGroup.addChild(currentBadge);
      }

      // Region name label
      const nameText = new Text({
        text: region.name,
        style: new TextStyle({
          fontFamily: 'Georgia, serif',
          fontSize: isSelected ? 12 : 10,
          fontWeight: isSelected ? 'bold' : 'normal',
          fill: region.unlocked ? region.color : 0x555566,
          letterSpacing: 1,
        }),
      });
      nameText.anchor.set(0.5, 0);
      nameText.position.set(0, nodeRadius + 6);
      nodeGroup.addChild(nameText);

      // Status label for locked regions
      if (!region.unlocked) {
        const lockedText = new Text({
          text: 'LOCKED',
          style: new TextStyle({
            fontFamily: '"Courier New", monospace',
            fontSize: 8,
            fill: 0x555555,
          }),
        });
        lockedText.anchor.set(0.5, 0);
        lockedText.position.set(0, nodeRadius + 22);
        nodeGroup.addChild(lockedText);
      }

      // Selection highlight ring
      if (isSelected && region.unlocked) {
        const selRing = new Graphics();
        selRing
          .circle(0, 0, nodeRadius + 5)
          .stroke({ color: 0xffffff, width: 1.5, alpha: 0.5 });
        nodeGroup.addChild(selRing);
      }

      this._nodeContainer.addChild(nodeGroup);
    }
  }

  // ------------------------------------------------------------------
  // Pulsing glow on current region
  // ------------------------------------------------------------------

  private _drawGlow(): void {
    this._glowGfx.clear();

    const currentIdx = REGIONS.findIndex((r) => r.id === this._currentRegionId);
    if (currentIdx < 0) return;

    const pos = this._regionPositions[currentIdx];
    const region = REGIONS[currentIdx];

    const pulse = 0.15 + 0.1 * Math.sin(this._elapsed * 3);
    const glowRadius = 30 + Math.sin(this._elapsed * 2) * 6;

    this._glowGfx
      .circle(pos.x, pos.y, glowRadius)
      .fill({ color: region.color, alpha: pulse * 0.5 });
    this._glowGfx
      .circle(pos.x, pos.y, glowRadius * 0.7)
      .fill({ color: region.color, alpha: pulse });
  }
}
