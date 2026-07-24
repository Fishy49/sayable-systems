<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { getVoices, onVoicesChanged, speak, speechRateSupported, type VoiceInfo } from '../lib/speech';
  import type { SnapshotMeta } from '../lib/snapshots';

  let voices = $state<VoiceInfo[]>([]);
  const rateSupported = speechRateSupported();

  let selected = $state('');
  // The tabbed voice picker (its own modal) owns browsing; here we just show
  // the current pick and a button to open it.
  const currentVoiceLabel = $derived(
    (selected && voices.find((v) => v.voiceURI === selected)?.name) || 'System default',
  );
  let backups = $state<SnapshotMeta[]>([]);

  // Load voices (and keep up with their async arrival) while the modal is open.
  $effect(() => {
    if (!app.settingsOpen) return;
    voices = getVoices();
    return onVoicesChanged(() => {
      voices = getVoices();
    });
  });

  // Reflect the active profile's saved voice into the select.
  $effect(() => {
    selected = app.voice.uri ?? '';
  });

  const rate = $derived(app.voice.rate ?? 0.95);

  function detectVoiceHint(): string {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const touch = typeof window !== 'undefined' && 'ontouchend' in window;
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh|Mac OS X/.test(ua) && touch)) {
      return 'On iPhone/iPad: Settings → Accessibility → Spoken Content → Voices → pick a language, then download an “Enhanced” or “Premium” voice.';
    }
    if (/Macintosh|Mac OS X/.test(ua)) {
      return 'On Mac: System Settings → Accessibility → Spoken Content → System Voice → Manage Voices… → download an “Enhanced” or “Premium” voice.';
    }
    if (/Android/.test(ua)) {
      return 'On Android: Settings → System → Languages & input → Text-to-speech → install or upgrade your voice data (Google’s voices work well).';
    }
    if (/Windows/.test(ua)) {
      return 'On Windows: Settings → Time & language → Speech → Manage voices → add a “Natural” voice.';
    }
    return 'Your device’s accessibility / speech settings usually let you download higher-quality voices — look for “Enhanced”, “Premium”, or “Natural”.';
  }
  const voiceHint = detectVoiceHint();

  function test() {
    speak('Hi! This is how I sound.', { voiceURI: app.voice.uri, rate: app.voice.rate });
  }

  $effect(() => {
    if (!app.settingsOpen) return;
    void refreshBackups();
  });
  async function refreshBackups() {
    backups = await app.listBackups();
  }
  async function restore(id: number) {
    if (confirm('Restore this backup? Your current boards are saved as a backup first.')) {
      await app.restoreBackup(id);
    }
  }
  async function removeBackup(id: number) {
    if (confirm('Delete this backup?')) {
      await app.deleteBackup(id);
      await refreshBackups();
    }
  }
  function fmtTime(ts: number): string {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function onKey(e: KeyboardEvent) {
    // The PIN pad sits above this modal and handles its own Escape.
    if (e.key === 'Escape' && !app.pinSetupOpen) app.closeSettings();
  }

  function removeLock() {
    if (confirm('Remove the caregiver lock?')) app.removePin();
  }

  // Fullscreen is per-tap browser state, not persisted data, so it lives here.
  const fsSupported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
  let isFullscreen = $state(false);
  $effect(() => {
    const sync = () => {
      isFullscreen = !!document.fullscreenElement;
    };
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  });
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // blocked by the browser — nothing sensible to do
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if app.settingsOpen}
  <div class="modal-backdrop" onclick={() => app.closeSettings()} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="modal settings-modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label="Settings"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="modal-head">Settings · {app.activeProfile.name}</div>

      <div class="field">
        <span class="field-label">Voice</span>
        <button type="button" class="voice-open" onclick={() => app.openVoicePicker()}>
          <span class="voice-open-name">{currentVoiceLabel}</span>
          <span class="voice-open-cta">Change ▸</span>
        </button>
        {#if voices.length === 0}
          <p class="picker-note">No installed voices detected yet - the default voice will be used.</p>
        {/if}
        <details class="voice-help">
          <summary>Want more natural voices?</summary>
          <p>{voiceHint} They'll show up in the picker once installed - all free and on-device.</p>
        </details>
      </div>

      {#if rateSupported}
        <div class="field">
          <span class="field-label">Speed · {rate.toFixed(2)}×</span>
          <input
            class="range"
            type="range"
            min="0.5"
            max="1.5"
            step="0.05"
            value={rate}
            oninput={(e) => app.setVoiceRate(Number((e.target as HTMLInputElement).value))}
          />
        </div>
      {/if}

      <label class="toggle-row">
        <span class="toggle-text">
          <span class="field-label">Category shapes</span>
          <span class="toggle-hint">A shape per word type, so color isn’t the only cue.</span>
        </span>
        <input
          type="checkbox"
          class="switch"
          checked={app.categoryShapes}
          onchange={(e) => app.setShowShapes((e.target as HTMLInputElement).checked)}
        />
      </label>

      <label class="toggle-row">
        <span class="toggle-text">
          <span class="field-label">Show every word</span>
          <span class="toggle-hint">
            {#if app.profileHiddenCount > 0}
              Temporarily un-hides {app.profileHiddenCount} hidden word{app.profileHiddenCount === 1 ? '' : 's'}.
              Turns itself off when you lock or reload.
            {:else}
              Nothing is hidden yet. Tap ✏️ Edit, then the 👁 on a tile to hide a word until they're ready for it.
            {/if}
          </span>
        </span>
        <input
          type="checkbox"
          class="switch"
          checked={app.revealAll}
          disabled={app.profileHiddenCount === 0}
          onchange={(e) => app.setRevealAll((e.target as HTMLInputElement).checked)}
        />
      </label>

      <label class="toggle-row">
        <span class="toggle-text">
          <span class="field-label">Record how it’s used</span>
          <span class="toggle-hint">
            Keeps a private note of the words tapped, on this tablet only. Nothing is ever sent anywhere.
            Off by default.
          </span>
        </span>
        <input
          type="checkbox"
          class="switch"
          checked={app.logging}
          onchange={(e) => app.setLogging((e.target as HTMLInputElement).checked)}
        />
      </label>

      {#if app.logging}
        <div class="field">
          <button type="button" class="voice-open" onclick={() => app.openReport()}>
            <span class="voice-open-name">See the report</span>
            <span class="voice-open-cta">Open ▸</span>
          </button>
        </div>
      {/if}

      <div class="field">
        <span class="field-label">Caregiver lock</span>
        {#if app.lockEnabled}
          <p class="picker-note">
            Editing, settings, and profiles ask for your PIN. Tap 🔓 in the top bar to lock now.
          </p>
          <div class="lock-actions">
            <button class="ghost-dark small" onclick={() => app.openPinSetup()}>Change PIN</button>
            <button class="ghost-dark small" onclick={removeLock}>Remove lock</button>
          </div>
        {:else}
          <p class="picker-note">Set a 4-digit PIN so only grown-ups can edit boards or change settings.</p>
          <div class="lock-actions">
            <button class="ghost-dark small" onclick={() => app.openPinSetup()}>Set PIN</button>
          </div>
        {/if}
      </div>

      {#if fsSupported}
        <div class="field">
          <span class="field-label">Display</span>
          <div class="lock-actions">
            <button class="ghost-dark small" onclick={toggleFullscreen}>
              {isFullscreen ? '⛶ Exit fullscreen' : '⛶ Go fullscreen'}
            </button>
          </div>
          <p class="picker-note">Hides the browser bars for a cleaner talking screen.</p>
        </div>
      {/if}

      <div class="field">
        <span class="field-label">Backups</span>
        {#if backups.length === 0}
          <p class="picker-note">No backups yet. One is saved automatically and before big changes.</p>
        {:else}
          <div class="backup-list">
            {#each backups as b (b.id)}
              <div class="backup-row">
                <div class="backup-info">
                  <span class="backup-label">{b.label}</span>
                  <span class="backup-meta">
                    {fmtTime(b.ts)} · {b.profiles} profile{b.profiles === 1 ? '' : 's'} · {b.boards} boards
                  </span>
                </div>
                <div class="backup-actions">
                  <button class="ghost-dark small" onclick={() => restore(b.id)}>Restore</button>
                  <button class="icon-btn" aria-label="Delete backup" onclick={() => removeBackup(b.id)}>🗑️</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="modal-actions">
        <button class="ghost-dark" onclick={test}>▶ Test voice</button>
        <span class="grow"></span>
        <button class="primary" onclick={() => app.closeSettings()}>Done</button>
      </div>
    </div>
  </div>
{/if}
