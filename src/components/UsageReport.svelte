<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { buildReport, eventsCsv, weeksCsv, RAW_WINDOW_DAYS, type Range, type UsageReport } from '../lib/usage';
  import { saveTextFile } from '../lib/transfer';

  let range = $state<Range>(30);
  let report = $state<UsageReport | null>(null);
  let busy = $state(false);
  let note = $state('');

  const RANGES: { key: Range; label: string }[] = [
    { key: 7, label: '7 days' },
    { key: 30, label: '30 days' },
    { key: 90, label: '90 days' },
    { key: 'all', label: 'All time' },
  ];

  // Sharing a file is a browser feature, not a web-platform guarantee: an
  // Android WebView typically has no navigator.share at all. Detect it rather
  // than rendering a button that silently does nothing on the tablet.
  const canShareFiles = (() => {
    try {
      if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
      const probe = new File(['a,b\n'], 'probe.csv', { type: 'text/csv' });
      return navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  })();

  $effect(() => {
    if (!app.reportOpen) return;
    const profileId = app.activeProfile.id;
    const r = range;
    void (async () => {
      report = await buildReport(profileId, r);
    })();
  });

  function fmtDate(ts: number): string {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  const maxBucket = $derived(Math.max(1, ...(report?.buckets ?? []).map((b) => b.words)));
  const topMax = $derived(Math.max(1, ...(report?.topWords ?? []).map(([, n]) => n)));

  function csvName(kind: string): string {
    const slug =
      app.activeProfile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) ||
      'profile';
    return `sayable-${slug}-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  }

  async function exportCsv(kind: 'taps' | 'weekly') {
    busy = true;
    note = '';
    try {
      const id = app.activeProfile.id;
      const text = kind === 'taps' ? await eventsCsv(id) : await weeksCsv(id);
      await saveTextFile(csvName(kind), text, 'text/csv');
      note = canShareFiles ? '' : 'Saved to this device’s Downloads.';
    } catch {
      note = 'Couldn’t save the file.';
    } finally {
      busy = false;
    }
  }

  async function clearAll() {
    if (!confirm('Delete all recorded usage? This cannot be undone.')) return;
    busy = true;
    try {
      await app.clearUsage();
      report = await buildReport(app.activeProfile.id, range);
      note = 'All recorded usage deleted.';
    } finally {
      busy = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') app.closeReport();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if app.reportOpen}
  <div class="modal-backdrop vp-backdrop" onclick={() => app.closeReport()} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="modal report-modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label="Usage report"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="modal-head">How {app.activeProfile.name} is talking</div>

      <div class="rp-tabs">
        {#each RANGES as r (r.key)}
          <button class="rp-tab" class:sel={range === r.key} onclick={() => (range = r.key)}>{r.label}</button>
        {/each}
      </div>

      {#if !report}
        <p class="picker-note">Reading the log…</p>
      {:else if !report.hasAnyData}
        <p class="picker-note">
          {#if app.logging}
            Nothing recorded in this stretch yet. Tap some words and check back.
          {:else}
            Recording is off, so there’s nothing here. Turn it on in Settings to start.
          {/if}
        </p>
      {:else}
        <div class="rp-stats">
          <div class="rp-stat">
            <span class="rp-num">{report.words.toLocaleString()}</span>
            <span class="rp-cap">words tapped</span>
          </div>
          <div class="rp-stat">
            <span class="rp-num">{report.uniqueWords.toLocaleString()}</span>
            <span class="rp-cap">different words</span>
          </div>
          <div class="rp-stat">
            <span class="rp-num">{report.utterances.toLocaleString()}</span>
            <span class="rp-cap">sentences spoken</span>
          </div>
          <div class="rp-stat">
            <span class="rp-num">{report.mlu === null ? '-' : report.mlu.toFixed(1)}</span>
            <span class="rp-cap">words per sentence</span>
          </div>
        </div>

        <div class="rp-section">
          <span class="field-label">
            Activity by {report.bucketUnit}
            <span class="rp-days">· {report.activeDays} active day{report.activeDays === 1 ? '' : 's'}</span>
          </span>
          <div class="rp-chart">
            {#each report.buckets as b (b.start)}
              <div
                class="rp-bar"
                style="--h:{Math.round((b.words / maxBucket) * 100)}%"
                title={`${fmtDate(b.start)}: ${b.words}`}
              ></div>
            {/each}
          </div>
          {#if report.buckets.length}
            <div class="rp-axis">
              <span>{fmtDate(report.buckets[0].start)}</span>
              <span>{fmtDate(report.buckets[report.buckets.length - 1].start)}</span>
            </div>
          {/if}
        </div>

        <div class="rp-section">
          <span class="field-label">Most used</span>
          <div class="rp-words">
            {#each report.topWords as [word, n] (word)}
              <div class="rp-word">
                <span class="rp-word-text">{word}</span>
                <span class="rp-word-bar" style="--w:{Math.round((n / topMax) * 100)}%"></span>
                <span class="rp-word-n">{n}</span>
              </div>
            {/each}
          </div>
        </div>

        {#if report.includesArchived}
          <p class="picker-note">
            Weeks older than {RAW_WINDOW_DAYS} days are kept as summaries, so these totals go all the way back
            even though the individual taps have been cleared out.
          </p>
        {/if}
      {/if}

      <div class="rp-section">
        <span class="field-label">Give this to a speech therapist</span>
        <div class="lock-actions">
          <button class="ghost-dark small" disabled={busy} onclick={() => exportCsv('taps')}>
            {canShareFiles ? '📤 Share' : '⬇ Save'} every tap (CSV)
          </button>
          {#if report?.includesArchived}
            <button class="ghost-dark small" disabled={busy} onclick={() => exportCsv('weekly')}>
              {canShareFiles ? '📤 Share' : '⬇ Save'} weekly summary (CSV)
            </button>
          {/if}
        </div>
        {#if note}<p class="picker-note">{note}</p>{/if}
      </div>

      <div class="modal-actions">
        <button class="danger" disabled={busy} onclick={clearAll}>Delete all</button>
        <span class="grow"></span>
        <button class="primary" onclick={() => app.closeReport()}>Done</button>
      </div>
    </div>
  </div>
{/if}
