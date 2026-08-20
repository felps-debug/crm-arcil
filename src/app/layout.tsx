import type { Metadata } from "next";
import { Montserrat, IBM_Plex_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Providers } from "@/components/layout/providers";
import { MainWrapper } from "@/components/layout/main-wrapper";

// Mesma fonte usada no site institucional da Arcil (arcil.com.br).
// Sem `weight`: Montserrat é variable font e o Google deixou de servir os
// arquivos de instância estática (`.../JTU4jIg1...woff2` responde 404), o que
// derrubava o build e fazia toda rota devolver 500. O eixo variável cobre
// 100–900, então os pesos usados na UI continuam disponíveis.
const montserrat = Montserrat({
  subsets: ["latin"],
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
          THESIS: ARCIL is an executive pulse for the operation, not a generic dashboard of detached cards.
          OWN-WORLD: Deep teal working surfaces, mineral text, disciplined signal colors and editorial hierarchy that makes the business state legible at a glance.
          STORY: Paulo understands the company's health first, then the domains, decisions and live events that explain it.
          FIRST VIEWPORT: A statement of operational health leads into measurable signals, a domain agenda, decision queue, event stream and commercial ledger.
          FORM: Executive Pulse; desktop command surface with explicit TV mode and mobile decision sequence.
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
