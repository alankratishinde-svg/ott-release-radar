import { ALL_PLATFORMS, discoverLive, LANG_CODE, queryCatalog, type Cand } from "./catalog";
import { dur } from "./format";
import { genreOverlap } from "./picker";
import type { Entry, Prefs } from "./types";

function profileGenres(prefs: Prefs): string[] {
  const out = new Set<string>();
  for (const g of prefs.genres.map((x) => x.toLowerCase())) {
    if (g.includes("thriller")) out.add("thriller");
    if (g.includes("sci")) out.add("sci-fi");
    if (g.includes("drama")) out.add("drama");
  }
  return [...out];
}
const sentences = (o: string): [string, string] => {
  if (!o) return ["no synopsis available", "The listing gives nothing to go on."];
  const s = o.match(/[^.!?]+[.!?]+/g)?.map((x) => x.trim()) ?? [o];
  return [s[0] ?? o, s[1] ?? ""];
};

/** A few extra movies from the full India catalogue that fit the stored profile. Ranked in code (not judged by Gemini) and labelled as such. */
export async function suggestMovies(exclude: string[], prefs: Prefs, n = 4): Promise<Entry[]> {
  const genres = profileGenres(prefs);
  const langs = prefs.languages.map((l) => LANG_CODE[l]).filter(Boolean);
  const skip = new Set(exclude.map((t) => t.toLowerCase()));
  const pick = async () => {
    const all = await queryCatalog(ALL_PLATFORMS, langs, "movie");
    return all
      .filter((c) => !skip.has(c.title.toLowerCase()) && !c.adult && c.rating >= 6.8 && c.voteCount >= 100 && genreOverlap(c, genres) > 0)
      .map((c) => ({ c, score: genreOverlap(c, genres) * 2 + c.rating + Math.min(1, Math.log10(c.voteCount + 1) / 4) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  };
  let list = await pick();
  if (list.length < n * 2) {
    await discoverLive({ platforms: ALL_PLATFORMS, langs, format: "movie", genres, hiddenGems: false });
    list = await pick();
  }
  return list.slice(0, n).map((c: Cand) => ({
    title: c.title,
    platforms: c.platforms,
    genres: c.genres,
    mediaType: "movie" as const,
    runtime: c.runtime,
    episodes: null,
    synopsis: sentences(c.overview),
    verdict: "WATCH" as const,
    score: 0,
    reason: `Not judged by Gemini. Picked from the full India catalogue because it fits your ${genres.join(", ")} taste and is rated ${c.rating.toFixed(1)} on TMDB (${dur(c.runtime)}).`,
    mood: "",
    poster: c.poster,
    year: c.year,
    releaseDate: "",
    isDare: false,
    isPick: false,
    suggested: true,
    rating: Math.round(c.rating * 10) / 10,
  }));
}
