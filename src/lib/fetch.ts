import { cachedJson } from "./db";
import type { Platform, Title } from "./types";
import { classifyWindow, RADAR_DAYS } from "./window";
import { daysAgoIST } from "./week";

const WM = "https://api.watchmode.com/v1";
const TMDB = "https://api.themoviedb.org/3";

// Fallback ids (these are what discovery returns today). Real ids are discovered from TMDB below.
export const TMDB_PROVIDERS: Record<Platform, number[]> = {
  Netflix: [8],
  "Prime Video": [119, 2100],
  JioHotstar: [2336, 122],
};
const PROVIDER_TO_PLATFORM = new Map<number, Platform>(
  (Object.entries(TMDB_PROVIDERS) as [Platform, number[]][]).flatMap(([p, ids]) => ids.map((i) => [i, p] as const)),
);

let providerPromise: Promise<Record<Platform, number[]>> | null = null;
/** Discover provider ids for India from TMDB instead of guessing; falls back to the constants above. */
export function getProviders(): Promise<Record<Platform, number[]>> {
  providerPromise ??= (async () => {
    try {
      const out: Record<Platform, Set<number>> = { Netflix: new Set(), "Prime Video": new Set(), JioHotstar: new Set() };
      for (const type of ["movie", "tv"]) {
        const d = await tmdb(`/watch/providers/${type}`, { watch_region: "IN" });
        for (const p of d.results ?? []) {
          const n = String(p.provider_name).toLowerCase();
          if (n === "netflix") out.Netflix.add(p.provider_id);
          else if (n === "amazon prime video" || n === "prime video" || n === "amazon prime video with ads") out["Prime Video"].add(p.provider_id);
          else if (n === "jiohotstar" || n === "disney+ hotstar" || n === "hotstar") out.JioHotstar.add(p.provider_id);
        }
      }
      const r = Object.fromEntries((Object.keys(out) as Platform[]).map((k) => [k, [...out[k]]])) as Record<Platform, number[]>;
      return (Object.keys(r) as Platform[]).every((k) => r[k].length) ? r : TMDB_PROVIDERS;
    } catch {
      return TMDB_PROVIDERS;
    }
  })();
  return providerPromise;
}

export interface FetchResult {
  titles: Title[];
  label: string;
  source: "watchmode" | "tmdb";
  perPlatform: Record<string, number>;
  note?: string;
  quota?: { used: number | null; limit: number | null };
}

async function getJson(url: string): Promise<{ json: any; headers: Headers }> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return { json: await r.json(), headers: r.headers };
}
export const tmdb = async (path: string, params: Record<string, string | number> = {}) => {
  const u = new URL(TMDB + path);
  u.searchParams.set("api_key", process.env.TMDB_API_KEY!);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return (await getJson(u.toString())).json;
};

export async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
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

/** Discover Watchmode source ids for the 3 platforms in India (never hardcoded). Cached 24h. */
async function discoverSources(): Promise<Map<number, Platform>> {
  const { payload: d } = await cachedJson<any[]>("wm:sources:IN", 24 * 3600e3, async () => {
    const r = await getJson(`${WM}/sources/?apiKey=${process.env.WATCHMODE_API_KEY}&regions=IN`);
    if (!Array.isArray(r.json)) throw new Error("watchmode sources: " + JSON.stringify(r.json).slice(0, 80));
    return { payload: r.json };
  });
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
  backdrop: string | null;
  year: string | null;
  tmdbId: number;
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
      backdrop: d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : null,
      year: String(d.release_date ?? d.first_air_date ?? "").slice(0, 4) || null,
      tmdbId: id,
      inPlatforms: new Set(ids.map((i) => PROVIDER_TO_PLATFORM.get(i)).filter(Boolean) as Platform[]),
      hasInData: !!inData && ids.length > 0,
    };
  } catch {
    return null;
  }
}

function merge(map: Map<string, Title>, t: Title) {
  const ex = map.get(t.key);
  if (!ex) return void map.set(t.key, { ...t, dateApprox: t.source === "tmdb", tmdbPlatforms: t.source === "tmdb" ? [...t.platforms] : [] });
  for (const p of t.platforms) {
    if (!ex.platforms.includes(p)) {
      ex.platforms.push(p);
      if (t.source === "tmdb") (ex.tmdbPlatforms ??= []).push(p);
    }
  }
  // Watchmode's date wins over TMDB's; between two Watchmode dates keep the latest.
  if (ex.source === "watchmode" && t.source === "watchmode" && t.releaseDate > ex.releaseDate) ex.releaseDate = t.releaseDate;
}

