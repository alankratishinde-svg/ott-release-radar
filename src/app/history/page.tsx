import Nav from "@/components/Nav";
import { q, safe } from "@/lib/db";
import { fmtTimeIST } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function History() {
  const rows = await safe(() =>
    q<any>(
      `SELECT d.id, d.week_start, d.window_days, d.data_source, d.fetched_count, d.filtered_count, d.watch_count, d.skip_count, d.created_at, d.meta,
              (SELECT entry->>'title' FROM verdicts v WHERE v.digest_id=d.id AND v.is_pick LIMIT 1) AS pick,
              (SELECT count(*)::int FROM sends s WHERE s.digest_id=d.id AND s.status='sent') AS sent
       FROM digests d ORDER BY d.created_at DESC LIMIT 50`,
    ),
  );
  return (
    <>
    <Nav solid />
    <main className="wrap">
      <h1>History</h1>
      <p className="sub">Every digest ever generated, read from Neon.</p>
      {!rows && <div className="banner warn">Storage unavailable.</div>}
      {rows?.length === 0 && <p className="sub">No digests yet.</p>}
      {rows?.map((r) => (
        <div className="row" key={r.id}>
          <div>
            <div className="mono" style={{ fontSize: 12, color: "var(--dim)" }}>Week of {String(r.week_start).slice(0, 10)} · {fmtTimeIST(new Date(r.created_at))} · {r.window_days}-day window{r.meta?.quiet ? " · quiet week" : ""}</div>
            <div style={{ fontSize: 20, marginTop: 4 }}>{r.pick ? <>Pick: <b>{r.pick}</b></> : r.meta?.quiet ? "Quiet week" : "No pick"}</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>{r.data_source}</div>
          </div>
          <div className="mono" style={{ fontSize: 12, textAlign: "right" }}>
            {r.fetched_count} fetched · {r.filtered_count} filtered<br />
            <span style={{ color: "var(--watch)" }}>{r.watch_count} watch</span> · <span style={{ color: "var(--skip)" }}>{r.skip_count} skip</span><br />
            sent {r.sent}×
          </div>
        </div>
      ))}
    </main>
    </>
  );
}
