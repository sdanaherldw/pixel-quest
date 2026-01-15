// Input handling for Pixel Quest

class InputManager {
    constructor() {
        this.keys = {};
        this.keysPressed = {};
        this.keysReleased = {};
        this.enabled = true;

        // Key mappings
        this.bindings = {
            left: ['ArrowLeft', 'KeyA'],
            right: ['ArrowRight', 'KeyD'],
            up: ['ArrowUp', 'KeyW'],
            down: ['ArrowDown', 'KeyS'],
            jump: ['Space', 'ArrowUp', 'KeyW'],
            attack: ['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyJ'],
            pause: ['Escape', 'KeyP'],
            confirm: ['Space', 'Enter', 'KeyZ'],
            mute: ['KeyM']
        };
    }

    init() {
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
        window.addEventListener('blur', () => this.onBlur());
    }

    onKeyDown(e) {
        // Prevent default for game keys
        if (this.isGameKey(e.code)) {
            e.preventDefault();
        }

        if (!this.keys[e.code]) {
            this.keysPressed[e.code] = true;
        }
        this.keys[e.code] = true;
    }

    onKeyUp(e) {
        this.keys[e.code] = false;
        this.keysReleased[e.code] = true;
    }

    onBlur() {
        // Clear all keys when window loses focus
        this.keys = {};
    }

    isGameKey(code) {
        for (const action in this.bindings) {
            if (this.bindings[action].includes(code)) {
                return true;
            }
        }
        return false;
    }

    // Check if action is currently held
    isDown(action) {
        if (!this.enabled) return false;
        const codes = this.bindings[action];
        if (!codes) return false;
        return codes.some(code => this.keys[code]);
    }

    // Check if action was just pressed this frame
    isPressed(action) {
        if (!this.enabled) return false;
        const codes = this.bindings[action];
        if (!codes) return false;
        return codes.some(code => this.keysPressed[code]);
    }

    // Check if action was just released this frame
    isReleased(action) {
        if (!this.enabled) return false;
        const codes = this.bindings[action];
        if (!codes) return false;
        return codes.some(code => this.keysReleased[code]);
    }

    // Check if any key was pressed
    anyKeyPressed() {
        return Object.keys(this.keysPressed).length > 0;
    }

    // Call at end of each frame to clear pressed/released states
    update() {
        this.keysPressed = {};
        this.keysReleased = {};
    }

    disable() {
        this.enabled = false;
    }

    enable() {
        this.enabled = true;
    }
}

const Input = new InputManager();
