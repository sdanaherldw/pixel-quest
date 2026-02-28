import {
  AnimatedSprite,
  Container,
  Graphics,
  RenderTexture,
  Texture,
} from 'pixi.js';

import { Engine } from '@/engine/Engine';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/**
 * Definition of a single named animation.
 */
export interface AnimationDef {
  /** Indices into the sprite sheet's frame array. */
  frames: number[];

  /**
   * Duration of each frame in seconds.
   * E.g. `0.15` means ~6.67 FPS for this animation.
   */
  frameDuration: number;

  /** Whether the animation loops. @default true */
  loop: boolean;
}

/**
 * Standard directional animation names used by characters.
 */
export type DirectionalAnimName =
  | 'walk-down'
  | 'walk-up'
  | 'walk-left'
  | 'walk-right'
  | 'idle-down'
  | 'idle-up'
  | 'idle-left'
  | 'idle-right';

// ------------------------------------------------------------------
// ProceduralSpriteGenerator
// ------------------------------------------------------------------

/**
 * Generates simple placeholder sprite frames using PixiJS Graphics.
 *
 * Until real sprite sheets are available, this utility creates
 * coloured rectangle "characters" with minimal walking animation
 * (body parts shift slightly between frames).
 *
 * Each frame is rendered to a {@link RenderTexture} so the result
 * is a standard `Texture[]` compatible with {@link AnimatedSprite}.
 */
export class ProceduralSpriteGenerator {
  /**
   * Generate 4 walk-cycle frames for a simple rectangular character.
   *
   * The character is drawn as:
   * - A head (small rectangle on top)
   * - A body (larger rectangle in the middle)
   * - Two legs (thin rectangles that shift per frame)
   *
   * @param color  Base colour (hex) for the character.
   * @param width  Total frame width in pixels.  @default 32
   * @param height Total frame height in pixels. @default 48
   * @returns An array of 4 {@link Texture}s.
   */
  public static generateCharacterFrames(
    color: number,
    width: number = 32,
    height: number = 48,
  ): Texture[] {
    const renderer = Engine.instance.renderer;
    const textures: Texture[] = [];

    // Colour helpers — darken / lighten by a factor.
    const darker = ProceduralSpriteGenerator._adjustBrightness(color, -40);
    const lighter = ProceduralSpriteGenerator._adjustBrightness(color, 30);

    // Leg offsets per frame to simulate walking.
    const legOffsets = [
      { left: 0, right: 0 },   // frame 0 — standing
      { left: -3, right: 3 },  // frame 1 — step left
      { left: 0, right: 0 },   // frame 2 — standing (pass)
      { left: 3, right: -3 },  // frame 3 — step right
    ];

    for (let i = 0; i < 4; i++) {
      const g = new Graphics();

      const headW = width * 0.5;
      const headH = height * 0.2;
      const headX = (width - headW) / 2;
      const headY = 2;

      const bodyW = width * 0.6;
      const bodyH = height * 0.35;
      const bodyX = (width - bodyW) / 2;
      const bodyY = headY + headH + 1;

      const legW = width * 0.2;
      const legH = height * 0.3;
      const legBaseY = bodyY + bodyH + 1;

      const leftLegX = bodyX + 1 + legOffsets[i].left;
      const rightLegX = bodyX + bodyW - legW - 1 + legOffsets[i].right;

      // Legs (drawn first so body overlaps)
      g.rect(leftLegX, legBaseY, legW, legH).fill(darker);
      g.rect(rightLegX, legBaseY, legW, legH).fill(darker);

      // Body
      g.rect(bodyX, bodyY, bodyW, bodyH).fill(color);

      // Head
      g.rect(headX, headY, headW, headH).fill(lighter);

      // Render to texture
      const rt = RenderTexture.create({ width, height });
      renderer.render({ container: g, target: rt });

      textures.push(rt);
      g.destroy();
    }

    return textures;
  }

