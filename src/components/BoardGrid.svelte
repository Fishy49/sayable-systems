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
    dragIndex = i;
    movedFar = false;
    startX = e.clientX;
    startY = e.clientY;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }

  function onPointerMove(e: PointerEvent) {
    if (dragIndex === null) return;
    if (!movedFar && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) movedFar = true;
    if (!movedFar) return;
    const over = indexAt(e.clientX, e.clientY);
    if (over !== null && over !== dragIndex && over < board.tiles.length) {
      app.moveTile(dragIndex, over);
      dragIndex = over;
    }
  }

  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
    const idx = dragIndex;
    const wasTap = !movedFar;
    dragIndex = null;
    if (wasTap && idx !== null) {
      app.openEditor(idx); // a tap in edit mode opens the tile editor
    } else if (idx !== null) {
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
    <TileButton {tile} index={i} {editing} dragging={dragIndex === i} />
  {/each}

  {#if editing}
    <button class="tile add-tile" onclick={() => app.openEditor(null)} aria-label="Add a new tile">
      <span class="tile-sym" aria-hidden="true">＋</span>
      <span class="tile-label">Add tile</span>
    </button>
  {/if}
</div>