async function fetchWatchmode(windowDays: number): Promise<FetchResult> {
  const sources = await discoverSources();
  const url =
    `${WM}/releases/?apiKey=${process.env.WATCHMODE_API_KEY}&regions=IN&limit=250` +
    `&start_date=${daysAgoIST(windowDays).replace(/-/g, "")}&end_date=${daysAgoIST(0).replace(/-/g, "")}`;
  // Hard cache: at most one live Watchmode releases call per 6 hours (free-tier quota). Stale cache beats failing.
  const c = await cachedJson<any>(`wm:releases:IN:${windowDays}`, 6 * 3600e3, async () => {
    const r = await getJson(url);
    const used = Number(r.headers.get("x-account-quota-used"));
    const limit = Number(r.headers.get("x-account-quota"));
    console.log(`[watchmode] live call. quota used ${Number.isFinite(used) && used ? used : "?"} / ${Number.isFinite(limit) && limit ? limit : "?"}`);
    if (!Array.isArray(r.json.releases)) throw new Error("watchmode releases: bad payload");
    return { payload: r.json, meta: { used: used || null, limit: limit || null } };
  });
  const d = c.payload;
  const quota = { used: (c.meta.used as number) ?? null, limit: (c.meta.limit as number) ?? null };
  if (c.stale) console.warn(`[watchmode] live call failed, using cached data from ${c.fetchedAt.toISOString()}`);

  const cand = new Map<string, { type: "movie" | "tv"; id: number; platform: Platform; date: string; season: number | null }>();
  for (const r of d.releases) {
    const platform = sources.get(r.source_id);
    if (!platform || !r.tmdb_id) continue;
    const type = r.tmdb_type === "movie" ? "movie" : "tv";
    const key = `${type}:${r.tmdb_id}:${platform}`;
    const prev = cand.get(key);
    if (!prev || r.source_release_date > prev.date) cand.set(key, { type, id: r.tmdb_id, platform, date: r.source_release_date, season: r.season_number ?? null });
  }
  if (cand.size === 0) throw new Error("watchmode returned 0 candidates on the 3 platforms");

  const list = [...cand.values()];
  const det = await pool(list, 8, (x) => details(x.type, x.id, x.season));
  const map = new Map<string, Title>();
  let droppedNotIndia = 0;
  let unverified = 0;
  list.forEach((x, i) => {
    const y = det[i];
    if (!y) return;
    // If TMDB has India provider data and this platform is not in it, the Watchmode date was a non-India window.
    if (y.hasInData && !y.inPlatforms.has(x.platform)) return void droppedNotIndia++;
    if (!y.hasInData) unverified++;
    merge(map, {
      key: `${x.type}:${x.id}`, tmdbId: x.id, mediaType: x.type, title: y.title, platforms: [x.platform], genres: y.genres, language: y.language,
      runtime: y.runtime, episodes: y.episodes, overview: y.overview, poster: y.poster, backdrop: y.backdrop, year: y.year, releaseDate: x.date,
      source: "watchmode", unverified: !y.hasInData,
    });
  });
  const titles = [...map.values()];
  return {
    titles,
    label: c.stale ? `Watchmode (cached ${c.fetchedAt.toISOString().slice(0, 16).replace("T", " ")} UTC; live call failed) + TMDB` : "Live from Watchmode (region IN), enriched and India-verified via TMDB",
    source: "watchmode",
    perPlatform: countPlatforms(titles),
    quota,
    note: `watchmode candidates=${list.length}${c.stale ? " (stale cache)" : ""}, dropped as not-India=${droppedNotIndia}, no India provider data yet=${unverified}, quota=${quota.used ?? "?"}/${quota.limit ?? "?"}`,
  };
}

