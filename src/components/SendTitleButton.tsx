"use client";
import { useState } from "react";

/** Sends ONE title to Naman's Telegram. Only the key goes to the server; the message is built there from Neon. Shares the 60s manual-send limit. */
export default function SendTitleButton({ titleKey, title }: { titleKey: string | null; title: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!titleKey) return null;
  async function go() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/send-now", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ titleKey }) });
      const d = await r.json();
      setMsg(d.ok ? "Sent to Telegram." : d.error || "Send failed.");
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="tgwrap">
      <button type="button" className="tgbtn" onClick={go} disabled={busy} aria-label={`Send ${title} to my Telegram`}>{busy ? "Sending…" : "Send to Telegram"}</button>
      {msg && <span className="tgmsg" role="status">{msg}</span>}
    </span>
  );
}
