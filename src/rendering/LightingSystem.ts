import { Container, Graphics } from 'pixi.js';

import { Engine } from '@/engine/Engine';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/** Type of light source. */
export type LightType = 'point' | 'spot' | 'ambient';

/**
 * Configuration for a single light source.
 */
export interface LightSource {
  /** Unique identifier for this light (auto-generated if omitted). */
  id?: string;

  /** World X position of the light. */
  x: number;

  /** World Y position of the light. */
  y: number;

  /** Radius of illumination in world pixels. */
  radius: number;

  /** Light colour (hex).  @default 0xffffff */
  color?: number;

  /** Light intensity (0-1).  @default 1 */
  intensity?: number;

  /** Type of light source.  @default 'point' */
  type?: LightType;

  /**
   * For 'spot' lights: the direction angle in radians.
   * @default 0
   */
  angle?: number;

  /**
   * For 'spot' lights: the cone width in radians.
   * @default Math.PI / 4
   */
  coneWidth?: number;
}

/**
 * Internal representation of a light with all fields resolved.
 */
interface ResolvedLight {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  type: LightType;
  angle: number;
  coneWidth: number;
}

// ------------------------------------------------------------------
// LightingSystem
// ------------------------------------------------------------------

/**
 * Dynamic 2-D lighting system using a PixiJS Graphics overlay.
 *
 * The system works by drawing a full-screen darkness rectangle and
 * then "cutting out" circular gradients for each point / spot light.
 * The overlay uses the `'multiply'` blend mode so it darkens the
 * scene underneath.
 *
 * ### How it works
 *
 * 1. A semi-transparent black rectangle covers the entire viewport
 *    (opacity controlled by {@link ambientLevel}).
 * 2. For each light, concentric circles with decreasing alpha are
 *    drawn in the _light's_ colour, effectively "erasing" the
 *    darkness at that point and tinting the surroundings.
 * 3. The overlay container is set to `blendMode = 'multiply'` so
 *    the effect composites naturally onto the scene.
 *
 * ### Day / night cycle
 *
 * Adjust {@link ambientLevel} between `1` (full daylight, no overlay)
 * and `0` (total darkness). Values around `0.3–0.5` produce a
 * convincing night-time look when combined with warm point lights.
 *
 * ### Usage
 *
 * ```ts
 * const lighting = new LightingSystem();
 * scene.container.addChild(lighting.container);
 *
 * lighting.setAmbient(0.3); // night-time
 * const torchId = lighting.addLight({
 *   x: 200, y: 300, radius: 120,
 *   color: 0xffaa44, intensity: 0.9,
 * });
 *
 * // Each frame:
 * lighting.update();
 * ```
 */
export class LightingSystem {
  // ------------------------------------------------------------------
  // Public
  // ------------------------------------------------------------------

  /**
   * The display container holding the darkness overlay.
   * Add this to the appropriate render layer (typically 'lighting').
   */
  public readonly container: Container;

  // ------------------------------------------------------------------
  // Private
  // ------------------------------------------------------------------

  /** All registered light sources. */
  private readonly _lights: Map<string, ResolvedLight> = new Map();

  /** Auto-increment counter for generating unique light IDs. */
  private _nextId: number = 0;

  /**
   * Ambient light level (0-1).
   * * `1` = full daylight (overlay is invisible).
   * * `0` = total darkness (overlay is fully opaque).
   */
  private _ambientLevel: number = 1;

  /** The Graphics object used to draw the darkness overlay. */
  private readonly _overlay: Graphics;

  /** Number of gradient rings per light (more = smoother). */
  private readonly _gradientSteps: number = 8;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor() {
    this._overlay = new Graphics();
    this._overlay.label = 'lighting-overlay';

    this.container = new Container();
    this.container.label = 'lighting-system';
    this.container.blendMode = 'multiply';
    this.container.addChild(this._overlay);
  }

  // ------------------------------------------------------------------
  // Ambient control
  // ------------------------------------------------------------------

  /** Current ambient light level (0-1). */
  public get ambientLevel(): number {
    return this._ambientLevel;
  }

  /**
   * Set the ambient light level.
   *
   * @param level Value between 0 (total darkness) and 1 (full daylight).
   */
  public setAmbient(level: number): void {
    this._ambientLevel = Math.max(0, Math.min(1, level));
  }

  // ------------------------------------------------------------------
  // Light management
  // ------------------------------------------------------------------

  /**
   * Add a new light source.
   *
   * @param config Light configuration.
   * @returns The unique ID assigned to this light (use for removal).
   */
  public addLight(config: LightSource): string {
    const id = config.id ?? `light_${this._nextId++}`;

    const resolved: ResolvedLight = {
      id,
      x: config.x,
      y: config.y,
      radius: config.radius,
      color: config.color ?? 0xffffff,
      intensity: config.intensity ?? 1,
      type: config.type ?? 'point',
      angle: config.angle ?? 0,
      coneWidth: config.coneWidth ?? Math.PI / 4,
    };

    this._lights.set(id, resolved);
    return id;
  }

