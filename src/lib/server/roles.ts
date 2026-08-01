export const VALID_ROLES = ["superadmin", "owner", "manager", "vendor", "employee", "client"] as const;
export type ValidRole = (typeof VALID_ROLES)[number];

export const ROLE_PERMISSIONS: Record<ValidRole, Record<string, boolean>> = {
  superadmin: { view_all: true, manage_users: true, manage_roles: true, manage_cobranca: true, manage_estoque: true, manage_gerador_imagem: true, manage_atendimento: true },
  owner:      { view_all: true, manage_cobranca: true, manage_estoque: true, manage_gerador_imagem: true, manage_atendimento: true },
  manager:    { view_all: true, manage_cobranca: true, manage_atendimento: true },
  vendor:     { view_leads: true },
  employee:   { view_leads: true },
  client:     {},
};
