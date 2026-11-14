import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { themeScript } from "@/lib/theme/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Workspace Prototype",
  description:
    "A connected workspace for your projects, conversations, and data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script may add `.dark` to <html> before React hydrates.
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Before the first paint, so the page never flashes the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
