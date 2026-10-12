import type { Metadata, Viewport } from "next";
import { Bebas_Neue, DM_Sans } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--sans" });
const display = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--display" });

export const viewport: Viewport = { themeColor: "#14161b" };
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://ott-release-radar-lovat.vercel.app"),
  title: { default: "OTT Release Radar", template: "%s · OTT Release Radar" },
  description: "What actually landed on Netflix, Prime Video and JioHotstar in India this week, with a watch-or-skip verdict for every title.",
  openGraph: { title: "OTT Release Radar", description: "What actually landed on Netflix, Prime Video and JioHotstar in India this week, with a watch-or-skip verdict.", siteName: "OTT Release Radar", type: "website" },
  twitter: { card: "summary_large_image" },
};

// Runs before first paint: the curtains play once per browser session (sessionStorage), never on repeat visits.
const CURTAIN = `try{if(!sessionStorage.getItem('curtain')){document.documentElement.dataset.curtain='1';sessionStorage.setItem('curtain','1')}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <head><link rel="preconnect" href="https://image.tmdb.org" /><script dangerouslySetInnerHTML={{ __html: CURTAIN }} /></head>
      <body>{children}</body>
    </html>
  );
}
