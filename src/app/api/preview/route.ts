import { isCron } from "@/lib/auth";
import { getOrCreateDigest } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Runs (or serves the <6h cached) pipeline and returns JSON. Sends nothing.
// ?fresh=1 forces a re-run, but only with the cron secret (protects free-tier API limits).
export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1" && isCron(req);
  try {
    const { view, cached } = await getOrCreateDigest({ fresh });
    const { text, ...rest } = view;
    return Response.json({ cached, ...rest, telegramText: text });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
