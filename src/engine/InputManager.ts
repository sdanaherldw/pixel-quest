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
// Internal gamepad button state
// ------------------------------------------------------------------

interface GamepadButtonState {
  /** `true` while the button is physically held down. */
  down: boolean;

  /** `true` only during the frame the button transitioned to down. */
  justPressed: boolean;

  /** `true` only during the frame the button transitioned to up. */
  justReleased: boolean;
}

/** Maps a standard gamepad button index to a game action. */
interface GamepadButtonMapping {
  buttonIndex: number;
  action: ActionName;
}

/** Threshold for analog stick axes to count as "pressed". */
const GAMEPAD_AXIS_THRESHOLD = 0.5;

/** Standard Gamepad button → action mappings. */
const GAMEPAD_BUTTON_MAP: GamepadButtonMapping[] = [
  { buttonIndex: 0, action: 'jump' },       // A
  { buttonIndex: 1, action: 'dodge' },       // B
  { buttonIndex: 2, action: 'attack' },      // X
  { buttonIndex: 3, action: 'spell' },       // Y
  { buttonIndex: 4, action: 'swapLeader' },  // LB
  { buttonIndex: 5, action: 'partyCommand' },// RB
  { buttonIndex: 9, action: 'openMenu' },    // Start
  { buttonIndex: 12, action: 'moveUp' },     // D-pad Up
  { buttonIndex: 13, action: 'moveDown' },   // D-pad Down
  { buttonIndex: 14, action: 'moveLeft' },   // D-pad Left
  { buttonIndex: 15, action: 'moveRight' },  // D-pad Right
];

