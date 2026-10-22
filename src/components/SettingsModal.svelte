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
  let backup = $state<SnapshotMeta | null>(null);

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
    void refreshBackup();
  });
  async function refreshBackup() {
    backup = await app.currentBackup();
  }
  async function restore(id: number) {
    if (confirm('Go back to this saved copy? Your current boards are saved first, so you can undo it.')) {
      await app.restoreBackup(id);
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

  // Settings grew section by section until the modal was taller than the
  // screen. Tabs keep each group short enough to read without scrolling, and
  // keep Done reachable instead of parked below the fold.
  const TABS = [
    { id: 'voice', label: 'Voice' },
    { id: 'display', label: 'Display' },
    { id: 'privacy', label: 'Privacy' },
    { id: 'backup', label: 'Backup' },
  ] as const;
  type TabId = (typeof TABS)[number]['id'];

  let tab = $state<TabId>('voice');
  // Reopening lands on the common stuff, wherever you left off last time.
  $effect(() => {
    if (app.settingsOpen) tab = 'voice';
  });

  /** Arrow/Home/End move between tabs and carry focus with them, per WAI-ARIA. */
  function onTabKey(e: KeyboardEvent, i: number): void {
    const last = TABS.length - 1;
    let next: number;
    if (e.key === 'ArrowRight') next = i === last ? 0 : i + 1;
    else if (e.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else return;
    e.preventDefault();
    tab = TABS[next].id;
    const list = (e.currentTarget as HTMLElement).parentElement;
    list?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
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

      <div class="settings-tabs" role="tablist" aria-label="Settings sections">
        {#each TABS as t, i (t.id)}
          <button
            type="button"
            class="settings-tab"
            role="tab"
            id={`settings-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`settings-panel-${t.id}`}
            tabindex={tab === t.id ? 0 : -1}
            onclick={() => (tab = t.id)}
            onkeydown={(e) => onTabKey(e, i)}
          >
            {t.label}
          </button>
        {/each}
      </div>

      <div
        class="settings-panel"
        role="tabpanel"
        id={`settings-panel-${tab}`}
        aria-labelledby={`settings-tab-${tab}`}
        tabindex="0"
      >
        <div class="settings-panel-inner">
          {#if tab === 'voice'}
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
          {:else if tab === 'display'}
            <label class="toggle-row">
              <span class="toggle-text">
                <span class="field-label">Keyboard in the sentence bar</span>
                <span class="toggle-hint">
                  Adds a ⌨ to the bar for spelling out words that aren’t on a board. Turn it off
                  for a communicator who doesn’t read yet.
                </span>
              </span>
              <input
                type="checkbox"
                class="switch"
                checked={app.canType}
                onchange={(e) => app.setAllowTyping((e.target as HTMLInputElement).checked)}
              />
            </label>

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

            {#if fsSupported}
              <div class="field">
                <span class="field-label">Fullscreen</span>
                <div class="lock-actions">
                  <button class="ghost-dark small" onclick={toggleFullscreen}>
                    {isFullscreen ? '⛶ Exit fullscreen' : '⛶ Go fullscreen'}
                  </button>
                </div>
                <p class="picker-note">Hides the browser bars for a cleaner talking screen.</p>
              </div>
            {/if}
          {:else if tab === 'privacy'}
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
              <span class="field-label">Get in touch</span>
              <p class="picker-note">
                Sayable has no accounts and no tracking, so nothing about how you use it reaches anyone.
                That also means the only way we hear that something is broken, missing, or working well is
                if you tell us: <a class="mail-link" href="mailto:contact@sayable.systems"
                  >contact@sayable.systems</a
                >
              </p>
            </div>
          {:else if tab === 'backup'}
            <div class="field">
              <span class="field-label">Saved copy</span>
              {#if !backup}
                <p class="picker-note">
                  No saved copy yet. Sayable keeps one, updated as you go and again before any big change.
                </p>
              {:else}
                {@const b = backup}
                <div class="backup-list">
                  <div class="backup-row">
                    <div class="backup-info">
                      <span class="backup-label">{b.label}</span>
                      <span class="backup-meta">
                        {fmtTime(b.ts)} · {b.profiles} profile{b.profiles === 1 ? '' : 's'} · {b.boards} boards
                      </span>
                    </div>
                    <div class="backup-actions">
                      <button class="ghost-dark small" onclick={() => restore(b.id)}>Go back to this</button>
                    </div>
                  </div>
                </div>
                <p class="picker-note">
                  Sayable keeps one saved copy of your boards, updated as you go and again before any big
                  change. To keep a copy for longer, export a backup file.
                </p>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <div class="modal-actions">
        {#if tab === 'voice'}
          <button class="ghost-dark" onclick={test}>▶ Test voice</button>
        {/if}
        <span class="grow"></span>
        <button class="primary" onclick={() => app.closeSettings()}>Done</button>
      </div>
    </div>
  </div>
{/if}
