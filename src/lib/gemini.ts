import type { Prefs, Title } from "./types";

const API = "https://generativelanguage.googleapis.com/v1beta";

export interface Verdict {
  id: number;
  synopsis_line_1: string;
  synopsis_line_2: string;
  verdict: "WATCH" | "SKIP";
  match_score: number;
  reason: string;
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
- reason: ONE line. For WATCH, say why it fits THIS viewer's profile (genres, taste notes). For SKIP, be specific and a little savage, never generic ("not his taste" is banned). It is shown as the title's epitaph.
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
          mood_tag: { type: "STRING" },
        },
        required: ["id", "synopsis_line_1", "synopsis_line_2", "verdict", "match_score", "reason", "mood_tag"],
      },
    },
    dare_id: { type: "INTEGER" },
  },
  required: ["verdicts", "dare_id"],
};

async function generate(model: string, system: string, user: string): Promise<string> {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.8, maxOutputTokens: 20000 },
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
      mood_tag: String(v.mood_tag ?? "").trim(),
    });
  }
  if (out.size < Math.ceil(ids.size * 0.5)) throw new Error(`only ${out.size}/${ids.size} verdicts valid`);
  return { verdicts: out, dareId: Number.isInteger(j.dare_id) ? j.dare_id : null };
}

/** ONE batched call for all titles. Retries once (stricter) on malformed output or an over-generous batch. */
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
  let first: { verdicts: Map<number, Verdict>; dareId: number | null } | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let raw: string;
      try {
        raw = await generate(model, SYSTEM + strict, JSON.stringify(payload));
      } catch (e: any) {
        if (!e.modelRejected) throw e;
        model = await newestFlash(); // model name rejected: re-list and retry
        raw = await generate(model, SYSTEM + strict, JSON.stringify(payload));
      }
      const res = validate(raw, ids);
      const mainVerdicts = [...res.verdicts.values()].filter((v) => v.id < main.length);
      const share = mainVerdicts.filter((v) => v.verdict === "WATCH").length / Math.max(1, mainVerdicts.length);
      if (share > 0.6 && main.length >= 5 && attempt === 0) {
        first = res;
        strict = "\n\nSTRICTER: your previous answer marked far too many titles WATCH. Re-judge ruthlessly. At most 40% of main titles may score >= 70.";
        continue;
      }
      return { ...res, model };
    } catch (e) {
      console.error("gemini attempt failed:", (e as Error).message);
      strict = "\n\nSTRICT OUTPUT: respond with valid JSON matching the schema exactly. No prose, no markdown, every id present.";
    }
  }
  return first ? { ...first, model } : null;
}
