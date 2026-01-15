// Boss system for Pixel Quest

class Boss {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 64;
        this.height = 64;
        this.active = false;
        this.defeated = false;

        // Stats
        this.maxHealth = 10;
        this.health = this.maxHealth;

        // Movement
        this.vx = 0;
        this.vy = 0;
        this.homeX = x;
        this.homeY = y;
        this.gravity = 0.3;
        this.grounded = false;

        // Attack patterns
        this.state = 'idle'; // idle, charge, jump, shoot, vulnerable, defeated
        this.stateTimer = 0;
        this.attackPattern = 0;
        this.attackCooldown = 60;

        // Projectiles
        this.projectiles = [];

        // Invincibility after hit
        this.invincible = false;
        this.invincibleTimer = 0;
        this.flickerTimer = 0;
        this.visible = true;

        // Animation
        this.animFrame = 0;
        this.animTimer = 0;
        this.facingRight = false;
    }

    activate() {
        this.active = true;
        this.state = 'idle';
        this.stateTimer = 60;
        Audio.startMusic('boss');
    }

    update(platforms, player, level) {
        if (!this.active || this.defeated) return;

        // Update animation
        this.animTimer++;
        if (this.animTimer >= 10) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 2;
        }

        // Face player
        this.facingRight = player.x > this.x;

        // Update invincibility
        if (this.invincible) {
            this.invincibleTimer--;
            this.flickerTimer++;
            this.visible = Math.floor(this.flickerTimer / 3) % 2 === 0;

            if (this.invincibleTimer <= 0) {
                this.invincible = false;
                this.visible = true;
            }
        }

        // State machine
        switch (this.state) {
            case 'idle':
                this.updateIdle(player);
                break;
            case 'charge':
                this.updateCharge(player, platforms);
                break;
            case 'jump':
                this.updateJump(player, platforms);
                break;
            case 'shoot':
                this.updateShoot(player);
                break;
            case 'vulnerable':
                this.updateVulnerable();
                break;
        }

        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.x += proj.vx;
            proj.y += proj.vy;
            proj.life--;

            if (proj.life <= 0) {
                this.projectiles.splice(i, 1);
            }
        }

        // Apply gravity when not in special states
        if (this.state !== 'charge') {
            this.vy += this.gravity;
            this.y += this.vy;

            // Ground collision
            this.grounded = false;
            for (const platform of platforms) {
                if (!platform.active) continue;

                if (Utils.rectCollision(this, platform)) {
                    if (this.vy > 0) {
                        this.y = platform.y - this.height;
                        this.vy = 0;
                        this.grounded = true;
                    }
                }
            }
        }

        // Level bounds
        if (this.x < level.width - 400) this.x = level.width - 400;
        if (this.x > level.width - this.width - 20) this.x = level.width - this.width - 20;
    }

    updateIdle(player) {
        this.stateTimer--;

        if (this.stateTimer <= 0) {
            // Choose next attack
            this.attackPattern = (this.attackPattern + 1) % 3;

            switch (this.attackPattern) {
                case 0:
                    this.startCharge(player);
                    break;
                case 1:
                    this.startJump(player);
                    break;
                case 2:
                    this.startShoot(player);
                    break;
            }
        }
    }

    startCharge(player) {
        this.state = 'charge';
        this.stateTimer = 90;
        this.vx = player.x > this.x ? 6 : -6;
    }

    updateCharge(player, platforms) {
        this.stateTimer--;
        this.x += this.vx;

        // Check for wall collision
        let hitWall = false;
        for (const platform of platforms) {
            if (!platform.active) continue;

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

        if (hitWall || this.stateTimer <= 0) {
            this.vx = 0;
            this.state = 'vulnerable';
            this.stateTimer = 60;
        }
    }

    startJump(player) {
        this.state = 'jump';
        this.vy = -15;
        this.vx = player.x > this.x ? 3 : -3;
        this.stateTimer = 120;
    }

    updateJump(player, platforms) {
        this.stateTimer--;
        this.x += this.vx;

        // Ground collision handled in main update
        if (this.grounded && this.stateTimer < 90) {
            this.vx = 0;
            this.state = 'idle';
            this.stateTimer = 30;

            // Spawn shockwave projectiles on landing
            for (let i = -1; i <= 1; i += 2) {
                this.projectiles.push({
                    x: this.x + this.width / 2,
                    y: this.y + this.height - 8,
                    vx: i * 5,
                    vy: 0,
                    width: 16,
                    height: 16,
                    life: 60
                });
            }
            Audio.playShoot();
        }
    }

    startShoot(player) {
        this.state = 'shoot';
        this.stateTimer = 90;
        this.shootCount = 0;
        this.shootDelay = 0;
    }

    updateShoot(player) {
        this.stateTimer--;
        this.shootDelay--;

        if (this.shootDelay <= 0 && this.shootCount < 5) {
            // Shoot at player
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const speed = 5;

            this.projectiles.push({
                x: this.x + this.width / 2,
                y: this.y + this.height / 2,
                vx: (dx / dist) * speed,
                vy: (dy / dist) * speed,
                width: 12,
                height: 12,
                life: 120
            });

            Audio.playShoot();
            this.shootCount++;
            this.shootDelay = 15;
        }

        if (this.stateTimer <= 0) {
            this.state = 'vulnerable';
            this.stateTimer = 45;
        }
    }

    updateVulnerable() {
        this.stateTimer--;

        if (this.stateTimer <= 0) {
            this.state = 'idle';
            this.stateTimer = 30;
        }
    }

    checkPlayerCollision(player) {
        if (!this.active || this.defeated) return null;

        // Check main body collision
        if (Utils.rectCollision(player, this)) {
            // Check if player is jumping on top during vulnerable state
            const playerBottom = player.y + player.height;
            const bossTop = this.y;

            if (player.vy > 0 && playerBottom - 15 < bossTop + 20 && this.state === 'vulnerable') {
                return 'stomp';
            }
            return 'damage';
        }

        // Check projectile collision
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            if (Utils.rectCollision(player, proj)) {
                this.projectiles.splice(i, 1);
                return 'damage';
            }
        }

        return null;
    }

    checkAttackCollision(hitbox) {
        if (!this.active || this.defeated || !hitbox || this.invincible) return false;

        // Only take damage during vulnerable state or if player is powered up
        if (this.state === 'vulnerable') {
            return Utils.rectCollision(hitbox, this);
        }
        return false;
    }

    takeDamage() {
        if (this.invincible) return 0;

        this.health--;
        this.invincible = true;
        this.invincibleTimer = 45;
        this.flickerTimer = 0;

        Audio.playBossHit();

        if (this.health <= 0) {
            this.defeat();
            return 1000;
        }

        return 100;
    }

    defeat() {
        this.defeated = true;
        this.active = false;
        Particles.bossDefeat(this.x + this.width / 2, this.y + this.height / 2);
        Audio.stopMusic();
        Audio.playLevelComplete();
    }

    render(ctx, camera) {
        if (!this.active && !this.defeated) return;
        if (!this.visible) return;

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);

        ctx.save();

        // Draw boss sprite
        const sprite = Sprites.getSprite('boss');
        if (sprite) {
            if (!this.facingRight) {
                ctx.translate(screenX + this.width, screenY);
                ctx.scale(-1, 1);
                ctx.drawImage(sprite, 0, 0, this.width, this.height);
            } else {
                ctx.drawImage(sprite, screenX, screenY, this.width, this.height);
            }
        } else {
            // Fallback
            ctx.fillStyle = this.state === 'vulnerable' ? '#FF6B6B' : '#8B0000';
            ctx.fillRect(screenX, screenY, this.width, this.height);
        }

        // State indicator
        if (this.state === 'vulnerable') {
            ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
            ctx.fillRect(screenX - 5, screenY - 5, this.width + 10, this.height + 10);
        }

        ctx.restore();

        // Draw projectiles
        const projSprite = Sprites.getSprite('bossProjectile');
        for (const proj of this.projectiles) {
            const projX = Math.floor(proj.x - camera.x);
            const projY = Math.floor(proj.y - camera.y);

            if (projSprite) {
                ctx.drawImage(projSprite, projX, projY, proj.width, proj.height);
            } else {
                ctx.fillStyle = '#FF0000';
                ctx.beginPath();
                ctx.arc(projX + proj.width / 2, projY + proj.height / 2, proj.width / 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Health bar
        if (this.active) {
            this.renderHealthBar(ctx, camera);
        }
    }

    renderHealthBar(ctx, camera) {
        const barWidth = 200;
        const barHeight = 16;
        const barX = (CONSTANTS.CANVAS_WIDTH - barWidth) / 2;
        const barY = 50;

        // Background
        ctx.fillStyle = '#333';
        ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);

        // Health
        const healthWidth = (this.health / this.maxHealth) * barWidth;
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(barX, barY, healthWidth, barHeight);

        // Border
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);

        // Label
        ctx.fillStyle = '#FFF';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('BOSS', CONSTANTS.CANVAS_WIDTH / 2, barY - 6);
    }

    reset(x, y) {
        this.x = x;
        this.y = y;
        this.health = this.maxHealth;
        this.active = false;
        this.defeated = false;
        this.state = 'idle';
        this.stateTimer = 0;
        this.projectiles = [];
        this.invincible = false;
        this.visible = true;
    }
}