async function fetchTmdbFallback(windowDays: number, only?: Platform[]): Promise<FetchResult> {
  const from = daysAgoIST(windowDays);
  const to = daysAgoIST(0);
  const providers = await getProviders();
  const jobs: { platform: Platform; type: "movie" | "tv" }[] = [];
  for (const platform of only ?? (Object.keys(providers) as Platform[])) for (const type of ["movie", "tv"] as const) jobs.push({ platform, type });
  const found = await pool(jobs, 6, async (j) => {
    const dateKey = j.type === "movie" ? "primary_release_date" : "first_air_date";
    const base = { watch_region: "IN", with_watch_providers: providers[j.platform].join("|"), with_watch_monetization_types: "flatrate", sort_by: "popularity.desc" };
    const queries: Record<string, string | number>[] = [
      { ...base, [`${dateKey}.gte`]: from, [`${dateKey}.lte`]: to, page: 1 },
      { ...base, [`${dateKey}.gte`]: from, [`${dateKey}.lte`]: to, page: 2 },
    ];
    // Movies: also India's own digital/physical/TV release date (films that reach OTT after a theatrical run)
    if (j.type === "movie") queries.push({ ...base, region: "IN", with_release_type: "4|5|6", "release_date.gte": from, "release_date.lte": to });
    const out: any[] = [];
    for (const qy of queries) {
      try {
        const r = await tmdb(`/discover/${j.type}`, qy);
        for (const x of r.results ?? []) out.push({ ...j, id: x.id, date: x.release_date ?? x.first_air_date ?? to });
      } catch {}
    }
    return out;
  });
  const flat = found.flat() as { platform: Platform; type: "movie" | "tv"; id: number; date: string }[];
  if (!flat.length) throw new Error("tmdb discover returned nothing");
  const det = await pool(flat, 8, (x) => details(x.type, x.id, null));
  const map = new Map<string, Title>();
  flat.forEach((x, i) => {
    const y = det[i];
    if (!y) return;
    merge(map, {
      key: `${x.type}:${x.id}`, tmdbId: x.id, mediaType: x.type, title: y.title, platforms: [x.platform], genres: y.genres, language: y.language,
      runtime: y.runtime, episodes: y.episodes, overview: y.overview, poster: y.poster, backdrop: y.backdrop, year: y.year, releaseDate: x.date, source: "tmdb",
    });
  });
  const titles = [...map.values()];
  return { titles, label: "TMDB (dates less precise)", source: "tmdb", perPlatform: countPlatforms(titles) };
}

function countPlatforms(titles: Title[]) {
  const c: Record<string, number> = {};
  for (const t of titles) for (const p of t.platforms) c[p] = (c[p] ?? 0) + 1;
  return c;
}

/**
 * The Radar fetch. Strictly the last 7 days. Watchmode and TMDB are MERGED and de-duplicated (never one instead of the other),
 * so a Watchmode outage or an exhausted quota cannot shrink the Radar. classifyWindow is applied as the final gate.
 */
export async function fetchReleases(): Promise<FetchResult> {
  const windowDays = RADAR_DAYS;
  let wm: FetchResult | null = null;
  let wmErr = "";
  try {
    wm = await fetchWatchmode(windowDays);
  } catch (e) {
    wmErr = (e as Error).message;
    console.error("Watchmode unavailable:", wmErr);
  }
  let extra: FetchResult | null = null;
  try {
    extra = await fetchTmdbFallback(windowDays);
  } catch (e) {
    console.error("TMDB discover failed:", (e as Error).message);
  }
  if (!wm && !extra) throw new Error(`no data source available (watchmode: ${wmErr})`);

  const map = new Map<string, Title>((wm?.titles ?? []).map((t) => [t.key, t] as const));
  const before = countPlatforms(wm?.titles ?? []);
  for (const t of extra?.titles ?? []) merge(map, t);
  const titles = [...map.values()].filter((t) => classifyWindow(t.releaseDate) === "radar");
  const perPlatform = countPlatforms(titles);
  const gaps = (Object.keys(TMDB_PROVIDERS) as Platform[]).filter((p) => (perPlatform[p] ?? 0) > (before[p] ?? 0));
  const label = !wm
    ? `TMDB discover (Watchmode unavailable: ${wmErr}; dates less precise)`
    : gaps.length
      ? `${wm.label}, plus TMDB discover for ${gaps.join(", ")} (Watchmode coverage is thin there; those dates are less precise)`
      : wm.label;
  return {
    titles,
    label,
    source: wm ? "watchmode" : "tmdb",
    perPlatform,
    quota: wm?.quota,
    note: [wm?.note ?? `watchmode failed: ${wmErr}`, extra ? `tmdb added ${JSON.stringify(Object.fromEntries(gaps.map((p) => [p, (perPlatform[p] ?? 0) - (before[p] ?? 0)])))}` : "tmdb discover failed"].join("; "),
  };
}