  /**
   * Remove a light source by ID.
   *
   * @param id The light's unique identifier.
   * @returns `true` if the light was found and removed.
   */
  public removeLight(id: string): boolean {
    return this._lights.delete(id);
  }

  /**
   * Get a light source by ID (for runtime position updates, etc.).
   *
   * @returns The light object, or `undefined`.
   */
  public getLight(id: string): ResolvedLight | undefined {
    return this._lights.get(id);
  }

  /**
   * Update properties of an existing light source.
   *
   * @param id      Light ID.
   * @param changes Partial light properties to merge.
   */
  public updateLight(id: string, changes: Partial<LightSource>): void {
    const light = this._lights.get(id);
    if (!light) return;

    if (changes.x !== undefined) light.x = changes.x;
    if (changes.y !== undefined) light.y = changes.y;
    if (changes.radius !== undefined) light.radius = changes.radius;
    if (changes.color !== undefined) light.color = changes.color;
    if (changes.intensity !== undefined) light.intensity = changes.intensity;
    if (changes.type !== undefined) light.type = changes.type;
    if (changes.angle !== undefined) light.angle = changes.angle;
    if (changes.coneWidth !== undefined) light.coneWidth = changes.coneWidth;
  }

  /** Number of registered lights. */
  public get lightCount(): number {
    return this._lights.size;
  }

  /**
   * Remove all lights.
   */
  public clearLights(): void {
    this._lights.clear();
  }

  // ------------------------------------------------------------------
  // Per-frame update
  // ------------------------------------------------------------------

  /**
   * Redraw the lighting overlay.
   *
   * Call this once per frame. It clears the overlay and redraws the
   * darkness rectangle plus all light cutouts based on current camera
   * position and ambient level.
   */
  public update(): void {
    const g = this._overlay;
    g.clear();

    // At full daylight, skip rendering entirely.
    if (this._ambientLevel >= 1) {
      return;
    }

    const camera = Engine.instance.camera;
    const bounds = camera.getBounds();

    // Darkness opacity is the inverse of ambient level.
    const darknessAlpha = 1 - this._ambientLevel;

    // Draw the full-viewport darkness rectangle.
    // We use a dark-grey colour (not pure black) so that the multiply
    // blend darkens without completely destroying colour information.
    const darknessColor = this._alphaToGrey(darknessAlpha);

    g.rect(bounds.x, bounds.y, bounds.width, bounds.height)
      .fill({ color: darknessColor, alpha: 1 });

    // Draw light cutouts. Each light "brightens" the darkness by
    // drawing concentric circles that transition from the light's
    // colour (at centre) back to the darkness colour (at radius edge).
    for (const [, light] of this._lights) {
      this._drawLight(g, light, darknessAlpha);
    }
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  /**
   * Destroy the lighting system and release GPU resources.
   */
  public destroy(): void {
    this._lights.clear();
    this._overlay.destroy();
    this.container.destroy({ children: true });
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Draw a single light as concentric gradient circles that blend
   * from "bright" at the centre to the surrounding darkness at the
   * edge.
   */
  private _drawLight(
    g: Graphics,
    light: ResolvedLight,
    darknessAlpha: number,
  ): void {
    if (light.type === 'ambient') {
      // Ambient lights are handled via the global ambient level;
      // nothing to draw per-source.
      return;
    }

    const steps = this._gradientSteps;
    const intensity = light.intensity;

    // Decompose the light colour into RGB components.
    const lr = ((light.color >> 16) & 0xff) / 255;
    const lg = ((light.color >> 8) & 0xff) / 255;
    const lb = (light.color & 0xff) / 255;

    // The darkness overlay is a solid grey value. At the light centre
    // we want to "undo" the darkness (push the grey towards white)
    // and tint with the light colour.
    const darknessGrey = 1 - darknessAlpha;

    // Draw rings from outermost (darkest) to innermost (brightest).
    for (let i = steps; i >= 0; i--) {
      const t = i / steps; // 0 (centre) ... 1 (edge)
      const radius = light.radius * t;

      // Blend factor: 1 at centre, 0 at edge (quadratic falloff).
      const blend = (1 - t * t) * intensity;

      // Interpolate between darkness grey and the illuminated colour.
      const r = darknessGrey + blend * (lr - darknessGrey);
      const gc = darknessGrey + blend * (lg - darknessGrey);
      const b = darknessGrey + blend * (lb - darknessGrey);

      const hexColor =
        (Math.round(r * 255) << 16) |
        (Math.round(gc * 255) << 8) |
        Math.round(b * 255);

      g.circle(light.x, light.y, Math.max(radius, 1))
        .fill({ color: hexColor, alpha: 1 });
    }
  }

  /**
   * Convert an alpha (0-1 darkness) to a grey hex value.
   *
   * The multiply blend mode works by multiplying screen colours by
   * the overlay colour. A value of 0xFFFFFF leaves the scene
   * unchanged; lower values darken it.
   *
   * @param alpha Darkness level (0 = no darkening, 1 = black).
   * @returns 24-bit grey hex colour.
   */
  private _alphaToGrey(alpha: number): number {
    const grey = Math.round((1 - alpha) * 255);
    return (grey << 16) | (grey << 8) | grey;
  }
}
