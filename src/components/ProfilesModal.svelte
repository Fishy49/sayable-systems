<script lang="ts">
  import { app } from '../lib/store.svelte';
  import type { Profile } from '../lib/types';
  import { serializeProfile, fileNameForProfile, saveTextFile, parseProfileFile } from '../lib/transfer';

  let adding = $state(false);
  let newName = $state('');
  let renamingId = $state<string | null>(null);
  let renameText = $state('');
  let importError = $state('');
  let fileInput = $state<HTMLInputElement | null>(null);

  function focusField(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function startAdd() {
    adding = true;
    newName = '';
  }
  function createProfile() {
    const name = newName.trim();
    if (!name) return;
    const id = app.addProfile(name);
    adding = false;
    newName = '';
    app.switchProfile(id); // jump straight into the new profile (also closes the modal)
  }

  function startRename(id: string, current: string) {
    renamingId = id;
    renameText = current;
  }
  function commitRename(id: string) {
    if (renamingId !== id) return;
    app.renameProfile(id, renameText);
    renamingId = null;
  }

  function boardCount(p: { boards: Record<string, unknown> }): number {
    return Object.keys(p.boards).length;
  }

  async function exportProfile(p: Profile) {
    const now = new Date();
    await saveTextFile(fileNameForProfile(p.name, now), serializeProfile(p, now.toISOString()));
  }
  function pickImport() {
    importError = '';
    fileInput?.click();
  }
  async function onImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const res = parseProfileFile(await file.text());
      if (!res.ok || !res.profile) {
        importError = res.error ?? 'Could not import that file.';
        return;
      }
      app.importProfile(res.profile); // adds, switches, closes the modal
    } catch {
      importError = 'Could not read that file.';
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') app.closeProfiles();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if app.profilesOpen}
  <div class="modal-backdrop" onclick={() => app.closeProfiles()} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="modal profiles-modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label="Profiles"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="modal-head">Profiles</div>

      <div class="profile-grid">
        {#each app.profiles as p (p.id)}
          <div class="pcard" class:active={p.id === app.activeProfile.id}>
            {#if p.id === app.activeProfile.id}<span class="pcard-check" aria-hidden="true">✓</span>{/if}

            {#if renamingId === p.id}
              <input
                class="text-in pcard-rename"
                bind:value={renameText}
                use:focusField
                onkeydown={(e) => {
                  if (e.key === 'Enter') commitRename(p.id);
                }}
                onblur={() => commitRename(p.id)}
              />
            {:else}
              <button class="pcard-main" onclick={() => app.switchProfile(p.id)}>
                <span class="pcard-name">{p.name}</span>
                <span class="pcard-meta">{boardCount(p)} boards</span>
              </button>
            {/if}

            <div class="pcard-tools">
              <button class="icon-btn" aria-label={`Export ${p.name}`} onclick={() => exportProfile(p)}>📤</button>
              <button class="icon-btn" aria-label={`Rename ${p.name}`} onclick={() => startRename(p.id, p.name)}>✏️</button>
              {#if app.profiles.length > 1}
                <button class="icon-btn" aria-label={`Delete ${p.name}`} onclick={() => app.deleteProfile(p.id)}>🗑️</button>
              {/if}
            </div>
          </div>
        {/each}

        {#if adding}
          <div class="pcard adding">
            <input
              class="text-in"
              placeholder="Profile name"
              bind:value={newName}
              use:focusField
              onkeydown={(e) => {
                if (e.key === 'Enter') createProfile();
              }}
            />
            <div class="adding-actions">
              <button class="ghost-dark" onclick={() => (adding = false)}>Cancel</button>
              <button class="primary" onclick={createProfile}>Create</button>
            </div>
          </div>
        {:else}
          <button class="pcard pcard-add" onclick={startAdd}>
            <span class="pcard-add-plus" aria-hidden="true">＋</span>
            <span>New profile</span>
          </button>
        {/if}
      </div>

      {#if importError}<p class="picker-note import-error">{importError}</p>{/if}

      <div class="modal-actions">
        <button class="ghost-dark" onclick={pickImport}>⬆️ Import</button>
        <input
          type="file"
          accept="application/json,.json"
          bind:this={fileInput}
          onchange={onImportFile}
          hidden
        />
        <span class="grow"></span>
        <button class="ghost-dark" onclick={() => app.closeProfiles()}>Close</button>
      </div>
    </div>
  </div>
{/if}
