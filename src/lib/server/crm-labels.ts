export const STATUS_LABELS_API: Record<string, string> = {
  ACTIVE: "Ativo",
  LOST: "Perdido",
  IN_PROGRESS: "Em progresso",
  PENDING: "Pendente",
  DISPARADO: "Disparado",
  "NAO DISPARADO": "Nao disparado",
};

export const SEGMENT_LABELS_API: Record<string, string> = {
  NEW: "Novo",
  CONSUMER: "Consumidor",
  // BUILDER é o valor canônico: construtor e arquiteto são o mesmo segmento na
  // operação, com o mesmo catálogo e o mesmo vendedor. ARCHITECT continua aqui
  // só como alias, para registro antigo que ainda carregue o valor.
  BUILDER: "Construtor / Arquiteto",
  ARCHITECT: "Construtor / Arquiteto",
  INSTALLER: "Instalador",
  RESELLER: "Revenda",
  COBRANCA: "Cobranca",
};

export function labelStatus(status: string | null | undefined) {
  if (!status) return "Sem status";
  return STATUS_LABELS_API[status] ?? status;
}

export function labelSegment(segment: string | null | undefined) {
  if (!segment) return "Sem segmento";
  return SEGMENT_LABELS_API[segment] ?? segment;
}
