<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { getVoices, onVoicesChanged, speak, type VoiceInfo } from '../lib/speech';

  let voices = $state<VoiceInfo[]>([]);
  let selected = $state('');
  let query = $state('');
  let tab = $state<'primary' | 'more'>('primary');
  let accent = $state('all'); // 'all' or a full lang tag like "en-US"

  const primaryBase = (typeof navigator !== 'undefined' ? navigator.language : 'en')
    .split('-')[0]
    .toLowerCase();

  // Load voices while open, and keep up with their async arrival.
  $effect(() => {
    if (!app.voicePickerOpen) return;
    voices = getVoices();
    return onVoicesChanged(() => {
      voices = getVoices();
    });
  });

  // Mirror the saved voice in.
  $effect(() => {
    selected = app.voice.uri ?? '';
  });

  function safeDisplay(type: 'language' | 'region'): Intl.DisplayNames | null {
    try {
      return new Intl.DisplayNames(['en'], { type });
    } catch {
      return null;
    }
  }
  const dnLang = safeDisplay('language');
  const dnRegion = safeDisplay('region');

  const baseOf = (lang: string) => lang.split('-')[0].toLowerCase();
  const langLabel = (base: string) => dnLang?.of(base) ?? base.toUpperCase();
  function regionLabel(lang: string): string {
    const parts = lang.split('-');
    if (parts.length < 2) return '';
    return dnRegion?.of(parts[1].toUpperCase()) ?? parts[1].toUpperCase();
  }

  const primaryVoices = $derived(voices.filter((v) => baseOf(v.lang) === primaryBase));
  const otherVoices = $derived(voices.filter((v) => baseOf(v.lang) !== primaryBase));

  // Distinct accents (region variants) within the primary language, for chips.
  const accents = $derived.by(() => {
    const seen = new Set<string>();
    const out: { lang: string; label: string }[] = [];
    for (const v of primaryVoices) {
      if (seen.has(v.lang)) continue;
      seen.add(v.lang);
      out.push({ lang: v.lang, label: regionLabel(v.lang) || v.lang });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  });

  function matchesQuery(v: VoiceInfo): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    // Match the voice name, its tag, and its language name ("cantonese" should
    // find a voice named "Sinji" whose only language cue is its locale).
    return (
      v.name.toLowerCase().includes(q) ||
      v.lang.toLowerCase().includes(q) ||
      langLabel(baseOf(v.lang)).toLowerCase().includes(q)
    );
  }

  const primaryRows = $derived(
    primaryVoices.filter((v) => (accent === 'all' || v.lang === accent) && matchesQuery(v)),
  );

  const otherGroups = $derived.by(() => {
    const groups = new Map<string, VoiceInfo[]>();
    for (const v of otherVoices) {
      if (!matchesQuery(v)) continue;
      const b = baseOf(v.lang);
      const arr = groups.get(b);
      if (arr) arr.push(v);
      else groups.set(b, [v]);
    }
    return [...groups.entries()]
      .map(([base, list]) => ({ base, label: langLabel(base), list }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  const primaryTabLabel = $derived(langLabel(primaryBase));

  // Land on the tab that actually has voices.
  $effect(() => {
    if (app.voicePickerOpen && primaryVoices.length === 0 && otherVoices.length > 0) {
      tab = 'more';
    }
  });

  function preview(uri: string) {
    speak('Hi! This is how I sound.', { voiceURI: uri || undefined, rate: app.voice.rate });
  }
  function choose(uri: string) {
    selected = uri;
    app.setVoiceURI(uri || null);
    preview(uri);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') app.closeVoicePicker();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if app.voicePickerOpen}
  <div class="modal-backdrop vp-backdrop" onclick={() => app.closeVoicePicker()} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="modal voice-modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label="Choose a voice"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="modal-head">Choose a voice</div>

      <div class="vp-tabs">
        <button
          class="vp-tab"
          class:sel={tab === 'primary'}
          disabled={primaryVoices.length === 0}
          onclick={() => (tab = 'primary')}
        >
          {primaryTabLabel}
          {#if primaryVoices.length}<span class="vp-count">{primaryVoices.length}</span>{/if}
        </button>
        <button
          class="vp-tab"
          class:sel={tab === 'more'}
          disabled={otherVoices.length === 0}
          onclick={() => (tab = 'more')}
        >
          More languages
          {#if otherVoices.length}<span class="vp-count">{otherVoices.length}</span>{/if}
        </button>
      </div>

      {#if tab === 'more'}
        <input class="text-in vp-search" type="search" placeholder="Search languages…" bind:value={query} />
      {:else if accents.length > 1}
        <div class="vp-chips">
          <button class="vp-chip" class:sel={accent === 'all'} onclick={() => (accent = 'all')}>All</button>
          {#each accents as a (a.lang)}
            <button class="vp-chip" class:sel={accent === a.lang} onclick={() => (accent = a.lang)}>{a.label}</button>
          {/each}
        </div>
      {/if}

      <div class="vp-list">
        {#if tab === 'primary'}
          <button class="vp-row" class:sel={selected === ''} onclick={() => choose('')}>
            <span class="vp-play" aria-hidden="true">↺</span>
            <span class="vp-name">
              System default
              <span class="vp-sub">the device's built-in voice</span>
            </span>
            {#if selected === ''}<span class="vp-check" aria-hidden="true">✓</span>{/if}
          </button>

          {#each primaryRows as v (v.voiceURI)}
            <button class="vp-row" class:sel={selected === v.voiceURI} onclick={() => choose(v.voiceURI)}>
              <span class="vp-play" aria-hidden="true">▶</span>
              <span class="vp-name">
                {v.name}
                {#if v.default}<span class="vp-badge">default</span>{/if}
              </span>
              {#if selected === v.voiceURI}<span class="vp-check" aria-hidden="true">✓</span>{/if}
            </button>
          {/each}
          {#if primaryRows.length === 0}
            <p class="picker-note">No voices match.</p>
          {/if}
        {:else}
          {#each otherGroups as g (g.base)}
            <div class="vp-group-head">{g.label}</div>
            {#each g.list as v (v.voiceURI)}
              <button class="vp-row" class:sel={selected === v.voiceURI} onclick={() => choose(v.voiceURI)}>
                <span class="vp-play" aria-hidden="true">▶</span>
                <span class="vp-name">{v.name}</span>
                {#if selected === v.voiceURI}<span class="vp-check" aria-hidden="true">✓</span>{/if}
              </button>
            {/each}
          {/each}
          {#if otherGroups.length === 0}
            <p class="picker-note">No languages match “{query}”.</p>
          {/if}
        {/if}
      </div>

      <div class="modal-actions">
        <button class="ghost-dark" onclick={() => preview(selected)}>▶ Test</button>
        <span class="grow"></span>
        <button class="primary" onclick={() => app.closeVoicePicker()}>Done</button>
      </div>
    </div>
  </div>
{/if}
