import type { DigestView, Entry } from "./types";
import { fmtDate, fmtTimeIST, weekday } from "./week";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function dur(min: number | null) {
  if (!min) return "runtime n/a";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
export function length(e: Pick<Entry, "mediaType" | "runtime" | "episodes">) {
  if (e.mediaType === "movie") return dur(e.runtime);
  const eps = e.episodes ? `${e.episodes} ep${e.episodes === 1 ? "" : "s"}` : "episodes n/a";
  return e.runtime ? `${eps} x ${e.runtime}m` : eps;
}
export function totalMinutes(e: Entry) {
  if (!e.runtime) return 0;
  return e.mediaType === "movie" ? e.runtime : e.runtime * (e.episodes ?? 1);
}

function genres(e: Entry) {
  return e.genres.length ? e.genres.slice(0, 3).join(" / ") : "genre n/a";
}

function syn(e: Entry) {
  return `<i>${esc(e.synopsis[0])}</i>\n<i>${esc(e.synopsis[1])}</i>`;
}

function card(e: Entry, icon: string, verdictLine: string) {
  return [
    `${icon} <b>${esc(e.title)}</b> — ${esc(e.platforms.join(" + "))}`,
    `${esc(genres(e))} · ${esc(length(e))}`,
    syn(e),
    verdictLine,
  ].join("\n");
}

/** Greedy plan: movies in one sitting, series episode by episode, across Tonight/Saturday/Sunday. */
export function plan(watch: Entry[]) {
  const slots = [
    { name: "Tonight", cap: 150, used: 0, items: [] as string[] },
    { name: "Saturday", cap: 240, used: 0, items: [] as string[] },
    { name: "Sunday", cap: 180, used: 0, items: [] as string[] },
  ];
  const leftover: string[] = [];
  for (const e of watch) {
    if (!e.runtime) { leftover.push(`${e.title} (runtime unknown)`); continue; }
    if (e.mediaType === "movie") {
      const s = slots.find((x) => x.used + e.runtime! <= x.cap);
      if (s) { s.used += e.runtime; s.items.push(`${e.title} (${dur(e.runtime)})`); } else leftover.push(e.title);
    } else {
      let left = e.episodes ?? 1;
      let ep = 1;
      for (const s of slots) {
        const fit = Math.min(left, Math.floor((s.cap - s.used) / e.runtime));
        if (fit > 0) {
          s.used += fit * e.runtime;
          s.items.push(`${e.title} ep ${ep}${fit > 1 ? `-${ep + fit - 1}` : ""} (${dur(fit * e.runtime)})`);
          ep += fit; left -= fit;
        }
        if (left <= 0) break;
      }
      if (left > 0) leftover.push(`${e.title} ep ${ep}-${e.episodes ?? ep} (next week's problem)`);
    }
  }
  return { slots, leftover };
}

export function buildBlocks(v: Omit<DigestView, "text" | "id" | "storage">, now = new Date()): string[] {
  const blocks: string[] = [];
  const worth = v.counts.watch + (v.dare ? 1 : 0);
  blocks.push(
    [
      `🎟 <b>━━━━━ ADMIT ONE ━━━━━</b>`,
      `<b>${weekday(now)}, ${fmtDate(now).toUpperCase()}</b>`,
      `<code>${v.counts.fetched} new in India · ${worth} worth your time</code>`,
      `<i>The Friday Projectionist presents tonight's programme.</i>`,
      ...(v.windowDays > 7 ? [`<i>House lights stayed on: this week was quiet, so I looked back ${v.windowDays} days.</i>`] : []),
    ].join("\n"),
  );

  if (v.quiet) {
    blocks.push(
      `🌙 <b>QUIET WEEK</b>\nNothing that clears your filters landed on Netflix, Prime Video or JioHotstar in India. The projector rests. Go outside, or rewatch something you already know is good.`,
    );
    blocks.push(footer(v));
    return blocks;
  }

  const watch = v.entries.filter((e) => e.verdict === "WATCH");
  const skip = v.entries.filter((e) => e.verdict === "SKIP");
  const unjudged = v.entries.filter((e) => e.verdict === "UNAVAILABLE");
  const pick = watch.find((e) => e.isPick);

  if (pick) {
    blocks.push(
      `⭐ <b>TONIGHT'S PICK</b>\n` +
        card(pick, "🎬", `✅ <b>WATCH ${pick.score}/100</b> · ${esc(pick.mood)}\n${esc(pick.reason)}`),
    );
  } else if (!unjudged.length) {
    blocks.push(`⭐ <b>TONIGHT'S PICK</b>\nNothing clears the bar tonight. I checked ${v.entries.length} titles. The bar is a feature.`);
  }

  const lineup = watch.filter((e) => !e.isPick);
  if (lineup.length) {
    blocks.push(`🍿 <b>THE WEEKEND LINEUP</b>`);
    for (const e of lineup) blocks.push(card(e, "▸", `✅ <b>WATCH ${e.score}/100</b> · ${esc(e.mood)}\n${esc(e.reason)}`));
  }

  if (v.dare) {
    blocks.push(
      `🎲 <b>GEMINI'S DARE</b> <i>(outside your usual genres, on purpose)</i>\n` +
        card(v.dare, "🎲", `✅ <b>WATCH ${v.dare.score}/100</b> · ${esc(v.dare.mood)}\n${esc(v.dare.reason)}`),
    );
  }

  if (unjudged.length) {
    blocks.push(`❔ <b>UNJUDGED</b> <i>(AI verdict unavailable)</i>`);
    for (const e of unjudged) blocks.push(card(e, "❔", `<b>AI verdict unavailable</b>`));
  }

  if (skip.length) {
    blocks.push(`🪦 <b>SKIP GRAVEYARD</b>`);
    for (const e of skip) blocks.push(card(e, "🪦", `✖ <b>SKIP ${e.score}/100</b> — ${esc(e.reason)}`));
  }

  const picks = [...watch, ...(v.dare ? [v.dare] : [])];
  if (picks.length) {
    const total = picks.reduce((n, e) => n + totalMinutes(e), 0);
    const p = plan(picks);
    const lines = p.slots.filter((s) => s.items.length).map((s) => `<b>${s.name}:</b> ${esc(s.items.join(" · "))}`);
    if (p.leftover.length) lines.push(`<b>Overflow:</b> ${esc(p.leftover.join(" · "))}`);
    blocks.push(`⏱ <b>TIME BUDGET</b>\nEverything marked WATCH: ${dur(total)} in total.\n${lines.join("\n")}`);
  }

  blocks.push(footer(v));
  return blocks;
}

function footer(v: Pick<DigestView, "sourceLabel" | "windowDays" | "createdAt">) {
  return `<i>Data: ${esc(v.sourceLabel)} · window ${v.windowDays} days · fetched ${fmtTimeIST(new Date(v.createdAt))}</i>`;
}

/** Pack blocks into Telegram messages under the 4096 char limit. */
export function pack(text: string, limit = 3800): string[] {
  const out: string[] = [];
  let cur = "";
  const push = (s: string) => {
    if (cur && cur.length + s.length + 2 > limit) { out.push(cur); cur = s; } else cur = cur ? cur + "\n\n" + s : s;
  };
  for (const block of text.split("\n\n")) {
    if (block.length <= limit) push(block);
    else for (const line of block.split("\n")) push(line.slice(0, limit));
  }
  if (cur) out.push(cur);
  return out;
}
