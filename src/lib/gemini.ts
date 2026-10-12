import type { Prefs, Title } from "./types";

const API = "https://generativelanguage.googleapis.com/v1beta";

export interface Verdict {
  id: number;
  synopsis_line_1: string;
  synopsis_line_2: string;
  verdict: "WATCH" | "SKIP";
  match_score: number;
  reason: string;
  reason_long: string;
  missed: string[];
  mood_tag: string;
}
export interface GeminiResult {
  verdicts: Map<number, Verdict>;
  dareId: number | null;
  model: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Newest plain Flash model from ListModels (no hardcoded name). */
export async function newestFlash(): Promise<string> {
  const r = await fetch(`${API}/models?pageSize=200&key=${process.env.GEMINI_API_KEY}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`gemini ListModels ${r.status}`);
  const d = await r.json();
  let best: { name: string; v: number } | null = null;
  for (const m of d.models ?? []) {
    const mm = /^models\/(gemini-(\d+(?:\.\d+)?)-flash)$/.exec(m.name);
    if (!mm || !(m.supportedGenerationMethods ?? []).includes("generateContent")) continue;
    const v = parseFloat(mm[2]);
    if (!best || v > best.v) best = { name: mm[1], v };
  }
  return best?.name ?? "gemini-flash-latest";
}

const SYSTEM = `You are "The Friday Projectionist": a friend who has seen everything and hates wasting his Friday night. Dry, specific, confident, a little theatrical. Never corporate, never "here are your recommendations".

You judge new streaming releases in India for one viewer, using ONLY the profile and the title data you are given.

Rules:
- Synopses (synopsis_line_1, synopsis_line_2) must come ONLY from the "overview" text provided. Two short lines. If the overview is empty, write exactly "no synopsis available" for line 1 and a short in-character shrug for line 2. NEVER invent plot, cast, or facts.
- verdict is "WATCH" only if match_score >= 70, otherwise "SKIP". Be picky: if more than ~60% of the main titles are WATCH you have failed the job. A typical week has maybe 2-4 real picks.
- reason: ONE line (at least 40 characters). For WATCH, say why it fits THIS viewer's profile (genres, taste notes). For SKIP, be specific and a little savage, never generic ("not his taste" is banned). It MUST name something concrete about THAT title: its episode count or runtime, a plot element from the overview, or its genre mix. It is shown as the title's epitaph.
- reason_long: 2 to 3 sentences expanding the verdict with specifics from the title data and the viewer's profile. Savage about the TITLE, never mean about the viewer.
- missed: 1 to 3 short phrases (max 8 words each) naming what the title missed or hit against his profile, e.g. "padded to eight episodes", "no grounded sci-fi ideas".
- mood_tag: 2-3 words, e.g. "slow-burn dread", "cerebral sci-fi", "comfort noise".
- Titles with outside_profile=true are outside his stated genres. They are ONLY candidates for "Gemini's dare". Give them a verdict like any title, but choose dare_id from among them: the one he would plausibly love anyway. If none is plausible, set dare_id to -1.
- Return a verdict object for EVERY id you were given.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    verdicts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "INTEGER" },
          synopsis_line_1: { type: "STRING" },
          synopsis_line_2: { type: "STRING" },
          verdict: { type: "STRING", enum: ["WATCH", "SKIP"] },
          match_score: { type: "INTEGER" },
          reason: { type: "STRING" },
          reason_long: { type: "STRING" },
          missed: { type: "ARRAY", items: { type: "STRING" } },
          mood_tag: { type: "STRING" },
        },
        required: ["id", "synopsis_line_1", "synopsis_line_2", "verdict", "match_score", "reason", "reason_long", "missed", "mood_tag"],
      },
    },
    dare_id: { type: "INTEGER" },
  },
  required: ["verdicts", "dare_id"],
};

export async function geminiGenerate(model: string, system: string, user: string, schema: unknown = SCHEMA, temperature = 0.8): Promise<string> {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature, maxOutputTokens: 20000 },
  };
  let lastErr = "";
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${API}/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (r.ok) {
      const d = await r.json();
      const text = (d.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("");
      if (text) return text;
      lastErr = "empty response";
    } else {
      lastErr = `${r.status}`;
      if (r.status === 404 || r.status === 400) throw Object.assign(new Error(`model rejected (${r.status})`), { modelRejected: true });
      if (r.status !== 429 && r.status < 500) break;
    }
    await sleep(1500 * 2 ** i);
  }
  throw new Error("gemini request failed: " + lastErr);
}

function validate(raw: string, ids: Set<number>): { verdicts: Map<number, Verdict>; dareId: number | null } {
  const j = JSON.parse(raw);
  if (!Array.isArray(j.verdicts)) throw new Error("no verdicts array");
  const out = new Map<number, Verdict>();
  for (const v of j.verdicts) {
    if (!ids.has(v?.id) || typeof v.reason !== "string" || typeof v.synopsis_line_1 !== "string") continue;
    const score = Math.max(0, Math.min(100, Math.round(Number(v.match_score))));
    if (Number.isNaN(score)) continue;
    out.set(v.id, {
      id: v.id,
      synopsis_line_1: v.synopsis_line_1.trim(),
      synopsis_line_2: String(v.synopsis_line_2 ?? "").trim(),
      verdict: score >= 70 ? "WATCH" : "SKIP",
      match_score: score,
      reason: v.reason.trim(),
      reason_long: String(v.reason_long ?? "").trim(),
      missed: Array.isArray(v.missed) ? v.missed.map((m: unknown) => String(m).trim()).filter(Boolean).slice(0, 3) : [],
      mood_tag: String(v.mood_tag ?? "").trim(),
    });
  }
  if (out.size < Math.ceil(ids.size * 0.5)) throw new Error(`only ${out.size}/${ids.size} verdicts valid`);
  return { verdicts: out, dareId: Number.isInteger(j.dare_id) ? j.dare_id : null };
}

