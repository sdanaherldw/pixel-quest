import { Container, Graphics, Text, TextStyle } from 'pixi.js';

import { Scene } from '@/engine/Scene';
import { AudioManager } from '@/engine/AudioManager';

// ---------------------------------------------------------------------------
// SettingsScene
// ---------------------------------------------------------------------------

interface SettingSlider {
  label: string;
  getValue: () => number;
  setValue: (v: number) => void;
}

/**
 * Settings overlay scene.
 *
 * Provides volume sliders (master, music, SFX), a mute toggle,
 * and display options. Pushed as an overlay; ESC closes.
 */
export class SettingsScene extends Scene {
  private _overlay!: Graphics;
  private _sliderContainer!: Container;
  private _sliders: SettingSlider[] = [];
  private _selectedIdx: number = 0;

  constructor() {
    super('SettingsScene');
  }

  public async init(): Promise<void> {
    const w = this.engine.width;
    const h = this.engine.height;

    // Semi-transparent backdrop
    this._overlay = new Graphics();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.75 });
    this._overlay.eventMode = 'static';
    this.container.addChild(this._overlay);

    // Panel
    const panelW = 460;
    const panelH = 360;
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;

    const panel = new Graphics();
    panel.roundRect(panelX, panelY, panelW, panelH, 8).fill({ color: 0x12100a, alpha: 0.95 });
    panel.roundRect(panelX, panelY, panelW, panelH, 8).stroke({ color: 0xdaa520, width: 2 });
    panel.eventMode = 'static';
    this.container.addChild(panel);

    // Title
    const title = new Text({
      text: 'SETTINGS',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 22,
        fontWeight: 'bold',
        fill: 0xffd700,
        stroke: { color: 0x1a0800, width: 3 },
        letterSpacing: 4,
      }),
    });
    title.anchor.set(0.5, 0);
    title.position.set(w / 2, panelY + 14);
    this.container.addChild(title);

    // Close hint
    const hint = new Text({
      text: '[ESC] Close    [Left/Right] Adjust',
      style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 10, fill: 0x666666 }),
    });
    hint.anchor.set(0.5, 0);
    hint.position.set(w / 2, panelY + panelH - 30);
    this.container.addChild(hint);

    // Define sliders
    const audio = AudioManager.instance;
    this._sliders = [
      {
        label: 'Master Volume',
        getValue: () => audio.getMasterVolume(),
        setValue: (v) => audio.setMasterVolume(v),
      },
      {
        label: 'Music Volume',
        getValue: () => audio.getMusicVolume(),
        setValue: (v) => audio.setMusicVolume(v),
      },
      {
        label: 'SFX Volume',
        getValue: () => audio.getSFXVolume(),
        setValue: (v) => audio.setSFXVolume(v),
      },
    ];

    // Slider container
    this._sliderContainer = new Container();
    this._sliderContainer.position.set(panelX + 40, panelY + 60);
    this.container.addChild(this._sliderContainer);

    this._buildSliders();
  }

  public update(_dt: number): void {
    if (this.engine.input.isActionJustPressed('openMenu')) {
      void this.engine.scenes.pop();
      return;
    }

    if (this.engine.input.isActionJustPressed('moveUp')) {
      this._selectedIdx = Math.max(0, this._selectedIdx - 1);
      this._buildSliders();
    }
    if (this.engine.input.isActionJustPressed('moveDown')) {
      this._selectedIdx = Math.min(this._sliders.length - 1, this._selectedIdx + 1);
      this._buildSliders();
    }

    // Adjust value with left/right
    const step = 0.05;
    if (this.engine.input.isActionJustPressed('moveLeft')) {
      const slider = this._sliders[this._selectedIdx];
      slider.setValue(Math.max(0, slider.getValue() - step));
      this._buildSliders();
    }
    if (this.engine.input.isActionJustPressed('moveRight')) {
      const slider = this._sliders[this._selectedIdx];
      slider.setValue(Math.min(1, slider.getValue() + step));
      this._buildSliders();
    }

    // Mute toggle
    if (this.engine.input.isKeyJustPressed('KeyM')) {
      AudioManager.instance.toggleMute();
      this._buildSliders();
    }
  }

  public fixedUpdate(_dt: number): void { /* no-op */ }

  public render(_alpha: number): void {
    const w = this.engine.width;
    const h = this.engine.height;
    this._overlay.clear();
    this._overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.75 });
  }

  // ------------------------------------------------------------------
  // Private
  // ------------------------------------------------------------------

  private _buildSliders(): void {
    this._sliderContainer.removeChildren();

    const sliderW = 380;
    const rowH = 60;

    for (let i = 0; i < this._sliders.length; i++) {
      const slider = this._sliders[i];
      const isSelected = i === this._selectedIdx;
      const value = slider.getValue();
      const y = i * (rowH + 10);

      const row = new Container();
      row.position.set(0, y);

      // Label
      const label = new Text({
        text: slider.label,
        style: new TextStyle({
          fontFamily: 'Georgia, serif',
          fontSize: 14,
          fill: isSelected ? 0xffd700 : 0xccbbaa,
        }),
      });
      label.position.set(0, 0);
      row.addChild(label);

      // Value percentage
      const pctText = new Text({
        text: `${Math.round(value * 100)}%`,
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 12,
          fill: isSelected ? 0xffd700 : 0xaaaaaa,
        }),
      });
      pctText.anchor.set(1, 0);
      pctText.position.set(sliderW, 0);
      row.addChild(pctText);

      // Slider track
      const track = new Graphics();
      track.roundRect(0, 24, sliderW, 10, 3).fill({ color: 0x1a1a1a, alpha: 0.8 });
      track.roundRect(0, 24, sliderW, 10, 3).stroke({ color: isSelected ? 0xffd700 : 0x444444, width: 1 });
      row.addChild(track);

      // Slider fill
      const fillW = sliderW * value;
      if (fillW > 0) {
        const fill = new Graphics();
        fill.roundRect(0, 24, fillW, 10, 3).fill({ color: isSelected ? 0xdaa520 : 0x886622, alpha: 0.9 });
        row.addChild(fill);
      }

      // Slider knob
      const knob = new Graphics();
      knob.circle(fillW, 29, 7).fill({ color: isSelected ? 0xffd700 : 0xaaaaaa });
      row.addChild(knob);

      // Selection indicator
      if (isSelected) {
        const indicator = new Text({
          text: '>',
          style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 16, fontWeight: 'bold', fill: 0xffd700 }),
        });
        indicator.position.set(-18, -2);
        row.addChild(indicator);
      }

      this._sliderContainer.addChild(row);
    }

    // Mute status
    const muteY = this._sliders.length * 70 + 20;
    const muteText = new Text({
      text: `[M] Mute: ${AudioManager.instance.isMuted() ? 'ON' : 'OFF'}`,
      style: new TextStyle({
        fontFamily: '"Courier New", monospace',
        fontSize: 12,
        fill: AudioManager.instance.isMuted() ? 0xff6666 : 0x88ff88,
      }),
    });
    muteText.position.set(0, muteY);
    this._sliderContainer.addChild(muteText);
  }
}
