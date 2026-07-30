-- Notas de instalacao/garantia por marca, usadas no Gerador de Imagem.
-- Vazia por enquanto: a IA gera a orientacao quando nao ha registro aqui.
-- Quando os PDFs oficiais dos fabricantes forem cadastrados, popule esta
-- tabela (content = texto extraido do PDF) e o app passa a usar o texto
-- real em vez da explicacao gerada por IA — sem precisar mudar codigo.
create table if not exists brand_warranty_notes (
  id uuid primary key default gen_random_uuid(),
  brand text not null unique,
  content text not null,
  source_url text,
  updated_at timestamptz not null default now()
);

alter table brand_warranty_notes enable row level security;

create policy "authenticated users can read brand_warranty_notes"
  on brand_warranty_notes for select
  to authenticated
  using (true);

-- Guarda a nota (real ou gerada por IA) junto com cada geracao de imagem,
-- pra ficar visivel no historico.
alter table image_generations add column if not exists installation_notes text;
alter table image_generations add column if not exists installation_notes_source text;