  /**
   * Generate a set of directional animation definitions for a
   * character using the standard 4-frame walk cycle.
   *
   * Returns both the textures (all 4 frames) and a map of animation
   * definitions for each direction.
   *
   * @param color  Base character colour.
   * @param width  Frame width.  @default 32
   * @param height Frame height. @default 48
   * @param frameDuration Seconds per frame. @default 0.15
   */
  public static generateDirectionalAnimations(
    color: number,
    width: number = 32,
    height: number = 48,
    frameDuration: number = 0.15,
  ): { textures: Texture[]; animations: Record<DirectionalAnimName, AnimationDef> } {
    const textures = ProceduralSpriteGenerator.generateCharacterFrames(
      color,
      width,
      height,
    );

    // For placeholders, all directions share the same frames.
    // Real sprites would have separate rows per direction.
    const animations: Record<DirectionalAnimName, AnimationDef> = {
      'walk-down':  { frames: [0, 1, 2, 3], frameDuration, loop: true },
      'walk-up':    { frames: [0, 1, 2, 3], frameDuration, loop: true },
      'walk-left':  { frames: [0, 1, 2, 3], frameDuration, loop: true },
      'walk-right': { frames: [0, 1, 2, 3], frameDuration, loop: true },
      'idle-down':  { frames: [0], frameDuration, loop: true },
      'idle-up':    { frames: [0], frameDuration, loop: true },
      'idle-left':  { frames: [0], frameDuration, loop: true },
      'idle-right': { frames: [0], frameDuration, loop: true },
    };

    return { textures, animations };
  }

  /**
   * Adjust the brightness of a hex colour by a signed offset.
   */
  private static _adjustBrightness(color: number, amount: number): number {
    const r = Math.max(0, Math.min(255, ((color >> 16) & 0xff) + amount));
    const g = Math.max(0, Math.min(255, ((color >> 8) & 0xff) + amount));
    const b = Math.max(0, Math.min(255, (color & 0xff) + amount));
    return (r << 16) | (g << 8) | b;
  }
}

// ------------------------------------------------------------------
// SpriteAnimator
// ------------------------------------------------------------------

/**
 * Sprite-sheet animation controller.
 *
 * Wraps a PixiJS {@link AnimatedSprite} and provides a higher-level
 * API for managing named animations (with per-animation frame
 * duration, looping, and directional variants).
 *
 * ### Usage
 *
 * ```ts
 * const { textures, animations } =
 *   ProceduralSpriteGenerator.generateDirectionalAnimations(0xff6644);
 *
 * const animator = new SpriteAnimator(textures);
 * for (const [name, def] of Object.entries(animations)) {
 *   animator.setAnimation(name, def);
 * }
 *
 * animator.play('walk-down');
 * scene.container.addChild(animator.container);
 * ```
 */
export class SpriteAnimator {
  // ------------------------------------------------------------------
  // Public
  // ------------------------------------------------------------------

  /**
   * The display container holding the animated sprite.
   * Add this to your scene graph.
   */
  public readonly container: Container;

  // ------------------------------------------------------------------
  // Private
  // ------------------------------------------------------------------

  /** The full set of textures (sprite sheet frames). */
  private readonly _textures: Texture[];

  /** The underlying PixiJS AnimatedSprite. */
  private _sprite: AnimatedSprite;

  /** Registered animation definitions keyed by name. */
  private readonly _animations: Map<string, AnimationDef> = new Map();

  /** Name of the currently active animation, or `null`. */
  private _currentAnimation: string | null = null;

  /** Whether the animator is currently playing. */
  private _playing: boolean = false;

  /** Elapsed time within the current frame (seconds). */
  private _frameTimer: number = 0;

