// Main game controller for Pixel Quest

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Set canvas size
        this.canvas.width = CONSTANTS.CANVAS_WIDTH;
        this.canvas.height = CONSTANTS.CANVAS_HEIGHT;

        // Disable image smoothing for pixel art
        this.ctx.imageSmoothingEnabled = false;

        // Game state
        this.state = 'title'; // title, playing, paused, levelComplete, gameOver, victory
        this.frameCount = 0;
        this.lastTime = 0;
        this.deltaTime = 0;
        this.fps = 60;

        // Game objects
        this.player = null;
        this.camera = new Camera(CONSTANTS.CANVAS_WIDTH, CONSTANTS.CANVAS_HEIGHT);

        // Score
        this.score = 0;
        this.highScore = this.loadHighScore();
        this.levelCompleteBonus = 0;

        // Level
        this.currentLevel = 0;
        this.levelStartTime = 0;

        // Boss trigger area (for level 3)
        this.bossTriggered = false;

        // Level transition
        this.transitioning = false;
        this.transitionTimer = 0;

        // Parallax backgrounds
        this.bgLayers = [];
    }

    init() {
        // Initialize systems
        Input.init();
        Audio.init();
        Sprites.init();

        // Create parallax background layers
        this.createBackgroundLayers();

        // Hide loading text
        document.getElementById('loading').classList.add('hidden');

        // Start game loop
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    createBackgroundLayers() {
        this.bgLayers = [
            { color: '#4A90D9', speed: 0.1, type: 'sky' },
            { color: '#6BA3D9', speed: 0.2, type: 'mountains' },
            { color: '#8AB8E0', speed: 0.3, type: 'hills' }
        ];
    }

    gameLoop(currentTime) {
        // Calculate delta time
        this.deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        this.fps = 1000 / this.deltaTime;
        GameUI.setFPS(this.fps);

        this.frameCount++;

        // Update
        this.update();

        // Render
        this.render();

        // Clear input state
        Input.update();

        // Next frame
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    update() {
        switch (this.state) {
            case 'title':
                this.updateTitle();
                break;
            case 'playing':
                this.updatePlaying();
                break;
            case 'paused':
                this.updatePaused();
                break;
            case 'levelComplete':
                this.updateLevelComplete();
                break;
            case 'gameOver':
                this.updateGameOver();
                break;
            case 'victory':
                this.updateVictory();
                break;
        }

        // Global mute toggle
        if (Input.isPressed('mute')) {
            Audio.toggleMute();
        }

        // Update UI
        GameUI.update();
    }

    updateTitle() {
        if (Input.isPressed('confirm')) {
            this.startGame();
        }
    }

    updatePlaying() {
        // Pause
        if (Input.isPressed('pause')) {
            this.state = 'paused';
            Audio.stopMusic();
            return;
        }

        // Update level
        Levels.update();

        // Update player
        this.player.update(Levels.platforms, { width: Levels.width, height: Levels.height });

        // Check if player died
        if (this.player.dead && this.player.lives <= 0) {
            this.gameOver();
            return;
        }

        // Update enemies
        Enemies.update(Levels.platforms, this.player, { width: Levels.width, height: Levels.height });

        // Update boss
        if (Levels.boss) {
            // Trigger boss when player gets close
            if (!this.bossTriggered && this.player.x > Levels.width - 500) {
                this.bossTriggered = true;
                Levels.boss.activate();
            }

            if (Levels.boss.active) {
                Levels.boss.update(Levels.platforms, this.player, { width: Levels.width, height: Levels.height });

                // Check boss collision
                const bossCollision = Levels.boss.checkPlayerCollision(this.player);
                if (bossCollision === 'stomp' || this.player.getAttackHitbox() && Levels.boss.checkAttackCollision(this.player.getAttackHitbox())) {
                    this.score += Levels.boss.takeDamage();
                    this.player.vy = -8;

                    if (Levels.boss.defeated) {
                        // Boss defeated - level complete
                        setTimeout(() => this.levelComplete(), 1000);
                    }
                } else if (bossCollision === 'damage') {
                    this.player.takeDamage();
                }
            }
        }

        // Update collectibles and power-ups
        Collectibles.update();
        PowerUps.update();

        // Update particles
        Particles.update();

        // Check collisions
        this.checkCollisions();

        // Update camera
        this.camera.follow(this.player);
        this.camera.update();

        // Check for level complete (goal reached)
        if (Levels.checkGoal(this.player) && (!Levels.boss || Levels.boss.defeated)) {
            this.levelComplete();
        }
    }

    updatePaused() {
        if (Input.isPressed('pause')) {
            this.state = 'playing';
            Audio.startMusic(Levels.boss && Levels.boss.active ? 'boss' : 'game');
        }
    }

    updateLevelComplete() {
        if (this.transitioning) {
            this.transitionTimer--;
            if (this.transitionTimer <= 0) {
                this.transitioning = false;
            }
            return;
        }

        if (Input.isPressed('confirm')) {
            if (Levels.isLastLevel()) {
                this.victory();
            } else {
                this.nextLevel();
            }
        }
    }

    updateGameOver() {
        if (Input.isPressed('confirm')) {
            this.startGame();
        }
    }

    updateVictory() {
        if (Input.isPressed('confirm')) {
            this.state = 'title';
            Audio.stopMusic();
        }
    }

    checkCollisions() {
        // Enemy collisions
        const enemyPoints = Enemies.checkCollisions(this.player);
        if (enemyPoints > 0) {
            this.score += enemyPoints;
            GameUI.addFlashMessage(`+${enemyPoints}`, this.player.x + this.player.width / 2, this.player.y);
        }

        // Collectible collisions
        const collectPoints = Collectibles.checkCollisions(this.player);
        if (collectPoints > 0) {
            this.score += collectPoints;
            GameUI.addFlashMessage(`+${collectPoints}`, this.player.x + this.player.width / 2, this.player.y);
        }

        // Power-up collisions
        PowerUps.checkCollisions(this.player);

        // Hazard collisions
        if (Levels.checkHazards(this.player)) {
            this.player.takeDamage();
            this.camera.shake(8, 10);
        }
    }

    render() {
        // Clear canvas
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, CONSTANTS.CANVAS_WIDTH, CONSTANTS.CANVAS_HEIGHT);

        switch (this.state) {
            case 'title':
                GameUI.renderTitleScreen(this.ctx, this);
                break;

            case 'playing':
            case 'paused':
            case 'levelComplete':
                this.renderGame();
                if (this.state === 'paused') {
                    GameUI.renderPauseScreen(this.ctx, this);
                } else if (this.state === 'levelComplete') {
                    GameUI.renderLevelComplete(this.ctx, this);
                }
                break;

            case 'gameOver':
                this.renderGame();
                GameUI.renderGameOver(this.ctx, this);
                break;

            case 'victory':
                GameUI.renderVictory(this.ctx, this);
                break;
        }
    }

    renderGame() {
        const ctx = this.ctx;
        const cam = {
            x: this.camera.getViewX(),
            y: this.camera.getViewY()
        };

        // Render parallax background
        this.renderBackground(ctx, cam);

        // Render level
        Levels.render(ctx, cam);

        // Render collectibles
        Collectibles.render(ctx, cam);

        // Render power-ups
        PowerUps.render(ctx, cam);

        // Render enemies
        Enemies.render(ctx, cam);

        // Render boss
        if (Levels.boss) {
            Levels.boss.render(ctx, cam);
        }

        // Render player
        this.player.render(ctx, cam);

        // Render particles
        Particles.render(ctx, cam);

        // Render HUD
        GameUI.renderHUD(ctx, this);
    }

    renderBackground(ctx, camera) {
        const levelBg = Levels.backgroundColor || '#87CEEB';

        // Sky gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, CONSTANTS.CANVAS_HEIGHT);

        if (levelBg === '#1a1a2e') {
            // Night sky
            gradient.addColorStop(0, '#0a0a1a');
            gradient.addColorStop(1, '#1a1a3e');

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, CONSTANTS.CANVAS_WIDTH, CONSTANTS.CANVAS_HEIGHT);

            // Stars
            ctx.fillStyle = '#FFF';
            for (let i = 0; i < 80; i++) {
                const x = ((i * 47 - camera.x * 0.05) % (CONSTANTS.CANVAS_WIDTH + 100)) - 50;
                const y = (i * 67) % CONSTANTS.CANVAS_HEIGHT;
                const size = (i % 3) + 1;
                const alpha = 0.5 + Math.sin(this.frameCount * 0.05 + i) * 0.3;
                ctx.globalAlpha = alpha;
                ctx.fillRect(x, y, size, size);
            }
            ctx.globalAlpha = 1;
        } else if (levelBg === '#2c3e50') {
            // Cave
            gradient.addColorStop(0, '#1a252f');
            gradient.addColorStop(1, '#2c3e50');

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, CONSTANTS.CANVAS_WIDTH, CONSTANTS.CANVAS_HEIGHT);

            // Crystal glow effects
            ctx.fillStyle = 'rgba(147, 112, 219, 0.1)';
            for (let i = 0; i < 10; i++) {
                const x = ((i * 137 - camera.x * 0.1) % (CONSTANTS.CANVAS_WIDTH + 200)) - 100;
                const y = 100 + (i * 73) % 300;
                const size = 50 + (i * 17) % 50;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            // Day sky
            gradient.addColorStop(0, '#87CEEB');
            gradient.addColorStop(0.7, '#E0F6FF');
            gradient.addColorStop(1, '#B0E0E6');

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, CONSTANTS.CANVAS_WIDTH, CONSTANTS.CANVAS_HEIGHT);

            // Clouds
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            for (let i = 0; i < 5; i++) {
                const x = ((i * 200 + this.frameCount * 0.2 - camera.x * 0.2) % (CONSTANTS.CANVAS_WIDTH + 200)) - 100;
                const y = 50 + i * 40;
                this.drawCloud(ctx, x, y, 60 + i * 10);
            }
        }

        // Far mountains/hills
        this.renderParallaxLayer(ctx, camera, 0.3, '#5a7a5a', 400);
        this.renderParallaxLayer(ctx, camera, 0.5, '#4a6a4a', 450);
    }

    drawCloud(ctx, x, y, size) {
        ctx.beginPath();
        ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
        ctx.arc(x + size * 0.3, y - size * 0.1, size * 0.35, 0, Math.PI * 2);
        ctx.arc(x + size * 0.6, y, size * 0.4, 0, Math.PI * 2);
        ctx.arc(x + size * 0.3, y + size * 0.1, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    renderParallaxLayer(ctx, camera, speed, color, baseY) {
        ctx.fillStyle = color;

        const offset = -camera.x * speed;
        const width = 200;

        for (let i = -1; i < Math.ceil(CONSTANTS.CANVAS_WIDTH / width) + 2; i++) {
            const x = (i * width + offset % width);
            const height = 50 + Math.sin(i * 0.5) * 30;

            ctx.beginPath();
            ctx.moveTo(x, CONSTANTS.CANVAS_HEIGHT);
            ctx.lineTo(x, baseY + height);
            ctx.lineTo(x + width * 0.5, baseY);
            ctx.lineTo(x + width, baseY + height);
            ctx.lineTo(x + width, CONSTANTS.CANVAS_HEIGHT);
            ctx.closePath();
            ctx.fill();
        }
    }

    startGame() {
        this.state = 'playing';
        this.score = 0;
        this.currentLevel = 0;
        this.bossTriggered = false;

        // Load first level
        this.loadLevel(0);

        // Start music
        Audio.init();
        Audio.startMusic('game');

        // Initialize player
        const levelData = Levels.getCurrentLevel();
        this.player = new Player(levelData.playerStart.x, levelData.playerStart.y);

        // Set camera bounds
        this.camera.setBounds(0, 0, Levels.width, Levels.height);
        this.camera.follow(this.player, true);

        Audio.playMenuConfirm();
    }

    loadLevel(index) {
        const levelData = Levels.loadLevel(index);
        if (!levelData) return false;

        this.currentLevel = index;
        this.levelStartTime = Date.now();
        this.bossTriggered = false;

        // Reset player position if exists
        if (this.player) {
            this.player.x = levelData.playerStart.x;
            this.player.y = levelData.playerStart.y;
            this.player.vx = 0;
            this.player.vy = 0;
            this.player.setSpawnPoint(levelData.playerStart.x, levelData.playerStart.y);

            // Clear power-ups between levels
            for (const key in this.player.powerUps) {
                this.player.powerUps[key].active = false;
            }
        }

        // Update camera bounds
        this.camera.setBounds(0, 0, Levels.width, Levels.height);
        if (this.player) {
            this.camera.follow(this.player, true);
        }

        return true;
    }

    nextLevel() {
        const nextIndex = Levels.getNextLevel();
        if (nextIndex >= 0) {
            this.loadLevel(nextIndex);
            this.state = 'playing';
            Audio.startMusic('game');
        } else {
            this.victory();
        }
    }

    levelComplete() {
        this.state = 'levelComplete';
        this.transitioning = true;
        this.transitionTimer = 60;

        // Calculate bonus
        const timeBonus = Math.max(0, 5000 - Math.floor((Date.now() - this.levelStartTime) / 100));
        const livesBonus = this.player.lives * 500;
        this.levelCompleteBonus = timeBonus + livesBonus;
        this.score += this.levelCompleteBonus;

        // Save high score
        this.saveHighScore();

        // Effects
        Particles.levelComplete(this.player.x + this.player.width / 2, this.player.y);
        Audio.stopMusic();
        Audio.playLevelComplete();
    }

    gameOver() {
        this.state = 'gameOver';
        this.saveHighScore();
        Audio.stopMusic();
        Audio.playGameOver();
    }

    victory() {
        this.state = 'victory';
        this.saveHighScore();
        Audio.stopMusic();
        Audio.playLevelComplete();
    }

    loadHighScore() {
        try {
            return parseInt(localStorage.getItem('pixelQuestHighScore')) || 0;
        } catch (e) {
            return 0;
        }
    }

    saveHighScore() {
        if (this.score > this.highScore) {
            this.highScore = this.score;
            try {
                localStorage.setItem('pixelQuestHighScore', this.highScore.toString());
            } catch (e) {
                // localStorage not available
            }
        }
    }
}

// Start the game when page loads
window.addEventListener('load', () => {
    const game = new Game();
    game.init();
});
