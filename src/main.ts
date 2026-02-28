import { Engine } from './engine/Engine';
import { BootScene } from './scenes/BootScene';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/**
 * Application entry point.
 *
 * Creates the engine, mounts the PixiJS canvas, sets up window resize
 * handling, pushes the initial boot scene, and starts the game loop.
 */
async function main(): Promise<void> {
  // --- Create and initialise the engine ---
  const engine = new Engine();

  await engine.start({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x0a0a0a,
    antialias: true,
    resolution: window.devicePixelRatio,
  });

  // --- Resize to fill the browser window ---
  const resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    engine.app.renderer.resize(width, height);
    engine.camera.resize(width, height);
    engine.scenes.resize(width, height);
  };

  window.addEventListener('resize', resize);

  // --- Push the initial boot scene ---
  await engine.loadScene(new BootScene());

  console.log('[main] Realms of Conquest engine started.');
}

// --- Global error handlers ---
window.addEventListener('unhandledrejection', (e) => {
  console.error('[main] Unhandled rejection:', e.reason);
});

// --- Run ---
main().catch((err) => {
  console.error('[main] Fatal error during bootstrap:', err);
});
