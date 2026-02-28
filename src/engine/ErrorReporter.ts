export class ErrorReporter {
  private static overlay: HTMLDivElement | null = null;

  static show(error: Error): void {
    if (ErrorReporter.overlay) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,0.9);
      color: #ff6b6b; font-family: monospace;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 2rem;
    `;

    overlay.innerHTML = `
      <h1 style="color: #ffd93d; margin-bottom: 1rem;">Something went wrong</h1>
      <pre style="color: #ff6b6b; max-width: 80%; overflow: auto; margin-bottom: 2rem;">${error.stack ?? error.message}</pre>
      <div>
        <button onclick="location.reload()" style="padding: 0.5rem 2rem; margin: 0 0.5rem; cursor: pointer; background: #4ecdc4; border: none; color: #000; font-size: 1rem;">
          Reload Game
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    ErrorReporter.overlay = overlay;
  }

  static hide(): void {
    if (ErrorReporter.overlay) {
      ErrorReporter.overlay.remove();
      ErrorReporter.overlay = null;
    }
  }
}
