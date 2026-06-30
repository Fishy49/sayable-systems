<script lang="ts">
  import { app } from './lib/store.svelte';
  import { speechSupported } from './lib/speech';
  import UtteranceBar from './components/UtteranceBar.svelte';
  import BoardGrid from './components/BoardGrid.svelte';
  import TileEditor from './components/TileEditor.svelte';
  import ProfilesModal from './components/ProfilesModal.svelte';

  const noSpeech = !speechSupported();

  function confirmReset() {
    if (confirm('Reset all boards back to the starter set? This erases your changes.')) {
      app.resetToDefaults();
    }
  }
</script>

<div class="app" class:edit-mode={app.editMode}>
  <header class="topbar">
    <div class="brand">
      <img class="logo" src="/icon.svg" alt="" width="26" height="26" />
      <span>Sayable</span>
    </div>
    <div class="crumb">{app.board.name}</div>
    <div class="top-actions">
      <button class="ghost profile-chip" onclick={() => app.openProfiles()} aria-label="Switch profile">
        <span aria-hidden="true">👤</span>
        <span class="pchip-name">{app.activeProfile.name}</span>
      </button>
      {#if !app.isHome}
        <button class="ghost" onclick={() => app.goHome()}>🏠 Home</button>
      {/if}
      {#if app.editMode}
        <button class="ghost subtle" onclick={confirmReset}>Reset</button>
      {/if}
      <button class="ghost toggle" class:on={app.editMode} onclick={() => app.toggleEdit()}>
        {app.editMode ? '✓ Done' : '✏️ Edit'}
      </button>
    </div>
  </header>

  {#if noSpeech}
    <p class="warn">This browser can’t speak out loud, but words will still appear in the bar.</p>
  {/if}

  {#if app.editMode}
    <p class="edit-hint">
      Editing — tap a tile to change it, drag to reorder, or tap ＋ to add. Changes save automatically.
    </p>
  {:else}
    <UtteranceBar />
  {/if}

  <main class="board-area">
    <BoardGrid />
  </main>
</div>

<TileEditor />
<ProfilesModal />
