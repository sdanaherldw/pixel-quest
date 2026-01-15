// UI system for Pixel Quest

class UI {
    constructor() {
        this.flashMessages = [];
        this.showFPS = false;
        this.lastFPS = 60;
    }

    update() {
        // Update flash messages
        for (let i = this.flashMessages.length - 1; i >= 0; i--) {
            const msg = this.flashMessages[i];
            msg.timer--;
            msg.y -= 0.5;
            if (msg.timer <= 0) {
                this.flashMessages.splice(i, 1);
            }
        }
    }

    addFlashMessage(text, x, y, color = '#FFD700') {
        this.flashMessages.push({
            text: text,
            x: x,
            y: y,
            color: color,
            timer: 60
        });
    }

    renderHUD(ctx, game) {
        const player = game.player;

        ctx.save();
        ctx.font = '12px monospace';

        // Score
        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'left';
        ctx.fillText('SCORE', 20, 25);
        ctx.fillStyle = '#FFD700';
        ctx.fillText(game.score.toString().padStart(8, '0'), 20, 42);

        // High score
        ctx.fillStyle = '#FFF';
        ctx.fillText('HIGH', 140, 25);
        ctx.fillStyle = '#FFD700';
        ctx.fillText(game.highScore.toString().padStart(8, '0'), 140, 42);

        // Lives
        ctx.fillStyle = '#FFF';
        ctx.fillText('LIVES', 280, 25);

        const heartSprite = Sprites.getSprite('heart');
        for (let i = 0; i < player.lives; i++) {
            if (heartSprite) {
                ctx.drawImage(heartSprite, 280 + i * 20, 30, 16, 16);
            } else {
                ctx.fillStyle = '#FF0000';
                ctx.fillText('❤', 280 + i * 20, 42);
            }
        }

        // Health bar
        ctx.fillStyle = '#FFF';
        ctx.fillText('HEALTH', 400, 25);

        const healthBarWidth = 80;
        const healthBarHeight = 12;
        const healthBarX = 400;
        const healthBarY = 32;

        // Background
        ctx.fillStyle = '#333';
        ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);

        // Health
        const healthPercent = player.health / player.maxHealth;
        ctx.fillStyle = healthPercent > 0.5 ? '#00FF00' : healthPercent > 0.25 ? '#FFD700' : '#FF0000';
        ctx.fillRect(healthBarX, healthBarY, healthBarWidth * healthPercent, healthBarHeight);

