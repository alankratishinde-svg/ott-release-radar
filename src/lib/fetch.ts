import type { Platform, Title } from "./types";
import { daysAgoIST } from "./week";

const WM = "https://api.watchmode.com/v1";
const TMDB = "https://api.themoviedb.org/3";

// TMDB watch-provider ids (verified against /watch/providers?watch_region=IN)
const TMDB_PROVIDERS: Record<Platform, number[]> = {
  Netflix: [8],
  "Prime Video": [119, 2100],
  JioHotstar: [2336, 122],
};
const PROVIDER_TO_PLATFORM = new Map<number, Platform>(
  (Object.entries(TMDB_PROVIDERS) as [Platform, number[]][]).flatMap(([p, ids]) => ids.map((i) => [i, p] as const)),
);

export interface FetchResult {
  titles: Title[];
  label: string;
  source: "watchmode" | "tmdb";
  perPlatform: Record<string, number>;
  note?: string;
}

async function getJson(url: string): Promise<any> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}
const tmdb = (path: string, params: Record<string, string | number> = {}) => {
  const u = new URL(TMDB + path);
  u.searchParams.set("api_key", process.env.TMDB_API_KEY!);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return getJson(u.toString());
};

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/** Discover Watchmode source ids for the 3 platforms in India (never hardcoded). */
async function discoverSources(): Promise<Map<number, Platform>> {
  const d = await getJson(`${WM}/sources/?apiKey=${process.env.WATCHMODE_API_KEY}&regions=IN`);
  if (!Array.isArray(d)) throw new Error("watchmode sources: " + JSON.stringify(d).slice(0, 80));
  const m = new Map<number, Platform>();
  for (const s of d) {
    if (s.type !== "sub") continue;
    const n = String(s.name).trim().toLowerCase();
    if (n === "netflix") m.set(s.id, "Netflix");
    else if (n === "prime video" || n === "amazon prime video") m.set(s.id, "Prime Video");
    else if (n === "jiohotstar" || n === "disney+ hotstar" || n === "hotstar") m.set(s.id, "JioHotstar");
  }
  if (m.size < 3) throw new Error(`watchmode sources: only ${m.size}/3 platforms found`);
  return m;
}

interface Detail {
  title: string;
  genres: string[];
  language: string;
  runtime: number | null;
  episodes: number | null;
  overview: string;
  poster: string | null;
  inPlatforms: Set<Platform>;
  hasInData: boolean;
}

async function details(type: "movie" | "tv", id: number, season?: number | null): Promise<Detail | null> {
  try {
    const d = await tmdb(`/${type}/${id}`, { append_to_response: "watch/providers", language: "en-US" });
    const inData = d["watch/providers"]?.results?.IN;
    const ids: number[] = [];
    if (inData) for (const k of ["flatrate", "free", "ads", "buy", "rent"]) for (const p of inData[k] ?? []) ids.push(p.provider_id);
    let episodes: number | null = null;
    let runtime: number | null = d.runtime || null;
    if (type === "tv") {
      const s = (d.seasons ?? []).find((x: any) => x.season_number === season);
      episodes = s?.episode_count || d.number_of_episodes || null;
      runtime = d.episode_run_time?.[0] || d.last_episode_to_air?.runtime || null;
    }
    return {
      title: d.title ?? d.name,
      genres: (d.genres ?? []).map((g: any) => g.name),
      language: d.original_language,
      runtime,
      episodes,
      overview: (d.overview ?? "").trim(),
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : null,
      inPlatforms: new Set(ids.map((i) => PROVIDER_TO_PLATFORM.get(i)).filter(Boolean) as Platform[]),
      hasInData: !!inData && ids.length > 0,
    };
  } catch {
    return null;
  }
}

function merge(map: Map<string, Title>, t: Title) {
  const ex = map.get(t.key);
  if (!ex) return void map.set(t.key, t);
  for (const p of t.platforms) if (!ex.platforms.includes(p)) ex.platforms.push(p);
  if (t.releaseDate > ex.releaseDate) ex.releaseDate = t.releaseDate;
}

