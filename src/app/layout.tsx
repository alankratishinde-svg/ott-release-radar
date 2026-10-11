import type { Metadata } from "next";
import { Bebas_Neue, DM_Sans } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--sans" });
const display = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--display" });

export const metadata: Metadata = {
  title: "OTT Release Radar",
  description: "What actually landed on Netflix, Prime Video and JioHotstar in India this week, with a watch-or-skip verdict.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
