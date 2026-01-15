// Camera system for Pixel Quest

class Camera {
    constructor(width, height) {
        this.x = 0;
        this.y = 0;
        this.width = width;
        this.height = height;
        this.targetX = 0;
        this.targetY = 0;
        this.smoothing = 0.1;
        this.bounds = null;

        // Screen shake
        this.shakeIntensity = 0;
        this.shakeDuration = 0;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
    }

    setBounds(minX, minY, maxX, maxY) {
        this.bounds = { minX, minY, maxX, maxY };
    }

    follow(target, immediate = false) {
        // Center camera on target
        this.targetX = target.x + target.width / 2 - this.width / 2;
        this.targetY = target.y + target.height / 2 - this.height / 2;

        // Apply bounds
        if (this.bounds) {
            this.targetX = Utils.clamp(this.targetX, this.bounds.minX, this.bounds.maxX - this.width);
            this.targetY = Utils.clamp(this.targetY, this.bounds.minY, this.bounds.maxY - this.height);
        }

        if (immediate) {
            this.x = this.targetX;
            this.y = this.targetY;
        }
    }

    update() {
        // Smooth camera movement
        this.x = Utils.lerp(this.x, this.targetX, this.smoothing);
        this.y = Utils.lerp(this.y, this.targetY, this.smoothing);

        // Update screen shake
        if (this.shakeDuration > 0) {
            this.shakeDuration--;
            this.shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity * 2;
            this.shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity * 2;
            this.shakeIntensity *= 0.9;
        } else {
            this.shakeOffsetX = 0;
            this.shakeOffsetY = 0;
        }

        // Apply bounds
        if (this.bounds) {
            this.x = Utils.clamp(this.x, this.bounds.minX, this.bounds.maxX - this.width);
            this.y = Utils.clamp(this.y, this.bounds.minY, this.bounds.maxY - this.height);
        }
    }

    shake(intensity, duration) {
        this.shakeIntensity = intensity;
        this.shakeDuration = duration;
    }

    getViewX() {
        return Math.floor(this.x + this.shakeOffsetX);
    }

    getViewY() {
        return Math.floor(this.y + this.shakeOffsetY);
    }

    isOnScreen(obj) {
        return obj.x + obj.width > this.x &&
               obj.x < this.x + this.width &&
               obj.y + obj.height > this.y &&
               obj.y < this.y + this.height;
    }
}
