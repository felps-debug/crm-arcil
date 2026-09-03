"use client";

import Image from "next/image";
import dynamic from "next/dynamic";

// /login is the very first screen every unauthenticated visit hits.
// framer-motion (the whole animated card — tabs, form transitions, spring
// button feedback) used to load unconditionally as part of this page's own
// bundle. Splitting it into a dynamic import keeps this first paint free of
// that dependency; the card itself still ends up on screen within one
// network round trip, well before anyone reads the page.
const LoginCard = dynamic(() => import("./login-card"), {
  ssr: false,
  loading: () => (
    <div
      className="relative z-10 w-full mx-4 animate-pulse rounded-2xl border"
      style={{ maxWidth: 400, height: 520, background: "#050b14", borderColor: "#1f2b3d" }}
    />
  ),
});

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-[1.05fr_1fr]" style={{ background: "#030813" }}>
      {/* Painel da marca. Some abaixo de `lg`: num celular ele empurraria o
          formulário para fora da primeira tela, e entrar é o que importa ali. */}
      <aside
        className="relative hidden flex-col justify-between overflow-visible p-12 lg:flex"
        style={{ background: "linear-gradient(155deg, #172959 0%, #0f1c3d 55%, #0a1229 100%)" }}
      >
        <Image
          src="/logo-arcil-full.png"
          alt="Grupo Arcil"
          width={420}
          height={132}
          priority
          className="relative z-10 h-auto w-[240px] object-contain"
        />

        <div className="relative z-10 max-w-[26rem]">
          <h1 className="text-[34px] font-extrabold leading-[1.12] tracking-tight text-white">
            A operação inteira em uma tela só.
          </h1>
          <p className="mt-4 text-[14px] leading-relaxed text-[#a8bfd4]">
            Leads, agentes de IA, cobranças, atendimento e estoque no mesmo lugar — atualizando em tempo real conforme a
            operação acontece.
          </p>
          <ul className="mt-8 space-y-3">
            {["Agentes de IA monitorados por segmento", "Cobrança acompanhada boleto a boleto", "Painel de TV para a visão do dia"].map(
              (line) => (
                <li key={line} className="flex items-center gap-3 text-[13px] font-medium text-[#d7e4f1]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#4ea7ff" }} />
                  {line}
                </li>
              )
            )}
          </ul>
        </div>

        <p className="relative z-10 text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: "#a8bfd4" }}>
          Fluxo · Automações com IA
        </p>
      </aside>

      <div className="relative flex w-full items-center justify-center py-16 lg:py-0">
        <LoginCard />
      </div>
    </div>
  );
}
