<script lang="ts">
  import type { Tile } from '../lib/types';
  import { app } from '../lib/store.svelte';
  import TileSymbol from './TileSymbol.svelte';
  import CategoryBadge from './CategoryBadge.svelte';

  let {
    tile,
    index,
    editing = false,
    dragging = false,
  }: {
    tile: Tile;
    index: number;
    editing?: boolean;
    dragging?: boolean;
  } = $props();

  const isFolder = $derived(tile.action.kind === 'goto');
  // An authored gap. Like a masked tile, it only ever renders in edit mode -
  // the communicator sees the same plain empty slot either way.
  const isBlank = $derived(tile.action.kind === 'blank');
  // Masked tiles vanish for the communicator (the grid renders an empty slot
  // instead), so the only place this renders is edit mode: dimmed, still here.
  const masked = $derived(!!tile.hidden);

  function onClick() {
    // In edit mode, taps/drags are handled by the grid's pointer logic.
    if (editing) return;
    app.tap(tile);
  }
</script>

<button
  class="tile"
  class:folder={isFolder}
  class:blank={isBlank}
  class:editing
  class:dragging
  class:masked={masked && editing}
  style="--bg:{isBlank ? 'transparent' : tile.bg};"
  data-index={index}
  onclick={onClick}
  aria-label={isBlank ? 'Empty space' : `${isFolder ? `Open ${tile.text}` : tile.text}${masked ? ', hidden' : ''}`}
>
  {#if isFolder}<span class="folder-tab" aria-hidden="true"></span>{/if}
  {#if editing}
    <span class="edit-grip" aria-hidden="true">⠿</span>
    <!-- Masking a gap is meaningless: there is no word here to bring back. -->
    {#if !isBlank}<span class="tile-eye" class:off={masked} aria-hidden="true">👁</span>{/if}
  {/if}
  {#if isBlank}
    <span class="tile-label blank-label">{editing ? 'empty' : ''}</span>
  {:else}
    {#if app.categoryShapes}<CategoryBadge color={tile.bg} />{/if}
    <TileSymbol symbol={tile.symbol} cls="tile-sym" />
    <span class="tile-label">{tile.text}</span>
  {/if}
</button>
