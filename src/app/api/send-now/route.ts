import { q, safe } from "@/lib/db";
import { getOrCreateDigest } from "@/lib/pipeline";
import { sendText } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Manual demo trigger. Max 1 manual send per 60s (enforced via the sends table). Only ever sends to the configured chat.
export async function POST() {
  const recent = await safe(() => q<{ s: number }>(`SELECT EXTRACT(EPOCH FROM (now() - max(sent_at)))::int AS s FROM sends WHERE trigger='manual' AND sent_at > now() - interval '60 seconds'`));
  if (recent?.[0]?.s != null) {
    const wait = Math.max(1, 60 - recent[0].s);
    return Response.json({ ok: false, error: `Rate limited: one manual send per 60s. Try again in ${wait}s.`, retryAfter: wait }, { status: 429, headers: { "retry-after": String(wait) } });
  }
  try {
    const { view, cached } = await getOrCreateDigest();
    const sent = await sendText(view.text, "manual", view.id);
    return Response.json({ ...sent, cached, digestId: view.id }, { status: sent.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
