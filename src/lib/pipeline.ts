import fallbackPrefs from "../../config/preferences.json";
import { q, safe } from "./db";
import { fetchReleases, type FetchResult } from "./fetch";
import { filterTitles } from "./filter";
import { buildBlocks } from "./format";
import { judge } from "./gemini";
import type { DigestView, Entry, Prefs, Title } from "./types";
import { isoWeek } from "./week";

const CACHE_MS = 6 * 3600e3;

export async function loadPrefs(): Promise<Prefs> {
  const rows = await safe(() => q<Prefs>(`SELECT genres, languages, platforms, taste_notes FROM preferences ORDER BY id LIMIT 1`));
  return rows?.[0] ?? (fallbackPrefs as Prefs);
}

function toEntry(t: Title, v?: { synopsis_line_1: string; synopsis_line_2: string; verdict: "WATCH" | "SKIP"; match_score: number; reason: string; mood_tag: string }): Entry {
  const noOverview = !t.overview;
  return {
    title: t.title,
    platforms: t.platforms,
    genres: t.genres,
    mediaType: t.mediaType,
    runtime: t.runtime,
    episodes: t.episodes,
    synopsis: noOverview
      ? ["no synopsis available", "The listing gives nothing to go on."]
      : v
        ? [v.synopsis_line_1, v.synopsis_line_2 || "—"]
        : [t.overview.slice(0, 110), ""],
    verdict: v ? v.verdict : "UNAVAILABLE",
    score: v ? v.match_score : 0,
    reason: v ? v.reason : "",
    mood: v ? v.mood_tag : "",
    poster: t.poster,
    backdrop: t.backdrop,
    year: t.year,
    releaseDate: t.releaseDate,
    isDare: false,
    isPick: false,
  };
}

async function upsertReleases(titles: Title[]): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  const jobs = titles.flatMap((t) => t.platforms.map((p) => ({ t, p })));
  let i = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < jobs.length) {
        const { t, p } = jobs[i++];
        const r = await q<{ id: number }>(
          `INSERT INTO releases (source_id, platform, title, media_type, genres, original_language, runtime, episode_count, overview, poster_url, release_date, source, fetched_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
           ON CONFLICT (source_id, platform) DO UPDATE SET title=EXCLUDED.title, genres=EXCLUDED.genres, original_language=EXCLUDED.original_language,
             runtime=EXCLUDED.runtime, episode_count=EXCLUDED.episode_count, overview=EXCLUDED.overview, poster_url=EXCLUDED.poster_url,
             release_date=EXCLUDED.release_date, source=EXCLUDED.source, fetched_at=now()
           RETURNING id`,
          [t.key, p, t.title, t.mediaType, t.genres, t.language, t.runtime, t.episodes, t.overview, t.poster, t.releaseDate, t.source],
        );
        if (!ids.has(t.key)) ids.set(t.key, r[0].id);
      }
    }),
  );
  return ids;
}

/** Run fetch -> filter -> Gemini -> format -> store. Widens 7 -> 21 days if fewer than 5 titles survive the filter. */
export async function generateDigest(): Promise<DigestView> {
  const prefs = await loadPrefs();
  let windowDays = 7;
  let fetched: FetchResult = await fetchReleases(7);
  let f = filterTitles(fetched.titles, prefs);
  if (f.main.length < 5) {
    windowDays = 21;
    fetched = await fetchReleases(21);
    f = filterTitles(fetched.titles, prefs);
  }
  console.log(`[pipeline] window=${windowDays} source=${fetched.source} fetched=${fetched.titles.length} per-platform=${JSON.stringify(fetched.perPlatform)} filtered=${f.main.length} wild=${f.wildcards.length} ${fetched.note ?? ""}`);

  const stored = await safe(() => upsertReleases(fetched.titles));
  const now = new Date();

  let entries: Entry[] = [];
  let dare: Entry | null = null;
  let model: string | null = null;
  const quiet = f.main.length === 0;

  if (!quiet) {
    const res = await judge(f.main, f.wildcards, prefs);
    model = res?.model ?? null;
    entries = f.main.map((t, i) => toEntry(t, res?.verdicts.get(i)));
    // enforce the "no synopsis" rule on the score side too: still judged, just not invented
    const dv = res && res.dareId != null && res.dareId >= f.main.length ? res.verdicts.get(res.dareId) : undefined;
    if (dv && res!.dareId! < f.main.length + f.wildcards.length) {
      dare = toEntry(f.wildcards[res!.dareId! - f.main.length], dv);
      dare.verdict = "WATCH";
      dare.isDare = true;
    }
    const judged = entries.filter((e) => e.verdict !== "UNAVAILABLE").sort((a, b) => b.score - a.score);
    const top = judged.find((e) => e.verdict === "WATCH");
    if (top) top.isPick = true;
    entries = [...judged, ...entries.filter((e) => e.verdict === "UNAVAILABLE")];
  }

  const counts = {
    fetched: fetched.titles.length,
    filtered: f.main.length,
    watch: entries.filter((e) => e.verdict === "WATCH").length,
    skip: entries.filter((e) => e.verdict === "SKIP").length,
  };
  const view: Omit<DigestView, "text" | "id" | "storage"> = {
    weekStart: isoWeek(now).monday,
    windowDays,
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
      [view.weekStart, windowDays, fetched.label, counts.fetched, counts.filtered, counts.watch, counts.skip, text, JSON.stringify({ quiet, model, note: fetched.note ?? null, perPlatform: fetched.perPlatform })],
    );
    const digestId = d[0].id;
    const all = [...entries, ...(dare ? [dare] : [])];
    const keyOf = new Map<Entry, string>();
    f.main.forEach((t, i) => keyOf.set(entries.find((e) => e.title === t.title && e.releaseDate === t.releaseDate) ?? entries[i], t.key));
    if (dare) keyOf.set(dare, f.wildcards.find((t) => t.title === dare!.title)!.key);
    for (const e of all) {
      await q(
        `INSERT INTO verdicts (digest_id, release_id, synopsis_line_1, synopsis_line_2, verdict, match_score, reason, mood_tag, is_dare, is_pick, entry)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [digestId, stored?.get(keyOf.get(e) ?? "") ?? null, e.synopsis[0], e.synopsis[1], e.verdict, e.score, e.reason, e.mood, e.isDare, e.isPick, JSON.stringify(e)],
      );
    }
    return digestId;
  });
  return { ...view, id, text, storage: id !== null };
}

export async function loadDigest(row: any): Promise<DigestView> {
  const vs = await q<{ entry: Entry; is_dare: boolean }>(`SELECT entry, is_dare FROM verdicts WHERE digest_id=$1 ORDER BY match_score DESC, id`, [row.id]);
  const entries = vs.filter((v) => !v.is_dare).map((v) => v.entry);
  return {
    id: row.id,
    weekStart: String(row.week_start).slice(0, 10),
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
  const r = await q(`SELECT * FROM digests ORDER BY created_at DESC LIMIT 1`);
  return r[0] ? loadDigest(r[0]) : null;
}

/** Serve the stored digest if < 6h old (protects free tiers), otherwise run the pipeline. */
export async function getOrCreateDigest(opts: { fresh?: boolean } = {}): Promise<{ view: DigestView; cached: boolean }> {
  if (!opts.fresh) {
    const latest = await safe(latestDigest);
    if (latest && Date.now() - new Date(latest.createdAt).getTime() < CACHE_MS) return { view: latest, cached: true };
  }
  return { view: await generateDigest(), cached: false };
}
