// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

/** A physical key identifier (uses `KeyboardEvent.code` values). */
export type KeyCode = string;

/** A named game action (e.g. "moveUp", "attack"). */
export type ActionName = string;

/** Mouse / pointer button index. */
export const enum PointerButton {
  Left = 0,
  Middle = 1,
  Right = 2,
}

/** Read-only snapshot of the pointer state. */
export interface PointerState {
  /** Pointer position in screen (CSS) pixels. */
  readonly x: number;
  readonly y: number;

  /** Bitfield of currently-held mouse buttons (`1 << button`). */
  readonly buttons: number;
}

/** Binding entry: an action can be triggered by any of its bound keys. */
export interface ActionBinding {
  /** Physical key codes that trigger this action. */
  keys: KeyCode[];
}

// ------------------------------------------------------------------
// Internal key state
// ------------------------------------------------------------------

interface KeyState {
  /** `true` while the key is physically held down. */
  down: boolean;

  /** `true` only during the frame the key transitioned to down. */
  justPressed: boolean;

  /** `true` only during the frame the key transitioned to up. */
  justReleased: boolean;
}

// ------------------------------------------------------------------
// Default action map
// ------------------------------------------------------------------

function createDefaultActionMap(): Map<ActionName, ActionBinding> {
  const m = new Map<ActionName, ActionBinding>();

  // Movement
  m.set('moveUp', { keys: ['KeyW', 'ArrowUp'] });
  m.set('moveDown', { keys: ['KeyS', 'ArrowDown'] });
  m.set('moveLeft', { keys: ['KeyA', 'ArrowLeft'] });
  m.set('moveRight', { keys: ['KeyD', 'ArrowRight'] });

  // Actions
  m.set('jump', { keys: ['Space'] });
  m.set('attack', { keys: ['KeyJ', 'KeyZ'] });
  m.set('spell', { keys: ['KeyK', 'KeyX'] });
  m.set('interact', { keys: ['KeyE', 'Enter'] });
  m.set('dodge', { keys: ['ShiftLeft', 'ShiftRight'] });

  // Menus / party
  m.set('openMenu', { keys: ['Escape'] });
  m.set('partyCommand', { keys: ['Tab'] });
  m.set('swapLeader', { keys: ['KeyQ'] });

  // Quick slots
  m.set('quickSlot1', { keys: ['Digit1'] });
  m.set('quickSlot2', { keys: ['Digit2'] });
  m.set('quickSlot3', { keys: ['Digit3'] });
  m.set('quickSlot4', { keys: ['Digit4'] });

  return m;
}

// ------------------------------------------------------------------
// InputManager
// ------------------------------------------------------------------

/**
 * Unified input manager with **action mapping**.
 *
 * Physical keyboard keys are mapped to named game actions.  This
 * allows rebinding at runtime and abstracts away physical layout
 * differences.
 *
 * Three query modes per action:
 * - **active** – held down right now.
 * - **justPressed** – transitioned to down *this frame*.
 * - **justReleased** – transitioned to up *this frame*.
 *
 * The engine calls {@link update} once per frame **after** all game
 * logic to reset the per-frame edge flags.
 *
 * Pointer (mouse / touch) position and button state are also tracked.
 */
export class InputManager {
  // ------------------------------------------------------------------
  // Private state
  // ------------------------------------------------------------------

  /** Per-key state indexed by `KeyboardEvent.code`. */
  private readonly _keys: Map<KeyCode, KeyState> = new Map();

  /** Keys that transitioned this frame – cleared during `update()`. */
  private readonly _justPressedQueue: KeyCode[] = [];
  private readonly _justReleasedQueue: KeyCode[] = [];

  /** Action → binding map (rebindable at runtime). */
  private readonly _actions: Map<ActionName, ActionBinding>;

  /** Current pointer state. */
  private _pointer: PointerState = { x: 0, y: 0, buttons: 0 };

  // Bound listener references (needed for clean removal).
  private readonly _onKeyDown: (e: KeyboardEvent) => void;
  private readonly _onKeyUp: (e: KeyboardEvent) => void;
  private readonly _onPointerMove: (e: PointerEvent) => void;
  private readonly _onPointerDown: (e: PointerEvent) => void;
  private readonly _onPointerUp: (e: PointerEvent) => void;
  private readonly _onContextMenu: (e: Event) => void;

  // ------------------------------------------------------------------
  // Constructor
  // ------------------------------------------------------------------

  constructor(actionMap?: Map<ActionName, ActionBinding>) {
    this._actions = actionMap ?? createDefaultActionMap();

    // Bind listeners.
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onContextMenu = (e: Event) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('contextmenu', this._onContextMenu);
  }

  // ------------------------------------------------------------------
  // Action queries
  // ------------------------------------------------------------------

  /**
   * `true` while *any* key bound to `action` is held down.
   */
  public isActionActive(action: ActionName): boolean {
    const binding = this._actions.get(action);
    if (!binding) return false;

    for (const code of binding.keys) {
      const state = this._keys.get(code);
      if (state?.down) return true;
    }
    return false;
  }

