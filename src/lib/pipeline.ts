import { after } from "next/server";
import fallbackPrefs from "../../config/preferences.json";
import { acquireLock, q, releaseLock, safe } from "./db";
import { fetchReleases, type FetchResult } from "./fetch";
import { filterTitles, genreSet, langCodes } from "./filter";
import { buildBlocks } from "./format";
import { factualSkip, judge } from "./gemini";
import type { DigestView, Entry, MissedSignals, Prefs, Title } from "./types";
import { isoWeek } from "./week";
import { classifyWindow, RADAR_DAYS } from "./window";

const CACHE_MS = 6 * 3600e3;
const LANG_NAME: Record<string, string> = { hi: "Hindi", en: "English", ta: "Tamil" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function loadPrefs(): Promise<Prefs> {
  const rows = await safe(() => q<Prefs>(`SELECT genres, languages, platforms, taste_notes FROM preferences ORDER BY id LIMIT 1`));
  return rows?.[0] ?? (fallbackPrefs as Prefs);
}

type V = { synopsis_line_1: string; synopsis_line_2: string; verdict: "WATCH" | "SKIP"; match_score: number; reason: string; reason_long?: string; missed?: string[]; mood_tag: string };

function missedFor(t: Title, prefs: Prefs, v?: V): MissedSignals {
  const gs = genreSet(prefs);
  return {
    language_match: langCodes(prefs).has(t.language),
    language: LANG_NAME[t.language] ?? t.language,
    genre_overlap: t.genres.filter((g) => gs.has(g.toLowerCase())),
    profile_genres: prefs.genres,
    mood_tag: v?.mood_tag ?? "",
    notes: v?.missed ?? [],
  };
}

function toEntry(t: Title, prefs: Prefs, v?: V): Entry {
  const noOverview = !t.overview;
  return {
    title: t.title,
    tmdbId: t.tmdbId,
    platforms: t.platforms,
    genres: t.genres,
    mediaType: t.mediaType,
    runtime: t.runtime,
    episodes: t.episodes,
    synopsis: noOverview ? ["no synopsis available", "The listing gives nothing to go on."] : v ? [v.synopsis_line_1, v.synopsis_line_2 || "—"] : [t.overview.slice(0, 110), ""],
    verdict: v ? v.verdict : "UNAVAILABLE",
    score: v ? v.match_score : 0,
    reason: v ? v.reason : "",
    reasonLong: v?.reason_long ?? "",
    missed: missedFor(t, prefs, v),
    mood: v ? v.mood_tag : "",
    poster: t.poster,
    tmdbPlatforms: t.tmdbPlatforms ?? [],
    backdrop: t.backdrop,
    year: t.year,
    releaseDate: t.releaseDate,
    dateApprox: !!t.dateApprox,
    isDare: false,
    isPick: false,
  };
}

export async function upsertReleases(titles: Title[]): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  const jobs = titles.flatMap((t) => t.platforms.map((p) => ({ t, p })));
  let i = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < jobs.length) {
        const { t, p } = jobs[i++];
        const r = await q<{ id: number }>(
          `INSERT INTO releases (source_id, platform, title, media_type, genres, original_language, runtime, episode_count, overview, poster_url, backdrop_url, release_date, source, fetched_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
           ON CONFLICT (source_id, platform) DO UPDATE SET title=EXCLUDED.title, genres=EXCLUDED.genres, original_language=EXCLUDED.original_language,
             runtime=EXCLUDED.runtime, episode_count=EXCLUDED.episode_count, overview=EXCLUDED.overview, poster_url=EXCLUDED.poster_url,
             backdrop_url=EXCLUDED.backdrop_url, release_date=EXCLUDED.release_date, source=EXCLUDED.source, fetched_at=now()
           RETURNING id`,
          [t.key, p, t.title, t.mediaType, t.genres, t.language, t.runtime, t.episodes, t.overview, t.poster, t.backdrop, t.releaseDate, t.source],
        );
        if (!ids.has(t.key)) ids.set(t.key, r[0].id);
      }
    }),
  );
  return ids;
}

