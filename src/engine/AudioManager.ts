import { sound } from '@pixi/sound';

// ── Types ────────────────────────────────────────────────────────────────────

interface TrackRegistration {
  id: string;
  path: string;
}

interface PlayMusicOptions {
  loop?: boolean;
  volume?: number;
  fadeIn?: number;
}

interface PlaySFXOptions {
  volume?: number;
  pan?: number;
  pitch?: number;
}

interface CrossfadeState {
  fromTrackId: string;
  toTrackId: string;
  duration: number;
  startTime: number;
  fromStartVolume: number;
  toTargetVolume: number;
  rafId: number;
}

// ── Default track / SFX IDs ─────────────────────────────────────────────────

const DEFAULT_MUSIC_TRACKS: ReadonlyArray<[string, string]> = [
  ['title', 'assets/audio/music/title.ogg'],
  ['overworld', 'assets/audio/music/overworld.ogg'],
  ['town', 'assets/audio/music/town.ogg'],
  ['dungeon', 'assets/audio/music/dungeon.ogg'],
  ['boss', 'assets/audio/music/boss.ogg'],
  ['victory', 'assets/audio/music/victory.ogg'],
  ['gameover', 'assets/audio/music/gameover.ogg'],
];

const DEFAULT_SFX: ReadonlyArray<[string, string]> = [
  ['sword-hit', 'assets/audio/sfx/sword-hit.ogg'],
  ['magic-cast', 'assets/audio/sfx/magic-cast.ogg'],
  ['heal', 'assets/audio/sfx/heal.ogg'],
  ['level-up', 'assets/audio/sfx/level-up.ogg'],
  ['item-pickup', 'assets/audio/sfx/item-pickup.ogg'],
  ['menu-select', 'assets/audio/sfx/menu-select.ogg'],
  ['menu-back', 'assets/audio/sfx/menu-back.ogg'],
  ['door-open', 'assets/audio/sfx/door-open.ogg'],
  ['chest-open', 'assets/audio/sfx/chest-open.ogg'],
  ['enemy-death', 'assets/audio/sfx/enemy-death.ogg'],
  ['critical-hit', 'assets/audio/sfx/critical-hit.ogg'],
  ['dodge', 'assets/audio/sfx/dodge.ogg'],
  ['spell-fire', 'assets/audio/sfx/spell-fire.ogg'],
  ['spell-ice', 'assets/audio/sfx/spell-ice.ogg'],
  ['spell-lightning', 'assets/audio/sfx/spell-lightning.ogg'],
  ['spell-holy', 'assets/audio/sfx/spell-holy.ogg'],
];

// ── AudioManager ─────────────────────────────────────────────────────────────

export class AudioManager {
  private static _instance: AudioManager;

  static get instance(): AudioManager {
    if (!AudioManager._instance) {
      AudioManager._instance = new AudioManager();
    }
    return AudioManager._instance;
  }

  private initialized = false;

  // Registrations (id -> path)
  private musicTracks: Map<string, TrackRegistration> = new Map();
  private sfxEntries: Map<string, TrackRegistration> = new Map();

  // Volume state
  private masterVolume = 1;
  private musicVolume = 1;
  private sfxVolume = 1;
  private muted = false;
  private volumeBeforeMute = 1;

  // Current music state
  private currentMusicId: string | null = null;
  private musicPaused = false;

  // Crossfade
  private crossfadeState: CrossfadeState | null = null;

  // Volume tween rAF IDs for cleanup
  private _tweenRafIds: Set<number> = new Set();

  private constructor() {
    // singleton — use AudioManager.instance
  }

