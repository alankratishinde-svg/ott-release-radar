import { q } from "./db";
import { classifyWindow } from "./window";

export interface Other {
  key: string;
  title: string;
  poster: string | null;
  language: string;
  genres: string[];
  releaseDate: string;
  platforms: string[];
  mediaType: "movie" | "tv";
  approx: boolean;
}

const langName = (c: string) => {
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(c) ?? c; } catch { return c; }
};

/**
 * Titles that arrived on the three platforms in the last 7 days but were not judged (outside Hindi / English / Tamil).
 * They are real new releases, so the Radar lists them, labelled, instead of hiding them. They are not recommendations and not in the digest.
 */
export async function radarOthers(judgedKeys: Set<string>): Promise<Other[]> {
  const rows = await q<any>(`SELECT source_id, platform, title, poster_url, original_language, genres, release_date::text AS release_date, media_type, source FROM releases WHERE release_date >= now() - interval '14 days' ORDER BY release_date DESC`);
  const by = new Map<string, Other>();
  for (const r of rows) {
    if (classifyWindow(r.release_date) !== "radar" || judgedKeys.has(r.source_id)) continue;
    const ex = by.get(r.source_id);
    if (ex) { if (!ex.platforms.includes(r.platform)) ex.platforms.push(r.platform); continue; }
    by.set(r.source_id, { key: r.source_id, title: r.title, poster: r.poster_url, language: langName(r.original_language), genres: r.genres ?? [], releaseDate: r.release_date, platforms: [r.platform], mediaType: r.media_type, approx: r.source === "tmdb" });
  }
  return [...by.values()];
}
