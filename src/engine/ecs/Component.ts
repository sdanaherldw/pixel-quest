import type { Container } from 'pixi.js';

// ---------------------------------------------------------------------------
// Component Type Keys
// ---------------------------------------------------------------------------

/**
 * Type-safe string constants for every built-in component.
 *
 * Using a frozen object (`as const`) instead of a TypeScript `enum` so that
 * the values are plain strings at runtime – friendlier for serialisation,
 * debugging output, and Map keys.
 */
export const ComponentType = {
  Transform: 'Transform',
  Velocity: 'Velocity',
  Sprite: 'Sprite',
  Health: 'Health',
  Collider: 'Collider',
  Input: 'Input',
  Animation: 'Animation',
  Tag: 'Tag',
} as const;

/** Union of every built-in component key string. */
export type ComponentTypeKey = (typeof ComponentType)[keyof typeof ComponentType];

// ---------------------------------------------------------------------------
// Component Data Interfaces
// ---------------------------------------------------------------------------

/** 2-D spatial transform (position, rotation, non-uniform scale). */
export interface TransformComponent {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/** Linear velocity in pixels per second. */
export interface VelocityComponent {
  vx: number;
  vy: number;
}

/**
 * Visual representation backed by a PixiJS Container (typically a Sprite).
 *
 * `container` is `null` until the render system attaches a display object.
 */
export interface SpriteComponent {
  container: Container | null;
  textureId: string;
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
}

/** Hit-points with optional passive regeneration. */
export interface HealthComponent {
  current: number;
  max: number;
  /** HP restored per second. */
  regenRate: number;
}

/** Axis-aligned collision shape. */
export interface ColliderComponent {
  type: 'box' | 'circle';
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  /** When `true` the collider raises events but does not resolve overlaps. */
  isTrigger: boolean;
}

/** Marks an entity as player-controlled. */
export interface InputComponent {
  controlled: boolean;
}

/** Frame-based sprite animation state. */
export interface AnimationComponent {
  currentAnim: string;
  frame: number;
  /** Seconds elapsed since the current frame started. */
  elapsed: number;
  /** Playback speed multiplier (1 = normal). */
  speed: number;
}

/** Flexible string tags for quick categorisation (`'player'`, `'enemy'`, …). */
export interface TagComponent {
  tags: Set<string>;
}

// ---------------------------------------------------------------------------
// Component Map – maps component key strings to their concrete data types
// ---------------------------------------------------------------------------

/**
 * Master mapping from component name → data interface.
 *
 * Every built-in component is listed here so that generic helpers such as
 * `Entity.addComponent` and `Entity.getComponent` can infer the correct type
 * from a string literal key.
 *
 * Game-specific components can be added by extending this interface via
 * declaration merging:
 *
 * ```ts
 * declare module '@/engine/ecs/Component' {
 *   interface ComponentMap {
 *     MyCustom: { foo: number };
 *   }
 * }
 * ```
 */
export interface ComponentMap {
  [ComponentType.Transform]: TransformComponent;
  [ComponentType.Velocity]: VelocityComponent;
  [ComponentType.Sprite]: SpriteComponent;
  [ComponentType.Health]: HealthComponent;
  [ComponentType.Collider]: ColliderComponent;
  [ComponentType.Input]: InputComponent;
  [ComponentType.Animation]: AnimationComponent;
  [ComponentType.Tag]: TagComponent;
  /** Escape-hatch for components not yet registered in the map. */
  [key: string]: unknown;
}
