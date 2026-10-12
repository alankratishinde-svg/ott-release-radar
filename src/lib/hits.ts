import { acquireLock, q, releaseLock, safe } from "./db";
import { fetchCand, upsertCatalog, ALL_PLATFORMS, type Cand } from "./catalog";
import { getProviders, pool, tmdb } from "./fetch";
import { geminiGenerate, newestFlash } from "./gemini";
import { loadPrefs } from "./pipeline";
import type { Platform } from "./types";
import { classifyWindow, dashboardFor, RADAR_DAYS } from "./window";

const TTL_MS = 24 * 3600e3;
export const MIN_VOTES = 1000;
export const MIN_RATING = 7.2;

export interface Hit {
  key: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  year: string | null;
  releaseDate: string;
  rating: number;
  voteCount: number;
  platforms: Platform[];
  genres: string[];
  language: string;
  runtime: number | null;
  episodes: number | null;
  seasons: number | null;
  overview: string;
  poster: string | null;
  reason: string;
  reasonLong: string;
  score: number;
}

export const SHELVES = ["Thriller hits", "Sci-fi hits", "Indie drama hits", "Hindi gems", "Tamil gems", "Hidden gems"] as const;
export type Shelf = (typeof SHELVES)[number];

const has = (h: Hit, ...g: string[]) => g.some((x) => h.genres.includes(x));
const MATCH: Record<Shelf, (h: Hit) => boolean> = {
  "Thriller hits": (h) => has(h, "Thriller", "Mystery"),
  "Sci-fi hits": (h) => has(h, "Science Fiction", "Sci-Fi & Fantasy"),
  "Indie drama hits": (h) => has(h, "Drama") && h.voteCount <= 8000 && !has(h, "Action", "Action & Adventure", "Animation", "Family", "Comedy", "Adventure", "Fantasy"),
  "Hindi gems": (h) => h.language === "hi",
  "Tamil gems": (h) => h.language === "ta",
  "Hidden gems": (h) => h.rating >= 7.5 && h.voteCount >= 1000 && h.voteCount <= 8000,
};

/** Each title goes to ONE shelf (his genres first, then language gems, then hidden gems). Shelves under 3 titles are hidden and their titles re-homed. */
export function assignShelves(hits: Hit[]): { shelves: { name: Shelf; items: Hit[] }[]; shelfOf: Map<string, Shelf> } {
  let allowed: Shelf[] = [...SHELVES];
  let shelfOf = new Map<string, Shelf>();
  for (let guard = 0; guard < SHELVES.length + 1; guard++) {
    shelfOf = new Map();
    for (const h of hits) {
      const s = allowed.find((n) => MATCH[n](h));
      if (s) shelfOf.set(h.key, s);
    }
    const counts = new Map<Shelf, number>();
    for (const s of shelfOf.values()) counts.set(s, (counts.get(s) ?? 0) + 1);
    const small = allowed.filter((n) => (counts.get(n) ?? 0) < 3);
    if (!small.length) break;
    allowed = allowed.filter((n) => !small.includes(n));
  }
  const shelves = allowed.map((name) => ({ name, items: hits.filter((h) => shelfOf.get(h.key) === name).sort((a, b) => b.score - a.score || b.rating - a.rating) })).filter((s) => s.items.length >= 3);
  return { shelves, shelfOf };
}

export async function radarKeys(): Promise<Set<string>> {
  const rows = await q<{ source_id: string; release_date: string }>(`SELECT source_id, release_date::text AS release_date FROM releases WHERE release_date >= now() - interval '14 days'`);
  return new Set(rows.filter((r) => classifyWindow(r.release_date) === "radar").map((r) => r.source_id));
}

