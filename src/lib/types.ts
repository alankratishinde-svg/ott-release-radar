export type Platform = "Netflix" | "Prime Video" | "JioHotstar";

export interface Title {
  key: string; // `${movie|tv}:${tmdbId}`
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  platforms: Platform[];
  genres: string[];
  language: string;
  runtime: number | null; // minutes (per episode for tv)
  episodes: number | null;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  year: string | null;
  releaseDate: string; // YYYY-MM-DD
  source: "watchmode" | "tmdb";
  unverified?: boolean;
  dateApprox?: boolean; // release date came from TMDB discover (imprecise)
  tmdbPlatforms?: Platform[]; // platforms that came from TMDB discover, not Watchmode
}

export interface Prefs {
  genres: string[];
  languages: string[];
  platforms: string[];
  taste_notes: string;
}

export interface Entry {
  title: string;
  platforms: string[];
  genres: string[];
  mediaType: "movie" | "tv";
  runtime: number | null;
  episodes: number | null;
  synopsis: [string, string];
  verdict: "WATCH" | "SKIP" | "UNAVAILABLE";
  score: number;
  reason: string;
  mood: string;
  poster: string | null;
  backdrop?: string | null;
  year?: string | null;
  releaseDate: string;
  isDare: boolean;
  isPick: boolean;
  tmdbPlatforms?: string[];
  tmdbId?: number;
  dateApprox?: boolean;
  reasonLong?: string;
  missed?: MissedSignals;
}

export interface MissedSignals {
  language_match: boolean;
  language: string;
  genre_overlap: string[];
  profile_genres: string[];
  mood_tag: string;
  notes: string[];
}

export interface DigestView {
  id: number | null;
  weekStart: string;
  windowDays: number; // always 7 for new digests; older rows keep their original window and are shown as legacy
  sourceLabel: string;
  counts: { fetched: number; filtered: number; watch: number; skip: number };
  entries: Entry[]; // main titles, best first
  dare: Entry | null;
  quiet: boolean;
  text: string;
  createdAt: string;
  model: string | null;
  storage: boolean;
}
