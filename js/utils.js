// Utility functions for Pixel Quest

const Utils = {
    // Collision detection (AABB)
    rectCollision(a, b) {
        return a.x < b.x + b.width &&
               a.x + a.width > b.x &&
               a.y < b.y + b.height &&
               a.y + a.height > b.y;
    },

    // Check if point is inside rectangle
    pointInRect(px, py, rect) {
        return px >= rect.x && px <= rect.x + rect.width &&
               py >= rect.y && py <= rect.y + rect.height;
    },

    // Distance between two points
    distance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    },

    // Linear interpolation
    lerp(a, b, t) {
        return a + (b - a) * t;
    },

    // Clamp value between min and max
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },

    // Random integer between min and max (inclusive)
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    // Random float between min and max
    randomFloat(min, max) {
        return Math.random() * (max - min) + min;
    },

    // Random item from array
    randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    },

    // Ease out quad
    easeOutQuad(t) {
        return t * (2 - t);
    },

    // Ease in out quad
    easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    },

    // Convert hex color to RGB
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },

    // Deep clone object
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
};

// NES-inspired color palette
const COLORS = {
    // Background colors
    SKY_LIGHT: '#87CEEB',
    SKY_DARK: '#4A90D9',
    NIGHT_SKY: '#1a1a2e',

    // Ground/Platform colors
    GROUND_LIGHT: '#8B4513',
    GROUND_DARK: '#654321',
    GRASS: '#228B22',
    STONE: '#696969',
    BRICK: '#B22222',

    // Character colors
    PLAYER_MAIN: '#E85D04',
    PLAYER_ACCENT: '#FFBA08',
    PLAYER_SKIN: '#FFDAB9',

    // Enemy colors
    ENEMY_RED: '#DC143C',
    ENEMY_GREEN: '#32CD32',
    ENEMY_PURPLE: '#9400D3',
    ENEMY_BLUE: '#1E90FF',

    // Effects
    GOLD: '#FFD700',
    SILVER: '#C0C0C0',
    WHITE: '#FFFFFF',
    BLACK: '#000000',

    // UI
    UI_RED: '#FF0000',
    UI_GREEN: '#00FF00',
    UI_BLUE: '#0080FF',
    UI_YELLOW: '#FFFF00'
};

// Game constants
const CONSTANTS = {
    GRAVITY: 0.38,
    MAX_FALL_SPEED: 10,
    TILE_SIZE: 32,
    CANVAS_WIDTH: 800,
    CANVAS_HEIGHT: 600
};
