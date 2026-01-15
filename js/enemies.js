// Enemy system for Pixel Quest

class Enemy {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.active = true;
        this.vx = 0;
        this.vy = 0;
        this.facingRight = false;
        this.animFrame = 0;
        this.animTimer = 0;

        // Set properties based on type
        this.setupType();
    }

    setupType() {
        switch (this.type) {
            case 'walker':
                this.width = 28;
                this.height = 28;
                this.speed = 1;
                this.vx = -this.speed;
                this.points = 100;
                this.gravity = CONSTANTS.GRAVITY;
                break;

            case 'jumper':
                this.width = 28;
                this.height = 24;
                this.speed = 1.5;
                this.jumpForce = -10;
                this.jumpTimer = 60;
                this.points = 150;
                this.gravity = CONSTANTS.GRAVITY;
                break;

            case 'shooter':
                this.width = 28;
                this.height = 24;
                this.speed = 0;
                this.shootTimer = 120;
                this.shootCooldown = 120;
                this.points = 200;
                this.gravity = CONSTANTS.GRAVITY;
                this.projectiles = [];
                break;
        }
    }

    update(platforms, player, level) {
        if (!this.active) return;

        this.animTimer++;
        if (this.animTimer >= 15) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 2;
        }

        switch (this.type) {
            case 'walker':
                this.updateWalker(platforms, level);
                break;
            case 'jumper':
                this.updateJumper(platforms, player, level);
                break;
            case 'shooter':
                this.updateShooter(platforms, player, level);
                break;
        }

        // Update facing direction based on velocity
        if (this.vx > 0) this.facingRight = true;
        else if (this.vx < 0) this.facingRight = false;
    }

    updateWalker(platforms, level) {
        // Apply gravity
        this.vy += this.gravity;
        if (this.vy > CONSTANTS.MAX_FALL_SPEED) {
            this.vy = CONSTANTS.MAX_FALL_SPEED;
        }

        // Move horizontally
        this.x += this.vx;

        // Check for edge of platform or wall collision
        let onGround = false;
        let hitWall = false;
        let atEdge = true;

        for (const platform of platforms) {
            if (!platform.active) continue;

            // Ground check
            const groundCheck = {
                x: this.x,
                y: this.y + this.height,
                width: this.width,
                height: 5
            };

            if (Utils.rectCollision(groundCheck, platform)) {
                onGround = true;
            }

            // Edge check - is there ground ahead?
            const edgeCheck = {
                x: this.vx > 0 ? this.x + this.width : this.x - 5,
                y: this.y + this.height,
                width: 5,
                height: 10
            };

            if (Utils.rectCollision(edgeCheck, platform)) {
                atEdge = false;
            }

            // Wall check
            if (Utils.rectCollision(this, platform)) {
                if (this.vx > 0) {
                    this.x = platform.x - this.width;
                    hitWall = true;
                } else if (this.vx < 0) {
                    this.x = platform.x + platform.width;
                    hitWall = true;
                }
            }
        }

        // Reverse direction at edges or walls
        if ((atEdge && onGround) || hitWall) {
            this.vx = -this.vx;
        }

        // Apply vertical movement and ground collision
        this.y += this.vy;

        for (const platform of platforms) {
            if (!platform.active) continue;

            if (Utils.rectCollision(this, platform)) {
                if (this.vy > 0) {
                    this.y = platform.y - this.height;
                    this.vy = 0;
                } else if (this.vy < 0) {
                    this.y = platform.y + platform.height;
                    this.vy = 0;
                }
            }
        }

        // Level bounds
        if (this.x < 0) {
            this.x = 0;
            this.vx = -this.vx;
        }
        if (this.x > level.width - this.width) {
            this.x = level.width - this.width;
            this.vx = -this.vx;
        }
    }

    updateJumper(platforms, player, level) {
        // Apply gravity
        this.vy += this.gravity;
        if (this.vy > CONSTANTS.MAX_FALL_SPEED) {
            this.vy = CONSTANTS.MAX_FALL_SPEED;
        }

        // Jump timer
        this.jumpTimer--;
        if (this.jumpTimer <= 0) {
            // Jump toward player
            const dx = player.x - this.x;
            this.vx = dx > 0 ? this.speed : -this.speed;
            this.vy = this.jumpForce;
            this.jumpTimer = Utils.randomInt(60, 120);
        }

        // Move
        this.x += this.vx;
        this.y += this.vy;

        // Platform collisions
        for (const platform of platforms) {
            if (!platform.active) continue;

            // Horizontal collision
            if (Utils.rectCollision(this, platform)) {
                if (this.vx > 0) {
                    this.x = platform.x - this.width;
                } else if (this.vx < 0) {
                    this.x = platform.x + platform.width;
                }
                this.vx = 0;
            }
        }

        for (const platform of platforms) {
            if (!platform.active) continue;

            // Vertical collision
            if (Utils.rectCollision(this, platform)) {
                if (this.vy > 0) {
                    this.y = platform.y - this.height;
                    this.vy = 0;
                    this.vx = 0;
                } else if (this.vy < 0) {
                    this.y = platform.y + platform.height;
                    this.vy = 0;
                }
            }
        }

        // Level bounds
        if (this.x < 0) this.x = 0;
        if (this.x > level.width - this.width) this.x = level.width - this.width;
    }

    updateShooter(platforms, player, level) {
        // Apply gravity
        this.vy += this.gravity;
        this.y += this.vy;

        // Ground collision
        for (const platform of platforms) {
            if (!platform.active) continue;

            if (Utils.rectCollision(this, platform)) {
                if (this.vy > 0) {
                    this.y = platform.y - this.height;
                    this.vy = 0;
                }
            }
        }

        // Face toward player
        this.facingRight = player.x > this.x;

        // Shooting
        this.shootTimer--;
        if (this.shootTimer <= 0) {
            this.shoot(player);
            this.shootTimer = this.shootCooldown;
        }

        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.x += proj.vx;
            proj.y += proj.vy;
            proj.life--;

            // Remove if off screen or expired
            if (proj.life <= 0 || proj.x < 0 || proj.x > level.width) {
                this.projectiles.splice(i, 1);
            }
        }
    }

    shoot(player) {
        const speed = 4;
        const dx = player.x - this.x;
        const dir = dx > 0 ? 1 : -1;

        this.projectiles.push({
            x: this.x + (dir > 0 ? this.width : 0),
            y: this.y + this.height / 2 - 4,
            vx: speed * dir,
            vy: 0,
            width: 8,
            height: 8,
            life: 180
        });

        Audio.playShoot();
    }

    checkPlayerCollision(player) {
        if (!this.active) return null;

        // Check main body collision
        if (Utils.rectCollision(player, this)) {
            // Check if player is jumping on top
            const playerBottom = player.y + player.height;
            const enemyTop = this.y;
            const playerVy = player.vy;

            if (playerVy > 0 && playerBottom - 10 < enemyTop + 10) {
                return 'stomp';
            } else {
                return 'damage';
            }
        }

        // Check projectile collision (for shooters)
        if (this.type === 'shooter') {
            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const proj = this.projectiles[i];
                if (Utils.rectCollision(player, proj)) {
                    this.projectiles.splice(i, 1);
                    return 'damage';
                }
            }
        }

        return null;
    }

    checkAttackCollision(hitbox) {
        if (!this.active || !hitbox) return false;
        return Utils.rectCollision(hitbox, this);
    }

    defeat() {
        this.active = false;
        Particles.enemyDefeat(this.x + this.width / 2, this.y + this.height / 2, this.getColor());
        Audio.playEnemyDefeat();
        return this.points;
    }

    getColor() {
        switch (this.type) {
            case 'walker': return '#8B4513';
            case 'jumper': return '#32CD32';
            case 'shooter': return '#9400D3';
            default: return '#FF0000';
        }
    }

    render(ctx, camera) {
        if (!this.active) return;

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);

        ctx.save();

        let sprite;
        switch (this.type) {
            case 'walker':
                sprite = Sprites.getSprite('walker')[this.animFrame];
                break;
            case 'jumper':
                sprite = Sprites.getSprite('jumper')[this.animFrame];
                break;
            case 'shooter':
                sprite = Sprites.getSprite('shooter');
                break;
        }

        if (sprite) {
            if (!this.facingRight) {
                ctx.translate(screenX + this.width, screenY);
                ctx.scale(-1, 1);
                ctx.drawImage(sprite, 0, 0, this.width, this.height);
            } else {
                ctx.drawImage(sprite, screenX, screenY, this.width, this.height);
            }
        }

        ctx.restore();

        // Render projectiles
        if (this.type === 'shooter') {
            const projSprite = Sprites.getSprite('projectile');
            for (const proj of this.projectiles) {
                const projX = Math.floor(proj.x - camera.x);
                const projY = Math.floor(proj.y - camera.y);
                if (projSprite) {
                    ctx.drawImage(projSprite, projX, projY, proj.width, proj.height);
                } else {
                    ctx.fillStyle = '#FF4500';
                    ctx.fillRect(projX, projY, proj.width, proj.height);
                }
            }
        }
    }
}

class EnemyManager {
    constructor() {
        this.enemies = [];
    }

    spawn(x, y, type) {
        this.enemies.push(new Enemy(x, y, type));
    }

    clear() {
        this.enemies = [];
    }

    update(platforms, player, level) {
        for (const enemy of this.enemies) {
            enemy.update(platforms, player, level);
        }
    }

    checkCollisions(player) {
        let points = 0;

        for (const enemy of this.enemies) {
            // Check attack collision first
            const attackHitbox = player.getAttackHitbox();
            if (attackHitbox && enemy.checkAttackCollision(attackHitbox)) {
                points += enemy.defeat();
                continue;
            }

            // Check player collision
            const collision = enemy.checkPlayerCollision(player);

            if (collision === 'stomp') {
                points += enemy.defeat();
                player.vy = -8; // Bounce
            } else if (collision === 'damage') {
                player.takeDamage();
            }
        }

        return points;
    }

    render(ctx, camera) {
        for (const enemy of this.enemies) {
            enemy.render(ctx, camera);
        }
    }

    getActiveCount() {
        return this.enemies.filter(e => e.active).length;
    }
}

const Enemies = new EnemyManager();
