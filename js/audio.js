// Audio system for Pixel Quest using Web Audio API

class AudioManager {
    constructor() {
        this.context = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.initialized = false;
        this.muted = false;
        this.currentMusic = null;
    }

    init() {
        if (this.initialized) return;

        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.context.createGain();
            this.masterGain.connect(this.context.destination);
            this.masterGain.gain.value = 0.3;

            this.musicGain = this.context.createGain();
            this.musicGain.connect(this.masterGain);
            this.musicGain.gain.value = 0.4;

            this.sfxGain = this.context.createGain();
            this.sfxGain.connect(this.masterGain);
            this.sfxGain.gain.value = 0.6;

            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    resume() {
        if (this.context && this.context.state === 'suspended') {
            this.context.resume();
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : 0.3;
        }
        return this.muted;
    }

    // Generate 8-bit style sounds
    playTone(frequency, duration, type = 'square', volume = 0.3) {
        if (!this.initialized || this.muted) return;
        this.resume();

        const oscillator = this.context.createOscillator();
        const gainNode = this.context.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGain);

        oscillator.type = type;
        oscillator.frequency.value = frequency;

        gainNode.gain.setValueAtTime(volume, this.context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);

        oscillator.start(this.context.currentTime);
        oscillator.stop(this.context.currentTime + duration);
    }

    // Sound effects
    playJump() {
        if (!this.initialized) return;
        this.resume();

        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.type = 'square';
        osc.frequency.setValueAtTime(150, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.context.currentTime + 0.1);

        gain.gain.setValueAtTime(0.3, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.15);

        osc.start();
        osc.stop(this.context.currentTime + 0.15);
    }

    playCoin() {
        if (!this.initialized) return;
        this.resume();

        // Two quick high notes
        [0, 0.08].forEach((delay, i) => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.type = 'square';
            osc.frequency.value = i === 0 ? 988 : 1319; // B5 and E6

            gain.gain.setValueAtTime(0.25, this.context.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + delay + 0.1);

            osc.start(this.context.currentTime + delay);
            osc.stop(this.context.currentTime + delay + 0.1);
        });
    }

    playEnemyDefeat() {
        if (!this.initialized) return;
        this.resume();

        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.type = 'square';
        osc.frequency.setValueAtTime(400, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.context.currentTime + 0.2);

        gain.gain.setValueAtTime(0.3, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.25);

        osc.start();
        osc.stop(this.context.currentTime + 0.25);
    }

    playDamage() {
        if (!this.initialized) return;
        this.resume();

        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.context.currentTime + 0.3);

        gain.gain.setValueAtTime(0.4, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.3);

        osc.start();
        osc.stop(this.context.currentTime + 0.3);
    }

    playPowerUp() {
        if (!this.initialized) return;
        this.resume();

        const notes = [262, 330, 392, 523]; // C4, E4, G4, C5
        notes.forEach((freq, i) => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.type = 'square';
            osc.frequency.value = freq;

            const startTime = this.context.currentTime + i * 0.08;
            gain.gain.setValueAtTime(0.25, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);

            osc.start(startTime);
            osc.stop(startTime + 0.15);
        });
    }

    playLevelComplete() {
        if (!this.initialized) return;
        this.resume();

        const melody = [523, 659, 784, 1047, 784, 1047]; // Victory fanfare
        melody.forEach((freq, i) => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.type = 'square';
            osc.frequency.value = freq;

            const duration = i < 4 ? 0.15 : 0.3;
            const startTime = this.context.currentTime + i * 0.15;
            gain.gain.setValueAtTime(0.3, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

            osc.start(startTime);
            osc.stop(startTime + duration);
        });
    }

    playGameOver() {
        if (!this.initialized) return;
        this.resume();

        const notes = [392, 370, 349, 330, 311, 294, 277, 262]; // Descending
        notes.forEach((freq, i) => {
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.type = 'triangle';
            osc.frequency.value = freq;

            const startTime = this.context.currentTime + i * 0.12;
            gain.gain.setValueAtTime(0.3, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);

            osc.start(startTime);
            osc.stop(startTime + 0.2);
        });
    }

    playShoot() {
        if (!this.initialized) return;
        this.resume();

        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.type = 'square';
        osc.frequency.setValueAtTime(800, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, this.context.currentTime + 0.1);

        gain.gain.setValueAtTime(0.2, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.1);

        osc.start();
        osc.stop(this.context.currentTime + 0.1);
    }

    playBossHit() {
        if (!this.initialized) return;
        this.resume();

        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, this.context.currentTime + 0.15);

        gain.gain.setValueAtTime(0.4, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.2);

        osc.start();
        osc.stop(this.context.currentTime + 0.2);
    }

    playMenuSelect() {
        if (!this.initialized) return;
        this.resume();
        this.playTone(440, 0.1, 'square', 0.2);
    }

    playMenuConfirm() {
        if (!this.initialized) return;
        this.resume();
        this.playTone(523, 0.08, 'square', 0.25);
        setTimeout(() => this.playTone(659, 0.12, 'square', 0.25), 80);
    }

    // Background music using oscillators
    startMusic(type = 'game') {
        this.stopMusic();
        if (!this.initialized || this.muted) return;
        this.resume();

        this.currentMusic = {
            playing: true,
            intervalId: null
        };

        const playMusicLoop = () => {
            if (!this.currentMusic || !this.currentMusic.playing) return;

            let melody, tempo;

            if (type === 'title') {
                melody = [262, 294, 330, 349, 392, 349, 330, 294];
                tempo = 250;
            } else if (type === 'boss') {
                melody = [196, 196, 233, 196, 175, 196, 233, 262];
                tempo = 180;
            } else {
                melody = [330, 330, 0, 330, 0, 262, 330, 392, 0, 196];
                tempo = 150;
            }

            let noteIndex = 0;
            this.currentMusic.intervalId = setInterval(() => {
                if (!this.currentMusic || !this.currentMusic.playing) {
                    clearInterval(this.currentMusic?.intervalId);
                    return;
                }

                const freq = melody[noteIndex];
                if (freq > 0) {
                    const osc = this.context.createOscillator();
                    const gain = this.context.createGain();
                    osc.connect(gain);
                    gain.connect(this.musicGain);

                    osc.type = 'square';
                    osc.frequency.value = freq;

                    gain.gain.setValueAtTime(0.15, this.context.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.1);

                    osc.start();
                    osc.stop(this.context.currentTime + 0.1);
                }

                noteIndex = (noteIndex + 1) % melody.length;
            }, tempo);
        };

        playMusicLoop();
    }

    stopMusic() {
        if (this.currentMusic) {
            this.currentMusic.playing = false;
            if (this.currentMusic.intervalId) {
                clearInterval(this.currentMusic.intervalId);
            }
            this.currentMusic = null;
        }
    }
}

const Audio = new AudioManager();
