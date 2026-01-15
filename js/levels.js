// Level system for Pixel Quest

class LevelManager {
    constructor() {
        this.currentLevel = 0;
        this.levels = [];
        this.platforms = [];
        this.hazards = [];
        this.goal = null;
        this.boss = null;
        this.width = 0;
        this.height = 0;
        this.backgroundColor = '#87CEEB';

        this.defineLevels();
    }

    defineLevels() {
        // Level 1: Grasslands - Tutorial level
        this.levels.push({
            name: 'Grassland Plains',
            width: 3200,
            height: 600,
            playerStart: { x: 50, y: 400 },
            backgroundColor: '#87CEEB',
            platforms: [
                // Ground
                { x: 0, y: 550, w: 600, h: 50, type: 'static', tile: 'ground' },
                { x: 700, y: 550, w: 400, h: 50, type: 'static', tile: 'ground' },
                { x: 1200, y: 550, w: 300, h: 50, type: 'static', tile: 'ground' },
                { x: 1600, y: 550, w: 500, h: 50, type: 'static', tile: 'ground' },
                { x: 2200, y: 550, w: 1000, h: 50, type: 'static', tile: 'ground' },

                // Platforms
                { x: 300, y: 450, w: 96, h: 32, type: 'static', tile: 'stone' },
                { x: 500, y: 380, w: 96, h: 32, type: 'static', tile: 'stone' },
                { x: 650, y: 450, w: 64, h: 32, type: 'moving', endX: 650, endY: 350, speed: 1.5 },
                { x: 850, y: 400, w: 96, h: 32, type: 'static', tile: 'stone' },
                { x: 1050, y: 450, w: 64, h: 32, type: 'crumbling' },
                { x: 1150, y: 400, w: 64, h: 32, type: 'crumbling' },
                { x: 1350, y: 450, w: 96, h: 32, type: 'static', tile: 'brick' },
                { x: 1500, y: 380, w: 80, h: 32, type: 'static', tile: 'brick' },
                { x: 1750, y: 420, w: 128, h: 32, type: 'static', tile: 'stone' },
                { x: 1950, y: 350, w: 96, h: 32, type: 'static', tile: 'stone' },
                { x: 2050, y: 450, w: 80, h: 32, type: 'moving', endX: 2150, endY: 450, speed: 2 },

                // Upper platforms for secrets
                { x: 200, y: 280, w: 64, h: 32, type: 'static', tile: 'stone' },
                { x: 1000, y: 250, w: 96, h: 32, type: 'static', tile: 'brick' },
                { x: 1800, y: 220, w: 80, h: 32, type: 'static', tile: 'stone' },
            ],
            hazards: [
                { x: 1100, y: 534, w: 32, h: 16 },
            ],
            enemies: [
                { x: 400, y: 520, type: 'walker' },
                { x: 800, y: 520, type: 'walker' },
                { x: 900, y: 370, type: 'jumper' },
                { x: 1400, y: 520, type: 'walker' },
                { x: 1800, y: 520, type: 'walker' },
                { x: 2400, y: 520, type: 'shooter' },
            ],
            coins: [
                { x: 150, y: 500 }, { x: 180, y: 500 }, { x: 210, y: 500 },
                { x: 330, y: 420 }, { x: 360, y: 420 },
                { x: 530, y: 350 },
                { x: 870, y: 360 }, { x: 900, y: 360 },
                { x: 1380, y: 420 }, { x: 1410, y: 420 },
                { x: 1530, y: 350 },
                { x: 1780, y: 390 }, { x: 1810, y: 390 }, { x: 1840, y: 390 },
                { x: 2300, y: 500 }, { x: 2330, y: 500 }, { x: 2360, y: 500 },
                { x: 2500, y: 500 }, { x: 2530, y: 500 },
            ],
            gems: [
                { x: 220, y: 250, color: 'blue' },
                { x: 1020, y: 220, color: 'green' },
                { x: 1820, y: 190, color: 'red' },
            ],
            powerUps: [
                { x: 550, y: 340, type: 'speed' },
                { x: 1200, y: 500, type: 'health' },
                { x: 1970, y: 310, type: 'doubleJump' },
            ],
            goal: { x: 3100, y: 486 },
            hasBoss: false
        });

        // Level 2: Cave System - More challenging
        this.levels.push({
            name: 'Crystal Caverns',
            width: 3600,
            height: 600,
            playerStart: { x: 50, y: 400 },
            backgroundColor: '#2c3e50',
            platforms: [
                // Ground sections with gaps
                { x: 0, y: 550, w: 400, h: 50, type: 'static', tile: 'stone' },
                { x: 500, y: 550, w: 300, h: 50, type: 'static', tile: 'stone' },
                { x: 900, y: 550, w: 200, h: 50, type: 'static', tile: 'stone' },
                { x: 1200, y: 550, w: 400, h: 50, type: 'static', tile: 'stone' },
                { x: 1700, y: 550, w: 300, h: 50, type: 'static', tile: 'stone' },
                { x: 2100, y: 550, w: 200, h: 50, type: 'static', tile: 'stone' },
                { x: 2400, y: 550, w: 400, h: 50, type: 'static', tile: 'stone' },
                { x: 2900, y: 550, w: 700, h: 50, type: 'static', tile: 'stone' },

                // Floating platforms
                { x: 400, y: 450, w: 80, h: 32, type: 'crumbling' },
                { x: 550, y: 400, w: 96, h: 32, type: 'static', tile: 'stone' },
                { x: 700, y: 350, w: 64, h: 32, type: 'moving', endX: 850, endY: 350, speed: 2 },
                { x: 950, y: 420, w: 80, h: 32, type: 'static', tile: 'stone' },
                { x: 1100, y: 480, w: 64, h: 32, type: 'crumbling' },
                { x: 1300, y: 400, w: 128, h: 32, type: 'static', tile: 'brick' },
                { x: 1500, y: 320, w: 96, h: 32, type: 'static', tile: 'brick' },
                { x: 1650, y: 400, w: 64, h: 32, type: 'moving', endX: 1650, endY: 280, speed: 1 },
                { x: 1850, y: 380, w: 96, h: 32, type: 'static', tile: 'stone' },
                { x: 2000, y: 450, w: 80, h: 32, type: 'crumbling' },
                { x: 2200, y: 400, w: 128, h: 32, type: 'static', tile: 'stone' },
                { x: 2350, y: 320, w: 64, h: 32, type: 'moving', endX: 2450, endY: 320, speed: 2.5 },
                { x: 2550, y: 400, w: 96, h: 32, type: 'static', tile: 'brick' },
                { x: 2700, y: 320, w: 80, h: 32, type: 'crumbling' },
                { x: 2850, y: 250, w: 96, h: 32, type: 'static', tile: 'stone' },

                // Secret upper area
                { x: 1250, y: 200, w: 200, h: 32, type: 'static', tile: 'brick' },
                { x: 2600, y: 150, w: 150, h: 32, type: 'static', tile: 'stone' },
            ],
            hazards: [
                { x: 450, y: 534, w: 48, h: 16 },
                { x: 850, y: 534, w: 48, h: 16 },
                { x: 1150, y: 534, w: 48, h: 16 },
                { x: 2050, y: 534, w: 48, h: 16 },
                { x: 2350, y: 534, w: 48, h: 16 },
            ],
            enemies: [
                { x: 300, y: 520, type: 'walker' },
                { x: 600, y: 370, type: 'jumper' },
                { x: 850, y: 520, type: 'shooter' },
                { x: 1000, y: 520, type: 'walker' },
                { x: 1350, y: 370, type: 'jumper' },
                { x: 1550, y: 290, type: 'shooter' },
                { x: 1800, y: 520, type: 'walker' },
                { x: 1900, y: 350, type: 'jumper' },
                { x: 2250, y: 370, type: 'shooter' },
                { x: 2500, y: 520, type: 'walker' },
                { x: 2600, y: 370, type: 'jumper' },
                { x: 2700, y: 520, type: 'walker' },
                { x: 3000, y: 520, type: 'shooter' },
            ],
            coins: [
                { x: 100, y: 500 }, { x: 130, y: 500 }, { x: 160, y: 500 },
                { x: 420, y: 420 }, { x: 580, y: 370 }, { x: 610, y: 370 },
                { x: 750, y: 320 }, { x: 780, y: 320 },
                { x: 980, y: 390 }, { x: 1010, y: 390 },
                { x: 1330, y: 370 }, { x: 1360, y: 370 }, { x: 1390, y: 370 },
                { x: 1530, y: 290 }, { x: 1560, y: 290 },
                { x: 1880, y: 350 }, { x: 1910, y: 350 },
                { x: 2230, y: 370 }, { x: 2260, y: 370 },
                { x: 2580, y: 370 }, { x: 2610, y: 370 },
                { x: 2880, y: 220 }, { x: 2910, y: 220 },
                { x: 3100, y: 500 }, { x: 3130, y: 500 }, { x: 3160, y: 500 },
            ],
            gems: [
                { x: 750, y: 300, color: 'blue' },
                { x: 1300, y: 170, color: 'green' },
                { x: 2650, y: 120, color: 'red' },
            ],
            powerUps: [
                { x: 650, y: 500, type: 'doubleJump' },
                { x: 1350, y: 160, type: 'invincibility' },
                { x: 1900, y: 500, type: 'health' },
                { x: 2650, y: 110, type: 'powered' },
            ],
            goal: { x: 3500, y: 486 },
            hasBoss: false
        });

        // Level 3: Sky Fortress - Boss level
        this.levels.push({
            name: 'Sky Fortress',
            width: 4000,
            height: 600,
            playerStart: { x: 50, y: 400 },
            backgroundColor: '#1a1a2e',
            platforms: [
                // Starting area
                { x: 0, y: 550, w: 300, h: 50, type: 'static', tile: 'brick' },
                { x: 350, y: 520, w: 64, h: 32, type: 'moving', endX: 450, endY: 520, speed: 2 },
                { x: 550, y: 480, w: 96, h: 32, type: 'static', tile: 'brick' },
                { x: 700, y: 420, w: 64, h: 32, type: 'crumbling' },
                { x: 800, y: 360, w: 80, h: 32, type: 'static', tile: 'brick' },
                { x: 950, y: 300, w: 64, h: 32, type: 'moving', endX: 1050, endY: 300, speed: 2 },

                // Mid section
                { x: 1150, y: 350, w: 200, h: 32, type: 'static', tile: 'brick' },
                { x: 1400, y: 400, w: 64, h: 32, type: 'crumbling' },
                { x: 1500, y: 450, w: 80, h: 32, type: 'static', tile: 'stone' },
                { x: 1650, y: 380, w: 64, h: 32, type: 'moving', endX: 1650, endY: 280, speed: 1.5 },
                { x: 1800, y: 320, w: 128, h: 32, type: 'static', tile: 'brick' },
                { x: 2000, y: 380, w: 64, h: 32, type: 'crumbling' },
                { x: 2100, y: 440, w: 96, h: 32, type: 'static', tile: 'brick' },
                { x: 2250, y: 500, w: 80, h: 32, type: 'moving', endX: 2350, endY: 500, speed: 2.5 },

                // Approach to boss
                { x: 2450, y: 450, w: 150, h: 32, type: 'static', tile: 'stone' },
                { x: 2650, y: 380, w: 64, h: 32, type: 'crumbling' },
                { x: 2750, y: 320, w: 80, h: 32, type: 'static', tile: 'brick' },
                { x: 2900, y: 260, w: 64, h: 32, type: 'moving', endX: 3000, endY: 260, speed: 2 },
                { x: 3100, y: 320, w: 100, h: 32, type: 'static', tile: 'brick' },
                { x: 3250, y: 400, w: 64, h: 32, type: 'crumbling' },

                // Boss arena
                { x: 3400, y: 550, w: 600, h: 50, type: 'static', tile: 'stone' },
                { x: 3500, y: 400, w: 100, h: 32, type: 'static', tile: 'brick' },
                { x: 3800, y: 400, w: 100, h: 32, type: 'static', tile: 'brick' },
                { x: 3650, y: 280, w: 100, h: 32, type: 'static', tile: 'brick' },
            ],
            hazards: [
                { x: 600, y: 464, w: 48, h: 16 },
                { x: 1200, y: 334, w: 48, h: 16 },
                { x: 1850, y: 304, w: 64, h: 16 },
                { x: 2500, y: 434, w: 48, h: 16 },
                { x: 3150, y: 304, w: 32, h: 16 },
            ],
            enemies: [
                { x: 200, y: 520, type: 'walker' },
                { x: 580, y: 450, type: 'jumper' },
                { x: 850, y: 330, type: 'shooter' },
                { x: 1200, y: 320, type: 'walker' },
                { x: 1550, y: 420, type: 'jumper' },
                { x: 1850, y: 290, type: 'shooter' },
                { x: 2150, y: 410, type: 'walker' },
                { x: 2500, y: 420, type: 'jumper' },
                { x: 2800, y: 290, type: 'shooter' },
                { x: 3150, y: 290, type: 'jumper' },
            ],
            coins: [
                { x: 100, y: 500 }, { x: 130, y: 500 },
                { x: 400, y: 490 },
                { x: 580, y: 450 }, { x: 610, y: 450 },
                { x: 830, y: 330 }, { x: 860, y: 330 },
                { x: 1000, y: 270 },
                { x: 1180, y: 320 }, { x: 1210, y: 320 }, { x: 1240, y: 320 },
                { x: 1530, y: 420 },
                { x: 1830, y: 290 }, { x: 1860, y: 290 },
                { x: 2130, y: 410 }, { x: 2160, y: 410 },
                { x: 2480, y: 420 }, { x: 2510, y: 420 },
                { x: 2780, y: 290 }, { x: 2810, y: 290 },
                { x: 2950, y: 230 },
                { x: 3130, y: 290 }, { x: 3160, y: 290 },
            ],
            gems: [
                { x: 1000, y: 240, color: 'blue' },
                { x: 1680, y: 230, color: 'green' },
                { x: 2950, y: 200, color: 'red' },
            ],
            powerUps: [
                { x: 600, y: 440, type: 'doubleJump' },
                { x: 1250, y: 280, type: 'speed' },
                { x: 1900, y: 500, type: 'health' },
                { x: 2550, y: 380, type: 'invincibility' },
                { x: 3350, y: 500, type: 'powered' },
                { x: 3350, y: 460, type: 'health' },
            ],
            boss: { x: 3800, y: 486 },
            hasBoss: true
        });
    }

