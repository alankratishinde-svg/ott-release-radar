import { q, safe } from "@/lib/db";
import { assertSevenDay, getOrCreateDigest } from "@/lib/pipeline";
import { pickToTelegram } from "@/lib/picker";
import { sendText } from "@/lib/telegram";
import { TITLE_KEY, titleMessage } from "@/lib/telegram-title";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Manual demo trigger. Max 1 manual send per 60s (enforced via the sends table). Only ever sends to the configured chat.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  // A body that names a pickId or titleKey but gets it wrong is rejected. It must never fall through to sending the digest.
  if (body && "pickId" in body && !Number.isInteger(body.pickId)) return Response.json({ ok: false, error: "pickId must be a number." }, { status: 400 });
  if (body && "titleKey" in body && !(typeof body.titleKey === "string" && TITLE_KEY.test(body.titleKey))) return Response.json({ ok: false, error: "titleKey must look like movie:123 or tv:123." }, { status: 400 });
  const pickId = body && Number.isInteger(body.pickId) ? (body.pickId as number) : null;
  const titleKey = body && typeof body.titleKey === "string" ? (body.titleKey as string) : null;
  const recent = await safe(() => q<{ s: number }>(`SELECT EXTRACT(EPOCH FROM (now() - max(sent_at)))::int AS s FROM sends WHERE trigger='manual' AND sent_at > now() - interval '60 seconds'`));
  if (recent?.[0]?.s != null) {
    const wait = Math.max(1, 60 - recent[0].s);
    return Response.json({ ok: false, error: `Rate limited: one manual send per 60s. Try again in ${wait}s.`, retryAfter: wait }, { status: 429, headers: { "retry-after": String(wait) } });
  }
  if (titleKey) {
    const text = await safe(() => titleMessage(titleKey));
    if (!text) return Response.json({ ok: false, error: "That title is no longer in this week's digest or the hits catalog." }, { status: 404 });
    const sent = await sendText(text, "manual", null);
    return Response.json({ ...sent, kind: "title" }, { status: sent.ok ? 200 : 502 });
  }
  if (pickId !== null) {
    // Send a stored picker result (looked up by id, never arbitrary client text)
    const row = await safe(() => q<{ result: any }>(`SELECT result FROM picks WHERE id=$1`, [pickId]));
    if (!row?.[0]?.result?.pick) return Response.json({ ok: false, error: "That pick no longer exists. Pick again." }, { status: 404 });
    const sent = await sendText(pickToTelegram(row[0].result), "manual", null);
    return Response.json({ ...sent, kind: "pick" }, { status: sent.ok ? 200 : 502 });
  }
  try {
    const { view, cached } = await getOrCreateDigest();
    assertSevenDay(view); // Telegram is strictly the 7-day radar. Fails closed.
    const sent = await sendText(view.text, "manual", view.id);
    return Response.json({ ...sent, cached, digestId: view.id }, { status: sent.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
