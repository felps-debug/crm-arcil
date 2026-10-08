export const VALID_ROLES = [
  "superadmin",
  "owner",
  "manager",
  "vendor",
  "employee",
  "client",
  "installer_manager",
  "builder_manager",
] as const;
export type ValidRole = (typeof VALID_ROLES)[number];

export const ROLE_PERMISSIONS: Record<ValidRole, Record<string, boolean>> = {
  superadmin: { view_all: true, manage_users: true, manage_roles: true, manage_cobranca: true, manage_estoque: true, manage_gerador_imagem: true, manage_atendimento: true },
  owner:      { view_all: true, manage_cobranca: true, manage_estoque: true, manage_gerador_imagem: true, manage_atendimento: true },
  manager:    { view_all: true, manage_cobranca: true, manage_atendimento: true },
  vendor:     { view_leads: true },
  employee:   { view_leads: true },
  client:     {},
  installer_manager: { view_leads: true },
  builder_manager:   { view_leads: true },
};

/**
 * Papéis que só enxergam alguns segmentos de leads. As políticas `staff_read_*`
 * do banco listam os papéis por nome e estes não estão nelas — então eles também
 * não leem nada direto pelo Supabase; todo dado deles passa pelas rotas do CRM,
 * que aplicam o filtro de lib/server/segment-scope.ts.
 */
const ROLE_SEGMENT_SCOPE: Partial<Record<string, string[]>> = {
  installer_manager: ["INSTALLER"],
  // Engenheiros e construtoras são BUILDER; ARCHITECT ainda não tem lead, mas é o
  // mesmo agente (Claudio) e o mesmo público.
  builder_manager: ["BUILDER", "ARCHITECT"],
};

/** Segmentos a que o papel está preso, ou null se ele não tem escopo. */
export function segmentScope(role: string): string[] | null {
  return ROLE_SEGMENT_SCOPE[role] ?? null;
}