const NUMBER_WORDS = new Set("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(" "));
const words = (x: string) => new Set(x.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);

/** A reason is concrete if it is long enough and shares a real word with the title data, or cites a number. */
export function isConcrete(reason: string, t: Title): boolean {
  if (reason.trim().length < 40) return false;
  const known = new Set([...words(t.title), ...words(t.overview), ...words(t.genres.join(" "))]);
  const ws = [...(reason.toLowerCase().match(/[a-z0-9]+/g) ?? [])];
  return ws.some((w) => (w.length >= 4 && known.has(w)) || /\d/.test(w) || NUMBER_WORDS.has(w));
}

function weakSkips(res: { verdicts: Map<number, Verdict> }, all: Title[]): number[] {
  return [...res.verdicts.values()].filter((v) => v.verdict === "SKIP" && (!isConcrete(v.reason, all[v.id]) || v.reason_long.length < 80)).map((v) => v.id);
}

/** Honest fallback built only from the title's own data when Gemini still gives a vague reason. */
export function factualSkip(t: Title, score: number): { reason: string; reason_long: string } {
  const len = t.mediaType === "tv" ? `${t.episodes ?? "?"} episodes${t.runtime ? ` of ${t.runtime}m` : ""}` : t.runtime ? `${t.runtime} minutes` : "an unlisted runtime";
  const g = t.genres.slice(0, 3).join("/") || "unlisted genres";
  return {
    reason: `${g} at ${len}, and nothing in the overview signals the grounded, idea-driven material he likes.`,
    reason_long: `It scored ${score}/100. The listing gives ${g} at ${len}. The overview does not point to a slow-burn thriller, grounded sci-fi or restrained indie drama, so it loses to the week's better matches.`,
  };
}

/** ONE batched call for all titles. Retries once (stricter) on malformed output, an over-generous batch, or vague SKIP reasons. */
export async function judge(main: Title[], wildcards: Title[], prefs: Prefs): Promise<GeminiResult | null> {
  const all = [...main, ...wildcards];
  const payload = {
    profile: { genres: prefs.genres, languages: prefs.languages, platforms: prefs.platforms, taste_notes: prefs.taste_notes },
    titles: all.map((t, i) => ({
      id: i,
      title: t.title,
      platforms: t.platforms,
      type: t.mediaType === "tv" ? "series" : "movie",
      genres: t.genres,
      original_language: t.language,
      runtime_minutes: t.runtime,
      episodes: t.episodes,
      overview: t.overview || "",
      outside_profile: i >= main.length,
    })),
  };
  const ids = new Set(all.map((_, i) => i));
  let model = await newestFlash();
  let strict = "";
  let last: { verdicts: Map<number, Verdict>; dareId: number | null } | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let raw: string;
      try {
        raw = await geminiGenerate(model, SYSTEM + strict, JSON.stringify(payload), SCHEMA, 0.5);
      } catch (e: any) {
        if (!e.modelRejected) throw e;
        model = await newestFlash(); // model name rejected: re-list and retry
        raw = await geminiGenerate(model, SYSTEM + strict, JSON.stringify(payload), SCHEMA, 0.5);
      }
      const res = validate(raw, ids);
      last = res;
      const mainVerdicts = [...res.verdicts.values()].filter((v) => v.id < main.length);
      const share = mainVerdicts.filter((v) => v.verdict === "WATCH").length / Math.max(1, mainVerdicts.length);
      const weak = weakSkips(res, all);
      if (attempt === 0 && ((share > 0.6 && main.length >= 5) || weak.length)) {
        strict = "\n\nSTRICTER:" +
          (share > 0.6 ? " your previous answer marked far too many titles WATCH; at most 40% of main titles may score >= 70." : "") +
          (weak.length ? ` Every SKIP needs a reason of at least 40 characters that names something concrete about THAT title (episode count, runtime, a plot element, its genre mix) and a reason_long of 2-3 sentences. Ids with vague reasons last time: ${weak.join(", ")}.` : "");
        continue;
      }
      break;
    } catch (e) {
      console.error("gemini attempt failed:", (e as Error).message);
      strict = "\n\nSTRICT OUTPUT: respond with valid JSON matching the schema exactly. No prose, no markdown, every id present.";
    }
  }
  if (!last) return null;
  // Anything still vague after the retry gets a factual reason built from the title's own data (never invented).
  for (const id of weakSkips(last, all)) {
    const v = last.verdicts.get(id)!;
    const f = factualSkip(all[id], v.match_score);
    if (!isConcrete(v.reason, all[id])) v.reason = f.reason;
    if (v.reason_long.length < 80) v.reason_long = f.reason_long;
  }
  return { ...last, model };
}
