import type { Metadata } from "next";
import { Montserrat, IBM_Plex_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Providers } from "@/components/layout/providers";
import { MainWrapper } from "@/components/layout/main-wrapper";

// Mesma fonte usada no site institucional da Arcil (arcil.com.br)
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ARCIL CRM",
  description: "Sistema CRM do Grupo Arcil — FLUXO Automações com IA",
  icons: { icon: "/logo-icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`dark h-full ${montserrat.variable} ${ibmPlexMono.variable}`}>
      <body className="h-full flex overflow-hidden" style={{ background: "var(--bg-base)" }}>
        {/*
          THESIS: ARCIL is an open operational wall, not a dashboard that hides work behind cards and destinations.
          OWN-WORLD: Matte split-flap board, warm off-white type, steel dividers, restrained blue live data, amber for attention and red only for an actual exception.
          STORY: The owner reads every queue, domain state, agent and event at once from a TV; the team reads the same factual state before acting elsewhere.
          FIRST VIEWPORT: A broadcast masthead sits above open queues, a central operations agenda, a continuous event stream, and a bottom status ledger.
          FORM: Operational split-flap board; direction seed 560c4a34.
          FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
        */}
        <Providers>
          <Suspense>
            <Sidebar />
            <MainWrapper>{children}</MainWrapper>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
