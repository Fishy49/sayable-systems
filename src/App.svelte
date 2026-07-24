<script lang="ts">
  import { app } from './lib/store.svelte';
  import { speechSupported } from './lib/speech';
  import UtteranceBar from './components/UtteranceBar.svelte';
  import BoardGrid from './components/BoardGrid.svelte';
  import TileEditor from './components/TileEditor.svelte';
  import ProfilesModal from './components/ProfilesModal.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import VoicePicker from './components/VoicePicker.svelte';
  import PinModal from './components/PinModal.svelte';
  import { pwa } from './lib/pwa.svelte';

  const noSpeech = !speechSupported();
  // Base-aware so the icon resolves under a sub-path deploy (e.g. /app/), not
  // just at the site root. import.meta.env.BASE_URL ends with a slash.
  const iconUrl = `${import.meta.env.BASE_URL}icon.svg`;

  // Lock body scroll while any modal is open. On mobile browser tabs this keeps
  // the page from scrolling behind the modal and stops Chrome's address bar from
  // showing/hiding mid-interaction — which desyncs fixed-position hit-testing and
  // can leave top-bar buttons unresponsive until an unrelated tap forces a reflow.
  $effect(() => {
    const anyModal =
      app.settingsOpen || app.profilesOpen || app.editorOpen || app.pinPromptOpen || app.pinSetupOpen;
    document.documentElement.classList.toggle('modal-open', anyModal);
  });

  function confirmReset() {
    if (confirm('Reset all boards back to the starter set? This erases your changes.')) {
      app.resetToDefaults();
    }
  }
</script>

{#if !app.ready}
  <div class="splash">
    <img src={iconUrl} alt="" width="72" height="72" />
    <span>Sayable</span>
  </div>
{:else}
  <div class="app" class:edit-mode={app.editMode}>
    <header class="topbar">
      <div class="brand">
        <img class="logo" src={iconUrl} alt="" width="26" height="26" />
        <span>Sayable</span>
      </div>
      <div class="crumb">{app.board.name}</div>
      <div class="top-actions">
        {#if app.revealAll}
          <!-- Turning masking back ON is the safe direction, so this needs no PIN. -->
          <button
            class="ghost reveal-chip"
            onclick={() => app.setRevealAll(false)}
            aria-label="Stop showing every word"
          >
            👁 All words
          </button>
        {/if}
        {#if app.lockEnabled && !app.locked}
          <button class="ghost icon-only" onclick={() => app.relock()} aria-label="Lock caregiver controls">🔓</button>
        {/if}
        <button class="ghost profile-chip" onclick={() => app.openProfiles()} aria-label="Switch profile">
          <span aria-hidden="true">👤</span>
          <span class="pchip-name">{app.activeProfile.name}</span>
        </button>
        <button class="ghost icon-only" onclick={() => app.openSettings()} aria-label="Settings">⚙️</button>
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

    {#if pwa.updateReady}
      <p class="update-notice">
        ✨ A new version of Sayable is ready.
        <button class="link-btn" onclick={() => pwa.applyUpdate()}>Reload</button>
      </p>
    {/if}
    {#if app.recoveryNotice}
      <p class="recovery-notice">
        ℹ️ {app.recoveryNotice}
        <button class="link-btn" onclick={() => app.dismissRecovery()}>Dismiss</button>
      </p>
    {/if}
    {#if app.saveError}
      <p class="save-error">⚠️ Couldn’t save your last change. Open ⚙️ and export a backup so nothing is lost.</p>
    {/if}
    {#if app.storageWarning}
      <p class="warn">{app.storageWarning}</p>
    {/if}
    {#if noSpeech}
      <p class="warn">This browser can’t speak out loud, but words will still appear in the bar.</p>
    {/if}

    {#if app.editMode}
      <div class="edit-hint">
        <span class="edit-hint-text">
          Editing - tap a tile to change it, drag to reorder, tap 👁 to hide a word, or tap ＋ to add.
        </span>
        <span class="mask-tools">
          <span class="mask-count">{app.boardHiddenCount} hidden here</span>
          <button class="link-btn" onclick={() => app.setBoardHidden(true)}>Hide all</button>
          <button class="link-btn" onclick={() => app.setBoardHidden(false)}>Show all</button>
        </span>
      </div>
    {:else}
      <UtteranceBar />
    {/if}

    <main class="board-area">
      <BoardGrid />
    </main>
  </div>

  <TileEditor />
  <ProfilesModal />
  <SettingsModal />
  <VoicePicker />
  <PinModal />
{/if}