const rowToHit = (r: any): Hit => ({
  key: `${r.media_type}:${r.tmdb_id}`, tmdbId: r.tmdb_id, mediaType: r.media_type, title: r.title, year: r.year, releaseDate: String(r.release_date_text ?? "").slice(0, 10),
  rating: r.rating, voteCount: r.vote_count, platforms: r.platforms, genres: r.genres, language: r.language, runtime: r.runtime, episodes: r.episodes,
  seasons: r.seasons, overview: r.overview ?? "", poster: r.poster_url, reason: r.hit_reason ?? "", reasonLong: r.hit_reason_long ?? "", score: r.hit_score ?? 0,
});

/** Hits = catalog titles that classifyWindow assigns to "hits" and that are not in this week's radar set. */
export async function loadHits(): Promise<{ hits: Hit[]; refreshedAt: Date | null; stale: boolean }> {
  const [rows, rk] = await Promise.all([
    q(`SELECT *, release_date::text AS release_date_text FROM catalog WHERE hit_score IS NOT NULL AND vote_count >= $1 AND rating >= $2 AND release_date IS NOT NULL AND language IN ('hi','en','ta')
         AND fetched_at > now() - interval '7 days' AND platforms && $3::text[]`, [MIN_VOTES, MIN_RATING, ALL_PLATFORMS]),
    radarKeys(),
  ]);
  const hits = rows.map(rowToHit).filter((h) => dashboardFor(h.releaseDate, h.key, rk) === "hits");
  const latest = rows.reduce<number>((m, r) => Math.max(m, r.reason_at ? new Date(r.reason_at).getTime() : 0), 0);
  const refreshedAt = latest ? new Date(latest) : null;
  return { hits, refreshedAt, stale: !refreshedAt || Date.now() - latest > TTL_MS };
}

const SYSTEM = `You are the friend who has seen everything and recommends the proven classics. For each title write why THIS viewer would like it, using ONLY the profile and that title's overview and genres. Never invent plot, cast or facts.
- why: ONE line, max 140 characters, specific to the title and his taste.
- why_long: 2 sentences with more detail from the overview and his profile.
- match_score: 0-100 for how well it fits his profile (thriller, sci-fi, indie drama; slow-burn, morally ambiguous, grounded ideas). Be honest, not generous.
Return an entry for EVERY id.`;
const SCHEMA = {
  type: "OBJECT",
  properties: {
    items: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "INTEGER" }, why: { type: "STRING" }, why_long: { type: "STRING" }, match_score: { type: "INTEGER" } }, required: ["id", "why", "why_long", "match_score"] } },
  },
  required: ["items"],
};

/** ONE batched Gemini Flash call for every title that has no reason fresher than 24h. Never per card, never on a cached page load. */
async function explain(cands: Cand[]): Promise<number> {
  if (!cands.length) return 0;
  const prefs = await loadPrefs();
  const model = await newestFlash();
  const payload = {
    profile: { genres: prefs.genres, languages: prefs.languages, taste_notes: prefs.taste_notes },
    titles: cands.map((c, i) => ({ id: i, title: c.title, type: c.mediaType === "tv" ? "series" : "movie", year: c.year, genres: c.genres, language: c.language, rating: c.rating, overview: c.overview.slice(0, 450) })),
  };
  console.log(`[hits] gemini batch: 1 call for ${cands.length} titles (${model})`);
  let items: any[] = [];
  for (let attempt = 0; attempt < 2 && !items.length; attempt++) {
    try {
      const raw = await geminiGenerate(model, SYSTEM + (attempt ? "\nSTRICT: valid JSON only, every id present." : ""), JSON.stringify(payload), SCHEMA, 0.5);
      items = JSON.parse(raw).items ?? [];
    } catch (e) {
      console.error("[hits] gemini attempt failed:", (e as Error).message);
    }
  }
  let n = 0;
  for (const it of items) {
    const c = cands[it?.id];
    if (!c || typeof it.why !== "string" || !it.why.trim()) continue;
    await q(
      `UPDATE catalog SET hit_reason=$1, hit_reason_long=$2, hit_score=$3, reason_at=now() WHERE tmdb_id=$4 AND media_type=$5`,
      [it.why.trim().slice(0, 200), String(it.why_long ?? "").trim(), Math.max(0, Math.min(100, Math.round(it.match_score))), c.tmdbId, c.mediaType],
    );
    n++;
  }
  return n;
}

