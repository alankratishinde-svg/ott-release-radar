import Nav from "@/components/Nav";
import Swimlane, { type Actor } from "@/components/Swimlane";

export const metadata = { title: "Components map", description: "How OTT Release Radar works: the Radar, All Time Hits and Picker flows as swimlanes, with the storage layer underneath." };

const NEON: Actor = { name: "Neon Postgres", role: "remembers everything", icon: "🗄️", tone: "t-neon", dashed: true };
const A = {
  cron: { name: "Scheduler", role: "wakes the app", icon: "⏰", tone: "t-cron" },
  app: { name: "App route", role: "orchestrates", icon: "⚙️", tone: "t-app" },
  api: { name: "Releases API", role: "supplies titles", icon: "📡", tone: "t-api" },
  tmdb: { name: "TMDB", role: "supplies the catalogue", icon: "🎞️", tone: "t-api" },
  gem: { name: "Gemini Flash", role: "judges taste", icon: "✨", tone: "t-ai" },
  tg: { name: "Telegram Bot API", role: "delivers", icon: "✈️", tone: "t-tg" },
  me: { name: "Naman", role: "decides", icon: "🍿", tone: "t-human" },
  user: { name: "User", role: "asks", icon: "🙋", tone: "t-human" },
  visitor: { name: "Visitor", role: "browses", icon: "👀", tone: "t-human" },
} satisfies Record<string, Actor>;

export default function MapPage() {
  return (
    <>
      <Nav solid />
      <main className="wrap wide">
        <h1>Components map</h1>
        <p className="sub">One swimlane per flow. Every title belongs to exactly one dashboard, decided by one shared function: <code>classifyWindow</code>, which sends a title to the Radar if it was released in the last 7 days and to All Time Hits if not.</p>

        <section className="swl" aria-label="End-to-end components map">
          <h2>End-to-end map</h2>
          <p className="sub">The whole system in one picture. <a href="/components-map.png" download style={{ textDecoration: "underline" }}>Download the full-resolution PNG</a>.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/components-map-web.png" alt="OTT Release Radar components map: ten numbered steps from the Friday cron through Releases APIs, taste profile, Radar rules, Gemini Flash, Telegram, web dashboards and the picker to Naman deciding, with Neon underneath as the persistence layer" width={2000} height={2512} decoding="async" style={{ width: "100%", height: "auto", borderRadius: 12, border: "1px solid var(--line)" }} />
        </section>

        <Swimlane
          title="Radar flow (7 days only)"
          blurb="Friday 6:00pm IST. Nothing older than 7 days can enter, and Telegram refuses to send anything that is not a 7-day digest."
          actors={[A.cron, A.app, A.api, A.gem, A.tg, A.me]}
          steps={[
            { n: 1, actor: 0, col: 0, text: "Friday 6:00pm IST (cron 30 12 * * 5)" },
            { n: 2, actor: 1, col: 1, text: "Bearer secret checked. Already sent this ISO week? Stop. Neon lock stops double runs" },
            { n: 3, actor: 2, col: 2, text: "Watchmode (cached 6h) and TMDB discover, merged and de-duplicated, last 7 days" },
            { n: 4, actor: 2, col: 3, text: "classifyWindow keeps radar titles; language hard filter, genre soft filter" },
            { n: 5, actor: 3, col: 4, text: "One batch: verdict, score, reason, long reason. Vague SKIP reasons retried" },
            { n: 6, actor: 4, col: 5, text: "7-day digest sent, split to 4096 chars. assertSevenDay fails closed" },
            { n: 7, actor: 5, col: 5, text: "Naman decides what to watch" },
          ]}
          neon={{ actor: NEON, chips: [{ col: 1, text: "Lock + 6h guard: one digest per window" }, { col: 2, text: "Reads the profile at step 4" }, { col: 5, text: "Writes releases (3), digests and verdicts (5), sends (6)" }] }}
        />

        <Swimlane
          title="All Time Hits flow"
          blurb="Older than a week, still worth your Friday. One Gemini call per refresh, never per card."
          actors={[A.visitor, A.app, A.tmdb, A.gem, A.me]}
          steps={[
            { n: 1, actor: 0, col: 0, text: "Opens /hits" },
            { n: 2, actor: 1, col: 1, text: "Serves cached shelves. Catalogue older than 24h refreshes in the background" },
            { n: 3, actor: 2, col: 2, text: "Discover: India, Netflix / Prime / JioHotstar, hi / en / ta, 1000+ votes, 7.2+ rating" },
            { n: 4, actor: 2, col: 3, text: "classifyWindow keeps hits only; radar titles excluded; details for the top ~110" },
            { n: 5, actor: 3, col: 4, text: "ONE batched call: a one-line reason and a match score per title" },
            { n: 6, actor: 4, col: 5, text: "Shelves with unique titles. Hover, tap or focus a card; Use in picker" },
          ]}
          neon={{ actor: NEON, chips: [{ col: 1, text: "Reads catalog (24h TTL)" }, { col: 2, text: "Writes catalog rows" }, { col: 5, text: "Reasons and scores stored with each row" }] }}
        />

        <Swimlane
          title="Picker flow"
          blurb="The mood picker searches the full India catalogue, not just this week's releases. Free text is sent to Gemini only as quoted data."
          actors={[A.user, A.app, A.tmdb, A.gem, A.me]}
          steps={[
            { n: 1, actor: 0, col: 0, text: "Taps mood and filter chips, presses Pick for me" },
            { n: 2, actor: 1, col: 1, text: "POST /api/pick: fields clamped, 8 per minute per IP, identical request cached 10 min" },
            { n: 3, actor: 2, col: 2, text: "Fewer than 15 cached candidates: discover the India catalogue live" },
            { n: 4, actor: 2, col: 3, text: "Hard filters in code, genre only ranks. Nothing left? Relax genre, time, then freshness (never platform, language or format)" },
            { n: 5, actor: 3, col: 4, text: "Picks one title and a Plan B, writes the reason, scores the mood match" },
            { n: 6, actor: 4, col: 5, text: "Verdict card. Pick again, send to Telegram, or go and watch" },
          ]}
          neon={{ actor: NEON, chips: [{ col: 1, text: "picks log and rate limit; pick_cache 10 min" }, { col: 2, text: "catalog 24h TTL" }, { col: 5, text: "Writes the pick and the result" }] }}
        />
      </main>
    </>
  );
}
