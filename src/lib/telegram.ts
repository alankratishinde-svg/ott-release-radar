import { q, safe } from "./db";
import { pack } from "./format";
import { isoWeek } from "./week";

const tg = (method: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export async function resolveChatId(): Promise<string> {
  const env = (process.env.TELEGRAM_CHAT_ID ?? "").trim();
  if (/^-?\d+$/.test(env)) return env;
  const r = await fetch(tg("getUpdates"), { cache: "no-store" });
  const d = await r.json();
  const upd = [...(d.result ?? [])].reverse().find((u: any) => u.message?.chat?.id ?? u.channel_post?.chat?.id);
  const id = upd?.message?.chat?.id ?? upd?.channel_post?.chat?.id;
  if (!id) throw new Error("No Telegram chat found: send any message to the bot first");
  return String(id);
}

export async function sendText(text: string, trigger: "cron" | "manual", digestId: number | null) {
  const week = isoWeek().label;
  const ids: number[] = [];
  try {
    const chat = await resolveChatId();
    for (const part of pack(text)) {
      const r = await fetch(tg("sendMessage"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: part, parse_mode: "HTML", disable_web_page_preview: true }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(`telegram: ${d.description ?? r.status}`);
      ids.push(d.result.message_id);
    }
    await safe(() =>
      q(`INSERT INTO sends (digest_id, trigger, status, iso_week, telegram_message_ids) VALUES ($1,$2,'sent',$3,$4)`, [digestId, trigger, week, ids.join(",")]),
    );
    return { ok: true as const, messageIds: ids };
  } catch (e) {
    const msg = (e as Error).message;
    await safe(() =>
      q(`INSERT INTO sends (digest_id, trigger, status, iso_week, telegram_message_ids, error) VALUES ($1,$2,'failed',$3,$4,$5)`, [digestId, trigger, week, ids.join(",") || null, msg]),
    );
    return { ok: false as const, error: msg, messageIds: ids };
  }
}
