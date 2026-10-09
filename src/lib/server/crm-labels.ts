export const STATUS_LABELS_API: Record<string, string> = {
  ACTIVE: "Ativo",
  LOST: "Perdido",
  IN_PROGRESS: "Em progresso",
  PENDING: "Pendente",
  DISPARADO: "Disparado",
  "NAO DISPARADO": "Não disparado",
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
  COBRANCA: "Cobranças",
};

/** Nome do papel para a tela. O código em inglês (`builder_manager`) é só o valor guardado no banco. */
export const ROLE_LABELS_API: Record<string, string> = {
  superadmin: "Super administrador",
  owner: "Dono",
  manager: "Gerente",
  vendor: "Vendedor",
  employee: "Funcionário",
  client: "Cliente",
  installer_manager: "Gestor de instaladores",
  builder_manager: "Gestor de construtores e arquitetos",
};

export function labelRole(role: string | null | undefined) {
  if (!role) return "Sem papel";
  return ROLE_LABELS_API[role] ?? role;
}

export function labelStatus(status: string | null | undefined) {
  if (!status) return "Sem status";
  return STATUS_LABELS_API[status] ?? status;
}

export function labelSegment(segment: string | null | undefined) {
  if (!segment) return "Sem segmento";
  return SEGMENT_LABELS_API[segment] ?? segment;
}
