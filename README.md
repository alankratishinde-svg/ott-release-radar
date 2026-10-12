# OTT Release Radar

Two dashboards and a picker for what to watch on **Netflix, Prime Video and JioHotstar in India**, judged for one viewer's taste by Gemini Flash.

- **Radar** (`/`): only titles released in India in the **last 7 days**, each with a watch-or-skip verdict, and a Telegram digest every Friday at 6pm IST.
- **All Time Hits** (`/hits`): older than a week, still worth your Friday. Proven titles streaming now, grouped into shelves.
- **Pick for me** (`/pick`): tell it your mood and it picks one title and a Plan B from the whole India catalogue.

Stack: Next.js (App Router, TypeScript) on Vercel. Data: Watchmode + TMDB. AI: Gemini Flash only (newest Flash model from `ListModels`; no other LLM). Storage: Neon serverless Postgres only. Delivery: Telegram Bot API via plain `fetch`.

## The one rule

Every title belongs to exactly one dashboard, decided by one shared function (`src/lib/window.ts`):

```ts
classifyWindow(indiaReleaseDate) // age <= 7 days -> "radar", otherwise "hits"
```

The Radar, All Time Hits, the Telegram digest and the picker's "just landed" option all use it, and the hits set additionally excludes anything in the current radar set, so a title can never appear in both. `npm test` proves it. There is no other release window anywhere in the product. Old digest rows from before this rule are kept and shown as "legacy" in History.

**Where the 7-day rule is enforced**
1. `fetchReleases()` asks Watchmode and TMDB for 7 days only, then filters with `classifyWindow`.
2. `runPipeline()` applies `classifyWindow` again before anything reaches Gemini.
3. `getOrCreateDigest()` and `getDigestForPage()` never reuse a digest whose window is not 7 days.
4. `assertSevenDay()` runs in both `/api/digest` (cron) and `/api/send-now` immediately before sending, and fails closed.
5. The hits refresh drops anything `classifyWindow` assigns to the radar.

## Components map

Rendered as swimlanes at `/map`: **Radar flow**, **All Time Hits flow**, **Picker flow**. Columns are Actor, Trigger, Input, Context, Processing, AI, Output. Steps are numbered cards that staircase from top-left to bottom-right, Gemini Flash is its own row, Neon is the dashed bottom row, and the last card is Naman deciding.

**Radar flow**

| # | Actor | Column | What happens |
|---|---|---|---|
| 1 | Scheduler | Trigger | Friday 6:00pm IST (`30 12 * * 5`) |
| 2 | App route | Input | Bearer secret checked; already sent this ISO week? stop; Neon lock stops double runs |
| 3 | Releases API | Context | Watchmode (cached 6h) and TMDB discover, merged and de-duplicated, last 7 days |
| 4 | Releases API | Processing | `classifyWindow` keeps radar titles; language hard filter, genre soft filter |
| 5 | Gemini Flash | AI | One batch: verdict, score, reason, long reason; vague SKIP reasons retried |
| 6 | Telegram | Output | 7-day digest, split to 4096 chars, `assertSevenDay` fails closed |
| 7 | Naman | Output | Decides what to watch |

Neon: lock + 6h guard (step 2), reads the profile (step 4), writes releases (3), digests and verdicts (5), sends (6).

**All Time Hits flow**: visitor opens `/hits` → cached shelves served, a catalogue older than 24h refreshes in the background → TMDB discover (India, three platforms, hi/en/ta, 1000+ votes, 7.2+ rating) → `classifyWindow` keeps hits only, radar titles excluded → **one** batched Gemini call per refresh writes a one-line reason and match score per title → shelves.

**Picker flow**: user taps mood and filter chips → `/api/pick` clamps every field, allows 8 picks per minute per IP, caches identical requests 10 minutes → Neon `catalog` (24h) → TMDB discover if under 15 candidates → hard filters in code (genre only ranks), relaxation ladder genre, then time, then freshness (never platform, language or format) → Gemini picks one title and a Plan B → verdict card; Pick again, send to Telegram, or watch.

## The Skip Graveyard

Each skipped title is a tombstone card. Hover (desktop), tap, or focus it and the card widens to its case file: the reason it was skipped, what it missed (language, genre overlap, mood), a score bar against the 70 threshold, runtime, synopsis, release date and a "Watch anyway?" link. Nothing is fetched on hover: `reason_long` and `missed_signals` are produced in the one digest-time Gemini batch and stored in `verdicts`. Every SKIP reason must be at least 40 characters and mention something concrete about the title; otherwise that batch is retried once with a stricter instruction, and anything still vague gets a factual reason built from the title's own data. On phones the card expands as an accordion (one open at a time); keyboard users get it on focus and Enter/Space; `prefers-reduced-motion` makes it instant.

