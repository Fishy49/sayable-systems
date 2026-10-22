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

  // The strip itself speaks the whole sentence, so a tap that lands on a word
  // must not also set the whole thing off.
  function tapWord(e: MouseEvent, id: string) {
    e.stopPropagation();
    app.tapWord(id);
  }
  function removeWord(e: MouseEvent, id: string) {
    e.stopPropagation();
    app.removeWord(id);
  }
</script>

<section class="utterance">
  <div class="bar-row">
    <!-- A plain div, not a button: it holds buttons now. Speaking the sentence
         from here is a convenience for a pointer; the labelled way in is the
         play button beside it. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="strip" onclick={() => app.speakAll()}>
      {#if app.utterance.length === 0}
        <span class="placeholder">
          {app.canType ? 'Tap pictures or type to talk…' : 'Tap pictures to talk…'}
        </span>
      {:else}
        {#each app.utterance as word (word.id)}
          {@const armed = app.selectedWordId === word.id}
          <span class="chip" class:armed>
            <!-- No line breaks between the picture and the word: this is a flex
                 box, and stray whitespace would render as a gap before it. -->
            <button
              class="chip-word"
              onclick={(e) => tapWord(e, word.id)}
              aria-pressed={armed}
              aria-label={armed ? `${word.text}, tap again to put the X away` : word.text}
            >{#if word.symbol}<TileSymbol symbol={word.symbol} cls="chip-sym" />{/if}{word.text}</button>
            {#if armed}
              <button
                class="chip-x"
                onclick={(e) => removeWord(e, word.id)}
                aria-label={`Remove ${word.text}`}
              >
                ×
              </button>
            {/if}
          </span>
        {/each}
      {/if}
    </div>

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
