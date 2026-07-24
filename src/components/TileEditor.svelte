<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { CATEGORIES } from '../lib/palette';
  import { speak } from '../lib/speech';
  import { starterSymbol } from '../lib/symbolSet';
  import SymbolPicker from './SymbolPicker.svelte';
  import TileSymbol from './TileSymbol.svelte';

  const existing = $derived(app.editorTile);
  const isNew = $derived(app.editorIsNew);
  const boards = $derived(Object.values(app.activeProfile.boards));

  // Local draft. Re-seeded whenever the editor opens for a (different) tile.
  let text = $state('');
  let symbol = $state('');
  let bg = $state(CATEGORIES[0].color);
  // Tracks the picture we last auto-filled from the typed word, so we can keep
  // suggesting as they type but back off the moment they hand-pick a symbol.
  let autoSym = '';
  let actionKind = $state<'speak' | 'goto' | 'blank'>('speak');
  const isBlank = $derived(actionKind === 'blank');
  let gotoBoardId = $state('__new__');
  let newBoardName = $state('');
  let spoken = $state('');
  let advOpen = $state(false);
  let hidden = $state(false);

  let lastKey = '';
  $effect(() => {
    const key = (app.editorOpen ? 'open' : 'closed') + ':' + (existing?.id ?? 'new');
    if (key === lastKey) return;
    lastKey = key;
    if (!app.editorOpen) return;
    if (existing) {
      text = existing.text;
      symbol = existing.symbol;
      bg = existing.bg;
      if (existing.action.kind === 'goto') {
        actionKind = 'goto';
        gotoBoardId = existing.action.boardId;
      } else {
        actionKind = existing.action.kind === 'blank' ? 'blank' : 'speak';
        gotoBoardId = '__new__';
      }
      newBoardName = '';
      spoken = existing.spoken ?? '';
      advOpen = !!existing.spoken?.trim(); // auto-reveal if this tile already has an override
      hidden = !!existing.hidden;
    } else {
      text = '';
      symbol = '';
      autoSym = '';
      bg = CATEGORIES[0].color;
      actionKind = 'speak';
      gotoBoardId = '__new__';
      newBoardName = '';
      spoken = '';
      advOpen = false;
      hidden = false; // a brand-new word starts visible
    }
  });

  // New tiles default to a symbol: as the caregiver types the word, fill in the
  // matching ARASAAC pictogram if we ship one. We only steer the picture while
  // it's still our suggestion — a hand-picked symbol (or an edit) wins.
  $effect(() => {
    if (!app.editorOpen || !isNew || isBlank) return;
    if (symbol && symbol !== autoSym) return; // user chose their own — leave it
    const s = starterSymbol(text) ?? '';
    if (s !== symbol) {
      symbol = s;
      autoSym = s;
    }
  });

  function save() {
    app.commitTile({ text, symbol, bg, actionKind, gotoBoardId, newBoardName, spoken, hidden });
  }

  function previewSpoken() {
    const phrase = spoken.trim() || text.trim();
    if (phrase) speak(phrase, { voiceURI: app.voice.uri, rate: app.voice.rate });
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') app.closeEditor();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if app.editorOpen}
  <div class="modal-backdrop" onclick={() => app.closeEditor()} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label={isNew ? 'New tile' : 'Edit tile'}
      onclick={(e) => e.stopPropagation()}
    >
      <div class="modal-head">{isNew ? 'New tile' : 'Edit tile'}</div>

      <div class="modal-body">
        <div class="field-preview">
          <div
            class="preview-tile"
            class:folder={actionKind === 'goto'}
            class:blank={isBlank}
            class:masked={hidden && !isBlank}
            style="--bg:{isBlank ? 'transparent' : bg};"
          >
            {#if actionKind === 'goto'}<span class="folder-tab" aria-hidden="true"></span>{/if}
            {#if isBlank}
              <span class="tile-label blank-label">empty</span>
            {:else}
              <TileSymbol symbol={symbol || '⭐'} cls="tile-sym" />
              <span class="tile-label">{text || '…'}</span>
            {/if}
          </div>
        </div>

        {#if !isBlank}
          <label class="field field-words">
            <span class="field-label">Words</span>
            <input class="text-in" bind:value={text} placeholder="e.g. more please" />
          </label>

          <div class="field field-picture">
            <span class="field-label">Picture</span>
            <SymbolPicker
              value={symbol}
              suggest={text}
              defaultTab={isNew ? 'search' : undefined}
              onchange={(s) => (symbol = s)}
            />
          </div>

          <div class="field field-color">
            <span class="field-label">Color</span>
            <div class="swatches">
              {#each CATEGORIES as c}
                <button
                  type="button"
                  class="swatch"
                  class:sel={bg === c.color}
                  style="--sw:{c.color}"
                  onclick={() => (bg = c.color)}
                >
                  {c.label}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <div class="field field-when">
          <span class="field-label">When tapped</span>
          <div class="seg">
            <button type="button" class:sel={actionKind === 'speak'} onclick={() => (actionKind = 'speak')}>
              🔊 Say the words
            </button>
            <button type="button" class:sel={actionKind === 'goto'} onclick={() => (actionKind = 'goto')}>
              📂 Open a board
            </button>
            <button type="button" class:sel={isBlank} onclick={() => (actionKind = 'blank')}>
              ▫️ Nothing
            </button>
          </div>
          {#if isBlank}
            <span class="field-hint">
              An empty space that holds its spot on the board. Use one to leave a gap between groups of
              words, or to save a place for a word you haven't added yet.
            </span>
          {/if}
          {#if actionKind === 'goto'}
            <select class="board-sel" bind:value={gotoBoardId}>
              <option value="__new__">➕ New board…</option>
              {#each boards as b}
                <option value={b.id}>{b.name}</option>
              {/each}
            </select>
            {#if gotoBoardId === '__new__'}
              <input class="text-in" bind:value={newBoardName} placeholder="New board name (optional)" />
            {/if}
          {/if}
        </div>

        {#if !isBlank}
          <label class="toggle-row">
            <span class="toggle-text">
              <span class="field-label">Hide this word for now</span>
              <span class="toggle-hint">
                It keeps its exact spot on the board, but shows as an empty space until you bring it back.
              </span>
            </span>
            <input type="checkbox" class="switch" bind:checked={hidden} />
          </label>
        {/if}

        {#if actionKind === 'speak'}
          <div class="field field-advanced">
            <button
              type="button"
              class="adv-toggle"
              aria-expanded={advOpen}
              onclick={() => (advOpen = !advOpen)}
            >
              <span class="adv-caret" class:open={advOpen} aria-hidden="true">▸</span>
              Advanced
              {#if !advOpen && spoken.trim()}<span class="adv-dot" aria-hidden="true"></span>{/if}
            </button>

            {#if advOpen}
              <div class="adv-body">
                <span class="field-label">Spoken words</span>
                <div class="spoken-row">
                  <input class="text-in" bind:value={spoken} placeholder={text.trim() || 'Same as the words above'} />
                  <button type="button" class="icon-btn preview-btn" aria-label="Hear it" onclick={previewSpoken}>🔊</button>
                </div>
                <span class="field-hint">
                  What the tile actually says. Leave blank to speak the words shown on the tile.
                </span>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="modal-actions">
        {#if !isNew}
          <button class="danger" onclick={() => app.removeEditingTile()}>Delete</button>
        {/if}
        <span class="grow"></span>
        <button class="ghost-dark" onclick={() => app.closeEditor()}>Cancel</button>
        <button class="primary" onclick={save}>Save</button>
      </div>
    </div>
  </div>
{/if}
