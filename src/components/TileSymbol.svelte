<script lang="ts">
  import { isImageSymbol } from '../lib/symbols';

  let { symbol, cls = '' }: { symbol: string; cls?: string } = $props();
</script>

{#if isImageSymbol(symbol)}
  <img class={`sym-img ${cls}`} src={symbol} alt="" draggable="false" />
{:else}
  <span class={cls}>{symbol}</span>
{/if}
