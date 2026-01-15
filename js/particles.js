// Particle system for Pixel Quest

class ParticleSystem {
    constructor() {
        this.particles = [];
        this.maxParticles = 200;
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= 1;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity || 0;

            // Apply friction
            p.vx *= p.friction || 1;
            p.vy *= p.friction || 1;

            // Update size if shrinking
            if (p.shrink) {
                p.size *= 0.95;
            }

            // Update alpha
            p.alpha = p.life / p.maxLife;
        }
    }

    render(ctx, camera) {
        for (const p of this.particles) {
            ctx.save();
            ctx.globalAlpha = p.alpha;

            const screenX = p.x - camera.x;
            const screenY = p.y - camera.y;

            if (p.type === 'square') {
                ctx.fillStyle = p.color;
                ctx.fillRect(
                    Math.floor(screenX - p.size / 2),
                    Math.floor(screenY - p.size / 2),
                    Math.ceil(p.size),
                    Math.ceil(p.size)
                );
            } else if (p.type === 'circle') {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'star') {
                ctx.fillStyle = p.color;
                this.drawStar(ctx, screenX, screenY, p.size);
            }

            ctx.restore();
        }
    }

    drawStar(ctx, x, y, size) {
        const spikes = 4;
        const outerRadius = size;
        const innerRadius = size / 2;

        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i * Math.PI) / spikes - Math.PI / 2;
            const px = x + Math.cos(angle) * radius;
            const py = y + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
    }

    emit(config) {
        const count = config.count || 1;

        for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
            const angle = config.angle !== undefined ?
                config.angle + (Math.random() - 0.5) * (config.spread || 0) :
                Math.random() * Math.PI * 2;

            const speed = config.speed || 2;
            const speedVariance = config.speedVariance || 0;
            const actualSpeed = speed + (Math.random() - 0.5) * speedVariance * 2;

            this.particles.push({
                x: config.x + (Math.random() - 0.5) * (config.xVariance || 0),
                y: config.y + (Math.random() - 0.5) * (config.yVariance || 0),
                vx: Math.cos(angle) * actualSpeed,
                vy: Math.sin(angle) * actualSpeed,
                size: config.size || 4,
                color: config.colors ? Utils.randomChoice(config.colors) : config.color || '#FFFFFF',
                life: config.life || 30,
                maxLife: config.life || 30,
                gravity: config.gravity || 0,
                friction: config.friction || 1,
                shrink: config.shrink || false,
                type: config.type || 'square',
                alpha: 1
            });
        }
    }

    // Preset effects
    jumpDust(x, y) {
        this.emit({
            x: x,
            y: y,
            count: 6,
            angle: -Math.PI / 2,
            spread: Math.PI / 3,
            speed: 2,
            speedVariance: 1,
            size: 3,
            colors: ['#D2B48C', '#DEB887', '#F5DEB3'],
            life: 15,
            gravity: 0.1,
            shrink: true,
            type: 'square'
        });
    }

    landDust(x, y) {
        this.emit({
            x: x,
            y: y,
            count: 8,
            angle: -Math.PI / 2,
            spread: Math.PI,
            speed: 3,
            speedVariance: 2,
            size: 4,
            colors: ['#D2B48C', '#DEB887', '#F5DEB3'],
            life: 20,
            gravity: 0.15,
            shrink: true,
            type: 'square'
        });
    }

    enemyDefeat(x, y, color = '#FF0000') {
        this.emit({
            x: x,
            y: y,
            count: 12,
            speed: 4,
            speedVariance: 2,
            size: 5,
            colors: [color, '#FFFFFF', '#FFD700'],
            life: 25,
            gravity: 0.1,
            shrink: true,
            type: 'square'
        });
    }

    coinCollect(x, y) {
        this.emit({
            x: x,
            y: y,
            count: 8,
            speed: 3,
            speedVariance: 1,
            size: 3,
            colors: ['#FFD700', '#FFA500', '#FFFF00'],
            life: 20,
            gravity: -0.05,
            shrink: true,
            type: 'star'
        });
    }

    powerUpCollect(x, y, color) {
        this.emit({
            x: x,
            y: y,
            count: 16,
            speed: 5,
            speedVariance: 2,
            size: 6,
            colors: [color, '#FFFFFF'],
            life: 30,
            gravity: 0,
            friction: 0.95,
            shrink: true,
            type: 'star'
        });
    }

    playerDamage(x, y) {
        this.emit({
            x: x,
            y: y,
            count: 10,
            speed: 3,
            speedVariance: 2,
            size: 4,
            colors: ['#FF0000', '#FF4500', '#FFFFFF'],
            life: 20,
            gravity: 0.1,
            shrink: true,
            type: 'square'
        });
    }

    invincibilitySparkle(x, y) {
        this.emit({
            x: x + (Math.random() - 0.5) * 20,
            y: y + (Math.random() - 0.5) * 30,
            count: 1,
            speed: 0.5,
            size: 4,
            colors: ['#FFD700', '#FFFF00', '#FFFFFF'],
            life: 15,
            gravity: -0.1,
            shrink: true,
            type: 'star'
        });
    }

    speedTrail(x, y) {
        this.emit({
            x: x,
            y: y,
            count: 2,
            speed: 0.5,
            size: 6,
            colors: ['#87CEEB', '#4169E1', '#FFFFFF'],
            life: 10,
            shrink: true,
            type: 'square'
        });
    }

    bossDefeat(x, y) {
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                this.emit({
                    x: x + (Math.random() - 0.5) * 60,
                    y: y + (Math.random() - 0.5) * 60,
                    count: 20,
                    speed: 6,
                    speedVariance: 3,
                    size: 8,
                    colors: ['#FF0000', '#FF4500', '#FFD700', '#FFFFFF'],
                    life: 40,
                    gravity: 0.1,
                    shrink: true,
                    type: 'square'
                });
            }, i * 100);
        }
    }

    levelComplete(x, y) {
        this.emit({
            x: x,
            y: y,
            count: 30,
            speed: 8,
            speedVariance: 4,
            size: 6,
            colors: ['#FFD700', '#FF4500', '#32CD32', '#4169E1', '#FF69B4'],
            life: 60,
            gravity: 0.15,
            shrink: true,
            type: 'star'
        });
    }

    clear() {
        this.particles = [];
    }
}

const Particles = new ParticleSystem();