/** TMDB discover across India streaming (hi/en/ta, 1000+ votes, 7.2+ rating), cached in `catalog`, then one Gemini batch. */
export async function refreshHits(): Promise<{ titles: number; explained: number } | null> {
  if ((await safe(() => acquireLock("hits"))) === false) return null;
  try {
    const providers = await getProviders();
    const rk = await radarKeys();
    const jobs: { platform: Platform; type: "movie" | "tv"; lang: string; page: number }[] = [];
    for (const platform of ALL_PLATFORMS) for (const type of ["movie", "tv"] as const) for (const [lang, pages] of [["en", 2], ["hi", 1], ["ta", 1]] as const) for (let page = 1; page <= pages; page++) jobs.push({ platform, type, lang, page });
    const found = await pool(jobs, 6, async (j) => {
      try {
        const r = await tmdb(`/discover/${j.type}`, {
          watch_region: "IN", with_watch_providers: providers[j.platform].join("|"), with_watch_monetization_types: "flatrate", with_original_language: j.lang,
          "vote_count.gte": MIN_VOTES, "vote_average.gte": MIN_RATING, sort_by: "popularity.desc", page: j.page,
        });
        return (r.results ?? []).map((x: any) => ({ type: j.type, id: x.id as number, platform: j.platform, date: String(x.release_date ?? x.first_air_date ?? ""), pop: x.popularity as number, lang: x.original_language as string }));
      } catch {
        return [];
      }
    });
    const byKey = new Map<string, { type: "movie" | "tv"; id: number; platforms: Platform[]; pop: number; lang: string }>();
    for (const x of found.flat() as { type: "movie" | "tv"; id: number; platform: Platform; date: string; pop: number; lang: string }[]) {
      const key = `${x.type}:${x.id}`;
      if (dashboardFor(x.date, key, rk) !== "hits") continue; // radar titles never enter the hits set
      const ex = byKey.get(key);
      if (ex) { if (!ex.platforms.includes(x.platform)) ex.platforms.push(x.platform); } else byKey.set(key, { type: x.type, id: x.id, platforms: [x.platform], pop: x.pop, lang: x.lang });
    }
    // Hindi and Tamil titles are rare above the vote floor and less popular than English ones: keep all of them, fill the rest by popularity.
    const all = [...byKey.values()].sort((a, b) => b.pop - a.pop);
    const top = [...all.filter((t) => t.lang !== "en"), ...all.filter((t) => t.lang === "en")].slice(0, 120);
    const cands = (await pool(top, 8, (t) => fetchCand(t.type, t.id, t.platforms))).filter((c): c is Cand => !!c);
    const keep: Cand[] = [];
    for (const c of cands) {
      if (!c.releaseDate || dashboardFor(c.releaseDate, `${c.mediaType}:${c.tmdbId}`, rk) !== "hits") continue;
      if (c.voteCount < MIN_VOTES || c.rating < MIN_RATING) continue;
      await upsertCatalog(c);
      keep.push(c);
    }
    // only titles without a reason fresher than 24h go into the single Gemini batch
    const fresh = new Set((await q<{ k: string }>(`SELECT media_type || ':' || tmdb_id AS k FROM catalog WHERE reason_at > now() - interval '24 hours' AND hit_score IS NOT NULL`)).map((r) => r.k));
    const explained = await explain(keep.filter((c) => !fresh.has(`${c.mediaType}:${c.tmdbId}`)));
    console.log(`[hits] refreshed: ${keep.length} titles, ${explained} explained, radar window=${RADAR_DAYS}d`);
    return { titles: keep.length, explained };
  } finally {
    await releaseLock("hits");
  }
}
