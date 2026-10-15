import { after } from "next/server";
import HitsBoard from "@/components/HitsBoard";
import Nav from "@/components/Nav";
import { safe } from "@/lib/db";
import { assignShelves, loadHits, refreshHits } from "@/lib/hits";
import { fmtTimeIST } from "@/lib/week";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata = {
  title: "All Time Hits streaming in India",
  description: "Older than a week, still worth your Friday. Proven hits on Netflix, Prime Video and JioHotstar in India, picked for your taste.",
};

export default async function HitsPage({ searchParams }: { searchParams: Promise<{ platform?: string }> }) {
  const { platform } = await searchParams;
  let data = await safe(loadHits);
  // Cached data is served as is. Only a missing or stale (>24h) catalog triggers a refresh (one Gemini batch), and a stale one refreshes in the background.
  if (!data || data.hits.length < 12) {
    await safe(() => refreshHits());
    data = await safe(loadHits);
  } else if (data.stale) {
    after(() => refreshHits().then(() => undefined, (e) => console.error("hits refresh failed:", e.message)));
  }
  const hits = data?.hits ?? [];
  const { shelves } = assignShelves(hits);

  return (
    <>
      <Nav solid />
      <main className="wrap wide">
        <h1>All Time Hits</h1>
        <p className="psub">Older than a week, still worth your Friday.</p>
        {!data && <div className="banner warn">Storage is unavailable, so the hits shelves can&apos;t load right now.</div>}
        {data && hits.length === 0 && <div className="banner">The hits catalog is still warming up. Reload in a minute.</div>}
        {hits.length > 0 && (
          <HitsBoard
            hits={hits}
            shelves={shelves.map((s) => ({ name: s.name, keys: s.items.map((h) => h.key) }))}
            refreshedAt={data?.refreshedAt ? fmtTimeIST(data.refreshedAt) : null}
            initialPlatform={platform}
          />
        )}
      </main>
    </>
  );
}
