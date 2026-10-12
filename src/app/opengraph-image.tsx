import { ImageResponse } from "next/og";

export const alt = "OTT Release Radar: what actually landed on Netflix, Prime Video and JioHotstar this week";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg,#14161b,#2a1013)", color: "#f2f2f2" }}>
        <div style={{ fontSize: 34, color: "#e5303a", letterSpacing: 6, textTransform: "uppercase", fontWeight: 700 }}>OTT Release Radar</div>
        <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.05, marginTop: 24 }}>What actually landed in India this week</div>
        <div style={{ fontSize: 34, color: "#a3a8b3", marginTop: 28 }}>Netflix · Prime Video · JioHotstar · Watch or skip, with reasons</div>
      </div>
    ),
    size,
  );
}