/** Left stick axis → action mappings (axis index, direction sign, action). */
const GAMEPAD_AXIS_MAP: { axis: number; sign: -1 | 1; action: ActionName }[] = [
  { axis: 0, sign: -1, action: 'moveLeft' },
  { axis: 0, sign: 1, action: 'moveRight' },
  { axis: 1, sign: -1, action: 'moveUp' },
  { axis: 1, sign: 1, action: 'moveDown' },
];

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

  /** Whether a gamepad is currently connected. */
  private _gamepadConnected = false;

  /** Index of the active gamepad (first one connected). */
  private _gamepadIndex = -1;

  /**
   * Per-gamepad-input state keyed by a virtual key like `Gamepad0`, `GamepadAxisLeft`, etc.
   * These are tracked separately from keyboard keys so the two never interfere.
   */
  private readonly _gamepadButtons: Map<string, GamepadButtonState> = new Map();

  /** Gamepad virtual keys that transitioned this frame – cleared during `update()`. */
  private readonly _gpJustPressedQueue: string[] = [];
  private readonly _gpJustReleasedQueue: string[] = [];

  // Bound listener references (needed for clean removal).
  private readonly _onKeyDown: (e: KeyboardEvent) => void;
  private readonly _onKeyUp: (e: KeyboardEvent) => void;
  private readonly _onPointerMove: (e: PointerEvent) => void;
  private readonly _onPointerDown: (e: PointerEvent) => void;
  private readonly _onPointerUp: (e: PointerEvent) => void;
  private readonly _onContextMenu: (e: Event) => void;
  private readonly _onGamepadConnected: (e: GamepadEvent) => void;
  private readonly _onGamepadDisconnected: (e: GamepadEvent) => void;

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

    this._onGamepadConnected = this._handleGamepadConnected.bind(this);
    this._onGamepadDisconnected = this._handleGamepadDisconnected.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('gamepadconnected', this._onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);
  }

  // ------------------------------------------------------------------
  // Gamepad
  // ------------------------------------------------------------------

  /** `true` when a gamepad is currently connected. */
  public get gamepadConnected(): boolean {
    return this._gamepadConnected;
  }

  // ------------------------------------------------------------------
  // Action queries
  // ------------------------------------------------------------------

  /**
   * `true` while *any* key bound to `action` is held down
   * (keyboard **or** gamepad).
   */
  public isActionActive(action: ActionName): boolean {
    const binding = this._actions.get(action);
    if (!binding) return false;

    for (const code of binding.keys) {
      const state = this._keys.get(code);
      if (state?.down) return true;
    }

    // Check gamepad virtual keys for this action.
    const gpState = this._gamepadButtons.get(action);
    if (gpState?.down) return true;

    return false;
  }

  /**
   * `true` only during the frame a key bound to `action` was first pressed
   * (keyboard **or** gamepad).
   */
  public isActionJustPressed(action: ActionName): boolean {
    const binding = this._actions.get(action);
    if (!binding) return false;

    for (const code of binding.keys) {
      const state = this._keys.get(code);
      if (state?.justPressed) return true;
    }

    const gpState = this._gamepadButtons.get(action);
    if (gpState?.justPressed) return true;

    return false;
  }

  /**
   * `true` only during the frame a key bound to `action` was released
   * (keyboard **or** gamepad).
   */
  public isActionJustReleased(action: ActionName): boolean {
    const binding = this._actions.get(action);
    if (!binding) return false;

    for (const code of binding.keys) {
      const state = this._keys.get(code);
      if (state?.justReleased) return true;
    }

    const gpState = this._gamepadButtons.get(action);
    if (gpState?.justReleased) return true;

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
   * Clears the per-frame edge flags (`justPressed`, `justReleased`)
   * and polls gamepad state.
   * Must be called **exactly once per frame** after all game logic.
   */
  public update(): void {
    // Clear keyboard edge flags.
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

    // Clear gamepad edge flags.
    for (const key of this._gpJustPressedQueue) {
      const state = this._gamepadButtons.get(key);
      if (state) state.justPressed = false;
    }
    this._gpJustPressedQueue.length = 0;

    for (const key of this._gpJustReleasedQueue) {
      const state = this._gamepadButtons.get(key);
      if (state) state.justReleased = false;
    }
    this._gpJustReleasedQueue.length = 0;

    // Poll gamepad.
    this._pollGamepad();
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
    window.removeEventListener('gamepadconnected', this._onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
    this._keys.clear();
    this._justPressedQueue.length = 0;
    this._justReleasedQueue.length = 0;
    this._gamepadButtons.clear();
    this._gpJustPressedQueue.length = 0;
    this._gpJustReleasedQueue.length = 0;
    this._gamepadConnected = false;
    this._gamepadIndex = -1;
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

  // ------------------------------------------------------------------
  // Gamepad event handlers
  // ------------------------------------------------------------------

  private _handleGamepadConnected(e: GamepadEvent): void {
    // Only track the first connected gamepad.
    if (this._gamepadConnected) return;
    this._gamepadIndex = e.gamepad.index;
    this._gamepadConnected = true;
  }

  private _handleGamepadDisconnected(e: GamepadEvent): void {
    if (e.gamepad.index !== this._gamepadIndex) return;
    this._gamepadConnected = false;
    this._gamepadIndex = -1;

    // Release all currently-held gamepad buttons.
    for (const [key, state] of this._gamepadButtons) {
      if (state.down) {
        state.down = false;
        state.justReleased = true;
        this._gpJustReleasedQueue.push(key);
      }
    }
  }

  // ------------------------------------------------------------------
  // Gamepad polling (called once per frame from update())
  // ------------------------------------------------------------------

  /**
   * Reads the current gamepad snapshot from the Gamepad API and updates
   * per-action edge states (justPressed / justReleased) so the action
   * query methods work identically for gamepad and keyboard input.
   */
  private _pollGamepad(): void {
    if (!this._gamepadConnected) return;

    const gamepads = navigator.getGamepads();
    const gp = gamepads[this._gamepadIndex];
    if (!gp) return;

    // --- Buttons ---
    for (const mapping of GAMEPAD_BUTTON_MAP) {
      const pressed = gp.buttons[mapping.buttonIndex]?.pressed ?? false;
      this._setGamepadAction(mapping.action, pressed);
    }

    // --- Left stick axes ---
    for (const mapping of GAMEPAD_AXIS_MAP) {
      const value = gp.axes[mapping.axis] ?? 0;
      const pressed =
        mapping.sign === 1
          ? value > GAMEPAD_AXIS_THRESHOLD
          : value < -GAMEPAD_AXIS_THRESHOLD;
      // Axis-driven actions share the same action key as d-pad, so
      // only set to true if pressed – don't overwrite a d-pad "true"
      // with a stick "false".
      if (pressed) {
        this._setGamepadAction(mapping.action, true);
      } else {
        // Only release via axis if the corresponding d-pad button
        // isn't also pressed.
        const dpadMapping = GAMEPAD_BUTTON_MAP.find(
          (m) => m.action === mapping.action,
        );
        if (dpadMapping) {
          const dpadPressed =
            gp.buttons[dpadMapping.buttonIndex]?.pressed ?? false;
          if (!dpadPressed) {
            this._setGamepadAction(mapping.action, false);
          }
        }
      }
    }
  }

  /**
   * Update the gamepad virtual button state for a given action,
   * generating justPressed / justReleased edges as needed.
   */
  private _setGamepadAction(action: string, pressed: boolean): void {
    let state = this._gamepadButtons.get(action);

    if (!state) {
      state = { down: false, justPressed: false, justReleased: false };
      this._gamepadButtons.set(action, state);
    }

    if (pressed && !state.down) {
      state.down = true;
      state.justPressed = true;
      this._gpJustPressedQueue.push(action);
    } else if (!pressed && state.down) {
      state.down = false;
      state.justReleased = true;
      this._gpJustReleasedQueue.push(action);
    }
  }
}
