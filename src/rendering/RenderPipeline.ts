import { Container } from 'pixi.js';

import { Engine } from '@/engine/Engine';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/**
 * Configuration for a single render layer.
 */
export interface RenderLayerConfig {
  /** Unique name of the layer (e.g. 'terrain', 'entities'). */
  name: string;

  /** Z-order index. Lower values render behind higher values. */
  zIndex: number;
}

/**
 * A post-processing pass that operates on the rendered frame.
 *
 * Post-processing is deferred; passes are registered and will be
 * applied when a shader pipeline is implemented. For now this
 * interface reserves the extension point.
 */
export interface PostProcessingPass {
  /** Unique name identifying this pass. */
  readonly name: string;

  /** Priority — lower values run first. */
  readonly order: number;

  /** Whether the pass is currently active. */
  enabled: boolean;

  /**
   * Apply the pass. The concrete implementation will be filled in
   * once the painterly shader system is built.
   *
   * @param _dt Frame delta in seconds.
   */
  apply(_dt: number): void;
}

// ------------------------------------------------------------------
// Default layer definitions
// ------------------------------------------------------------------

/** The default set of named render layers, ordered back to front. */
const DEFAULT_LAYERS: RenderLayerConfig[] = [
  { name: 'background', zIndex: 0 },
  { name: 'terrain', zIndex: 10 },
  { name: 'entities', zIndex: 20 },
  { name: 'particles', zIndex: 30 },
  { name: 'foreground', zIndex: 40 },
  { name: 'lighting', zIndex: 50 },
  { name: 'ui', zIndex: 60 },
];

// ------------------------------------------------------------------
// RenderPipeline
// ------------------------------------------------------------------

/**
 * Manages named render layers as PixiJS {@link Container}s attached
 * to the engine's stage.
 *
 * Each layer is a Container with a configurable `zIndex` so that
 * display objects can be added to the correct depth bucket without
 * worrying about insertion order.
 *
 * The pipeline also supports registration of {@link PostProcessingPass}
 * instances that will be invoked (in order) after the main scene has
 * rendered. The actual GPU post-processing will be wired up when the
 * painterly shader is implemented; for now the passes are stored and
 * their `apply()` method is called each frame.
 *
 * ### Usage
 *
 * ```ts
 * const pipeline = new RenderPipeline();
 * pipeline.addToLayer('entities', playerSprite);
 * pipeline.addToLayer('particles', sparkleEmitter);
 * ```
 */
export class RenderPipeline {
  // ------------------------------------------------------------------
  // Internal state
  // ------------------------------------------------------------------

  /** Map of layer name -> Container. */
  private readonly _layers: Map<string, Container> = new Map();

  /** The root container that holds all layers. */
  private readonly _root: Container;

  /** Registered post-processing passes, kept sorted by `order`. */
  private readonly _postProcessingPasses: PostProcessingPass[] = [];

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  /**
   * Create a new RenderPipeline and attach the default layers to the
   * given parent container. If no parent is provided the Engine's
   * world container is used.
   *
   * @param parent Optional parent container. Defaults to
   *   `Engine.instance.worldContainer`.
   */
  constructor(parent?: Container) {
    this._root = parent ?? Engine.instance.worldContainer;

    // Ensure zIndex sorting is enabled on the root.
    this._root.sortableChildren = true;

    // Bootstrap the default layers.
    for (const cfg of DEFAULT_LAYERS) {
      this.addLayer(cfg.name, cfg.zIndex);
    }
  }

  // ------------------------------------------------------------------
  // Layer management
  // ------------------------------------------------------------------

  /**
   * Create a new named render layer and attach it to the root.
   *
   * If a layer with the same name already exists an error is thrown.
   *
   * @param name  Unique layer name.
   * @param zIndex  Draw-order index (lower = further back).
   * @returns The newly created Container for the layer.
   */
  public addLayer(name: string, zIndex: number): Container {
    if (this._layers.has(name)) {
      throw new Error(
        `[RenderPipeline] Layer "${name}" already exists.`,
      );
    }

    const container = new Container();
    container.label = `layer:${name}`;
    container.zIndex = zIndex;
    container.sortableChildren = true;

    this._layers.set(name, container);
    this._root.addChild(container);

    return container;
  }

  /**
   * Retrieve the Container for a named layer.
   *
   * @param name Layer name.
   * @returns The layer Container, or `undefined` if it does not exist.
   */
  public getLayer(name: string): Container | undefined {
    return this._layers.get(name);
  }

  /**
   * Add a display object to a named layer.
   *
   * @param name          Layer name.
   * @param displayObject The PixiJS display object to add.
   * @throws If the layer does not exist.
   */
  public addToLayer(name: string, displayObject: Container): void {
    const layer = this._layers.get(name);
    if (!layer) {
      throw new Error(
        `[RenderPipeline] Cannot add to unknown layer "${name}".`,
      );
    }
    layer.addChild(displayObject);
  }

  /**
   * Remove a display object from a named layer.
   *
   * @param name          Layer name.
   * @param displayObject The PixiJS display object to remove.
   * @throws If the layer does not exist.
   */
  public removeFromLayer(name: string, displayObject: Container): void {
    const layer = this._layers.get(name);
    if (!layer) {
      throw new Error(
        `[RenderPipeline] Cannot remove from unknown layer "${name}".`,
      );
    }
    layer.removeChild(displayObject);
  }

  /**
   * Remove a named layer and destroy its container (and children).
   *
   * @param name Layer name to remove.
   */
  public removeLayer(name: string): void {
    const layer = this._layers.get(name);
    if (!layer) return;

    this._root.removeChild(layer);
    layer.destroy({ children: true });
    this._layers.delete(name);
  }

  /**
   * Returns an iterator over all `[name, container]` layer entries.
   */
  public get layers(): IterableIterator<[string, Container]> {
    return this._layers.entries();
  }

  // ------------------------------------------------------------------
  // Post-processing
  // ------------------------------------------------------------------

  /**
   * Register a post-processing pass.
   *
   * Passes are kept sorted by their {@link PostProcessingPass.order}
   * value so they execute in a deterministic sequence.
   *
   * @param pass The pass to register.
   */
  public addPostProcessingPass(pass: PostProcessingPass): void {
    this._postProcessingPasses.push(pass);
    this._postProcessingPasses.sort((a, b) => a.order - b.order);
  }

  /**
   * Unregister a post-processing pass by name.
   *
   * @param name Name of the pass to remove.
   * @returns `true` if a pass was removed.
   */
  public removePostProcessingPass(name: string): boolean {
    const idx = this._postProcessingPasses.findIndex(
      (p) => p.name === name,
    );
    if (idx === -1) return false;
    this._postProcessingPasses.splice(idx, 1);
    return true;
  }

  /**
   * Run all enabled post-processing passes in order.
   *
   * This should be called once per frame after the main render.
   *
   * @param dt Frame delta in seconds.
   */
  public applyPostProcessing(dt: number): void {
    for (const pass of this._postProcessingPasses) {
      if (pass.enabled) {
        pass.apply(dt);
      }
    }
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  /**
   * Destroy all layers and clear internal state.
   */
  public destroy(): void {
    for (const [, layer] of this._layers) {
      this._root.removeChild(layer);
      layer.destroy({ children: true });
    }
    this._layers.clear();
    this._postProcessingPasses.length = 0;
  }
}
