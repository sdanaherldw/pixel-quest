// Input handling for Pixel Quest

class InputManager {
    constructor() {
        this.keys = {};
        this.keysPressed = {};
        this.keysReleased = {};
        this.enabled = true;

        // Touch state
        this.touchState = {
            left: false,
            right: false,
            jump: false,
            attack: false
        };
        this.touchPressed = {};

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

        // Initialize touch controls
        this.initTouchControls();
    }

    initTouchControls() {
        const btnLeft = document.getElementById('btn-left');
        const btnRight = document.getElementById('btn-right');
        const btnJump = document.getElementById('btn-jump');
        const btnAttack = document.getElementById('btn-attack');

        if (btnLeft) {
            this.addTouchListeners(btnLeft, 'left');
        }
        if (btnRight) {
            this.addTouchListeners(btnRight, 'right');
        }
        if (btnJump) {
            this.addTouchListeners(btnJump, 'jump');
            // Also use jump as confirm for menus
            this.addTouchListeners(btnJump, 'confirm');
        }
        if (btnAttack) {
            this.addTouchListeners(btnAttack, 'attack');
        }

        // Prevent default touch behavior on game container
        const container = document.getElementById('game-container');
        if (container) {
            container.addEventListener('touchstart', (e) => {
                if (e.target.tagName !== 'BUTTON') {
                    e.preventDefault();
                }
            }, { passive: false });
        }
    }

    addTouchListeners(element, action) {
        element.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!this.touchState[action]) {
                this.touchPressed[action] = true;
            }
            this.touchState[action] = true;
            // Resume audio context on touch
            if (Audio && Audio.resume) {
                Audio.resume();
            }
        }, { passive: false });

        element.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.touchState[action] = false;
        }, { passive: false });

        element.addEventListener('touchcancel', (e) => {
            this.touchState[action] = false;
        });

        // Also support mouse for testing on desktop
        element.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (!this.touchState[action]) {
                this.touchPressed[action] = true;
            }
            this.touchState[action] = true;
        });

        element.addEventListener('mouseup', (e) => {
            this.touchState[action] = false;
        });

        element.addEventListener('mouseleave', (e) => {
            this.touchState[action] = false;
        });
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
        // Check touch state first
        if (this.touchState[action]) return true;
        // Then check keyboard
        const codes = this.bindings[action];
        if (!codes) return false;
        return codes.some(code => this.keys[code]);
    }

    // Check if action was just pressed this frame
    isPressed(action) {
        if (!this.enabled) return false;
        // Check touch pressed first
        if (this.touchPressed[action]) return true;
        // Then check keyboard
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
        return Object.keys(this.keysPressed).length > 0 || Object.keys(this.touchPressed).length > 0;
    }

    // Call at end of each frame to clear pressed/released states
    update() {
        this.keysPressed = {};
        this.touchPressed = {};
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
