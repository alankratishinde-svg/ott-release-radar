# OTT Release Radar

Every Friday at 6pm IST, a Telegram digest of what **actually released in the last 7 days in India** on Netflix, Prime Video and JioHotstar, filtered to one viewer's taste, with a Gemini "watch or skip" verdict for every title. Written by "The Friday Projectionist".

- Next.js (App Router, TypeScript) on Vercel
- Data: Watchmode (primary, region IN) + TMDB (enrichment, India verification, fallback)
- AI: Gemini Flash only (newest Flash model picked from `ListModels` at run time). No other LLM.
- Storage: Neon serverless Postgres (`@neondatabase/serverless`). Nothing else.
- Delivery: Telegram Bot API via plain `fetch`

## Components map

Steps 1-8 are in flow order. Step 8 is Naman deciding what to watch. Also rendered at `/map`.

| Actor | Trigger | Input | Context | Processing | AI | Output |
|---|---|---|---|---|---|---|
| **1 Scheduler** (Vercel Cron) | Fri 12:30 UTC = 6:00pm IST (`30 12 * * 5`) | Time | `CRON_SECRET` | GET `/api/digest` with `Authorization: Bearer` | None | HTTP call into the app route |
| **2, 4 App route** (Next.js) | Cron, or the "Send to Telegram now" button (`/api/send-now`, 1 per 60s) | Bearer secret; idempotency + cache check in Neon | Profile read from Neon; a digest under 6h old is served from Neon with no API calls | Skip if a cron digest was already sent this ISO week, then fetch, then **filter** (language hard, genre soft, dedupe), batch, format, split to 4096 chars | None itself | Digest + verdict rows, Telegram text, page JSON |
| **3 Releases API** (Watchmode / TMDB) | Fetch step | Region IN, last 7 days (21 if fewer than 5 titles survive the filter); source ids discovered from `/sources` | Watchmode dates; TMDB genres, language, runtime, episodes, overview, poster, India providers | Keep the 3 platforms; drop titles TMDB says are not on that platform in India; TMDB discover if Watchmode fails | None | Titles upserted into `releases` |
| **5 Gemini Flash** | One batched call after the filter | All filtered titles + wildcard candidates for the dare | Profile and taste notes (from Neon); only the supplied overviews | Structured JSON against a response schema; one retry if malformed or too generous | **Judges taste**: 2-line synopsis, WATCH/SKIP, score, reason, mood, one dare | Rows in `verdicts` |
| **6 Telegram Bot API** | Digest ready | Formatted HTML text | Bot token + chat id | `sendMessage`, `parse_mode=HTML`, split to fit | None | Message ids in `sends` |
| **7 Neon Postgres** (storage) | Reads at the filter step; writes at fetch, Gemini and send | Releases, digests, verdicts, sends written; profile read | `preferences`, `releases`, `digests`, `verdicts`, `sends` | Upsert on (source id, platform); 6h cache; per-week cron idempotency; 60s manual rate limit | None | `/` and `/history` read from here |
| **8 Naman** (human) | Friday evening notification | The Telegram digest or the web page | His mood and free time | Reads pick, lineup, dare, graveyard, time budget | None | Decides what to watch |

## The data-source trap

IMDb and TMDB release dates are global (theatrical or first-air). They say nothing about when a title reached an Indian OTT catalogue, and "trending" lists say nothing about what is new. This build avoids both:

1. **Watchmode `/releases` with `regions=IN`** is the primary source. It reports when a title appeared on a streaming source.
2. Source ids for Netflix, Prime Video and JioHotstar are **discovered from `/sources`**, never hardcoded. JioHotstar (formerly Disney+ Hotstar) is matched by name.
3. Each candidate is **verified against TMDB's India watch providers**. If TMDB has India provider data and the platform is not in it, the title is dropped (the Watchmode date was for another region). Titles with no India provider data yet are kept.
4. If Watchmode fails, TMDB `discover` with `watch_region=IN` and the three provider ids is used, and the digest says **"TMDB fallback (dates less precise)"**.
5. If Watchmode has nothing for a platform (it currently has no JioHotstar releases for India), that platform alone is backfilled from TMDB and the source label says so.

## Why language is a hard filter and genre is soft

A Telugu or Korean title is simply unwatchable for him, so language is a yes/no gate (`hi`, `en`, `ta`). Genre is a fuzzy signal: "indie drama" is not a TMDB genre, and the best thing he will watch this month might be tagged Crime or Mystery. So any overlap with thriller / sci-fi / drama, plus adjacent crime and mystery, passes. Code never decides "taste match". Gemini does, with the profile and taste notes from the database, so it can reject a loud sci-fi franchise and rescue a quiet crime drama. A few language-passing titles outside his genres go in as candidates for **Gemini's dare** only.

## Why Neon

One place for profile, history and send log. The pipeline reads the profile **from the database**, so editing the `preferences` row changes his taste. The 6h cache in `digests` protects the Watchmode, TMDB and Gemini free tiers. The `sends` table makes the cron idempotent (one cron send per ISO week) and rate-limits manual sends (1 per 60s). If Neon is unreachable the pipeline still runs and sends, and the page says "storage unavailable".

## Assumptions

- **taste_notes** are my own: slow-burn, morally ambiguous thrillers; grounded idea-driven sci-fi; restrained indie drama; dislikes formulaic action, jump-scare horror, padded series, loud rom-coms. Edit the row in `preferences` to change them.
- **JioHotstar** is the current name of Disney+ Hotstar in India; provider ids come from the APIs (Watchmode 447, TMDB 2336 and legacy 122).
- **Demo window**: if fewer than 5 titles survive the filter in 7 days, the window widens to 21 days and a banner says so. Nothing is faked.
- At most 40 filtered titles + 6 dare candidates go to Gemini in one call.
- Series length is the season's episode count x per-episode runtime.

## Setup

Environment variables (names only):

```
GEMINI_API_KEY
WATCHMODE_API_KEY
TMDB_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID     # optional: if empty it is found via getUpdates
DATABASE_URL         # Neon pooled connection string
CRON_SECRET          # openssl rand -hex 32
```

```bash
npm install
cp .env.example .env.local   # fill in values
npm run db:setup             # creates the 5 tables (re-runnable) and seeds preferences once
npm run dev
```

`npm run db:setup` uses `CREATE TABLE IF NOT EXISTS` and `ON CONFLICT DO NOTHING`, so it is safe to run against production as often as you like.

**Cron:** `vercel.json` schedules `GET /api/digest` at `30 12 * * 5` (UTC, which is Friday 6:00pm IST). Vercel adds `Authorization: Bearer $CRON_SECRET` automatically; the route returns 401 without it, and skips the send if a cron digest was already sent this ISO week.

Routes: `/` latest digest from Neon, `/history`, `/map`, `/api/preview` (JSON, sends nothing), `/api/digest` (cron), `/api/send-now` (manual).
