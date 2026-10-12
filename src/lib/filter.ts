import type { Prefs, Title } from "./types";

const LANG_CODES: Record<string, string> = { hindi: "hi", english: "en", tamil: "ta", telugu: "te", malayalam: "ml", kannada: "kn", bengali: "bn", marathi: "mr" };
const ADJACENT = ["crime", "mystery"];

export function genreSet(prefs: Prefs): Set<string> {
  const s = new Set<string>(ADJACENT);
  for (const g of prefs.genres.map((x) => x.toLowerCase())) {
    if (g.includes("thriller")) s.add("thriller");
    if (g.includes("sci")) (s.add("science fiction"), s.add("sci-fi & fantasy"));
    if (g.includes("drama")) s.add("drama");
    if (!/thriller|sci|drama/.test(g)) s.add(g);
  }
  return s;
}

export function langCodes(prefs: Prefs) {
  return new Set(prefs.languages.map((l) => LANG_CODES[l.toLowerCase()]).filter(Boolean));
}

export interface Filtered {
  main: Title[];
  wildcards: Title[]; // language ok, genre outside profile: only eligible for the dare
}

/** LANGUAGE = hard filter. GENRE = soft (any overlap or adjacent genre). Taste is Gemini's job. */
export function filterTitles(all: Title[], prefs: Prefs, cap = 40, wildcardCap = 6): Filtered {
  const langs = langCodes(prefs);
  const genres = genreSet(prefs);
  const main: Title[] = [];
  const wild: Title[] = [];
  for (const t of all) {
    if (!langs.has(t.language)) continue;
    const hit = t.genres.some((g) => genres.has(g.toLowerCase())) || /psychological/i.test(t.overview);
    (hit ? main : wild).push(t);
  }
  const byDate = (a: Title, b: Title) => b.releaseDate.localeCompare(a.releaseDate);
  main.sort(byDate);
  wild.sort((a, b) => Number(!!b.overview) - Number(!!a.overview) || byDate(a, b));
  return { main: main.slice(0, cap), wildcards: wild.slice(0, wildcardCap) };
}
