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
  BUILDER: "Construtor",
  ARCHITECT: "Arquiteto",
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
