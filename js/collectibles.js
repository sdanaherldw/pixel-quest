// Collectibles system for Pixel Quest

class Coin {
    constructor(x, y, value = 10) {
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 20;
        this.value = value;
        this.active = true;

        // Animation
        this.animFrame = 0;
        this.animTimer = 0;
        this.sparkleTimer = 0;
    }

    update() {
        if (!this.active) return;

        this.animTimer++;
        this.sparkleTimer++;

        // Spin animation
        if (this.animTimer >= 8) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 2;
        }
    }

    checkCollision(player) {
        if (!this.active) return false;
        return Utils.rectCollision(player, this);
    }

    collect() {
        this.active = false;
        return this.value;
    }

    render(ctx, camera) {
        if (!this.active) return;

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);

        const sprites = Sprites.getSprite('coin');
        if (sprites && sprites[this.animFrame]) {
            ctx.drawImage(sprites[this.animFrame], screenX, screenY, this.width, this.height);
        } else {
            // Fallback
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.ellipse(
                screenX + this.width / 2,
                screenY + this.height / 2,
                this.width / 2 * (this.animFrame === 0 ? 1 : 0.3),
                this.height / 2,
                0, 0, Math.PI * 2
            );
            ctx.fill();
        }

        // Occasional sparkle
        if (this.sparkleTimer % 60 < 10) {
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(screenX + 4, screenY + 4, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

class Gem {
    constructor(x, y, color = 'blue') {
        this.x = x;
        this.y = y;
        this.width = 24;
        this.height = 24;
        this.color = color;
        this.active = true;
        this.value = this.getValue();

        // Animation
        this.animTimer = 0;
        this.floatOffset = 0;
    }

    getValue() {
        switch (this.color) {
            case 'blue': return 50;
            case 'green': return 100;
            case 'red': return 200;
            default: return 50;
        }
    }

    getColorHex() {
        switch (this.color) {
            case 'blue': return '#4169E1';
            case 'green': return '#32CD32';
            case 'red': return '#DC143C';
            default: return '#4169E1';
        }
    }

    update() {
        if (!this.active) return;

        this.animTimer++;
        this.floatOffset = Math.sin(this.animTimer * 0.08) * 3;
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
        return this.value;
    }

    render(ctx, camera) {
        if (!this.active) return;

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y + this.floatOffset);

        ctx.save();

        // Glow
        ctx.shadowColor = this.getColorHex();
        ctx.shadowBlur = 8;

        // Draw gem shape
        ctx.fillStyle = this.getColorHex();
        ctx.beginPath();
        ctx.moveTo(screenX + this.width / 2, screenY);
        ctx.lineTo(screenX + this.width, screenY + this.height / 2);
        ctx.lineTo(screenX + this.width / 2, screenY + this.height);
        ctx.lineTo(screenX, screenY + this.height / 2);
        ctx.closePath();
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.moveTo(screenX + this.width / 2, screenY + 4);
        ctx.lineTo(screenX + this.width - 6, screenY + this.height / 2);
        ctx.lineTo(screenX + this.width / 2, screenY + this.height / 2);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}

class CollectibleManager {
    constructor() {
        this.coins = [];
        this.gems = [];
    }

    spawnCoin(x, y, value = 10) {
        this.coins.push(new Coin(x, y, value));
    }

    spawnGem(x, y, color = 'blue') {
        this.gems.push(new Gem(x, y, color));
    }

    clear() {
        this.coins = [];
        this.gems = [];
    }

    update() {
        for (const coin of this.coins) {
            coin.update();
        }
        for (const gem of this.gems) {
            gem.update();
        }
    }

    checkCollisions(player) {
        let points = 0;

        for (const coin of this.coins) {
            if (coin.checkCollision(player)) {
                points += coin.collect();
                Particles.coinCollect(coin.x + coin.width / 2, coin.y + coin.height / 2);
                Audio.playCoin();
            }
        }

        for (const gem of this.gems) {
            if (gem.checkCollision(player)) {
                points += gem.collect();
                Particles.coinCollect(gem.x + gem.width / 2, gem.y + gem.height / 2);
                Audio.playCoin();
            }
        }

        return points;
    }

    render(ctx, camera) {
        for (const coin of this.coins) {
            coin.render(ctx, camera);
        }
        for (const gem of this.gems) {
            gem.render(ctx, camera);
        }
    }

    getCollectedCount() {
        const totalCoins = this.coins.length;
        const collectedCoins = this.coins.filter(c => !c.active).length;
        const totalGems = this.gems.length;
        const collectedGems = this.gems.filter(g => !g.active).length;

        return {
            coins: { collected: collectedCoins, total: totalCoins },
            gems: { collected: collectedGems, total: totalGems }
        };
    }
}

const Collectibles = new CollectibleManager();