    loadLevel(index) {
        if (index < 0 || index >= this.levels.length) return false;

        const level = this.levels[index];
        this.currentLevel = index;
        this.width = level.width;
        this.height = level.height;
        this.backgroundColor = level.backgroundColor;

        // Clear existing objects
        this.platforms = [];
        this.hazards = [];
        Enemies.clear();
        PowerUps.clear();
        Collectibles.clear();

        // Create platforms
        for (const p of level.platforms) {
            const options = {
                endX: p.endX,
                endY: p.endY,
                speed: p.speed,
                tileType: p.tile || 'ground'
            };
            this.platforms.push(new Platform(p.x, p.y, p.w, p.h, p.type, options));
        }

        // Create hazards
        for (const h of level.hazards) {
            this.hazards.push(new Hazard(h.x, h.y, h.w, h.h));
        }

        // Spawn enemies
        for (const e of level.enemies) {
            Enemies.spawn(e.x, e.y, e.type);
        }

        // Spawn coins
        for (const c of level.coins) {
            Collectibles.spawnCoin(c.x, c.y);
        }

        // Spawn gems
        for (const g of level.gems) {
            Collectibles.spawnGem(g.x, g.y, g.color);
        }

        // Spawn power-ups
        for (const pu of level.powerUps) {
            PowerUps.spawn(pu.x, pu.y, pu.type);
        }

        // Create goal
        this.goal = new Goal(level.goal.x, level.goal.y);

        // Create boss if level has one
        if (level.hasBoss && level.boss) {
            this.boss = new Boss(level.boss.x, level.boss.y);
        } else {
            this.boss = null;
        }

        return level;
    }