  // ── Initialization ───────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // @pixi/sound initializes itself on import; nothing extra needed.
    this.initialized = true;
    console.log('[AudioManager] Initialized.');
  }

  // ── Music ────────────────────────────────────────────────────────────────

  async playMusic(
    trackId: string,
    options: PlayMusicOptions = {}
  ): Promise<void> {
    this.ensureInitialized();

    const registration = this.musicTracks.get(trackId);
    if (!registration) {
      console.warn(`[AudioManager] Music track "${trackId}" not registered.`);
      return;
    }

    const loop = options.loop !== undefined ? options.loop : true;
    const targetVolume = options.volume !== undefined ? options.volume : 1;
    const fadeIn = options.fadeIn !== undefined ? options.fadeIn : 0;

    // If the same track is already playing, do nothing
    if (this.currentMusicId === trackId && !this.musicPaused) {
      return;
    }

    // Ensure the track is added to the sound library
    this.ensureSoundAdded(trackId, registration.path);

    const effectiveVolume = this.computeMusicVolume(targetVolume);

    // If a different track is currently playing, crossfade
    if (this.currentMusicId !== null && this.currentMusicId !== trackId) {
      const crossfadeDuration = fadeIn > 0 ? fadeIn : 2;
      await this.crossfade(this.currentMusicId, trackId, crossfadeDuration, loop, effectiveVolume);
      return;
    }

    // No existing track — just play (with optional fade-in)
    if (fadeIn > 0) {
      sound.play(trackId, { loop, volume: 0 });
      this.currentMusicId = trackId;
      this.musicPaused = false;
      this.tweenVolume(trackId, 0, effectiveVolume, fadeIn);
    } else {
      sound.play(trackId, { loop, volume: effectiveVolume });
      this.currentMusicId = trackId;
      this.musicPaused = false;
    }

    console.log(`[AudioManager] Playing music: "${trackId}" (loop=${loop}).`);
  }

  stopMusic(fadeOut?: number): void {
    this.ensureInitialized();

    if (this.currentMusicId === null) {
      return;
    }

    this.cancelCrossfade();

    const trackId = this.currentMusicId;

    if (fadeOut !== undefined && fadeOut > 0) {
      const currentVol = this.getCurrentTrackVolume(trackId);
      this.tweenVolume(trackId, currentVol, 0, fadeOut, () => {
        sound.stop(trackId);
      });
    } else {
      sound.stop(trackId);
    }

    this.currentMusicId = null;
    this.musicPaused = false;
    console.log(`[AudioManager] Stopped music: "${trackId}".`);
  }

  pauseMusic(): void {
    this.ensureInitialized();

    if (this.currentMusicId === null || this.musicPaused) {
      return;
    }

    const instance = sound.find(this.currentMusicId);
    if (instance) {
      instance.pause();
    }
    this.musicPaused = true;
    console.log(`[AudioManager] Paused music: "${this.currentMusicId}".`);
  }

  resumeMusic(): void {
    this.ensureInitialized();

    if (this.currentMusicId === null || !this.musicPaused) {
      return;
    }

    const instance = sound.find(this.currentMusicId);
    if (instance) {
      instance.resume();
    }
    this.musicPaused = false;
    console.log(`[AudioManager] Resumed music: "${this.currentMusicId}".`);
  }

  // ── SFX ──────────────────────────────────────────────────────────────────

  playSFX(sfxId: string, options: PlaySFXOptions = {}): void {
    this.ensureInitialized();

    const registration = this.sfxEntries.get(sfxId);
    if (!registration) {
      console.warn(`[AudioManager] SFX "${sfxId}" not registered.`);
      return;
    }

    this.ensureSoundAdded(sfxId, registration.path);

    const baseVolume = options.volume !== undefined ? options.volume : 1;
    const effectiveVolume = this.computeSFXVolume(baseVolume);

    const playOptions: Record<string, unknown> = {
      volume: effectiveVolume,
    };

    if (options.pan !== undefined) {
      // @pixi/sound supports panning via the "filters" or "panning" option
      // We clamp pan to [-1, 1] range
      playOptions['panning'] = Math.max(-1, Math.min(1, options.pan));
    }

    if (options.pitch !== undefined) {
      playOptions['speed'] = options.pitch;
    }

    sound.play(sfxId, playOptions);
  }

  // ── Registration ─────────────────────────────────────────────────────────

  registerTrack(id: string, path: string): void {
    this.musicTracks.set(id, { id, path });
  }

  registerSFX(id: string, path: string): void {
    this.sfxEntries.set(id, { id, path });
  }

  // ── Volume Controls ──────────────────────────────────────────────────────

  setMasterVolume(v: number): void {
    this.masterVolume = this.clampVolume(v);
    this.applyGlobalVolume();
    console.log(`[AudioManager] Master volume: ${this.masterVolume.toFixed(2)}`);
  }

  setMusicVolume(v: number): void {
    this.musicVolume = this.clampVolume(v);
    this.applyCurrentMusicVolume();
    console.log(`[AudioManager] Music volume: ${this.musicVolume.toFixed(2)}`);
  }

  setSFXVolume(v: number): void {
    this.sfxVolume = this.clampVolume(v);
    console.log(`[AudioManager] SFX volume: ${this.sfxVolume.toFixed(2)}`);
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  getMusicVolume(): number {
    return this.musicVolume;
  }

  getSFXVolume(): number {
    return this.sfxVolume;
  }

  // ── Mute ─────────────────────────────────────────────────────────────────

  toggleMute(): boolean {
    if (this.muted) {
      this.muted = false;
      this.masterVolume = this.volumeBeforeMute;
    } else {
      this.volumeBeforeMute = this.masterVolume;
      this.muted = true;
      this.masterVolume = 0;
    }

    this.applyGlobalVolume();
    console.log(`[AudioManager] Mute: ${this.muted}`);
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  // ── Register Defaults ────────────────────────────────────────────────────

  registerDefaults(): void {
    for (const [id, path] of DEFAULT_MUSIC_TRACKS) {
      this.registerTrack(id, path);
    }

    for (const [id, path] of DEFAULT_SFX) {
      this.registerSFX(id, path);
    }

    console.log(
      `[AudioManager] Registered ${DEFAULT_MUSIC_TRACKS.length} default music tracks ` +
        `and ${DEFAULT_SFX.length} default SFX.`
    );
  }

  // ── Private Helpers ──────────────────────────────────────────────────────

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('[AudioManager] Not initialized. Call initialize() first.');
    }
  }

  private clampVolume(v: number): number {
    return Math.max(0, Math.min(1, v));
  }

  private computeMusicVolume(trackVolume: number): number {
    return this.masterVolume * this.musicVolume * trackVolume;
  }

  private computeSFXVolume(sfxBaseVolume: number): number {
    return this.masterVolume * this.sfxVolume * sfxBaseVolume;
  }

  /**
   * Ensures a sound asset is added to the @pixi/sound library exactly once.
   */
  private ensureSoundAdded(id: string, path: string): void {
    try {
      const existing = sound.find(id);
      if (existing) {
        return;
      }
    } catch (_err: unknown) {
      // sound.find throws if not found in some versions; that's fine.
    }

    sound.add(id, path);
  }

  /**
   * Applies the effective global volume to the currently playing music track.
   */
  private applyGlobalVolume(): void {
    this.applyCurrentMusicVolume();
  }

  private applyCurrentMusicVolume(): void {
    if (this.currentMusicId === null) {
      return;
    }

    try {
      const instance = sound.find(this.currentMusicId);
      if (instance) {
        instance.volume = this.computeMusicVolume(1);
      }
    } catch (_err: unknown) {
      // track may not be loaded yet
    }
  }

  private getCurrentTrackVolume(trackId: string): number {
    try {
      const instance = sound.find(trackId);
      if (instance) {
        return instance.volume;
      }
    } catch (_err: unknown) {
      // ignore
    }
    return 0;
  }

  // ── Crossfade ────────────────────────────────────────────────────────────

  private async crossfade(
    fromTrackId: string,
    toTrackId: string,
    duration: number,
    loop: boolean,
    toTargetVolume: number
  ): Promise<void> {
    this.cancelCrossfade();

    const fromStartVolume = this.getCurrentTrackVolume(fromTrackId);

    // Start the new track at volume 0
    const registration = this.musicTracks.get(toTrackId);
    if (registration) {
      this.ensureSoundAdded(toTrackId, registration.path);
    }
    sound.play(toTrackId, { loop, volume: 0 });

    return new Promise<void>((resolve) => {
      const startTime = performance.now();
      const durationMs = duration * 1000;

      const tick = (): void => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / durationMs, 1);

        // Ease: simple linear interpolation
        const fromVol = fromStartVolume * (1 - t);
        const toVol = toTargetVolume * t;

        try {
          const fromInstance = sound.find(fromTrackId);
          if (fromInstance) {
            fromInstance.volume = fromVol;
          }
        } catch (_err: unknown) {
          // ignore
        }

        try {
          const toInstance = sound.find(toTrackId);
          if (toInstance) {
            toInstance.volume = toVol;
          }
        } catch (_err: unknown) {
          // ignore
        }

        if (t < 1) {
          this.crossfadeState = {
            fromTrackId,
            toTrackId,
            duration,
            startTime,
            fromStartVolume,
            toTargetVolume,
            rafId: requestAnimationFrame(tick),
          };
        } else {
          // Crossfade complete — stop the old track
          sound.stop(fromTrackId);
          this.currentMusicId = toTrackId;
          this.musicPaused = false;
          this.crossfadeState = null;
          console.log(
            `[AudioManager] Crossfade complete: "${fromTrackId}" -> "${toTrackId}".`
          );
          resolve();
        }
      };

      // Kick off the first frame
      this.crossfadeState = {
        fromTrackId,
        toTrackId,
        duration,
        startTime,
        fromStartVolume,
        toTargetVolume,
        rafId: requestAnimationFrame(tick),
      };
    });
  }

  private cancelCrossfade(): void {
    if (this.crossfadeState !== null) {
      cancelAnimationFrame(this.crossfadeState.rafId);
      this.crossfadeState = null;
    }
  }

  // ── Volume Tween ─────────────────────────────────────────────────────────

  /**
   * Linearly tweens a track's volume from `fromVol` to `toVol` over `duration` seconds,
   * using requestAnimationFrame. Calls `onComplete` when done.
   */
  private tweenVolume(
    trackId: string,
    fromVol: number,
    toVol: number,
    duration: number,
    onComplete?: () => void
  ): void {
    const startTime = performance.now();
    const durationMs = duration * 1000;

    const tick = (): void => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / durationMs, 1);
      const currentVol = fromVol + (toVol - fromVol) * t;

      try {
        const instance = sound.find(trackId);
        if (instance) {
          instance.volume = currentVol;
        }
      } catch (_err: unknown) {
        // ignore — track may have been removed
      }

      if (t < 1) {
        const id = requestAnimationFrame(tick);
        this._tweenRafIds.add(id);
      } else {
        onComplete?.();
      }
    };

    const id = requestAnimationFrame(tick);
    this._tweenRafIds.add(id);
  }

  private cancelAllTweens(): void {
    for (const id of this._tweenRafIds) {
      cancelAnimationFrame(id);
    }
    this._tweenRafIds.clear();
  }

  destroy(): void {
    this.cancelCrossfade();
    this.cancelAllTweens();
    if (this.currentMusicId) {
      sound.stop(this.currentMusicId);
      this.currentMusicId = null;
    }
    this.initialized = false;
  }
}