## The data-source trap

IMDb and TMDB release dates are global (theatrical or first-air). They say nothing about when a title reached an Indian OTT catalogue, and "trending" lists say nothing about what is new. This build avoids both:

1. **Watchmode `/releases` with `regions=IN`** is the primary source, cached in Neon for 6 hours (one live call per 6h; remaining quota is logged on every live call).
2. Source ids for the three platforms are **discovered from `/sources`**, never hardcoded. Provider ids for TMDB are discovered from `/watch/providers`. JioHotstar (formerly Disney+ Hotstar) is matched by name.
3. Each Watchmode candidate is **verified against TMDB's India watch providers**. If TMDB has India data and the platform is not in it, the title is dropped.
4. **Both sources are merged and de-duplicated** every run, so a Watchmode outage or exhausted quota cannot shrink the Radar. If a live Watchmode call fails, the last cached payload is used and the label says so. Dates that came from TMDB discover are marked approximate on the card ("~3 days ago").
5. Watchmode has little or nothing for JioHotstar in India, so JioHotstar comes mostly from TMDB, and the tab says so honestly.

## Why language is a hard filter and genre is soft

A Telugu or Korean title is unwatchable for him, so language is a yes/no gate (`hi`, `en`, `ta`). Genre is fuzzy: "indie drama" is not a TMDB genre, and the best thing he sees this week may be tagged Crime or Mystery. So any overlap with thriller / sci-fi / drama, plus adjacent crime and mystery, passes. Code never decides "taste match". Gemini does, using the profile and taste notes from the database. A few language-passing titles outside his genres are offered to Gemini as candidates for **Gemini's dare**; the dare always comes from the 7-day radar set.

## Why Neon

One place for profile, history, caches and the send log. The pipeline reads the profile from the `preferences` row, so editing it changes his taste. A lock table prevents two requests generating a digest at once (this fixed a double-write bug that made duplicate digest rows), `api_cache` holds the 6h Watchmode cache, `catalog` is the 24h TMDB cache with Gemini reasons for Hits and the picker, and `sends` makes the cron idempotent (one cron send per ISO week) and rate-limits manual sends (1 per 60s). If Neon is unreachable the pipeline still runs and sends, and the page says "storage unavailable".

## Why the picker and Hits search the full catalogue

The Radar answers "what is new?". The picker and Hits answer "what should I watch tonight?", and on a bad Friday the best answer landed years ago. Restricting them to a week of releases would leave a handful of titles and make most filter combinations empty. They search everything streaming in India on the three platforms and cache it in Neon.

## Assumptions

- **taste_notes** are my own: slow-burn morally ambiguous thrillers, grounded idea-driven sci-fi, restrained indie drama; dislikes formulaic action, jump-scare horror, padded series, loud rom-coms. Edit the `preferences` row to change them.
- **JioHotstar** is the current name of Disney+ Hotstar in India.
- The Radar's "N new this week" counts every title that arrived in the last 7 days on the three platforms; the page and digest judge the ones that pass the language and genre filters.
- On All Time Hits, a Hindi or Tamil title that also fits one of his genres lands on that genre shelf (his genres win), and shelves with fewer than 3 titles are hidden. Few Hindi or Tamil titles clear 1000 votes and a 7.2 rating on these platforms, so those shelves are often hidden.
- Series length: the picker uses first-season length; the weekend plan uses the season's episode count x per-episode runtime.

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
npm run db:setup             # creates every table (re-runnable) and seeds preferences once
npm run dev
```

Other scripts: `npm test` (the `classifyWindow` tests), `npm run verify:radar` (fails if a title repeats across Radar sections, is older than 7 days, or a SKIP reason is vague), `npm run backfill:skips` (one batched Gemini call to give old SKIP rows specific reasons), `npm run cleanup:digests` (keeps the newest digest per day, never deletes one with a send logged).

**Cron:** `vercel.json` schedules `GET /api/digest` at `30 12 * * 5` (UTC, which is Friday 6:00pm IST). Vercel adds `Authorization: Bearer $CRON_SECRET`; the route returns 401 without it and skips the send if a cron digest was already sent this ISO week.

Routes: `/` Radar (`?platform=` tabs), `/hits`, `/pick` (prefill with `?genre=&platform=&format=`), `/history`, `/map`, `/api/preview` (JSON, sends nothing), `/api/digest` (cron), `/api/send-now` (manual, 1 per 60s), `/api/pick`.
