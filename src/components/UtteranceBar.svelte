<script lang="ts">
  import { app } from '../lib/store.svelte';
  import TileSymbol from './TileSymbol.svelte';

  // The keyboard row owns focus while it is open, so the first thing a typist
  // sees after tapping the key is a live caret, not another tap to make.
  let field = $state<HTMLInputElement | null>(null);
  $effect(() => {
    if (app.typing) field?.focus();
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      app.commitDraft();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      app.setTyping(false);
    }
  }
</script>

<section class="utterance">
  <div class="bar-row">
    <button class="strip" onclick={() => app.speakAll()} aria-label="Speak the whole sentence">
      {#if app.utterance.length === 0}
        <span class="placeholder">
          {app.canType ? 'Tap pictures or type to talk…' : 'Tap pictures to talk…'}
        </span>
      {:else}
        {#each app.utterance as word (word.id)}
          <!-- No line breaks inside the chip: it is a flex box, and stray
               whitespace would render as a gap before the word. -->
          <span class="chip">{#if word.symbol}<TileSymbol symbol={word.symbol} cls="chip-sym" />{/if}{word.text}</span>
        {/each}
      {/if}
    </button>

    <div class="bar-actions">
      {#if app.canType}
        <button
          class="bar-btn type"
          class:on={app.typing}
          onclick={() => app.toggleTyping()}
          aria-label={app.typing ? 'Hide the keyboard' : 'Type a word'}
          aria-pressed={app.typing}
        >
          ⌨
        </button>
      {/if}
      <button class="bar-btn speak" onclick={() => app.speakAll()} aria-label="Speak">▶</button>
      <button class="bar-btn" onclick={() => app.backspace()} aria-label="Delete last word">⌫</button>
      <button class="bar-btn" onclick={() => app.clear()} aria-label="Clear the sentence">✕</button>
    </div>
  </div>

  {#if app.typing}
    <div class="type-row">
      <input
        class="type-field"
        bind:this={field}
        type="text"
        value={app.draft}
        oninput={(e) => app.setDraft((e.target as HTMLInputElement).value)}
        onkeydown={onKey}
        placeholder="Type a word, then press ⏎"
        aria-label="Type a word to add to the sentence"
        autocapitalize="none"
        autocomplete="off"
        enterkeyhint="send"
      />
      <button
        class="bar-btn speak"
        onclick={() => app.commitDraft()}
        disabled={app.draft.trim() === ''}
        aria-label="Add the typed word to the sentence and say it"
      >
        ⏎
      </button>
    </div>
  {/if}
</section>
