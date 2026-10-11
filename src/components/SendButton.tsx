"use client";
import { useState } from "react";

export default function SendButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function go() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/send-now", { method: "POST" });
      const d = await r.json();
      setMsg(d.ok ? `Sent to Telegram (${d.messageIds?.length ?? 1} message${d.messageIds?.length === 1 ? "" : "s"}).` : d.error || "Send failed.");
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button className="send" onClick={go} disabled={busy}>{busy ? "Sending…" : "Send to Telegram now"}</button>
      {msg && <div className="msg" role="status">{msg}</div>}
    </div>
  );
}
