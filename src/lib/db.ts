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
CREATE TABLE IF NOT EXISTS catalog (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  title TEXT NOT NULL,
  platforms TEXT[] NOT NULL DEFAULT '{}',
  genres TEXT[] NOT NULL DEFAULT '{}',
  language TEXT,
  runtime INTEGER,
  episodes INTEGER,
  seasons INTEGER,
  s1_episodes INTEGER,
  overview TEXT,
  poster_url TEXT,
  rating REAL,
  vote_count INTEGER,
  year TEXT,
  adult_flag BOOLEAN NOT NULL DEFAULT false,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tmdb_id, media_type)
);
CREATE TABLE IF NOT EXISTS picks (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  filters JSONB NOT NULL DEFAULT '{}',
  ip_hash TEXT,
  candidate_count INTEGER,
  pick_id TEXT,
  plan_b_id TEXT,
  relaxed TEXT[] NOT NULL DEFAULT '{}',
  gemini_model TEXT,
  latency_ms INTEGER,
  result JSONB
);
CREATE TABLE IF NOT EXISTS pick_cache (
  key TEXT PRIMARY KEY,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE verdicts ADD COLUMN IF NOT EXISTS reason_long TEXT;
ALTER TABLE verdicts ADD COLUMN IF NOT EXISTS missed_signals JSONB;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS backdrop_url TEXT;
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS release_date DATE;
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS backdrop_url TEXT;
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS hit_reason TEXT;
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS hit_reason_long TEXT;
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS hit_score INTEGER;
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS reason_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS api_cache (
  key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS locks (
  name TEXT PRIMARY KEY,
  until TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS digests_created ON digests (created_at);
CREATE INDEX IF NOT EXISTS picks_ip_time ON picks (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS catalog_fetched ON catalog (fetched_at);
CREATE INDEX IF NOT EXISTS sends_trigger_week ON sends (trigger, iso_week);
CREATE INDEX IF NOT EXISTS verdicts_digest ON verdicts (digest_id);
`;

/** Cross-request mutex in Neon so two requests never generate the same thing at once. Returns false if held. */
export async function acquireLock(name: string, seconds = 180): Promise<boolean> {
  const r = await q(
    `INSERT INTO locks (name, until) VALUES ($1, now() + ($2 || ' seconds')::interval)
     ON CONFLICT (name) DO UPDATE SET until = EXCLUDED.until WHERE locks.until < now() RETURNING name`,
    [name, String(seconds)],
  );
  return r.length > 0;
}
export const releaseLock = (name: string) => safe(() => q(`DELETE FROM locks WHERE name=$1`, [name]));

/** JSON cache in Neon. Returns fresh value, or (when fn throws) the stale value flagged as stale. */
export async function cachedJson<T>(key: string, ttlMs: number, fn: () => Promise<{ payload: T; meta?: Record<string, unknown> }>): Promise<{ payload: T; meta: Record<string, unknown>; stale: boolean; fetchedAt: Date }> {
  const row = await safe(() => q<{ payload: T; meta: Record<string, unknown>; fetched_at: string }>(`SELECT payload, meta, fetched_at FROM api_cache WHERE key=$1`, [key]));
  const hit = row?.[0];
  if (hit && Date.now() - new Date(hit.fetched_at).getTime() < ttlMs) return { payload: hit.payload, meta: hit.meta, stale: false, fetchedAt: new Date(hit.fetched_at) };
  try {
    const f = await fn();
    await safe(() => q(`INSERT INTO api_cache (key, payload, meta, fetched_at) VALUES ($1,$2,$3, now()) ON CONFLICT (key) DO UPDATE SET payload=EXCLUDED.payload, meta=EXCLUDED.meta, fetched_at=now()`, [key, JSON.stringify(f.payload), JSON.stringify(f.meta ?? {})]));
    return { payload: f.payload, meta: f.meta ?? {}, stale: false, fetchedAt: new Date() };
  } catch (e) {
    if (hit) return { payload: hit.payload, meta: hit.meta, stale: true, fetchedAt: new Date(hit.fetched_at) };
    throw e;
  }
}
