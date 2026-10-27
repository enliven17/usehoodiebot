import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist", weight: ["300", "400", "500", "600"] });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", weight: ["400", "500"] });

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://usehoodiebot.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Hoodie", template: "%s · Hoodie" },
  description: "Your private trading team on Robinhood Chain. Tell Hoodie what to watch; its specialists research, wait for the entry and trade inside your rules.",
  openGraph: { siteName: "Hoodie", type: "website", images: [{ url: "/og/home.png", width: 1200, height: 630, alt: "Hoodie, your private trading team on Robinhood Chain" }] },
  twitter: { card: "summary_large_image", site: "@usehoodiebot" },
};

export const viewport: Viewport = { themeColor: "#04060a", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