/** Radar pipeline: strictly the last 7 days. fetch -> classifyWindow gate -> filter -> Gemini -> format -> store. */
async function runPipeline(): Promise<DigestView> {
  const prefs = await loadPrefs();
  const fetched: FetchResult = await fetchReleases(); // already limited to 7 days and merged from both sources
  const radarTitles = fetched.titles.filter((t) => classifyWindow(t.releaseDate) === "radar"); // the shared rule, applied again at the gate
  const f = filterTitles(radarTitles, prefs);
  console.log(`[pipeline] window=${RADAR_DAYS} source=${fetched.source} fetched=${radarTitles.length} per-platform=${JSON.stringify(fetched.perPlatform)} filtered=${f.main.length} wild=${f.wildcards.length} ${fetched.note ?? ""}`);

  const stored = await safe(() => upsertReleases(radarTitles));
  const now = new Date();
  let entries: Entry[] = [];
  let dare: Entry | null = null;
  let model: string | null = null;
  const quiet = f.main.length === 0;

  if (!quiet) {
    const res = await judge(f.main, f.wildcards, prefs);
    model = res?.model ?? null;
    entries = f.main.map((t, i) => toEntry(t, prefs, res?.verdicts.get(i)));
    const dv = res && res.dareId != null && res.dareId >= f.main.length ? res.verdicts.get(res.dareId) : undefined;
    if (dv && res!.dareId! < f.main.length + f.wildcards.length) {
      dare = toEntry(f.wildcards[res!.dareId! - f.main.length], prefs, dv);
      dare.verdict = "WATCH";
      dare.isDare = true;
    }
    const judged = entries.filter((e) => e.verdict !== "UNAVAILABLE").sort((a, b) => b.score - a.score);
    const top = judged.find((e) => e.verdict === "WATCH");
    if (top) top.isPick = true;
    entries = [...judged, ...entries.filter((e) => e.verdict === "UNAVAILABLE")];
  }

  const counts = {
    fetched: radarTitles.length,
    filtered: f.main.length,
    watch: entries.filter((e) => e.verdict === "WATCH").length,
    skip: entries.filter((e) => e.verdict === "SKIP").length,
  };
  const view: Omit<DigestView, "text" | "id" | "storage"> = {
    weekStart: isoWeek(now).monday,
    windowDays: RADAR_DAYS,
    sourceLabel: fetched.label,
    counts,
    entries,
    dare,
    quiet,
    createdAt: now.toISOString(),
    model,
  };
  const text = buildBlocks(view, now).join("\n\n");

  const id = await safe(async () => {
    const d = await q<{ id: number }>(
      `INSERT INTO digests (week_start, window_days, data_source, fetched_count, filtered_count, watch_count, skip_count, text, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [view.weekStart, RADAR_DAYS, fetched.label, counts.fetched, counts.filtered, counts.watch, counts.skip, text, JSON.stringify({ quiet, model, note: fetched.note ?? null, perPlatform: fetched.perPlatform, quota: fetched.quota ?? null })],
    );
    const digestId = d[0].id;
    const all = [...entries, ...(dare ? [dare] : [])];
    const keyOf = new Map<Entry, string>();
    f.main.forEach((t, i) => keyOf.set(entries.find((e) => e.title === t.title && e.releaseDate === t.releaseDate) ?? entries[i], t.key));
    if (dare) keyOf.set(dare, f.wildcards.find((t) => t.title === dare!.title)!.key);
    for (const e of all) {
      await q(
        `INSERT INTO verdicts (digest_id, release_id, synopsis_line_1, synopsis_line_2, verdict, match_score, reason, reason_long, missed_signals, mood_tag, is_dare, is_pick, entry)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [digestId, stored?.get(keyOf.get(e) ?? "") ?? null, e.synopsis[0], e.synopsis[1], e.verdict, e.score, e.reason, e.reasonLong ?? "", JSON.stringify(e.missed ?? {}), e.mood, e.isDare, e.isPick, JSON.stringify(e)],
      );
    }
    return digestId;
  });
  return { ...view, id, text, storage: id !== null };
}

/**
 * Generate one digest. A Neon lock means two simultaneous requests can never both generate (this was the duplicate-row bug:
 * the page and an API call both missed the cache and both wrote a digest seconds apart). The loser waits and returns the winner's digest.
 */
