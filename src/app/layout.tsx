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
          THESIS: ARCIL is a live operational rundown, not a generic dashboard grid.
          OWN-WORLD: Ink-blue broadcast desk, porcelain data, broadcast-blue section bars, and amber or red reserved for active attention.
          STORY: The owner sees every operating domain and the exception that needs attention; each team can enter its focused surface from the same signal.
          FIRST VIEWPORT: A live masthead and attention ribbon lead into six horizontal operation lanes, a priority rail, and a bottom event rundown.
          FORM: Redação em tempo real; assigned direction seed 87b65c94.
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
