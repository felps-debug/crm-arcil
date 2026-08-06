-- Tabela de tradução da coluna Emp da planilha do ERP para os dados que o agente
-- precisa informar ao cliente. Hoje não existe nenhuma lógica ligando PHBMa/PHBLd a
-- CNPJ ou Pix: o agente diz o que sobrou de uma conversa anterior. Num teste de maio
-- ele passou o CNPJ /0002-42 (Londrina) num atendimento cujo boleto era PHBMa.
--
-- O prefixo do documento NÃO identifica a filial — 'B1' aparece nas duas planilhas
-- (36 em Maringá, 4 em Londrina). Só a coluna Emp serve para isso.
--
-- Todos os CNPJs conferidos pelo dígito verificador antes de gravar.

create table if not exists public.cobranca_empresas (
  emp              text primary key,
  razao_social     text not null,
  nome_exibicao    text not null,
  cidade           text,
  cnpj             text not null,
  pix_chave        text not null,
  pix_tipo         text not null default 'CNPJ',
  pix_favorecido   text not null,
  ativo            boolean not null default true,
  created_at       timestamptz not null default now()
);

comment on table public.cobranca_empresas is
  'Emp da planilha -> CNPJ e Pix que o agente de cobrança deve informar. O número de disparo é o mesmo para todas: a empresa decide apenas o conteúdo da mensagem.';
comment on column public.cobranca_empresas.pix_chave is
  'Chave Pix apenas com dígitos. Assumido como sendo o próprio CNPJ — confirmar no app do banco antes de usar em produção.';
comment on column public.cobranca_empresas.nome_exibicao is
  'Nome que o agente fala ao cliente. Precisa bater com o favorecido que aparece no app de quem paga.';

insert into public.cobranca_empresas
  (emp, razao_social, nome_exibicao, cidade, cnpj, pix_chave, pix_favorecido) values
  ('PHBMa', 'PHB REFRIGERACAO', 'PHB Refrigeração Maringá',  'Maringá',  '23.936.600/0001-61', '23936600000161', 'PHB REFRIGERACAO'),
  ('PHBLd', 'PHB REFRIGERACAO', 'PHB Refrigeração Londrina', 'Londrina', '23.936.600/0002-42', '23936600000242', 'PHB REFRIGERACAO'),
  ('ARCIL', 'ARCIL',            'Arcil',                     null,       '55.206.082/0001-17', '55206082000117', 'ARCIL')
on conflict (emp) do nothing;
