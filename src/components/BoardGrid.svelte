<script lang="ts">
  import { app } from '../lib/store.svelte';
  import TileButton from './TileButton.svelte';

  const board = $derived(app.board);
  const editing = $derived(app.editMode);
  const cols = $derived(board.cols);
  // Rows grow to fit the tiles (plus one slot for the "add" cell while editing).
  const slots = $derived(board.tiles.length + (editing ? 1 : 0));
  const rows = $derived(Math.max(board.rows, Math.ceil(slots / Math.max(1, cols))));

  // ----- pointer-based drag-to-reorder + tap-to-edit -----
  let dragIndex = $state<number | null>(null);
  let movedFar = false;
  let startX = 0;
  let startY = 0;

  // A floating copy of the tile that tracks the finger. The reorder itself is
  // live (tiles swap as you pass over them), so without this there is nothing
  // in your hand and the tile just teleports from cell to cell.
  let ghost = $state<{ w: number; h: number; x: number; y: number } | null>(null);
  // Where inside the tile the finger landed, so the ghost doesn't jump on lift.
  let grabDX = 0;
  let grabDY = 0;
  let grabW = 0;
  let grabH = 0;

  function indexAt(x: number, y: number): number | null {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-index]') as
      | HTMLElement
      | null;
    if (!el) return null;
    const i = Number(el.dataset.index);
    return Number.isNaN(i) ? null : i;
  }

  function onPointerDown(e: PointerEvent) {
    if (!editing || dragIndex !== null) return;
    const el = (e.target as HTMLElement).closest('[data-index]') as HTMLElement | null;
    if (!el) return; // tapped the "add" cell or empty space
    const i = Number(el.dataset.index);
    if (Number.isNaN(i)) return;
    // The eye badge masks/unmasks in place. It lives inside the tile button, so
    // the grid claims it here rather than nesting a second button in a button.
    if ((e.target as HTMLElement).closest('.tile-eye')) {
      app.toggleTileHidden(i);
      return; // no drag, no editor
    }
    dragIndex = i;
    movedFar = false;
    startX = e.clientX;
    startY = e.clientY;
    const r = el.getBoundingClientRect();
    grabDX = e.clientX - r.left;
    grabDY = e.clientY - r.top;
    grabW = r.width;
    grabH = r.height;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  }

  function onPointerMove(e: PointerEvent) {
    if (dragIndex === null) return;
    if (!movedFar && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) movedFar = true;
    if (!movedFar) return; // a tap should never flash a ghost
    ghost = { w: grabW, h: grabH, x: e.clientX - grabDX, y: e.clientY - grabDY };
    const over = indexAt(e.clientX, e.clientY);
    if (over !== null && over !== dragIndex && over < board.tiles.length) {
      app.moveTile(dragIndex, over);
      dragIndex = over;
    }
  }

  function onPointerUp() {
    endDrag(true);
  }

  // Fires when the browser steals the gesture (scroll takeover, a call coming
  // in). Tear down the same way, minus the tap, so no ghost is left stranded.
  function onPointerCancel() {
    endDrag(false);
  }

  function endDrag(allowTap: boolean) {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    const idx = dragIndex;
    const wasTap = !movedFar;
    dragIndex = null;
    ghost = null;
    if (idx === null) return;
    if (wasTap) {
      if (allowTap) app.openEditor(idx); // a tap in edit mode opens the tile editor
    } else {
      app.persist(); // a reorder finished
    }
  }
</script>

<div
  class="grid"
  class:editing
  style="--rows:{rows}; --cols:{cols};"
  role="group"
  aria-label={board.name}
  onpointerdown={onPointerDown}
>
  {#each board.tiles as tile, i (tile.id)}
    {#if !editing && !app.tileShown(tile)}
      <!-- A masked word still owns its cell, so the words around it never move. -->
      <div class="tile-slot" aria-hidden="true"></div>
    {:else}
      <TileButton {tile} index={i} {editing} dragging={dragIndex === i} />
    {/if}
  {/each}

  {#if editing}
    <button class="tile add-tile" onclick={() => app.openEditor(null)} aria-label="Add a new tile">
      <span class="tile-sym" aria-hidden="true">＋</span>
      <span class="tile-label">Add tile</span>
    </button>
  {/if}
</div>

{#if ghost && dragIndex !== null && board.tiles[dragIndex]}
  {@const held = board.tiles[dragIndex]}
  <div
    class="tile-ghost"
    style="width:{ghost.w}px; height:{ghost.h}px; transform: translate3d({ghost.x}px, {ghost.y}px, 0) scale(1.04);"
    aria-hidden="true"
  >
    <TileButton tile={held} index={-1} editing={true} />
  </div>
{/if}