async function fetchWatchmode(windowDays: number): Promise<FetchResult> {
  const sources = await discoverSources();
  const url =
    `${WM}/releases/?apiKey=${process.env.WATCHMODE_API_KEY}&regions=IN&limit=250` +
    `&start_date=${daysAgoIST(windowDays).replace(/-/g, "")}&end_date=${daysAgoIST(0).replace(/-/g, "")}`;
  const d = await getJson(url);
  if (!Array.isArray(d.releases)) throw new Error("watchmode releases: bad payload");

  const cand = new Map<string, { type: "movie" | "tv"; id: number; platform: Platform; date: string; season: number | null }>();
  for (const r of d.releases) {
    const platform = sources.get(r.source_id);
    if (!platform || !r.tmdb_id) continue;
    const type = r.tmdb_type === "movie" ? "movie" : "tv";
    const key = `${type}:${r.tmdb_id}:${platform}`;
    const prev = cand.get(key);
    if (!prev || r.source_release_date > prev.date)
      cand.set(key, { type, id: r.tmdb_id, platform, date: r.source_release_date, season: r.season_number ?? null });
  }
  if (cand.size === 0) throw new Error("watchmode returned 0 candidates on the 3 platforms");

  const list = [...cand.values()];
  const det = await pool(list, 8, (c) => details(c.type, c.id, c.season));
  const map = new Map<string, Title>();
  let droppedNotIndia = 0;
  let unverified = 0;
  list.forEach((c, i) => {
    const x = det[i];
    if (!x) return;
    // India check: if TMDB has India provider data and this platform is not in it, the
    // Watchmode date was a non-India window -> drop.
    if (x.hasInData && !x.inPlatforms.has(c.platform)) return void droppedNotIndia++;
    if (!x.hasInData) unverified++;
    merge(map, {
      key: `${c.type}:${c.id}`,
      tmdbId: c.id,
      mediaType: c.type,
      title: x.title,
      platforms: [c.platform],
      genres: x.genres,
      language: x.language,
      runtime: x.runtime,
      episodes: x.episodes,
      overview: x.overview,
      poster: x.poster,
      releaseDate: c.date,
      source: "watchmode",
      unverified: !x.hasInData,
    });
  });
  const titles = [...map.values()];
  return {
    titles,
    label: "Live from Watchmode (region IN), enriched and India-verified via TMDB",
    source: "watchmode",
    perPlatform: countPlatforms(titles),
    note: `watchmode candidates=${list.length}, dropped as not-India=${droppedNotIndia}, no India provider data yet=${unverified}`,
  };
}

async function fetchTmdbFallback(windowDays: number, only?: Platform[]): Promise<FetchResult> {
  const from = daysAgoIST(windowDays);
  const to = daysAgoIST(0);
  const jobs: { platform: Platform; type: "movie" | "tv" }[] = [];
  for (const platform of (only ?? (Object.keys(TMDB_PROVIDERS) as Platform[]))) for (const type of ["movie", "tv"] as const) jobs.push({ platform, type });
  const found = await pool(jobs, 6, async (j) => {
    const dateKey = j.type === "movie" ? "primary_release_date" : "first_air_date";
    const r = await tmdb(`/discover/${j.type}`, {
      watch_region: "IN",
      with_watch_providers: TMDB_PROVIDERS[j.platform].join("|"),
      with_watch_monetization_types: "flatrate",
      [`${dateKey}.gte`]: from,
      [`${dateKey}.lte`]: to,
      sort_by: "popularity.desc",
    });
    return (r.results ?? []).map((x: any) => ({ ...j, id: x.id, date: x.release_date ?? x.first_air_date ?? to }));
  });
  const flat = found.flat() as { platform: Platform; type: "movie" | "tv"; id: number; date: string }[];
  if (!flat.length) throw new Error("tmdb fallback returned nothing");
  const det = await pool(flat, 8, (c) => details(c.type, c.id, null));
  const map = new Map<string, Title>();
  flat.forEach((c, i) => {
    const x = det[i];
    if (!x) return;
    merge(map, {
      key: `${c.type}:${c.id}`,
      tmdbId: c.id,
      mediaType: c.type,
      title: x.title,
      platforms: [c.platform],
      genres: x.genres,
      language: x.language,
      runtime: x.runtime,
      episodes: x.episodes,
      overview: x.overview,
      poster: x.poster,
      releaseDate: c.date,
      source: "tmdb",
    });
  });
  const titles = [...map.values()];
  return {
    titles,
    label: "TMDB fallback (dates less precise)",
    source: "tmdb",
    perPlatform: countPlatforms(titles),
  };
}

function countPlatforms(titles: Title[]) {
  const c: Record<string, number> = {};
  for (const t of titles) for (const p of t.platforms) c[p] = (c[p] ?? 0) + 1;
  return c;
}

export async function fetchReleases(windowDays: number): Promise<FetchResult> {
  try {
    const wm = await fetchWatchmode(windowDays);
    // Watchmode sometimes has no India data for a platform at all: backfill only that platform from TMDB, labelled honestly.
    const missing = (Object.keys(TMDB_PROVIDERS) as Platform[]).filter((p) => !wm.perPlatform[p]);
    if (missing.length) {
      try {
        const extra = await fetchTmdbFallback(windowDays, missing);
        const map = new Map(wm.titles.map((t) => [t.key, t] as const));
        for (const t of extra.titles) merge(map, t);
        wm.titles = [...map.values()];
        wm.perPlatform = countPlatforms(wm.titles);
        wm.label = `Live from Watchmode (region IN) + TMDB for ${missing.join(", ")} (Watchmode had none; dates less precise)`;
        wm.note += `; tmdb backfill for ${missing.join(",")}=${extra.titles.length}`;
      } catch (e) {
        wm.note += `; tmdb backfill failed: ${(e as Error).message}`;
      }
    }
    return wm;
  } catch (e) {
    console.error("Watchmode failed, using TMDB fallback:", (e as Error).message);
    const r = await fetchTmdbFallback(windowDays);
    r.note = `watchmode failed: ${(e as Error).message}`;
    return r;
  }
}
