-- ============================================
-- ARCIL CRM - Schema do Banco de Dados
-- Execute no SQL Editor do Supabase
-- ============================================

-- Habilitar extensão de UUID
create extension if not exists "uuid-ossp";

-- ============================================
-- VENDEDORES / USUÁRIOS
-- ============================================
create table if not exists vendedores (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  email text unique not null,
  telefone text,
  role text not null default 'vendedor' check (role in ('admin', 'gestor', 'vendedor')),
  unidade text not null default 'Maringá',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================
-- CLIENTES
-- ============================================
create table if not exists clientes (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  telefone text not null,
  email text,
  cpf_cnpj text,
  tipo text not null default 'consumidor_final' check (tipo in ('consumidor_final', 'construtor_arquiteto', 'parceiro_instalador', 'revenda')),
  unidade text,
  endereco text,
  cidade text,
  estado text,
  vendedor_id uuid references vendedores(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================
-- LEADS
-- ============================================
create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  telefone text not null,
  email text,
  origem text not null default 'whatsapp' check (origem in ('whatsapp', 'instagram', 'site', 'campanha_b2b', 'indicacao')),
  tipo text not null default 'consumidor_final' check (tipo in ('consumidor_final', 'construtor_arquiteto', 'parceiro_instalador', 'revenda')),
  status text not null default 'novo' check (status in ('novo', 'qualificado', 'em_negociacao', 'proposta_enviada', 'ganho', 'perdido')),
  produto_interesse text,
  btu text,
  unidade text,
  vendedor_id uuid references vendedores(id) on delete set null,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger para atualizar updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at();

-- ============================================
-- INTERAÇÕES
-- ============================================
create table if not exists interacoes (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete cascade,
  tipo text not null default 'whatsapp' check (tipo in ('whatsapp', 'ligacao', 'email', 'visita', 'outro')),
  descricao text not null,
  vendedor_id uuid references vendedores(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================
-- FOLLOW-UPS
-- ============================================
create table if not exists followups (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete cascade,
  -- follow-up pós-proposta: 30min, 2h, 24h, 48h, 72h
  -- cobrança: D-3, D0, D+1, D+3, D+7, D+15
  tipo text not null check (tipo in ('30min', '2h', '24h', '48h', '72h', 'D-3', 'D0', 'D+1', 'D+3', 'D+7', 'D+15')),
  categoria text not null default 'venda' check (categoria in ('venda', 'cobranca')),
  status text not null default 'pendente' check (status in ('pendente', 'realizado', 'cancelado')),
  agendado_para timestamptz not null,
  realizado_em timestamptz,
  vendedor_id uuid references vendedores(id) on delete set null,
  observacoes text,
  created_at timestamptz not null default now()
);

-- ============================================
-- DEMANDAS (Banco de Produtos Desejados)
-- ============================================
create table if not exists demandas (
  id uuid primary key default uuid_generate_v4(),
  cliente_id uuid references clientes(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  produto text not null,
  btu text,
  marca text,
  quantidade integer not null default 1,
  status text not null default 'aguardando' check (status in ('aguardando', 'disponivel', 'vendido', 'cancelado')),
  vendedor_id uuid references vendedores(id) on delete set null,
  observacoes text,
  created_at timestamptz not null default now()
);

-- ============================================
-- DISPAROS B2B (Leads frios / perdidos)
-- ============================================
create table if not exists disparos_b2b (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete set null,
  nome text not null,
  telefone text not null,
  tipo text not null check (tipo in ('consumidor_final', 'construtor_arquiteto', 'parceiro_instalador', 'revenda')),
  produto_interesse text,
  motivo_perda text,
  campanha text,
  status text not null default 'na_fila' check (status in ('na_fila', 'enviado', 'respondeu', 'convertido', 'descartado')),
  enviado_em timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================
-- COBRANÇAS
-- ============================================
create table if not exists cobrancas (
  id uuid primary key default uuid_generate_v4(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  valor numeric(10,2) not null,
  vencimento date not null,
  status text not null default 'em_dia' check (status in ('em_dia', 'proximo_vencimento', 'vencido', 'pago', 'cancelado')),
  numero_boleto text,
  descricao text,
  tentativas integer not null default 0,
  ultimo_contato timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================
-- VIEWS ÚTEIS
-- ============================================

-- View: leads com vendedor
create or replace view leads_completo as
select
  l.*,
  v.nome as vendedor_nome,
  v.email as vendedor_email,
  v.unidade as vendedor_unidade
from leads l
left join vendedores v on l.vendedor_id = v.id;

-- View: followups pendentes de hoje
create or replace view followups_hoje as
select
  f.*,
  l.nome as lead_nome,
  l.telefone as lead_telefone,
  c.nome as cliente_nome,
  c.telefone as cliente_telefone,
  v.nome as vendedor_nome
from followups f
left join leads l on f.lead_id = l.id
left join clientes c on f.cliente_id = c.id
left join vendedores v on f.vendedor_id = v.id
where
  f.status = 'pendente'
  and f.agendado_para <= now() + interval '1 hour';

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
alter table vendedores enable row level security;
alter table clientes enable row level security;
alter table leads enable row level security;
alter table interacoes enable row level security;
alter table followups enable row level security;
alter table demandas enable row level security;
alter table cobrancas enable row level security;

-- Políticas básicas (ajuste conforme necessário)
create policy "Vendedores podem ver tudo" on vendedores for select using (true);
create policy "Clientes visíveis para autenticados" on clientes for all using (auth.role() = 'authenticated');
create policy "Leads visíveis para autenticados" on leads for all using (auth.role() = 'authenticated');
create policy "Interações visíveis para autenticados" on interacoes for all using (auth.role() = 'authenticated');
create policy "Followups visíveis para autenticados" on followups for all using (auth.role() = 'authenticated');
create policy "Demandas visíveis para autenticados" on demandas for all using (auth.role() = 'authenticated');
create policy "Cobranças visíveis para autenticados" on cobrancas for all using (auth.role() = 'authenticated');

-- ============================================
-- DADOS INICIAIS (seed)
-- ============================================
insert into vendedores (nome, email, role, unidade) values
  ('Admin ARCIL', 'admin@arcil.com.br', 'admin', 'Maringá'),
  ('Gestor Comercial', 'gestor@arcil.com.br', 'gestor', 'Maringá')
on conflict (email) do nothing;
