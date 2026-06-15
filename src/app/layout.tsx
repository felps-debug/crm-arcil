import type { Metadata } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Providers } from "@/components/layout/providers";
import { MainWrapper } from "@/components/layout/main-wrapper";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-outfit",
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
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`h-full ${plusJakarta.variable} ${ibmPlexMono.variable}`}>
      <body className="h-full flex overflow-hidden" style={{ background: "var(--bg-base)" }}>
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
