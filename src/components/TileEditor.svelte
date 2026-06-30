<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { CATEGORIES } from '../lib/palette';
  import SymbolPicker from './SymbolPicker.svelte';
  import TileSymbol from './TileSymbol.svelte';

  const existing = $derived(app.editorTile);
  const isNew = $derived(app.editorIsNew);
  const boards = $derived(Object.values(app.boardSet.boards));

  // Local draft. Re-seeded whenever the editor opens for a (different) tile.
  let text = $state('');
  let symbol = $state('⭐');
  let bg = $state(CATEGORIES[0].color);
  let actionKind = $state<'speak' | 'goto'>('speak');
  let gotoBoardId = $state('__new__');
  let newBoardName = $state('');

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
        actionKind = 'speak';
        gotoBoardId = '__new__';
      }
      newBoardName = '';
    } else {
      text = '';
      symbol = '⭐';
      bg = CATEGORIES[0].color;
      actionKind = 'speak';
      gotoBoardId = '__new__';
      newBoardName = '';
    }
  });

  function save() {
    app.commitTile({ text, symbol, bg, actionKind, gotoBoardId, newBoardName });
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

      <div class="preview-tile" class:folder={actionKind === 'goto'} style="--bg:{bg};">
        {#if actionKind === 'goto'}<span class="folder-tab" aria-hidden="true"></span>{/if}
        <TileSymbol symbol={symbol || '⭐'} cls="tile-sym" />
        <span class="tile-label">{text || '…'}</span>
      </div>

      <label class="field">
        <span class="field-label">Words</span>
        <input class="text-in" bind:value={text} placeholder="e.g. more please" />
      </label>

      <div class="field">
        <span class="field-label">Picture</span>
        <SymbolPicker value={symbol} suggest={text} onchange={(s) => (symbol = s)} />
      </div>

      <div class="field">
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

      <div class="field">
        <span class="field-label">When tapped</span>
        <div class="seg">
          <button type="button" class:sel={actionKind === 'speak'} onclick={() => (actionKind = 'speak')}>
            🔊 Say the words
          </button>
          <button type="button" class:sel={actionKind === 'goto'} onclick={() => (actionKind = 'goto')}>
            📂 Open a board
          </button>
        </div>
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
