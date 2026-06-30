<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { getVoices, onVoicesChanged, speak } from '../lib/speech';

  let voices = $state<SpeechSynthesisVoice[]>([]);
  let selected = $state('');

  // Load voices (and keep up with their async arrival) while the modal is open.
  $effect(() => {
    if (!app.voiceOpen) return;
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

  function onPick() {
    app.setVoiceURI(selected || null);
  }
  function test() {
    speak('Hi! This is how I sound.', { voiceURI: app.voice.uri, rate: app.voice.rate });
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') app.closeVoice();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if app.voiceOpen}
  <div class="modal-backdrop" onclick={() => app.closeVoice()} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="modal voice-modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label="Voice settings"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="modal-head">Voice · {app.activeProfile.name}</div>

      <div class="field">
        <span class="field-label">Voice</span>
        <select class="board-sel" bind:value={selected} onchange={onPick}>
          <option value="">System default</option>
          {#each voices as v (v.voiceURI)}
            <option value={v.voiceURI}>{v.name} ({v.lang}){v.default ? ' — default' : ''}</option>
          {/each}
        </select>
        {#if voices.length === 0}
          <p class="picker-note">
            No installed voices detected yet — your device may add them in a moment, or this browser
            may not expose them. The default voice will still be used.
          </p>
        {/if}
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

      <div class="modal-actions">
        <button class="ghost-dark" onclick={test}>▶ Test</button>
        <span class="grow"></span>
        <button class="primary" onclick={() => app.closeVoice()}>Done</button>
      </div>
    </div>
  </div>
{/if}
