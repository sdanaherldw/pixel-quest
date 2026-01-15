// Player character for Pixel Quest

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 28;
        this.height = 32;
        this.vx = 0;
        this.vy = 0;

        // Physics constants
        this.walkSpeed = 3;
        this.runSpeed = 5;
        this.jumpForce = -12;
        this.gravity = CONSTANTS.GRAVITY;
        this.maxFallSpeed = CONSTANTS.MAX_FALL_SPEED;
        this.friction = 0.85;
        this.airFriction = 0.95;

        // State
        this.grounded = false;
        this.jumping = false;
        this.facingRight = true;
        this.state = 'idle'; // idle, run, jump, fall
        this.animFrame = 0;
        this.animTimer = 0;

        // Health and lives
        this.maxHealth = 3;
        this.health = this.maxHealth;
        this.lives = 3;
        this.dead = false;
        this.respawning = false;
        this.respawnTimer = 0;

        // Invincibility frames
        this.invincible = false;
        this.invincibleTimer = 0;
        this.flickerTimer = 0;
        this.visible = true;

        // Power-ups
        this.powerUps = {
            speed: { active: false, timer: 0, duration: 600 },
            doubleJump: { active: false, timer: 0, duration: 900, used: false },
            invincibility: { active: false, timer: 0, duration: 480 },
            powered: { active: false, timer: 0, duration: 900 }
        };

        // Jump tracking for variable height
        this.jumpHeld = false;
        this.jumpTime = 0;
        this.maxJumpTime = 15;

        // Double jump
        this.canDoubleJump = false;
        this.hasDoubleJumped = false;

        // Attack
        this.attacking = false;
        this.attackTimer = 0;
        this.attackCooldown = 0;

        // Wall mechanics
        this.touchingWall = false;
        this.wallDirection = 0;
        this.wallSliding = false;

        // Spawn point
        this.spawnX = x;
        this.spawnY = y;
    }

    update(platforms, level) {
        if (this.dead) {
            this.handleDeath();
            return;
        }

        if (this.respawning) {
            this.respawnTimer--;
            if (this.respawnTimer <= 0) {
                this.respawning = false;
            }
            return;
        }

        // Handle input
        this.handleInput();

        // Update power-ups
        this.updatePowerUps();

        // Apply physics
        this.applyPhysics();

        // Handle collisions
        this.handleCollisions(platforms, level);

        // Update invincibility
        this.updateInvincibility();

        // Update animation
        this.updateAnimation();

        // Attack cooldown
        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.attackTimer > 0) {
            this.attackTimer--;
            if (this.attackTimer <= 0) {
                this.attacking = false;
            }
        }

        // Check for falling off level
        if (this.y > level.height + 100) {
            this.takeDamage(this.health); // Instant death
        }
    }

    handleInput() {
        const moveSpeed = this.powerUps.speed.active ? this.runSpeed * 1.5 : this.runSpeed;

        // Horizontal movement
        if (Input.isDown('left')) {
            this.vx -= moveSpeed * 0.3;
            this.facingRight = false;
        }
        if (Input.isDown('right')) {
            this.vx += moveSpeed * 0.3;
            this.facingRight = true;
        }

        // Clamp horizontal speed
        const maxSpeed = this.powerUps.speed.active ? this.runSpeed * 1.5 : this.runSpeed;
        this.vx = Utils.clamp(this.vx, -maxSpeed, maxSpeed);

        // Jump
        if (Input.isPressed('jump')) {
            if (this.grounded) {
                this.jump();
            } else if (this.wallSliding) {
                this.wallJump();
            } else if (this.canDoubleJump && !this.hasDoubleJumped) {
                this.doubleJump();
            }
        }

        // Variable jump height
        if (Input.isDown('jump') && this.jumping && this.jumpTime < this.maxJumpTime) {
            this.vy += -0.5;
            this.jumpTime++;
        }

        if (Input.isReleased('jump')) {
            this.jumpHeld = false;
            if (this.vy < -4) {
                this.vy = -4;
            }
        }

        // Attack
        if (Input.isPressed('attack') && this.attackCooldown <= 0) {
            this.attack();
        }
    }

    jump() {
        this.vy = this.jumpForce;
        this.grounded = false;
        this.jumping = true;
        this.jumpHeld = true;
        this.jumpTime = 0;
        Particles.jumpDust(this.x + this.width / 2, this.y + this.height);
        Audio.playJump();
    }

    doubleJump() {
        this.vy = this.jumpForce * 0.9;
        this.hasDoubleJumped = true;
        this.jumping = true;
        this.jumpTime = 0;
        Particles.jumpDust(this.x + this.width / 2, this.y + this.height / 2);
        Audio.playJump();
    }

    wallJump() {
        this.vy = this.jumpForce * 0.9;
        this.vx = this.wallDirection * 8;
        this.grounded = false;
        this.jumping = true;
        this.wallSliding = false;
        Audio.playJump();
    }

    attack() {
        this.attacking = true;
        this.attackTimer = 20;
        this.attackCooldown = 30;
        Audio.playShoot();
    }

    getAttackHitbox() {
        if (!this.attacking) return null;

        const attackWidth = this.powerUps.powered.active ? 40 : 25;
        const attackHeight = 20;

        return {
            x: this.facingRight ? this.x + this.width : this.x - attackWidth,
            y: this.y + this.height / 2 - attackHeight / 2,
            width: attackWidth,
            height: attackHeight
        };
    }

    applyPhysics() {
        // Apply gravity
        this.vy += this.gravity;
        if (this.vy > this.maxFallSpeed) {
            this.vy = this.maxFallSpeed;
        }

        // Apply friction
        if (this.grounded) {
            this.vx *= this.friction;
        } else {
            this.vx *= this.airFriction;
        }

        // Wall sliding
        if (this.wallSliding && this.vy > 2) {
            this.vy = 2;
        }

        // Stop very small movements
        if (Math.abs(this.vx) < 0.1) this.vx = 0;
    }

    handleCollisions(platforms, level) {
        const wasGrounded = this.grounded;
        this.grounded = false;
        this.touchingWall = false;
        this.wallSliding = false;

        // Move horizontally
        this.x += this.vx;

        // Check horizontal collisions
        for (const platform of platforms) {
            if (!platform.active) continue;

            if (Utils.rectCollision(this, platform)) {
                if (this.vx > 0) {
                    this.x = platform.x - this.width;
                    this.touchingWall = true;
                    this.wallDirection = -1;
                } else if (this.vx < 0) {
                    this.x = platform.x + platform.width;
                    this.touchingWall = true;
                    this.wallDirection = 1;
                }
                this.vx = 0;
            }
        }

        // Move vertically
        this.y += this.vy;

        // Check vertical collisions
        for (const platform of platforms) {
            if (!platform.active) continue;

            if (Utils.rectCollision(this, platform)) {
                if (this.vy > 0) {
                    this.y = platform.y - this.height;
                    this.vy = 0;
                    this.grounded = true;
                    this.jumping = false;
                    this.hasDoubleJumped = false;

                    // Handle crumbling platforms
                    if (platform.type === 'crumbling' && !platform.crumbling) {
                        platform.startCrumble();
                    }

                    // Move with moving platforms
                    if (platform.type === 'moving') {
                        this.x += platform.vx || 0;
                    }
                } else if (this.vy < 0) {
                    this.y = platform.y + platform.height;
                    this.vy = 0;
                }
            }
        }

        // Wall slide check
        if (this.touchingWall && !this.grounded && this.vy > 0) {
            if ((this.wallDirection === -1 && Input.isDown('right')) ||
                (this.wallDirection === 1 && Input.isDown('left'))) {
                this.wallSliding = true;
            }
        }

        // Landing effects
        if (this.grounded && !wasGrounded && this.vy >= 0) {
            Particles.landDust(this.x + this.width / 2, this.y + this.height);
        }

        // Level bounds
        if (this.x < 0) this.x = 0;
        if (this.x > level.width - this.width) this.x = level.width - this.width;
    }

    updatePowerUps() {
        // Update each power-up timer
        for (const key in this.powerUps) {
            const powerUp = this.powerUps[key];
            if (powerUp.active) {
                powerUp.timer--;
                if (powerUp.timer <= 0) {
                    powerUp.active = false;
                    if (key === 'doubleJump') {
                        this.canDoubleJump = false;
                    }
                }

                // Visual effects
                if (key === 'invincibility') {
                    Particles.invincibilitySparkle(this.x + this.width / 2, this.y + this.height / 2);
                }
                if (key === 'speed' && (Input.isDown('left') || Input.isDown('right'))) {
                    Particles.speedTrail(this.x + this.width / 2, this.y + this.height / 2);
                }
            }
        }

        // Update double jump ability
        this.canDoubleJump = this.powerUps.doubleJump.active;
    }

    updateInvincibility() {
        if (this.invincible) {
            this.invincibleTimer--;
            this.flickerTimer++;

            // Flicker effect
            this.visible = Math.floor(this.flickerTimer / 4) % 2 === 0;

            if (this.invincibleTimer <= 0) {
                this.invincible = false;
                this.visible = true;
            }
        }
    }

    updateAnimation() {
        this.animTimer++;

        // Determine state
        if (!this.grounded) {
            this.state = this.vy < 0 ? 'jump' : 'fall';
        } else if (Math.abs(this.vx) > 0.5) {
            this.state = 'run';
        } else {
            this.state = 'idle';
        }

        // Update animation frame
        const animSpeed = this.state === 'run' ? 8 : 20;
        if (this.animTimer >= animSpeed) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 2;
        }
    }

    takeDamage(amount = 1) {
        if (this.invincible || this.powerUps.invincibility.active || this.dead) return;

        this.health -= amount;
        Particles.playerDamage(this.x + this.width / 2, this.y + this.height / 2);
        Audio.playDamage();

        if (this.health <= 0) {
            this.die();
        } else {
            // Brief invincibility after damage
            this.invincible = true;
            this.invincibleTimer = 90; // 1.5 seconds
            this.flickerTimer = 0;
        }
    }

    die() {
        this.dead = true;
        this.lives--;
        this.vy = this.jumpForce;
        this.vx = 0;
        Audio.playDamage();
    }

    handleDeath() {
        // Death animation (fall off screen)
        this.vy += this.gravity;
        this.y += this.vy;

        if (this.y > CONSTANTS.CANVAS_HEIGHT + 100) {
            if (this.lives > 0) {
                this.respawn();
            }
        }
    }

    respawn() {
        this.x = this.spawnX;
        this.y = this.spawnY;
        this.vx = 0;
        this.vy = 0;
        this.health = this.maxHealth;
        this.dead = false;
        this.respawning = true;
        this.respawnTimer = 60;
        this.invincible = true;
        this.invincibleTimer = 120;
        this.flickerTimer = 0;

        // Clear power-ups on death
        for (const key in this.powerUps) {
            this.powerUps[key].active = false;
            this.powerUps[key].timer = 0;
        }
        this.canDoubleJump = false;
        this.hasDoubleJumped = false;
    }

    setSpawnPoint(x, y) {
        this.spawnX = x;
        this.spawnY = y;
    }

    collectPowerUp(type) {
        const powerUp = this.powerUps[type];
        if (powerUp) {
            powerUp.active = true;
            powerUp.timer = powerUp.duration;

            if (type === 'doubleJump') {
                this.canDoubleJump = true;
                powerUp.used = false;
            }
        }
        Particles.powerUpCollect(this.x + this.width / 2, this.y + this.height / 2, '#FFD700');
        Audio.playPowerUp();
    }

    heal(amount = 1) {
        this.health = Math.min(this.health + amount, this.maxHealth);
    }

    addLife() {
        this.lives++;
        Audio.playPowerUp();
    }

    render(ctx, camera) {
        if (!this.visible) return;

        const screenX = Math.floor(this.x - camera.x);
        const screenY = Math.floor(this.y - camera.y);

        ctx.save();

        // Choose sprite set based on power-up state
        const spriteSet = this.powerUps.powered.active || this.powerUps.invincibility.active ?
            Sprites.getSprite('playerPowered') : Sprites.getSprite('player');

        let sprite;
        switch (this.state) {
            case 'idle':
                sprite = spriteSet.idle[this.animFrame];
                break;
            case 'run':
                sprite = spriteSet.run[this.animFrame];
                break;
            case 'jump':
                sprite = spriteSet.jump;
                break;
            case 'fall':
                sprite = spriteSet.fall;
                break;
            default:
                sprite = spriteSet.idle[0];
        }

        // Flip sprite if facing left
        if (!this.facingRight) {
            ctx.translate(screenX + this.width, screenY);
            ctx.scale(-1, 1);
            ctx.drawImage(sprite, 0, 0, this.width, this.height);
        } else {
            ctx.drawImage(sprite, screenX, screenY, this.width, this.height);
        }

        ctx.restore();

        // Draw attack effect
        if (this.attacking) {
            const hitbox = this.getAttackHitbox();
            if (hitbox) {
                ctx.save();
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = this.powerUps.powered.active ? '#FFD700' : '#FFFFFF';

                const attackX = hitbox.x - camera.x;
                const attackY = hitbox.y - camera.y;

                // Draw attack slash
                ctx.beginPath();
                if (this.facingRight) {
                    ctx.moveTo(attackX, attackY);
                    ctx.lineTo(attackX + hitbox.width, attackY + hitbox.height / 2);
                    ctx.lineTo(attackX, attackY + hitbox.height);
                } else {
                    ctx.moveTo(attackX + hitbox.width, attackY);
                    ctx.lineTo(attackX, attackY + hitbox.height / 2);
                    ctx.lineTo(attackX + hitbox.width, attackY + hitbox.height);
                }
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        }
    }
}
