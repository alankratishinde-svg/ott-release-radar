import { q } from "./db";
import { pool, tmdb, TMDB_PROVIDERS } from "./fetch";
import type { Platform } from "./types";

export const ALL_PLATFORMS: Platform[] = ["Netflix", "Prime Video", "JioHotstar"];
export const LANG_CODE: Record<string, string> = { Hindi: "hi", English: "en", Tamil: "ta" };

// our genre key -> TMDB names (weight 1 = exact, 0.5 = near, used for TV where no Thriller/Horror genre exists)
export const GENRE_NAMES: Record<string, [string, number][]> = {
  thriller: [["Thriller", 1], ["Mystery", 0.5]],
  "sci-fi": [["Science Fiction", 1], ["Sci-Fi & Fantasy", 1]],
  drama: [["Drama", 1]],
  comedy: [["Comedy", 1]],
  romance: [["Romance", 1]],
  horror: [["Horror", 1], ["Thriller", 0.3]],
  crime: [["Crime", 1]],
  action: [["Action", 1], ["Action & Adventure", 1]],
  documentary: [["Documentary", 1]],
  animation: [["Animation", 1]],
};
// TMDB genre ids per media type, used only to steer live discover (ranking stays in code)
const GENRE_IDS: Record<"movie" | "tv", Record<string, number[]>> = {
  movie: { thriller: [53], "sci-fi": [878], drama: [18], comedy: [35], romance: [10749], horror: [27], crime: [80], action: [28], documentary: [99], animation: [16] },
  tv: { thriller: [9648, 80], "sci-fi": [10765], drama: [18], comedy: [35], romance: [], horror: [9648], crime: [80], action: [10759], documentary: [99], animation: [16] },
};
const MATURE = new Set(["A", "R", "NC-17", "TV-MA", "18+", "18", "16+", "U/A 16+", "UA 16+"]);

export interface Cand {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  platforms: Platform[];
  genres: string[];
  language: string;
  runtime: number | null; // minutes (per episode for tv)
  episodes: number | null;
  seasons: number | null;
  s1Episodes: number | null;
  overview: string;
  poster: string | null;
  rating: number;
  voteCount: number;
  year: string | null;
  adult: boolean;
}
export const candKey = (c: Pick<Cand, "mediaType" | "tmdbId">) => `${c.mediaType}:${c.tmdbId}`;

/** Total watch time used for the time-budget filter: movie runtime, or first-season length for series. */
export function budgetMinutes(c: Cand): number | null {
  if (!c.runtime) return null;
  return c.mediaType === "movie" ? c.runtime : c.runtime * (c.s1Episodes ?? c.episodes ?? 1);
}

export async function fetchCand(type: "movie" | "tv", id: number, platforms: Platform[]): Promise<Cand | null> {
  try {
    const d = await tmdb(`/${type}/${id}`, { append_to_response: type === "movie" ? "release_dates" : "content_ratings", language: "en-US" });
    let cert = "";
    if (type === "movie") {
      const rs: any[] = d.release_dates?.results ?? [];
      cert = (rs.find((r) => r.iso_3166_1 === "IN") ?? rs.find((r) => r.iso_3166_1 === "US"))?.release_dates?.find((x: any) => x.certification)?.certification ?? "";
    } else {
      const rs: any[] = d.content_ratings?.results ?? [];
      cert = (rs.find((r) => r.iso_3166_1 === "IN") ?? rs.find((r) => r.iso_3166_1 === "US"))?.rating ?? "";
    }
    const s1 = (d.seasons ?? []).find((x: any) => x.season_number === 1);
    return {
      tmdbId: id,
      mediaType: type,
      title: d.title ?? d.name,
      platforms,
      genres: (d.genres ?? []).map((g: any) => g.name),
      language: d.original_language,
      runtime: type === "movie" ? d.runtime || null : d.episode_run_time?.[0] || d.last_episode_to_air?.runtime || null,
      episodes: type === "tv" ? d.number_of_episodes || null : null,
      seasons: type === "tv" ? d.number_of_seasons || null : null,
      s1Episodes: type === "tv" ? s1?.episode_count || d.number_of_episodes || null : null,
      overview: (d.overview ?? "").trim(),
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : null,
      rating: d.vote_average ?? 0,
      voteCount: d.vote_count ?? 0,
      year: String(d.release_date ?? d.first_air_date ?? "").slice(0, 4) || null,
      adult: !!d.adult || MATURE.has(cert.trim().toUpperCase()),
    };
  } catch {
    return null;
  }
}

