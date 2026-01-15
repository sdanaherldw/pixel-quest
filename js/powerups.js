// Power-up system for Pixel Quest

class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.width = 24;
        this.height = 24;
        this.type = type;
        this.active = true;

        // Animation
        this.animTimer = 0;
        this.floatOffset = 0;
        this.glowTimer = 0;
    }

    update() {
        if (!this.active) return;

        this.animTimer++;
        this.glowTimer++;

        // Floating animation
        this.floatOffset = Math.sin(this.animTimer * 0.1) * 4;
    }

    checkCollision(player) {
        if (!this.active) return false;

        const hitbox = {
            x: this.x,
            y: this.y + this.floatOffset,
            width: this.width,
            height: this.height
        };

        return Utils.rectCollision(player, hitbox);
    }

    collect() {
        this.active = false;
    }

    getSprite() {
        switch (this.type) {
            case 'speed': return Sprites.getSprite('speedBoost');
            case 'doubleJump': return Sprites.getSprite('doubleJump');
            case 'invincibility': return Sprites.getSprite('star');
            case 'powered': return Sprites.getSprite('mushroom');
            case 'health': return Sprites.getSprite('heart');
            default: return null;
        }
    }

    getColor() {
        switch (this.type) {
            case 'speed': return '#FFD700';
            case 'doubleJump': return '#87CEEB';
            case 'invincibility': return '#FFD700';
            case 'powered': return '#FF0000';
            case 'health': return '#FF69B4';
            default: return '#FFFFFF';
        }
    }

    render(ctx, camera) {
        if (!this.active) return;

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y + this.floatOffset);

        ctx.save();

        // Glow effect
        const glowIntensity = 0.3 + Math.sin(this.glowTimer * 0.15) * 0.2;
        ctx.shadowColor = this.getColor();
        ctx.shadowBlur = 10 * glowIntensity;

        const sprite = this.getSprite();
        if (sprite) {
            ctx.drawImage(sprite, screenX, screenY, this.width, this.height);
        } else {
            // Fallback
            ctx.fillStyle = this.getColor();
            ctx.fillRect(screenX, screenY, this.width, this.height);
        }

        ctx.restore();
    }
}

class PowerUpManager {
    constructor() {
        this.powerUps = [];
    }

    spawn(x, y, type) {
        this.powerUps.push(new PowerUp(x, y, type));
    }

    clear() {
        this.powerUps = [];
    }

    update() {
        for (const powerUp of this.powerUps) {
            powerUp.update();
        }
    }

    checkCollisions(player) {
        for (const powerUp of this.powerUps) {
            if (powerUp.checkCollision(player)) {
                powerUp.collect();

                if (powerUp.type === 'health') {
                    player.heal();
                    Audio.playPowerUp();
                } else {
                    player.collectPowerUp(powerUp.type);
                }

                Particles.powerUpCollect(
                    powerUp.x + powerUp.width / 2,
                    powerUp.y + powerUp.height / 2,
                    powerUp.getColor()
                );
            }
        }
    }

    render(ctx, camera) {
        for (const powerUp of this.powerUps) {
            powerUp.render(ctx, camera);
        }
    }
}

const PowerUps = new PowerUpManager();
