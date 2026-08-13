"use client";

import { useEffect, useState } from "react";
import { versiculoDoDia, type Versiculo } from "@/lib/versiculo-do-dia";

/**
 * Só resolve o versículo depois de montar.
 *
 * O Next 16 com Cache Components recusa `new Date()` durante o render de um
 * Server Component — e `ConsolePage` é prerenderizado em algumas rotas, o que
 * derrubava o build. Ler a data no efeito também evita divergência de
 * hidratação na virada da meia-noite.
 */
export function VersiculoDoDia() {
  const [versiculo, setVersiculo] = useState<Versiculo | null>(null);

  useEffect(() => {
    setVersiculo(versiculoDoDia());
  }, []);

  // Some abaixo de `lg`: entre o título e os botões, é o primeiro a atrapalhar
  // quando a largura aperta.
  if (!versiculo) return <span className="hidden flex-1 lg:block" aria-hidden />;

  return (
    <p className="hidden min-w-0 flex-1 justify-center px-4 text-center text-[12px] leading-snug text-[var(--text-muted)] lg:flex">
      <span className="truncate">
        <span className="italic">“{versiculo.texto}”</span>
        <span className="ml-2 font-semibold not-italic text-[var(--text-secondary)]">{versiculo.referencia}</span>
      </span>
    </p>
  );
}
