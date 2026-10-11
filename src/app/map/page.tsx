import Nav from "@/components/Nav";

const S = ({ n }: { n: number }) => <span className="step">{n}</span>;

export const metadata = { title: "Components map · OTT Release Radar" };

export default function MapPage() {
  return (
    <>
    <Nav solid />
    <main className="wrap" style={{ maxWidth: 1180 }}>
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
      <h2 style={{ marginTop: 56, fontSize: 28 }}>Picker flow</h2>
      <p className="sub">The &ldquo;Ugh, fine. Pick for me.&rdquo; page. It searches the full India catalogue, not just this week&apos;s releases.</p>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Actor</th><th>Trigger</th><th>Input</th><th>Context</th><th>Processing</th><th>AI</th><th>Output</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><S n={1} />User</td>
              <td>Opens <code>/pick</code>, taps mood and filter chips, presses the button</td>
              <td>Moods, optional free text (300 chars), genre, language, format, platform, time, company, hidden gems, freshness, exclude list</td>
              <td>Their mood right now</td>
              <td>Browser POSTs to <code>/api/pick</code></td>
              <td>None</td>
              <td>JSON request</td>
            </tr>
            <tr>
              <td><S n={2} /><code>/api/pick</code> route</td>
              <td>POST from the page</td>
              <td>Request body</td>
              <td>IP hash; identical request within 10 minutes</td>
              <td>Validate and clamp every field; allow 8 picks per minute per IP hash; serve a cached answer when the same filters and mood repeat</td>
              <td>None</td>
              <td>Candidate search, or a cached result</td>
            </tr>
            <tr>
              <td><S n={3} />Neon cache</td>
              <td>First lookup, and every write-back</td>
              <td>Platform, language, format</td>
              <td><code>catalog</code> (24h TTL), <code>pick_cache</code> (10 min), <code>picks</code> (log and rate limit)</td>
              <td>Hard filters in code: platform, language, format, time, company, exclude, hidden gems. Genre is only ranking. Fewer than 15 candidates triggers a live fetch</td>
              <td>None</td>
              <td>Candidates, or a request to TMDB</td>
            </tr>
            <tr>
              <td><S n={4} />TMDB</td>
              <td>Fewer than 15 cached candidates</td>
              <td><code>discover</code> with <code>watch_region=IN</code>, provider ids, language, genre steering, vote floor, two pages</td>
              <td>Provider ids for Netflix, Prime Video, JioHotstar</td>
              <td>Details for the top ~30: runtime, episodes, seasons, rating, certificate. Upsert into <code>catalog</code>. If nothing matches, relax genre, then time, then freshness. Platform, language and format are never relaxed</td>
              <td>None</td>
              <td>Ranked top 25 candidates, plus a list of what was relaxed</td>
            </tr>
            <tr>
              <td><S n={5} />Gemini Flash</td>
              <td>One call per uncached pick</td>
              <td>The 25 candidates, mood and filters. Free text is passed as quoted data, never as instructions</td>
              <td>Overviews only</td>
              <td>Structured JSON, validated against the candidate ids; one retry, then the top-ranked candidate labelled &ldquo;AI unavailable&rdquo;</td>
              <td><b>Picks one title and a Plan B</b>, writes the sassy reason, scores the mood match</td>
              <td>Pick, Plan B, reasons, mood-match %</td>
            </tr>
            <tr>
              <td><S n={6} />Result card</td>
              <td>Response arrives</td>
              <td>Pick, Plan B, any relaxed filters</td>
              <td>Row stored in <code>picks</code></td>
              <td>Shows the ticket with a &ldquo;Tonight&apos;s verdict&rdquo; stamp, a banner when filters were relaxed, and a Plan B card</td>
              <td>None</td>
              <td>What to watch, on screen</td>
            </tr>
            <tr>
              <td><S n={7} />User (decides)</td>
              <td>Reads the card</td>
              <td>The verdict</td>
              <td>Whether it feels right</td>
              <td>Presses <b>Pick again</b> (exclude list grows, nothing repeats), <b>Send to Telegram</b> (shares the 60s limit with the digest), or goes and watches</td>
              <td>None</td>
              <td>A decision</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ marginTop: 18 }}>
        Neon row detail: the <b>profile is read at step 4 (filter)</b>; writes land at step 3 (<code>releases</code>), step 5 (<code>digests</code> + <code>verdicts</code>) and step 6 (<code>sends</code>).
      </p>
    </main>
    </>
  );
}
