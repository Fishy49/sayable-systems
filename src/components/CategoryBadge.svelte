<script lang="ts">
  import { categoryForColor } from '../lib/palette';

  let { color }: { color: string } = $props();

  const cat = $derived(categoryForColor(color));
</script>

{#if cat}
  <span class="cat-badge" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="12" height="12">
      {#if cat.shape === 'circle'}
        <circle cx="12" cy="12" r="8" />
      {:else if cat.shape === 'triangle'}
        <polygon points="12,3 21,20 3,20" />
      {:else if cat.shape === 'diamond'}
        <polygon points="12,2 22,12 12,22 2,12" />
      {:else if cat.shape === 'square'}
        <rect x="4" y="4" width="16" height="16" rx="2" />
      {:else if cat.shape === 'heart'}
        <path d="M12 20.5C6 16.5 3 12.9 3 9.3 3 6.9 4.9 5 7.3 5c1.5 0 2.9.8 3.7 2 .8-1.2 2.2-2 3.7-2C20.1 5 22 6.9 22 9.3c0 3.6-3 7.2-9 11.2z" />
      {:else if cat.shape === 'folder'}
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      {/if}
    </svg>
  </span>
{/if}
