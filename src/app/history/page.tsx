import Nav from "@/components/Nav";
import { q, safe } from "@/lib/db";
import { fmtTimeIST } from "@/lib/week";

export const dynamic = "force-dynamic";
export const metadata = { title: "History", description: "Every digest the radar has produced, grouped by week, with the pick, the source and how many times it was sent." };

export default async function History() {
  const rows = await safe(() =>
    q<any>(
      `SELECT d.id, d.week_start::text AS week_start, d.window_days, d.data_source, d.fetched_count, d.filtered_count, d.watch_count, d.skip_count, d.created_at, d.meta,
              (SELECT entry->>'title' FROM verdicts v WHERE v.digest_id=d.id AND v.is_pick LIMIT 1) AS pick,
              (SELECT count(*)::int FROM sends s WHERE s.digest_id=d.id AND s.status='sent') AS sent
       FROM digests d ORDER BY d.created_at DESC, d.id DESC LIMIT 80`,
    ),
  );
  const weeks = new Map<string, any[]>();
  for (const r of rows ?? []) weeks.set(r.week_start, [...(weeks.get(r.week_start) ?? []), r]);
  return (
    <>
      <Nav solid />
      <main className="wrap">
        <h1>History</h1>
        <p className="sub">One row per digest, grouped by week, read from Neon.</p>
        {!rows && <div className="banner warn">Storage unavailable.</div>}
        {rows?.length === 0 && <p className="sub">No digests yet.</p>}
        {[...weeks.entries()].map(([week, list]) => (
          <section key={week} className="hweek" aria-label={`Week of ${week}`}>
            <h2 className="sec">Week of {week} <span className="sec-note">{list.length} {list.length === 1 ? "digest" : "digests"}</span></h2>
            {list.map((r) => {
              const legacy = r.window_days !== 7;
              return (
                <div className="row" key={r.id}>
                  <div>
                    <div className="hrow-top">
                      <span className={`chip-w ${legacy ? "legacy" : ""}`}>{legacy ? `legacy ${r.window_days}-day` : "7-day"}</span>
                      <span className="muted">{fmtTimeIST(new Date(r.created_at))}{r.meta?.quiet ? " · quiet week" : ""}</span>
                    </div>
                    <div className="hpick">{r.pick ? <>Pick: <b>{r.pick}</b></> : r.meta?.quiet ? "Quiet week" : "No pick"}</div>
                    <div className="muted">{r.data_source}</div>
                  </div>
                  <div className="hcounts">
                    {r.fetched_count} fetched · {r.filtered_count} filtered<br />
                    <span className="g">{r.watch_count} watch</span> · <span className="r">{r.skip_count} skip</span><br />
                    sent {r.sent}×
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </main>
    </>
  );
}
