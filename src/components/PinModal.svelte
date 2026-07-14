<script lang="ts">
  // The caregiver-lock PIN pad. Two jobs, same keypad: unlock a gated action
  // (app.pinPromptOpen) or set/change the PIN via enter-then-confirm
  // (app.pinSetupOpen).
  import { app } from '../lib/store.svelte';

  let digits = $state('');
  let firstPin = $state<string | null>(null); // setup: first entry awaiting its confirmation
  let error = $state('');

  const isSetup = $derived(app.pinSetupOpen);
  const open = $derived(app.pinPromptOpen || app.pinSetupOpen);
  const title = $derived(
    !isSetup ? 'Enter caregiver PIN' : firstPin === null ? 'Choose a 4-digit PIN' : 'Enter it again to confirm',
  );

  // Start every open (and finished flow) from a blank pad.
  $effect(() => {
    if (!open) {
      digits = '';
      firstPin = null;
      error = '';
    }
  });

  async function press(d: string) {
    if (digits.length >= 4) return;
    error = '';
    digits += d;
    if (digits.length < 4) return;
    const pin = digits;
    if (isSetup) {
      if (firstPin === null) {
        firstPin = pin;
        digits = '';
      } else if (firstPin === pin) {
        await app.setPin(pin);
      } else {
        error = 'PINs didn’t match — start again.';
        firstPin = null;
        digits = '';
      }
    } else if (!(await app.tryUnlock(pin))) {
      error = 'Wrong PIN — try again.';
      digits = '';
    }
  }

  function back() {
    digits = digits.slice(0, -1);
    error = '';
  }

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') app.cancelPin();
    else if (e.key === 'Backspace') back();
    else if (/^[0-9]$/.test(e.key)) void press(e.key);
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div class="modal-backdrop" onclick={() => app.cancelPin()} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="modal pin-modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label="Caregiver PIN"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="modal-head">🔒 {title}</div>
      <div class="pin-dots" aria-label="{digits.length} of 4 digits entered">
        {#each [0, 1, 2, 3] as i (i)}
          <span class="pin-dot" class:filled={i < digits.length}></span>
        {/each}
      </div>
      {#if error}<p class="pin-error" role="alert">{error}</p>{/if}
      <div class="pin-pad">
        {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as d (d)}
          <button class="pin-key" onclick={() => press(d)}>{d}</button>
        {/each}
        <button class="pin-key ghosted" onclick={() => app.cancelPin()}>Cancel</button>
        <button class="pin-key" onclick={() => press('0')}>0</button>
        <button class="pin-key ghosted" aria-label="Delete digit" onclick={back}>⌫</button>
      </div>
    </div>
  </div>
{/if}