export async function upsertCatalog(c: Cand) {
  await q(
    `INSERT INTO catalog (tmdb_id, media_type, title, platforms, genres, language, runtime, episodes, seasons, s1_episodes, overview, poster_url, rating, vote_count, year, adult_flag, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
     ON CONFLICT (tmdb_id, media_type) DO UPDATE SET title=EXCLUDED.title,
       platforms=(SELECT array_agg(DISTINCT x) FROM unnest(catalog.platforms || EXCLUDED.platforms) x),
       genres=EXCLUDED.genres, language=EXCLUDED.language, runtime=EXCLUDED.runtime, episodes=EXCLUDED.episodes, seasons=EXCLUDED.seasons,
       s1_episodes=EXCLUDED.s1_episodes, overview=EXCLUDED.overview, poster_url=EXCLUDED.poster_url, rating=EXCLUDED.rating,
       vote_count=EXCLUDED.vote_count, year=EXCLUDED.year, adult_flag=EXCLUDED.adult_flag, fetched_at=now()`,
    [c.tmdbId, c.mediaType, c.title, c.platforms, c.genres, c.language, c.runtime, c.episodes, c.seasons, c.s1Episodes, c.overview, c.poster, c.rating, c.voteCount, c.year, c.adult],
  );
}

const rowToCand = (r: any): Cand => ({
  tmdbId: r.tmdb_id, mediaType: r.media_type, title: r.title, platforms: r.platforms, genres: r.genres, language: r.language,
  runtime: r.runtime, episodes: r.episodes, seasons: r.seasons, s1Episodes: r.s1_episodes, overview: r.overview ?? "", poster: r.poster_url,
  rating: r.rating ?? 0, voteCount: r.vote_count ?? 0, year: r.year, adult: r.adult_flag,
});

/** Fresh (24h TTL) catalog rows matching the hard SQL filters: platform, language, format. */
export async function queryCatalog(platforms: Platform[], langs: string[], format: "movie" | "tv" | "either"): Promise<Cand[]> {
  const rows = await q(
    `SELECT * FROM catalog WHERE fetched_at > now() - interval '24 hours' AND platforms && $1::text[] AND language = ANY($2::text[])
       AND ($3::text IS NULL OR media_type = $3)`,
    [platforms, langs, format === "either" ? null : format],
  );
  return rows.map(rowToCand);
}

export interface LiveOpts {
  platforms: Platform[];
  langs: string[];
  format: "movie" | "tv" | "either";
  genres: string[]; // may be empty
  hiddenGems: boolean;
}

/** Live TMDB discover across the India catalog (not just this week), then details for the top ~30 and upsert into the catalog. */
export async function discoverLive(o: LiveOpts): Promise<number> {
  const types: ("movie" | "tv")[] = o.format === "either" ? ["movie", "tv"] : [o.format];
  const jobs = o.platforms.flatMap((platform) => types.flatMap((type) => [1, 2].map((page) => ({ platform, type, page }))));
  const found = await pool(jobs, 6, async (j) => {
    const ids = [...new Set(o.genres.flatMap((g) => GENRE_IDS[j.type][g] ?? []))];
    try {
      const r = await tmdb(`/discover/${j.type}`, {
        watch_region: "IN",
        with_watch_providers: TMDB_PROVIDERS[j.platform].join("|"),
        with_watch_monetization_types: "flatrate",
        with_original_language: o.langs.join("|"),
        ...(ids.length ? { with_genres: ids.join("|") } : {}),
        "vote_count.gte": 50,
        ...(o.hiddenGems ? { "vote_count.lte": 2000, "vote_average.gte": 7 } : {}),
        sort_by: "popularity.desc",
        page: j.page,
      });
      return (r.results ?? []).map((x: any) => ({ type: j.type, id: x.id as number, platform: j.platform, pop: x.popularity as number }));
    } catch {
      return [];
    }
  });
  const byKey = new Map<string, { type: "movie" | "tv"; id: number; platforms: Platform[]; pop: number }>();
  for (const x of found.flat() as { type: "movie" | "tv"; id: number; platform: Platform; pop: number }[]) {
    const k = `${x.type}:${x.id}`;
    const ex = byKey.get(k);
    if (ex) { if (!ex.platforms.includes(x.platform)) ex.platforms.push(x.platform); } else byKey.set(k, { type: x.type, id: x.id, platforms: [x.platform], pop: x.pop });
  }
  const top = [...byKey.values()].sort((a, b) => b.pop - a.pop).slice(0, 30);
  const cands = await pool(top, 8, (t) => fetchCand(t.type, t.id, t.platforms));
  let n = 0;
  for (const c of cands) if (c) { await upsertCatalog(c); n++; }
  return n;
}
