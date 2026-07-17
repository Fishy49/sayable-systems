// Service-worker update handling. With registerType: 'prompt', a freshly
// deployed version installs in the background but WAITS — we flip `updateReady`
// so App.svelte can offer a "Reload" banner, rather than reloading mid-sentence.

import { registerSW } from 'virtual:pwa-register';

let updateReady = $state(false);
let reload: ((reload?: boolean) => Promise<void>) | null = null;

// registerSW returns the update function; onNeedRefresh fires when a new SW is
// waiting. In dev (no SW) this is a harmless no-op stub.
reload = registerSW({
  onNeedRefresh() {
    updateReady = true;
  },
});

export const pwa = {
  get updateReady(): boolean {
    return updateReady;
  },
  applyUpdate(): void {
    updateReady = false;
    // reload(true) tells the waiting SW to activate, then reloads the page.
    void reload?.(true);
  },
};
