import assert from "node:assert/strict";
import { test } from "node:test";
import { ageDays, classifyWindow, dashboardFor, partition, RADAR_DAYS } from "../src/lib/window";

// 2026-10-12 12:00 IST
const NOW = new Date("2026-10-12T06:30:00Z");
const daysAgo = (n: number) => new Date(Date.UTC(2026, 9, 12 - n)).toISOString().slice(0, 10);

test("age <= 7 days is radar, older is hits", () => {
  assert.equal(RADAR_DAYS, 7);
  assert.equal(classifyWindow(daysAgo(0), NOW), "radar");
  assert.equal(classifyWindow(daysAgo(7), NOW), "radar");
  assert.equal(classifyWindow(daysAgo(8), NOW), "hits");
  assert.equal(classifyWindow(daysAgo(400), NOW), "hits");
  assert.equal(classifyWindow(daysAgo(-3), NOW), "radar"); // announced for the future
  assert.equal(classifyWindow("not a date", NOW), "hits");
  assert.equal(ageDays(daysAgo(5), NOW), 5);
});

test("every title is in exactly one dashboard (partition is disjoint and complete)", () => {
  const titles = Array.from({ length: 800 }, (_, i) => ({ id: i, date: daysAgo(i - 20) }));
  const { radar, hits } = partition(titles, (t) => t.date, NOW);
  const r = new Set(radar.map((t) => t.id));
  const h = new Set(hits.map((t) => t.id));
  assert.equal(r.size + h.size, titles.length);
  for (const id of r) assert.ok(!h.has(id), `title ${id} is in both dashboards`);
  assert.ok(radar.every((t) => classifyWindow(t.date, NOW) === "radar"));
  assert.ok(hits.every((t) => classifyWindow(t.date, NOW) === "hits"));
});

test("a title in the radar set is never assigned to hits, even with an old TMDB date", () => {
  const radarKeys = new Set(["movie:1"]);
  assert.equal(dashboardFor(daysAgo(900), "movie:1", radarKeys, NOW), "radar");
  assert.equal(dashboardFor(daysAgo(900), "movie:2", radarKeys, NOW), "hits");
  const catalog = [{ key: "movie:1", date: daysAgo(900) }, { key: "movie:2", date: daysAgo(900) }, { key: "tv:3", date: daysAgo(2) }];
  const hits = catalog.filter((c) => dashboardFor(c.date, c.key, radarKeys, NOW) === "hits").map((c) => c.key);
  const radar = catalog.filter((c) => dashboardFor(c.date, c.key, radarKeys, NOW) === "radar").map((c) => c.key);
  assert.deepEqual(hits, ["movie:2"]);
  assert.deepEqual(radar.sort(), ["movie:1", "tv:3"]);
  assert.equal(hits.filter((k) => radar.includes(k)).length, 0);
});
