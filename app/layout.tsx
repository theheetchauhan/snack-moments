import type { Metadata, Viewport } from "next";
import { Outfit, Inter } from "next/font/google";
import "./globals.css";

const display = Outfit({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700", "800"] });
const body = Inter({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Snack Moments",
  description: "An adaptive, behaviour-first research game and response-intelligence engine.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fbf7f0" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. ColorZilla's `cz-shortcut-listen`) inject
    // attributes into <html>/<body> before React hydrates. This only silences attribute mismatches
    // on these two elements; hydration errors inside the app are still reported.
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable} antialiased`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
