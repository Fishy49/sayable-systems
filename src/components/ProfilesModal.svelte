<script lang="ts">
  import { app } from '../lib/store.svelte';
  import type { Profile } from '../lib/types';
  import { serializeProfile, fileNameForProfile, saveTextFile, saveBinaryFile, parseProfileFile } from '../lib/transfer';
  import { profileToObz, obzFileName, obzToProfile, singleObfTextToProfile, looksLikeObf } from '../lib/obf';

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
  async function exportProfileObf(p: Profile) {
    const bytes = await profileToObz(p);
    await saveBinaryFile(obzFileName(p.name, new Date()), bytes, 'application/zip');
  }
  function pickImport() {
    importError = '';
    fileInput?.click();
  }
  // Accepts a Sayable backup (.json), a single Open Board (.obf), or an Open
  // Board set (.obz, a ZIP) — sniffed by content, not extension.
  async function onImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    importError = '';
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let res;
      if (buf[0] === 0x50 && buf[1] === 0x4b) {
        res = await obzToProfile(buf); // 'PK' magic → a ZIP → .obz
      } else {
        const text = new TextDecoder().decode(buf);
        let obj: unknown = null;
        try {
          obj = JSON.parse(text);
        } catch {
          // leave obj null; parseProfileFile will report the JSON error
        }
        res = looksLikeObf(obj) ? await singleObfTextToProfile(text) : parseProfileFile(text);
      }
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
              <button class="icon-btn" aria-label={`Back up ${p.name}`} title="Save a Sayable backup (.json)" onclick={() => exportProfile(p)}>📤</button>
              <button class="icon-btn obf-chip" aria-label={`Export ${p.name} as Open Board Format`} title="Export as Open Board Format (.obz) — for other AAC apps" onclick={() => exportProfileObf(p)}>OBF</button>
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
        <button class="ghost-dark" onclick={pickImport} title="Import a Sayable backup, .obf, or .obz">⬆️ Import</button>
        <input
          type="file"
          accept=".json,.obf,.obz,application/json,application/zip"
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
