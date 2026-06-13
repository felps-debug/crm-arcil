import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Providers } from "@/components/layout/providers";
import { MainWrapper } from "@/components/layout/main-wrapper";

export const metadata: Metadata = {
  title: "ARCIL CRM",
  description: "Sistema CRM do Grupo Arcil — FLUXO Automações com IA",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="h-full flex" style={{ background: "var(--bg-base)" }}>
        <Providers>
          <Sidebar />
          <MainWrapper>{children}</MainWrapper>
        </Providers>
      </body>
    </html>
  );
}
