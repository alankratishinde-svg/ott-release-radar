import { neon } from "@neondatabase/serverless";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run a query with up to 3 retries and backoff (Neon cold starts, timeouts). */
export async function q<T = Record<string, any>>(text: string, params: any[] = []): Promise<T[]> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const sql = neon(url);
      return (await sql.query(text, params)) as T[];
    } catch (e) {
      lastErr = e;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastErr;
}

/** Never throws: returns null when storage is unreachable. */
export async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error("storage error:", (e as Error).message);
    return null;
  }
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS preferences (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  genres TEXT[] NOT NULL,
  languages TEXT[] NOT NULL,
  platforms TEXT[] NOT NULL,
  taste_notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS releases (
  id SERIAL PRIMARY KEY,
  source_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  media_type TEXT,
  genres TEXT[] NOT NULL DEFAULT '{}',
  original_language TEXT,
  runtime INTEGER,
  episode_count INTEGER,
  overview TEXT,
  poster_url TEXT,
  release_date DATE,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, platform)
);
CREATE TABLE IF NOT EXISTS digests (
  id SERIAL PRIMARY KEY,
  week_start DATE NOT NULL,
  window_days INTEGER NOT NULL,
  data_source TEXT NOT NULL,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  filtered_count INTEGER NOT NULL DEFAULT 0,
  watch_count INTEGER NOT NULL DEFAULT 0,
  skip_count INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS verdicts (
  id SERIAL PRIMARY KEY,
  digest_id INTEGER NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
  release_id INTEGER REFERENCES releases(id) ON DELETE SET NULL,
  synopsis_line_1 TEXT,
  synopsis_line_2 TEXT,
  verdict TEXT NOT NULL,
  match_score INTEGER,
  reason TEXT,
  mood_tag TEXT,
  is_dare BOOLEAN NOT NULL DEFAULT false,
  is_pick BOOLEAN NOT NULL DEFAULT false,
  entry JSONB NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS sends (
  id SERIAL PRIMARY KEY,
  digest_id INTEGER REFERENCES digests(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  iso_week TEXT,
  telegram_message_ids TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sends_trigger_week ON sends (trigger, iso_week);
CREATE INDEX IF NOT EXISTS verdicts_digest ON verdicts (digest_id);
`;
