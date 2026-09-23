-- Numeros da propria Arcil que o agente de WhatsApp nao deve tratar.
--
-- O numero de vendas da Arcil mandou mensagem para o bot e virou lead
-- ("Vendas Grupo Arcil", "Ana Paula - Vendas"), contando como "Leads sem
-- responsavel" e correndo o risco de a IA responder como se fosse cliente.
--
-- O workflow n8n "AGENTE COMPLETO ARCIL" consulta esta tabela logo depois de
-- normalizar o telefone (no "VERIFICA NUMERO1"): numero ativo aqui encerra a
-- execucao sem criar lead e sem resposta da IA. Se a consulta falhar, a
-- mensagem segue normalmente -- a lista nunca pode calar o bot.
--
-- Para liberar um numero para teste (ex.: Paulo testando o agente):
--   update public.blocked_phones set ativo = false where phone = '55...';
-- e depois voltar para true.
--
-- Os numeros NAO ficam neste arquivo (repo): sao inseridos direto no banco.
--
-- down:
--   drop table if exists public.blocked_phones;

create table if not exists public.blocked_phones (
  -- mesmo formato que o VERIFICA NUMERO1 produz: 55 + DDD + numero, com o nono digito
  phone      text primary key check (phone ~ '^55[0-9]{10,11}$'),
  motivo     text not null,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

-- So o servidor (service role / conexao do n8n) le e escreve.
alter table public.blocked_phones enable row level security;
revoke all on public.blocked_phones from anon, authenticated;

comment on table public.blocked_phones is
  'Numeros internos da Arcil que o agente de WhatsApp ignora (sem lead, sem resposta da IA). ativo=false libera para teste.';
