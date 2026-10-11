import { q, safe } from "@/lib/db";
import { cacheKey, clampRequest, ipHash, runPick, type PickResponse } from "@/lib/picker";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PER_MINUTE = 8;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Send a JSON body." }, { status: 400 });
  }
  const r = clampRequest(body);
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const hash = ipHash(ip);
  const t0 = Date.now();

  // max 8 picks per minute per IP hash, counted in Neon
  const recent = await safe(() => q<{ n: number; oldest: number }>(`SELECT count(*)::int AS n, COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at)))::int, 0) AS oldest FROM picks WHERE ip_hash=$1 AND created_at > now() - interval '60 seconds'`, [hash]));
  if (recent && recent[0].n >= PER_MINUTE) {
    const wait = Math.max(1, 60 - recent[0].oldest);
    return Response.json({ ok: false, error: `Easy there. ${PER_MINUTE} picks a minute is the limit. Try again in ${wait}s.`, retryAfter: wait }, { status: 429, headers: { "retry-after": String(wait) } });
  }

  // identical request (same filters + mood) within 10 minutes: serve the cached answer, no TMDB or Gemini calls
  const key = cacheKey(r);
  const hit = await safe(() => q<{ response: PickResponse }>(`SELECT response FROM pick_cache WHERE key=$1 AND created_at > now() - interval '10 minutes'`, [key]));
  let result: PickResponse;
  let cached = false;
  if (hit?.[0]) {
    result = hit[0].response;
    cached = true;
  } else {
    try {
      result = await runPick(r);
    } catch (e) {
      return Response.json({ ok: false, error: `The picker tripped: ${(e as Error).message}` }, { status: 500 });
    }
    if (!result.empty && !result.aiFallback) {
      await safe(() => q(`INSERT INTO pick_cache (key, response) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET response=EXCLUDED.response, created_at=now()`, [key, JSON.stringify(result)]));
    }
  }

  const row = await safe(() =>
    q<{ id: number }>(
      `INSERT INTO picks (filters, ip_hash, candidate_count, pick_id, plan_b_id, relaxed, gemini_model, latency_ms, result) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [JSON.stringify({ ...r, cached }), hash, result.candidateCount, result.pick?.key ?? null, result.planB?.key ?? null, result.relaxed, result.model, Date.now() - t0, JSON.stringify(result)],
    ),
  );
  return Response.json({ ok: true, cached, pickId: row?.[0]?.id ?? null, ...result });
}
