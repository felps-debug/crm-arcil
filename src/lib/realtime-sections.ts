import type { DashboardSection } from "@/types/api";

/**
 * Que seções do dashboard dependem de cada tabela que o realtime observa.
 *
 * Antes qualquer evento recarregava o painel inteiro — cinco chamadas e ~45
 * leituras no banco porque uma conversa começou. Agora uma conversa nova só
 * pede de volta os agentes e o resumo.
 *
 * `inventory` não aparece: produtos não estão na publicação do realtime, e o
 * sync do ERP escreve milhares de linhas por hora — ouvir aquilo seria pior.
 */
export const SECTION_DEPENDENCIES: Record<string, DashboardSection[]> = {
  leads: ["summary", "pending", "agents", "activity"],
  followups: ["summary", "pending", "urgentFollowups", "activity"],
  cobranca_log: ["summary", "pending", "activity"],
  conversations: ["summary", "agents"],
};

export function sectionsFor(table: string): DashboardSection[] {
  return [...(SECTION_DEPENDENCIES[table] ?? [])].sort();
}

/**
 * Janela padrão de agrupamento. O realtime emite um evento por linha, e um
 * disparo de cobrança grava dezenas de uma vez; 2s junta o lote todo sem que
 * uma alteração isolada pareça demorar (a spec pede entre 2 e 5 s).
 */
export const REALTIME_WINDOW_MS = 2000;

/**
 * Junta eventos de várias tabelas numa atualização só por janela.
 *
 * A janela abre no primeiro evento e fecha depois de `windowMs`, sem reiniciar
 * a cada evento novo — senão um fluxo contínuo de mudanças (um disparo grande)
 * adiaria a atualização indefinidamente.
 */
export function createSectionBatcher(onFlush: (sections: DashboardSection[]) => void, windowMs = REALTIME_WINDOW_MS) {
  let pending = new Set<DashboardSection>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    add(table: string) {
      const secoes = sectionsFor(table);
      if (!secoes.length) return;
      for (const s of secoes) pending.add(s);
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        const batch = [...pending].sort();
        pending = new Set();
        onFlush(batch);
      }, windowMs);
    },
    dispose() {
      clearTimeout(timer);
      timer = undefined;
      pending = new Set();
    },
  };
}