  /** Index into the current animation's `frames` array. */
  private _frameIndex: number = 0;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  /**
   * Create a new SpriteAnimator.
   *
   * @param textures The full array of frame textures (sprite sheet).
   */
  constructor(textures: Texture[]) {
    if (textures.length === 0) {
      throw new Error(
        '[SpriteAnimator] At least one texture is required.',
      );
    }

    this._textures = textures;

    // Create the animated sprite with the first texture as default.
    this._sprite = new AnimatedSprite([textures[0]]);
    this._sprite.anchor.set(0.5);
    this._sprite.animationSpeed = 0; // We control animation manually.

    this.container = new Container();
    this.container.label = 'sprite-animator';
    this.container.addChild(this._sprite);
  }

  // ------------------------------------------------------------------
  // Accessors
  // ------------------------------------------------------------------

  /** The name of the currently playing animation, or `null`. */
  public get currentAnimation(): string | null {
    return this._currentAnimation;
  }

  /** Whether any animation is currently playing. */
  public get isPlaying(): boolean {
    return this._playing;
  }

  /** Direct access to the underlying AnimatedSprite. */
  public get sprite(): AnimatedSprite {
    return this._sprite;
  }

  // ------------------------------------------------------------------
  // Animation registration
  // ------------------------------------------------------------------

  /**
   * Register (or replace) a named animation definition.
   *
   * @param name  Unique animation name (e.g. `'walk-down'`).
   * @param def   The animation definition.
   */
  public setAnimation(name: string, def: AnimationDef): void {
    this._animations.set(name, def);
  }

  /**
   * Check whether an animation with the given name is registered.
   */
  public hasAnimation(name: string): boolean {
    return this._animations.has(name);
  }

  // ------------------------------------------------------------------
  // Playback controls
  // ------------------------------------------------------------------

  /**
   * Start playing a named animation.
   *
   * If the requested animation is already playing, this is a no-op
   * (to avoid restarting from frame 0). Pass `force = true` to
   * restart regardless.
   *
   * @param name  Animation name.
   * @param force Restart even if already playing this animation.
   */
  public play(name: string, force: boolean = false): void {
    if (!force && this._currentAnimation === name && this._playing) {
      return;
    }

    const def = this._animations.get(name);
    if (!def) {
      throw new Error(
        `[SpriteAnimator] Unknown animation "${name}".`,
      );
    }

    this._currentAnimation = name;
    this._playing = true;
    this._frameIndex = 0;
    this._frameTimer = 0;

    // Set the sprite to the first frame of this animation.
    this._applyFrame(def);
  }

  /**
   * Stop the current animation. The sprite remains on whatever frame
   * it was displaying.
   */
  public stop(): void {
    this._playing = false;
  }

  // ------------------------------------------------------------------
  // Per-frame update
  // ------------------------------------------------------------------

  /**
   * Advance the animation by `dt` seconds.
   *
   * Call this once per frame from your scene's `update()`.
   *
   * @param dt Frame delta in seconds.
   */
  public update(dt: number): void {
    if (!this._playing || !this._currentAnimation) return;

    const def = this._animations.get(this._currentAnimation);
    if (!def) return;

    this._frameTimer += dt;

    if (this._frameTimer >= def.frameDuration) {
      this._frameTimer -= def.frameDuration;
      this._frameIndex++;

      if (this._frameIndex >= def.frames.length) {
        if (def.loop) {
          this._frameIndex = 0;
        } else {
          this._frameIndex = def.frames.length - 1;
          this._playing = false;
        }
      }

      this._applyFrame(def);
    }
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  /**
   * Destroy the animator and its underlying sprite.
   */
  public destroy(): void {
    this._sprite.destroy();
    this.container.destroy({ children: true });
    this._animations.clear();
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Apply the texture for the current frame index.
   */
  private _applyFrame(def: AnimationDef): void {
    const textureIndex = def.frames[this._frameIndex];
    if (textureIndex >= 0 && textureIndex < this._textures.length) {
      this._sprite.texture = this._textures[textureIndex];
    }
  }
}