        // Border
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);

        // Level indicator
        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'right';
        ctx.fillText(`LEVEL ${game.currentLevel + 1}`, CONSTANTS.CANVAS_WIDTH - 20, 25);
        ctx.fillStyle = '#87CEEB';
        ctx.fillText(Levels.getLevelName(), CONSTANTS.CANVAS_WIDTH - 20, 42);

        // Power-up status
        this.renderPowerUpStatus(ctx, player);

        // FPS (if enabled)
        if (this.showFPS) {
            ctx.fillStyle = '#0F0';
            ctx.textAlign = 'right';
            ctx.fillText(`FPS: ${Math.round(this.lastFPS)}`, CONSTANTS.CANVAS_WIDTH - 20, CONSTANTS.CANVAS_HEIGHT - 10);
        }

        ctx.restore();

        // Flash messages
        for (const msg of this.flashMessages) {
            ctx.save();
            ctx.globalAlpha = msg.timer / 60;
            ctx.fillStyle = msg.color;
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(msg.text, msg.x - game.camera.x, msg.y - game.camera.y);
            ctx.restore();
        }
    }

    renderPowerUpStatus(ctx, player) {
        let yOffset = 60;

        for (const key in player.powerUps) {
            const powerUp = player.powerUps[key];
            if (powerUp.active) {
                // Power-up icon
                let sprite;
                let label;
                let color;

                switch (key) {
                    case 'speed':
                        sprite = Sprites.getSprite('speedBoost');
                        label = 'SPEED';
                        color = '#FFD700';
                        break;
                    case 'doubleJump':
                        sprite = Sprites.getSprite('doubleJump');
                        label = 'JUMP';
                        color = '#87CEEB';
                        break;
                    case 'invincibility':
                        sprite = Sprites.getSprite('star');
                        label = 'STAR';
                        color = '#FFD700';
                        break;
                    case 'powered':
                        sprite = Sprites.getSprite('mushroom');
                        label = 'POWER';
                        color = '#FF0000';
                        break;
                }

                if (sprite) {
                    ctx.drawImage(sprite, 20, yOffset, 16, 16);
                }

                // Timer bar
                const timerPercent = powerUp.timer / powerUp.duration;
                ctx.fillStyle = '#333';
                ctx.fillRect(40, yOffset + 4, 60, 8);
                ctx.fillStyle = color;
                ctx.fillRect(40, yOffset + 4, 60 * timerPercent, 8);

                // Label
                ctx.fillStyle = '#FFF';
                ctx.font = '8px monospace';
                ctx.textAlign = 'left';
                ctx.fillText(label, 105, yOffset + 12);

                yOffset += 22;
            }
        }
    }

    renderTitleScreen(ctx, game) {
        // Background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, CONSTANTS.CANVAS_WIDTH, CONSTANTS.CANVAS_HEIGHT);

        // Stars background
        ctx.fillStyle = '#FFF';
        for (let i = 0; i < 100; i++) {
            const x = (i * 37 + game.frameCount * 0.1) % CONSTANTS.CANVAS_WIDTH;
            const y = (i * 59) % CONSTANTS.CANVAS_HEIGHT;
            const size = (i % 3) + 1;
            ctx.fillRect(x, y, size, size);
        }

        // Title
        ctx.save();
        ctx.textAlign = 'center';

        // Shadow
        ctx.fillStyle = '#000';
        ctx.font = 'bold 48px monospace';
        ctx.fillText('PIXEL QUEST', CONSTANTS.CANVAS_WIDTH / 2 + 4, 204);

        // Main title
        const gradient = ctx.createLinearGradient(0, 150, 0, 220);
        gradient.addColorStop(0, '#FFD700');
        gradient.addColorStop(1, '#FF8C00');
        ctx.fillStyle = gradient;
        ctx.fillText('PIXEL QUEST', CONSTANTS.CANVAS_WIDTH / 2, 200);

        // Subtitle
        ctx.font = '16px monospace';
        ctx.fillStyle = '#87CEEB';
        ctx.fillText('A Retro Platformer Adventure', CONSTANTS.CANVAS_WIDTH / 2, 240);

        // Instructions
        ctx.font = '14px monospace';
        ctx.fillStyle = '#FFF';

        if (Math.floor(game.frameCount / 30) % 2 === 0) {
            ctx.fillText('PRESS SPACE TO START', CONSTANTS.CANVAS_WIDTH / 2, 350);
        }

        // Controls
        ctx.font = '10px monospace';
        ctx.fillStyle = '#AAA';
        ctx.fillText('CONTROLS:', CONSTANTS.CANVAS_WIDTH / 2, 420);
        ctx.fillText('ARROW KEYS / WASD - Move', CONSTANTS.CANVAS_WIDTH / 2, 440);
        ctx.fillText('SPACE - Jump', CONSTANTS.CANVAS_WIDTH / 2, 455);
        ctx.fillText('SHIFT / X - Attack', CONSTANTS.CANVAS_WIDTH / 2, 470);
        ctx.fillText('P / ESC - Pause', CONSTANTS.CANVAS_WIDTH / 2, 485);
        ctx.fillText('M - Mute', CONSTANTS.CANVAS_WIDTH / 2, 500);

        // High score
        if (game.highScore > 0) {
            ctx.font = '12px monospace';
            ctx.fillStyle = '#FFD700';
            ctx.fillText(`HIGH SCORE: ${game.highScore}`, CONSTANTS.CANVAS_WIDTH / 2, 550);
        }

        ctx.restore();
    }

    renderPauseScreen(ctx, game) {
        // Darken background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, CONSTANTS.CANVAS_WIDTH, CONSTANTS.CANVAS_HEIGHT);

        ctx.save();
        ctx.textAlign = 'center';

        // Paused text
        ctx.font = 'bold 36px monospace';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('PAUSED', CONSTANTS.CANVAS_WIDTH / 2, 250);

        ctx.font = '14px monospace';
        ctx.fillStyle = '#FFF';
        ctx.fillText('Press P or ESC to resume', CONSTANTS.CANVAS_WIDTH / 2, 300);
        ctx.fillText('Press M to toggle sound', CONSTANTS.CANVAS_WIDTH / 2, 330);

        ctx.fillStyle = Audio.muted ? '#FF6B6B' : '#90EE90';
        ctx.fillText(`Sound: ${Audio.muted ? 'OFF' : 'ON'}`, CONSTANTS.CANVAS_WIDTH / 2, 370);

        ctx.restore();
    }

    renderGameOver(ctx, game) {
        // Darken background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, CONSTANTS.CANVAS_WIDTH, CONSTANTS.CANVAS_HEIGHT);

        ctx.save();
        ctx.textAlign = 'center';

        // Game Over text
        ctx.font = 'bold 48px monospace';
        ctx.fillStyle = '#FF0000';
        ctx.fillText('GAME OVER', CONSTANTS.CANVAS_WIDTH / 2, 200);

        // Stats
        ctx.font = '16px monospace';
        ctx.fillStyle = '#FFF';
        ctx.fillText(`Final Score: ${game.score}`, CONSTANTS.CANVAS_WIDTH / 2, 280);
        ctx.fillText(`Level Reached: ${game.currentLevel + 1}`, CONSTANTS.CANVAS_WIDTH / 2, 310);

        if (game.score >= game.highScore && game.score > 0) {
            ctx.fillStyle = '#FFD700';
            ctx.fillText('NEW HIGH SCORE!', CONSTANTS.CANVAS_WIDTH / 2, 350);
        }

        ctx.font = '14px monospace';
        ctx.fillStyle = '#FFF';

        if (Math.floor(game.frameCount / 30) % 2 === 0) {
            ctx.fillText('Press SPACE to try again', CONSTANTS.CANVAS_WIDTH / 2, 420);
        }

        ctx.restore();
    }

    renderLevelComplete(ctx, game) {
        // Darken background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, CONSTANTS.CANVAS_WIDTH, CONSTANTS.CANVAS_HEIGHT);

        ctx.save();
        ctx.textAlign = 'center';

        // Level Complete text
        ctx.font = 'bold 36px monospace';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('LEVEL COMPLETE!', CONSTANTS.CANVAS_WIDTH / 2, 180);

        ctx.font = '20px monospace';
        ctx.fillStyle = '#87CEEB';
        ctx.fillText(Levels.getLevelName(), CONSTANTS.CANVAS_WIDTH / 2, 220);

        // Stats
        ctx.font = '14px monospace';
        ctx.fillStyle = '#FFF';

        const stats = Collectibles.getCollectedCount();

        ctx.fillText(`Coins: ${stats.coins.collected} / ${stats.coins.total}`, CONSTANTS.CANVAS_WIDTH / 2, 280);
        ctx.fillText(`Gems: ${stats.gems.collected} / ${stats.gems.total}`, CONSTANTS.CANVAS_WIDTH / 2, 310);
        ctx.fillText(`Score: ${game.score}`, CONSTANTS.CANVAS_WIDTH / 2, 340);

        // Time bonus display
        if (game.levelCompleteBonus > 0) {
            ctx.fillStyle = '#FFD700';
            ctx.fillText(`Level Bonus: +${game.levelCompleteBonus}`, CONSTANTS.CANVAS_WIDTH / 2, 380);
        }

        ctx.font = '12px monospace';
        ctx.fillStyle = '#FFF';

        if (Math.floor(game.frameCount / 30) % 2 === 0) {
            if (Levels.isLastLevel()) {
                ctx.fillText('Press SPACE to continue', CONSTANTS.CANVAS_WIDTH / 2, 450);
            } else {
                ctx.fillText('Press SPACE for next level', CONSTANTS.CANVAS_WIDTH / 2, 450);
            }
        }

        ctx.restore();
    }

    renderVictory(ctx, game) {
        // Background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, CONSTANTS.CANVAS_WIDTH, CONSTANTS.CANVAS_HEIGHT);

        // Celebratory particles/stars
        ctx.fillStyle = '#FFD700';
        for (let i = 0; i < 50; i++) {
            const x = (i * 37 + game.frameCount) % CONSTANTS.CANVAS_WIDTH;
            const y = (i * 59 + game.frameCount * 0.5) % CONSTANTS.CANVAS_HEIGHT;
            const size = 2 + Math.sin(game.frameCount * 0.1 + i) * 2;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.save();
        ctx.textAlign = 'center';

        // Victory text
        ctx.font = 'bold 48px monospace';
        const victoryGradient = ctx.createLinearGradient(0, 120, 0, 180);
        victoryGradient.addColorStop(0, '#FFD700');
        victoryGradient.addColorStop(0.5, '#FF8C00');
        victoryGradient.addColorStop(1, '#FFD700');
        ctx.fillStyle = victoryGradient;
        ctx.fillText('VICTORY!', CONSTANTS.CANVAS_WIDTH / 2, 150);

        ctx.font = '20px monospace';
        ctx.fillStyle = '#90EE90';
        ctx.fillText('You have conquered Pixel Quest!', CONSTANTS.CANVAS_WIDTH / 2, 200);

        // Final stats
        ctx.font = '16px monospace';
        ctx.fillStyle = '#FFF';
        ctx.fillText('FINAL STATS', CONSTANTS.CANVAS_WIDTH / 2, 270);

        ctx.font = '14px monospace';
        ctx.fillText(`Total Score: ${game.score}`, CONSTANTS.CANVAS_WIDTH / 2, 310);
        ctx.fillText(`Lives Remaining: ${game.player.lives}`, CONSTANTS.CANVAS_WIDTH / 2, 340);
        ctx.fillText(`Levels Completed: ${Levels.levels.length}`, CONSTANTS.CANVAS_WIDTH / 2, 370);

        if (game.score >= game.highScore) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 16px monospace';
            ctx.fillText('★ NEW HIGH SCORE! ★', CONSTANTS.CANVAS_WIDTH / 2, 420);
        }

        ctx.font = '12px monospace';
        ctx.fillStyle = '#FFF';
        if (Math.floor(game.frameCount / 30) % 2 === 0) {
            ctx.fillText('Press SPACE to play again', CONSTANTS.CANVAS_WIDTH / 2, 500);
        }

        // Credits
        ctx.font = '10px monospace';
        ctx.fillStyle = '#666';
        ctx.fillText('Thanks for playing!', CONSTANTS.CANVAS_WIDTH / 2, 560);

        ctx.restore();
    }

    setFPS(fps) {
        this.lastFPS = fps;
    }
}

const GameUI = new UI();
