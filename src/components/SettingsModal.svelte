<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { getVoices, onVoicesChanged, speak } from '../lib/speech';

  let voices = $state<SpeechSynthesisVoice[]>([]);
  let selected = $state('');

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

  function onPick() {
    app.setVoiceURI(selected || null);
  }
  function test() {
    speak('Hi! This is how I sound.', { voiceURI: app.voice.uri, rate: app.voice.rate });
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') app.closeSettings();
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
        <select class="board-sel" bind:value={selected} onchange={onPick}>
          <option value="">System default</option>
          {#each voices as v (v.voiceURI)}
            <option value={v.voiceURI}>{v.name} ({v.lang}){v.default ? ' — default' : ''}</option>
          {/each}
        </select>
        {#if voices.length === 0}
          <p class="picker-note">No installed voices detected yet — the default voice will be used.</p>
        {/if}
        <details class="voice-help">
          <summary>Want more natural voices?</summary>
          <p>{voiceHint} They’ll show up in the list above once installed — all free and on-device.</p>
        </details>
      </div>

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

      <div class="modal-actions">
        <button class="ghost-dark" onclick={test}>▶ Test voice</button>
        <span class="grow"></span>
        <button class="primary" onclick={() => app.closeSettings()}>Done</button>
      </div>
    </div>
  </div>
{/if}
