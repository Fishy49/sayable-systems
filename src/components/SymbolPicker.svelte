<script lang="ts">
  import { untrack } from 'svelte';
  import { searchPictograms, toDataUrl, isImageSymbol, type Pictogram } from '../lib/symbols';
  import { QUICK_EMOJIS } from '../lib/palette';

  let {
    value,
    suggest = '',
    onchange,
  }: {
    value: string;
    suggest?: string;
    onchange: (symbol: string) => void;
  } = $props();

  // Initialise the tab + emoji field from the symbol the editor opened with.
  // Read once (untracked) so picking a symbol doesn't yank the tab back.
  const initialValue = untrack(() => value);
  let mode = $state<'emoji' | 'search'>(isImageSymbol(initialValue) ? 'search' : 'emoji');
  let emojiText = $state(isImageSymbol(initialValue) ? '' : initialValue);
  let query = $state('');
  let results = $state<Pictogram[]>([]);
  let searching = $state(false);
  let embedding = $state(false);
  let note = $state('');
  let ctrl: AbortController | null = null;

  function pickEmoji(e: string) {
    emojiText = e;
    onchange(e);
  }

  function toSearchTab() {
    mode = 'search';
    if (!results.length && !query && suggest) {
      query = suggest;
      runSearch();
    }
  }

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    ctrl?.abort();
    ctrl = new AbortController();
    searching = true;
    note = '';
    try {
      results = await searchPictograms(q, 'en', ctrl.signal);
      if (results.length === 0) note = 'No symbols found — try another word.';
    } catch (err) {
      if ((err as Error).name !== 'AbortError') note = 'Search failed — check your connection.';
    } finally {
      searching = false;
    }
  }

  async function pick(p: Pictogram) {
    onchange(p.thumb); // instant preview from the network URL
    embedding = true;
    note = '';
    try {
      onchange(await toDataUrl(p.thumb)); // embed so it works offline and persists
    } catch {
      note = 'Saved as a link (couldn’t embed for offline).';
    } finally {
      embedding = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    }
  }
</script>

<div class="picker">
  <div class="picker-tabs">
    <button type="button" class:sel={mode === 'emoji'} onclick={() => (mode = 'emoji')}>😀 Emoji</button>
    <button type="button" class:sel={mode === 'search'} onclick={toSearchTab}>🔎 Symbols</button>
  </div>

  {#if mode === 'emoji'}
    <div class="emoji-area">
      <input
        class="emoji-in"
        bind:value={emojiText}
        maxlength="6"
        placeholder="🙂"
        oninput={() => onchange(emojiText)}
        aria-label="Type or paste an emoji"
      />
      <div class="emoji-grid">
        {#each QUICK_EMOJIS as e}
          <button type="button" class="emoji-opt" class:sel={value === e} onclick={() => pickEmoji(e)}>{e}</button>
        {/each}
      </div>
    </div>
  {:else}
    <div class="search-row">
      <input class="text-in" bind:value={query} onkeydown={onKey} placeholder="Search symbols (e.g. water)" />
      <button type="button" class="primary" onclick={runSearch} disabled={searching}>
        {searching ? '…' : 'Search'}
      </button>
    </div>

    {#if embedding}
      <p class="picker-note">Embedding picture…</p>
    {:else if note}
      <p class="picker-note">{note}</p>
    {/if}

    {#if results.length}
      <div class="result-grid">
        {#each results as p (p.id)}
          <button type="button" class="result" onclick={() => pick(p)} title={p.keyword} aria-label={p.keyword}>
            <img src={p.thumb} alt={p.keyword} loading="lazy" draggable="false" />
          </button>
        {/each}
      </div>
    {/if}

    <p class="attribution">
      Symbols: <a href="https://arasaac.org" target="_blank" rel="noreferrer">ARASAAC</a> · CC BY-NC-SA · Gobierno de Aragón (Sergio Palao)
    </p>
  {/if}
</div>