  /**
   * `true` only during the frame a key bound to `action` was first pressed.
   */
  public isActionJustPressed(action: ActionName): boolean {
    const binding = this._actions.get(action);
    if (!binding) return false;

    for (const code of binding.keys) {
      const state = this._keys.get(code);
      if (state?.justPressed) return true;
    }
    return false;
  }

  /**
   * `true` only during the frame a key bound to `action` was released.
   */
  public isActionJustReleased(action: ActionName): boolean {
    const binding = this._actions.get(action);
    if (!binding) return false;

    for (const code of binding.keys) {
      const state = this._keys.get(code);
      if (state?.justReleased) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------
  // Raw key queries
  // ------------------------------------------------------------------

  /** `true` while the physical key is held. */
  public isKeyDown(code: KeyCode): boolean {
    return this._keys.get(code)?.down ?? false;
  }

  /** `true` only during the frame the physical key was first pressed. */
  public isKeyJustPressed(code: KeyCode): boolean {
    return this._keys.get(code)?.justPressed ?? false;
  }

  /** `true` only during the frame the physical key was released. */
  public isKeyJustReleased(code: KeyCode): boolean {
    return this._keys.get(code)?.justReleased ?? false;
  }

  // ------------------------------------------------------------------
  // Pointer
  // ------------------------------------------------------------------

  /** Current pointer / mouse state. */
  public get pointer(): PointerState {
    return this._pointer;
  }

  /** `true` while the given mouse button is held. */
  public isPointerButtonDown(button: PointerButton): boolean {
    return (this._pointer.buttons & (1 << button)) !== 0;
  }

  // ------------------------------------------------------------------
  // Binding management
  // ------------------------------------------------------------------

  /** Return the current binding for an action (or `undefined`). */
  public getBinding(action: ActionName): Readonly<ActionBinding> | undefined {
    return this._actions.get(action);
  }

  /** Overwrite the key list for an existing action. */
  public rebind(action: ActionName, keys: KeyCode[]): void {
    const binding = this._actions.get(action);
    if (binding) {
      binding.keys = [...keys];
    } else {
      this._actions.set(action, { keys: [...keys] });
    }
  }

  /** Register a brand-new action. */
  public registerAction(action: ActionName, keys: KeyCode[]): void {
    this._actions.set(action, { keys: [...keys] });
  }

  /** Return all registered action names. */
  public get actionNames(): ReadonlyArray<ActionName> {
    return [...this._actions.keys()];
  }

  // ------------------------------------------------------------------
  // Per-frame update (called by Engine AFTER game logic)
  // ------------------------------------------------------------------

  /**
   * Clears the per-frame edge flags (`justPressed`, `justReleased`).
   * Must be called **exactly once per frame** after all game logic.
   */
  public update(): void {
    for (const code of this._justPressedQueue) {
      const state = this._keys.get(code);
      if (state) state.justPressed = false;
    }
    this._justPressedQueue.length = 0;

    for (const code of this._justReleasedQueue) {
      const state = this._keys.get(code);
      if (state) state.justReleased = false;
    }
    this._justReleasedQueue.length = 0;
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  /** Remove all event listeners. */
  public destroy(): void {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('contextmenu', this._onContextMenu);
    this._keys.clear();
    this._justPressedQueue.length = 0;
    this._justReleasedQueue.length = 0;
  }

  // ------------------------------------------------------------------
  // DOM event handlers
  // ------------------------------------------------------------------

  private _handleKeyDown(e: KeyboardEvent): void {
    // Prevent default for game keys to avoid browser shortcuts.
    // Allow F-keys and some combos through.
    if (!e.code.startsWith('F') && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
    }

    const code = e.code;
    let state = this._keys.get(code);

    if (!state) {
      state = { down: false, justPressed: false, justReleased: false };
      this._keys.set(code, state);
    }

    // Ignore OS key repeat.
    if (state.down) return;

    state.down = true;
    state.justPressed = true;
    this._justPressedQueue.push(code);
  }

  private _handleKeyUp(e: KeyboardEvent): void {
    const code = e.code;
    let state = this._keys.get(code);

    if (!state) {
      state = { down: false, justPressed: false, justReleased: false };
      this._keys.set(code, state);
    }

    state.down = false;
    state.justReleased = true;
    this._justReleasedQueue.push(code);
  }

  private _handlePointerMove(e: PointerEvent): void {
    this._pointer = {
      x: e.clientX,
      y: e.clientY,
      buttons: e.buttons,
    };
  }

  private _handlePointerDown(e: PointerEvent): void {
    this._pointer = {
      x: e.clientX,
      y: e.clientY,
      buttons: e.buttons,
    };
  }

  private _handlePointerUp(e: PointerEvent): void {
    this._pointer = {
      x: e.clientX,
      y: e.clientY,
      buttons: e.buttons,
    };
  }
}
