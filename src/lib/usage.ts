// Opt-in, on-device usage logging.
//
// The whole point is that this never leaves the tablet. Rows live in their own
// IndexedDB stores (never inside a Profile, so a profile export cannot carry
// them), nothing is transmitted anywhere, and the caregiver can wipe the lot
// with one button.
//
// Retention is a rolling raw window plus permanent weekly roll-ups. Raw rows
// older than RAW_WINDOW_DAYS are collapsed into one record per profile per
// week and then deleted. The roll-up keeps every word and its count, so the
// long-term numbers stay exact - what is lost is the individual timestamps,
// which is precisely the detail nobody needs a year later.

import {
  usageAdd,
  usageRange,
  usageWeeksAll,
  usageCollapse,
  usageClear,
  type UsageEventRow,
  type UsageWeekRow,
} from './idb';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
export const RAW_WINDOW_DAYS = 90;

// Cap the per-week vocabulary so a pathological board cannot bloat a roll-up.
// Real boards run a few hundred words, so this is headroom, not a haircut.
const MAX_WORDS_PER_WEEK = 500;

function dayStartOf(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday 00:00 local time for the week containing ts. */
function weekStartOf(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

// ---- recording ----
// Every logger is fire-and-forget and swallows its own errors. Logging must
// never delay speech or break a tap if storage is full or blocked.

function record(row: UsageEventRow): void {
  void usageAdd(row).catch(() => {});
}

export function logWord(profileId: string, text: string): void {
  record({ ts: Date.now(), profileId, kind: 'word', text });
}

export function logUtterance(profileId: string, text: string, words: number): void {
  record({ ts: Date.now(), profileId, kind: 'utterance', text, words });
}

export function logNav(profileId: string, boardName: string): void {
  record({ ts: Date.now(), profileId, kind: 'nav', text: boardName });
}

export { usageClear };

// ---- roll-up / prune ----

function foldWeek(key: string, profileId: string, weekStart: number, rows: UsageEventRow[], prev?: UsageWeekRow): UsageWeekRow {
  const counts = new Map<string, number>(prev?.topWords ?? []);
  const days = new Set<number>();
  let words = prev?.words ?? 0;
  let utterances = prev?.utterances ?? 0;
  let utteranceWords = prev?.utteranceWords ?? 0;
  let navs = prev?.navs ?? 0;

  for (const r of rows) {
    days.add(dayStartOf(r.ts));
    if (r.kind === 'word') {
      words++;
      const w = r.text.trim().toLowerCase();
      if (w && (counts.has(w) || counts.size < MAX_WORDS_PER_WEEK)) {
        counts.set(w, (counts.get(w) ?? 0) + 1);
      }
    } else if (r.kind === 'utterance') {
      utterances++;
      utteranceWords += r.words ?? 0;
    } else {
      navs++;
    }
  }

  return {
    key,
    profileId,
    weekStart,
    words,
    utterances,
    utteranceWords,
    navs,
    uniqueWords: counts.size,
    topWords: [...counts.entries()].sort((a, b) => b[1] - a[1]),
    // Merging a previously-folded week cannot recover its exact day set, so
    // take the larger count rather than inventing precision.
    activeDays: Math.max(prev?.activeDays ?? 0, days.size),
  };
}

/**
 * Collapse raw rows that have aged out of the window. Only weeks lying wholly
 * past the cutoff are folded, so the week straddling the boundary stays raw
 * until it is fully outside the window. Safe to call on every boot.
 */
export async function collapseOldEvents(): Promise<void> {
  try {
    const cutoff = Date.now() - RAW_WINDOW_DAYS * DAY;
    const old = await usageRange(-Infinity, cutoff);
    if (!old.length) return;

    const buckets = new Map<string, { profileId: string; weekStart: number; rows: UsageEventRow[] }>();
    let deleteBefore = -Infinity;
    for (const r of old) {
      const ws = weekStartOf(r.ts);
      if (ws + WEEK > cutoff) continue; // straddles the boundary, leave it raw
      const key = `${r.profileId}|${ws}`;
      const b = buckets.get(key);
      if (b) b.rows.push(r);
      else buckets.set(key, { profileId: r.profileId, weekStart: ws, rows: [r] });
      // Week starts are aligned, so this is exactly the boundary below which
      // every remaining row has already been folded.
      deleteBefore = Math.max(deleteBefore, ws + WEEK);
    }
    if (!buckets.size) return;

    const existing = new Map((await usageWeeksAll()).map((w) => [w.key, w]));
    const folded = [...buckets.entries()].map(([key, b]) =>
      foldWeek(key, b.profileId, b.weekStart, b.rows, existing.get(key)),
    );
    await usageCollapse(folded, deleteBefore);
  } catch {
    // Roll-up is housekeeping. Never let it break boot.
  }
}

// ---- report ----

export interface UsageReport {
  from: number;
  to: number;
  words: number;
  utterances: number;
  uniqueWords: number;
  mlu: number | null; // mean words per spoken sentence
  activeDays: number;
  topWords: [string, number][];
  /** Bars for the chart: per day for short ranges, per week for all time. */
  buckets: { start: number; words: number }[];
  bucketUnit: 'day' | 'week';
  /** True when collapsed weeks contributed, so the UI can say so. */
  includesArchived: boolean;
  hasAnyData: boolean;
}

export type Range = 7 | 30 | 90 | 'all';

export async function buildReport(profileId: string, range: Range): Promise<UsageReport> {
  const now = Date.now();
  const from = range === 'all' ? -Infinity : dayStartOf(now - (range - 1) * DAY);

  const [raw, allWeeks] = await Promise.all([
    usageRange(from === -Infinity ? undefined : from).catch(() => [] as UsageEventRow[]),
    usageWeeksAll().catch(() => [] as UsageWeekRow[]),
  ]);

  const rows = raw.filter((r) => r.profileId === profileId);
  // Roll-ups only ever hold data older than the raw window, so for any range
  // inside that window they are irrelevant and cannot double count.
  const weeks = range === 'all' ? allWeeks.filter((w) => w.profileId === profileId) : [];

  const counts = new Map<string, number>();
  const days = new Set<number>();
  let words = 0;
  let utterances = 0;
  let utteranceWords = 0;

  for (const w of weeks) {
    words += w.words;
    utterances += w.utterances;
    utteranceWords += w.utteranceWords;
    for (const [word, n] of w.topWords) counts.set(word, (counts.get(word) ?? 0) + n);
  }
  const archivedDays = weeks.reduce((n, w) => n + w.activeDays, 0);

  for (const r of rows) {
    days.add(dayStartOf(r.ts));
    if (r.kind === 'word') {
      words++;
      const w = r.text.trim().toLowerCase();
      if (w) counts.set(w, (counts.get(w) ?? 0) + 1);
    } else if (r.kind === 'utterance') {
      utterances++;
      utteranceWords += r.words ?? 0;
    }
  }

  // Chart buckets.
  const bucketUnit: 'day' | 'week' = range === 'all' ? 'week' : 'day';
  const bucketed = new Map<number, number>();
  if (bucketUnit === 'week') {
    for (const w of weeks) bucketed.set(w.weekStart, (bucketed.get(w.weekStart) ?? 0) + w.words);
    for (const r of rows) {
      if (r.kind !== 'word') continue;
      const k = weekStartOf(r.ts);
      bucketed.set(k, (bucketed.get(k) ?? 0) + 1);
    }
  } else {
    // Seed every day in range so quiet days render as gaps, not as missing bars.
    for (let i = 0; i < (range as number); i++) bucketed.set(dayStartOf(now - i * DAY), 0);
    for (const r of rows) {
      if (r.kind !== 'word') continue;
      const k = dayStartOf(r.ts);
      bucketed.set(k, (bucketed.get(k) ?? 0) + 1);
    }
  }
  const buckets = [...bucketed.entries()]
    .map(([start, words]) => ({ start, words }))
    .sort((a, b) => a.start - b.start);

  const earliest = weeks.length
    ? weeks[0].weekStart
    : rows.length
      ? rows[0].ts
      : now;

  return {
    from: range === 'all' ? earliest : from,
    to: now,
    words,
    utterances,
    uniqueWords: counts.size,
    mlu: utterances > 0 ? utteranceWords / utterances : null,
    activeDays: days.size + archivedDays,
    topWords: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    buckets,
    bucketUnit,
    includesArchived: weeks.length > 0,
    hasAnyData: words + utterances > 0,
  };
}
