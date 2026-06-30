<script lang="ts">
  import { app } from '../lib/store.svelte';
  import TileSymbol from './TileSymbol.svelte';
</script>

<section class="utterance">
  <button class="strip" onclick={() => app.speakAll()} aria-label="Speak the whole sentence">
    {#if app.utterance.length === 0}
      <span class="placeholder">Tap pictures to talk…</span>
    {:else}
      {#each app.utterance as word (word.id)}
        <span class="chip"><TileSymbol symbol={word.symbol} cls="chip-sym" />{word.text}</span>
      {/each}
    {/if}
  </button>

  <div class="bar-actions">
    <button class="bar-btn speak" onclick={() => app.speakAll()} aria-label="Speak">▶</button>
    <button class="bar-btn" onclick={() => app.backspace()} aria-label="Delete last word">⌫</button>
    <button class="bar-btn" onclick={() => app.clear()} aria-label="Clear the sentence">✕</button>
  </div>
</section>
