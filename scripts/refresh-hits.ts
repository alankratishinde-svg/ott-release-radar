import { refreshHits, loadHits, assignShelves } from "../src/lib/hits";
(async () => {
  const r = await refreshHits();
  console.log("refresh:", JSON.stringify(r));
  const { hits, refreshedAt, stale } = await loadHits();
  const { shelves } = assignShelves(hits);
  console.log("hits:", hits.length, "refreshedAt:", refreshedAt?.toISOString(), "stale:", stale);
  for (const s of shelves) console.log(" ", s.name, s.items.length, s.items.slice(0, 4).map((h) => `${h.title}(${h.year},${h.platforms.join("/")})`).join(", "));
})();
