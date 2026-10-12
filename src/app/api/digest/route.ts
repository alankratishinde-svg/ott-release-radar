import { isCron } from "@/lib/auth";
import { q, safe } from "@/lib/db";
import { assertSevenDay, getOrCreateDigest } from "@/lib/pipeline";
import { sendText } from "@/lib/telegram";
import { isoWeek } from "@/lib/week";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(req: Request) {
  if (!isCron(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const week = isoWeek().label;

  // Idempotency: Vercel can fire a cron twice. One cron send per ISO week.
  const done = await safe(() => q(`SELECT id, sent_at FROM sends WHERE trigger='cron' AND status='sent' AND iso_week=$1 LIMIT 1`, [week]));
  if (done?.length) return Response.json({ skipped: true, reason: `cron digest already sent for ${week}`, sendId: done[0].id });

  try {
    const { view, cached } = await getOrCreateDigest();
    assertSevenDay(view); // Telegram is strictly the 7-day radar. Fails closed.
    const sent = await sendText(view.text, "cron", view.id);
    return Response.json({ skipped: false, week, cached, digestId: view.id, counts: view.counts, windowDays: view.windowDays, sent }, { status: sent.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