export async function generateDigest(opts: { force?: boolean } = {}): Promise<DigestView> {
  const started = Date.now();
  const got = await safe(() => acquireLock("digest"));
  if (got === false) {
    for (let i = 0; i < 50; i++) {
      await sleep(2000);
      const l = await safe(latestDigest);
      if (l && new Date(l.createdAt).getTime() >= started - 1000) return l;
    }
    throw new Error("another digest run is in progress; try again shortly");
  }
  try {
    if (!opts.force) {
      const l = await safe(latestDigest);
      if (l && l.windowDays === RADAR_DAYS && Date.now() - new Date(l.createdAt).getTime() < CACHE_MS) return l; // guard: same window, <6h
    }
    return await runPipeline();
  } finally {
    if (got) await releaseLock("digest");
  }
}

export async function loadDigest(row: any): Promise<DigestView> {
  const vs = await q<{ entry: Entry; is_dare: boolean }>(`SELECT entry, is_dare FROM verdicts WHERE digest_id=$1 ORDER BY match_score DESC, id`, [row.id]);
  const entries = vs.filter((v) => !v.is_dare).map((v) => v.entry);
  return {
    id: row.id,
    weekStart: typeof row.week_start === "string" ? row.week_start.slice(0, 10) : new Date(row.week_start).toISOString().slice(0, 10),
    windowDays: row.window_days,
    sourceLabel: row.data_source,
    counts: { fetched: row.fetched_count, filtered: row.filtered_count, watch: row.watch_count, skip: row.skip_count },
    entries,
    dare: vs.find((v) => v.is_dare)?.entry ?? null,
    quiet: !!row.meta?.quiet,
    text: row.text,
    createdAt: new Date(row.created_at).toISOString(),
    model: row.meta?.model ?? null,
    storage: true,
  };
}

export async function latestDigest(): Promise<DigestView | null> {
  const r = await q(`SELECT * FROM digests ORDER BY created_at DESC, id DESC LIMIT 1`);
  return r[0] ? loadDigest(r[0]) : null;
}

/** Cron / send-now / preview: serve the stored 7-day digest if < 6h old, otherwise run the pipeline. */
export async function getOrCreateDigest(opts: { fresh?: boolean } = {}): Promise<{ view: DigestView; cached: boolean }> {
  if (!opts.fresh) {
    const latest = await safe(latestDigest);
    if (latest && latest.windowDays === RADAR_DAYS && Date.now() - new Date(latest.createdAt).getTime() < CACHE_MS) return { view: latest, cached: true };
  }
  return { view: await generateDigest({ force: !!opts.fresh }), cached: false };
}

/**
 * The home page: always the LATEST digest row from Neon (the same row History lists first). If it is older than 6h it is shown
 * immediately and refreshed in the background, so a visitor never sees an old digest while a newer one exists.
 */
export async function getDigestForPage(): Promise<{ view: DigestView; cached: boolean; refreshing: boolean }> {
  const latest = await safe(latestDigest);
  if (latest && latest.windowDays === RADAR_DAYS) {
    const agedOut = [...latest.entries, ...(latest.dare ? [latest.dare] : [])].some((e) => !e.releaseDate || classifyWindow(e.releaseDate) !== "radar");
    const stale = agedOut || Date.now() - new Date(latest.createdAt).getTime() >= CACHE_MS; // a title that aged past 7 days also triggers a refresh
    if (stale) after(() => generateDigest().then(() => undefined, (e) => console.error("background refresh failed:", e.message)));
    return { view: latest, cached: true, refreshing: stale };
  }
  // no digest yet, or only a legacy digest with a different window: build a 7-day digest now
  return { view: await generateDigest(), cached: false, refreshing: false };
}

/** Telegram safety net: refuse to send anything that is not a pure 7-day radar digest. */
export function assertSevenDay(v: DigestView) {
  if (v.windowDays !== RADAR_DAYS) throw new Error(`refusing to send: digest window is ${v.windowDays} days, not ${RADAR_DAYS}`);
  const at = new Date(v.createdAt);
  for (const e of [...v.entries, ...(v.dare ? [v.dare] : [])]) {
    if (!e.releaseDate || classifyWindow(e.releaseDate, at) !== "radar") throw new Error(`refusing to send: "${e.title}" is not a 7-day radar title`);
  }
}

export { factualSkip };