    getCurrentLevel() {
        return this.levels[this.currentLevel];
    }

    getNextLevel() {
        return this.currentLevel + 1 < this.levels.length ? this.currentLevel + 1 : -1;
    }

    isLastLevel() {
        return this.currentLevel === this.levels.length - 1;
    }

    update() {
        // Update platforms
        for (const platform of this.platforms) {
            platform.update();
        }

        // Update goal
        if (this.goal) {
            this.goal.update();
        }
    }

    render(ctx, camera) {
        // Draw platforms
        for (const platform of this.platforms) {
            if (camera.isOnScreen(platform)) {
                platform.render(ctx, camera);
            }
        }

        // Draw hazards
        for (const hazard of this.hazards) {
            if (camera.isOnScreen(hazard)) {
                hazard.render(ctx, camera);
            }
        }

        // Draw goal
        if (this.goal) {
            this.goal.render(ctx, camera);
        }
    }

    checkHazards(player) {
        for (const hazard of this.hazards) {
            if (hazard.checkCollision(player)) {
                return true;
            }
        }
        return false;
    }

    checkGoal(player) {
        if (this.goal) {
            return this.goal.checkCollision(player);
        }
        return false;
    }

    getLevelName() {
        return this.levels[this.currentLevel]?.name || 'Unknown';
    }
}

const Levels = new LevelManager();
