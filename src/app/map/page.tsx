import Nav from "@/components/Nav";

const S = ({ n }: { n: number }) => <span className="step">{n}</span>;

export const metadata = { title: "Components map · OTT Release Radar" };

export default function MapPage() {
  return (
    <main className="wrap" style={{ maxWidth: 1180 }}>
      <Nav />
      <h1>Components map</h1>
      <p className="sub">One row per actor. Steps 1–8 run in flow order; step 8 is Naman deciding what to watch.</p>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Actor</th><th>Trigger</th><th>Input</th><th>Context</th><th>Processing</th><th>AI</th><th>Output</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><S n={1} />Scheduler (Vercel Cron)</td>
              <td>Fri 12:30 UTC = 6:00pm IST (<code>30 12 * * 5</code>)</td>
              <td>Time</td>
              <td><code>CRON_SECRET</code></td>
              <td>GET <code>/api/digest</code> with <code>Authorization: Bearer</code></td>
              <td>None</td>
              <td>HTTP call into the app route</td>
            </tr>
            <tr>
              <td><S n={2} /><S n={4} />App route (Next.js on Vercel)</td>
              <td>Cron call, or the manual “Send to Telegram now” button (<code>/api/send-now</code>, 1 per 60s)</td>
              <td>Bearer secret; cache + idempotency check in Neon</td>
              <td>Profile read from Neon; digest &lt;6h old is served from Neon without any API call</td>
              <td>Skip if a cron digest was already sent this ISO week → fetch → <b>filter</b> (language hard, genre soft, dedupe) → batch → format → split to ≤4096 chars</td>
              <td>None itself; orchestrates Gemini</td>
              <td>Digest row + verdict rows; Telegram text; page JSON</td>
            </tr>
            <tr>
              <td><S n={3} />Releases API (Watchmode / TMDB)</td>
              <td>Pipeline fetch step</td>
              <td>Region IN, last 7 days (21 if fewer than 5 titles survive the filter), source ids discovered from <code>/sources</code></td>
              <td>Watchmode release dates; TMDB for genres, language, runtime, episodes, overview, poster and India provider check</td>
              <td>Keep Netflix / Prime Video / JioHotstar; drop titles TMDB says are not on that platform in India; fall back to TMDB discover if Watchmode fails</td>
              <td>None</td>
              <td>Raw titles → upserted into <code>releases</code></td>
            </tr>
            <tr>
              <td><S n={5} />Gemini Flash</td>
              <td>One batched call after the filter</td>
              <td>All filtered titles + wildcard candidates for the dare</td>
              <td>Naman’s profile and taste notes (from Neon); only the provided overviews</td>
              <td>Structured JSON against a response schema; one retry if malformed or too generous</td>
              <td><b>Judges taste</b>: two-line synopsis, WATCH/SKIP, 0–100 score, reason, mood tag, one dare</td>
              <td>Verdicts → <code>verdicts</code></td>
            </tr>
            <tr>
              <td><S n={6} />Telegram Bot API</td>
              <td>Digest ready</td>
              <td>Formatted HTML text (“The Friday Projectionist”)</td>
              <td>Bot token + chat id</td>
              <td><code>sendMessage</code> with <code>parse_mode=HTML</code>, split to fit 4096</td>
              <td>None</td>
              <td>Message ids → <code>sends</code></td>
            </tr>
            <tr>
              <td><S n={7} />Neon Postgres (storage)</td>
              <td>Reads at the filter step; writes at fetch, Gemini and send</td>
              <td>Releases, digests, verdicts and sends written; profile read</td>
              <td><code>preferences</code>, <code>releases</code>, <code>digests</code>, <code>verdicts</code>, <code>sends</code></td>
              <td>Upsert on (source id, platform); 6h cache; per-week cron idempotency; 60s manual rate limit</td>
              <td>None</td>
              <td>Page <code>/</code> and <code>/history</code> read from here</td>
            </tr>
            <tr>
              <td><S n={8} />Naman (the human)</td>
              <td>Friday evening notification</td>
              <td>The Telegram digest (or the web page)</td>
              <td>His own mood and free time</td>
              <td>Reads the pick, lineup, dare, graveyard and time budget</td>
              <td>None</td>
              <td>Decides what to watch this weekend</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ marginTop: 18 }}>
        Neon row detail: the <b>profile is read at step 4 (filter)</b>; writes land at step 3 (<code>releases</code>), step 5 (<code>digests</code> + <code>verdicts</code>) and step 6 (<code>sends</code>).
      </p>
    </main>
  );
}
