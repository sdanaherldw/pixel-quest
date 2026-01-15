// Platform system for Pixel Quest

class Platform {
    constructor(x, y, width, height, type = 'static', options = {}) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.type = type;
        this.active = true;

        // For moving platforms
        this.startX = x;
        this.startY = y;
        this.endX = options.endX || x;
        this.endY = options.endY || y;
        this.speed = options.speed || 2;
        this.direction = 1;
        this.vx = 0;
        this.vy = 0;

        // For crumbling platforms
        this.crumbling = false;
        this.crumbleTimer = 0;
        this.crumbleDuration = 30;
        this.respawnTimer = 0;
        this.respawnDuration = 180;
        this.shakeOffset = 0;

        // Visual
        this.tileType = options.tileType || 'ground';
    }

    update() {
        if (!this.active && this.type === 'crumbling') {
            this.respawnTimer--;
            if (this.respawnTimer <= 0) {
                this.active = true;
                this.crumbling = false;
                this.crumbleTimer = 0;
            }
            return;
        }

        switch (this.type) {
            case 'moving':
                this.updateMoving();
                break;
            case 'crumbling':
                this.updateCrumbling();
                break;
        }
    }

    updateMoving() {
        // Calculate movement
        const dx = this.endX - this.startX;
        const dy = this.endY - this.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist === 0) return;

        // Move toward target
        const targetX = this.direction > 0 ? this.endX : this.startX;
        const targetY = this.direction > 0 ? this.endY : this.startY;

        const toDx = targetX - this.x;
        const toDy = targetY - this.y;
        const toDist = Math.sqrt(toDx * toDx + toDy * toDy);

        if (toDist < this.speed) {
            this.direction *= -1;
        }

        this.vx = (dx / dist) * this.speed * this.direction;
        this.vy = (dy / dist) * this.speed * this.direction;

        this.x += this.vx;
        this.y += this.vy;
    }

    updateCrumbling() {
        if (this.crumbling) {
            this.crumbleTimer++;
            this.shakeOffset = (Math.random() - 0.5) * 4;

            if (this.crumbleTimer >= this.crumbleDuration) {
                this.active = false;
                this.respawnTimer = this.respawnDuration;
                this.shakeOffset = 0;

                // Particles
                for (let i = 0; i < 8; i++) {
                    Particles.emit({
                        x: this.x + Math.random() * this.width,
                        y: this.y + Math.random() * this.height,
                        count: 1,
                        speed: 2,
                        speedVariance: 1,
                        size: 6,
                        colors: ['#DEB887', '#D2691E', '#8B4513'],
                        life: 30,
                        gravity: 0.2,
                        shrink: true,
                        type: 'square'
                    });
                }
            }
        }
    }

    startCrumble() {
        if (!this.crumbling && this.type === 'crumbling') {
            this.crumbling = true;
            this.crumbleTimer = 0;
        }
    }

    render(ctx, camera) {
        if (!this.active) return;

        const screenX = Math.floor(this.x - camera.x + (this.shakeOffset || 0));
        const screenY = Math.floor(this.y - camera.y);

        // Get the appropriate sprite
        let sprite;
        switch (this.type) {
            case 'moving':
                sprite = Sprites.getSprite('movingPlatform');
                break;
            case 'crumbling':
                sprite = Sprites.getSprite('crumblingPlatform');
                break;
            default:
                sprite = Sprites.getSprite(this.tileType);
        }

        // Draw platform tiles
        const tileSize = 16;
        const tilesX = Math.ceil(this.width / tileSize);
        const tilesY = Math.ceil(this.height / tileSize);

        ctx.save();

        // Add alpha for crumbling
        if (this.crumbling) {
            ctx.globalAlpha = 1 - (this.crumbleTimer / this.crumbleDuration) * 0.5;
        }

        for (let ty = 0; ty < tilesY; ty++) {
            for (let tx = 0; tx < tilesX; tx++) {
                const tileX = screenX + tx * tileSize;
                const tileY = screenY + ty * tileSize;
                const tileW = Math.min(tileSize, this.width - tx * tileSize);
                const tileH = Math.min(tileSize, this.height - ty * tileSize);

                if (sprite) {
                    ctx.drawImage(sprite, tileX, tileY, tileW, tileH);
                } else {
                    // Fallback colors
                    ctx.fillStyle = this.getFallbackColor();
                    ctx.fillRect(tileX, tileY, tileW, tileH);
                }
            }
        }

        ctx.restore();
    }

    getFallbackColor() {
        switch (this.type) {
            case 'moving': return '#4169E1';
            case 'crumbling': return '#DEB887';
            default:
                switch (this.tileType) {
                    case 'ground': return '#8B4513';
                    case 'stone': return '#696969';
                    case 'brick': return '#B22222';
                    default: return '#8B4513';
                }
        }
    }
}

// Hazard class for spikes and other dangers
class Hazard {
    constructor(x, y, width, height, type = 'spike') {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.type = type;
        this.active = true;
    }

    checkCollision(player) {
        if (!this.active) return false;

        // Smaller hitbox for spikes (more forgiving)
        const hitbox = {
            x: this.x + 4,
            y: this.y + 8,
            width: this.width - 8,
            height: this.height - 8
        };

        return Utils.rectCollision(player, hitbox);
    }

    render(ctx, camera) {
        if (!this.active) return;

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);

        const sprite = Sprites.getSprite('spike');
        const tileSize = 16;
        const tilesX = Math.ceil(this.width / tileSize);

        for (let tx = 0; tx < tilesX; tx++) {
            if (sprite) {
                ctx.drawImage(sprite, screenX + tx * tileSize, screenY, tileSize, this.height);
            } else {
                // Fallback spike drawing
                ctx.fillStyle = '#A9A9A9';
                ctx.beginPath();
                ctx.moveTo(screenX + tx * tileSize + tileSize / 2, screenY);
                ctx.lineTo(screenX + tx * tileSize + tileSize, screenY + this.height);
                ctx.lineTo(screenX + tx * tileSize, screenY + this.height);
                ctx.closePath();
                ctx.fill();
            }
        }
    }
}

// Level goal (flagpole/door)
class Goal {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 32;
        this.height = 64;
        this.reached = false;
        this.animTimer = 0;
    }

    checkCollision(player) {
        if (this.reached) return false;

        if (Utils.rectCollision(player, this)) {
            this.reached = true;
            return true;
        }
        return false;
    }

    update() {
        this.animTimer++;
    }

    render(ctx, camera) {
        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);

        const sprite = Sprites.getSprite('flag');

        // Draw flag pole
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(screenX + 14, screenY, 4, this.height);

        // Draw flag with wave animation
        const waveOffset = Math.sin(this.animTimer * 0.1) * 2;

        if (sprite) {
            ctx.drawImage(sprite, screenX + waveOffset, screenY, 32, 32);
        } else {
            ctx.fillStyle = this.reached ? '#FFD700' : '#228B22';
            ctx.fillRect(screenX + 18 + waveOffset, screenY + 4, 20, 20);
        }

        // Draw base
        ctx.fillStyle = '#654321';
        ctx.fillRect(screenX + 8, screenY + this.height - 8, 16, 8);

        // Sparkle effect if reached
        if (this.reached && this.animTimer % 10 < 5) {
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(screenX + 28, screenY + 16, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
