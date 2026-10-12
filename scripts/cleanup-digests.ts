import { q } from "../src/lib/db";

// Keep the newest digest per IST day. Never delete a digest that has a send logged against it.
(async () => {
  const before = await q<{ n: number }>(`SELECT count(*)::int AS n FROM digests`);
  const del = await q<{ id: number }>(
    `DELETE FROM digests d
     WHERE NOT EXISTS (SELECT 1 FROM sends s WHERE s.digest_id = d.id)
       AND EXISTS (SELECT 1 FROM digests n
                   WHERE (n.created_at AT TIME ZONE 'Asia/Kolkata')::date = (d.created_at AT TIME ZONE 'Asia/Kolkata')::date
                     AND (n.created_at > d.created_at OR (n.created_at = d.created_at AND n.id > d.id)))
     RETURNING d.id`,
  );
  const after = await q<{ n: number }>(`SELECT count(*)::int AS n FROM digests`);
  console.log(`digests before=${before[0].n} deleted=${del.map((r) => r.id).join(",") || "none"} after=${after[0].n}`);
  const rows = await q(`SELECT id, created_at, window_days, (SELECT count(*) FROM sends s WHERE s.digest_id=digests.id)::int AS sends FROM digests ORDER BY id`);
  for (const r of rows) console.log(" ", r.id, new Date(r.created_at).toISOString(), `${r.window_days}d`, `sends=${r.sends}`);
})();
