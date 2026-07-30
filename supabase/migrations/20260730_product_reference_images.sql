-- Fotos de referencia por produto/marca, usadas como referencia visual real
-- no Gerador de Imagem. Vazia por enquanto — popule quando tiver as fotos
-- oficiais de cada modelo (brand + model_pattern: texto que deve aparecer
-- na resposta "modelo do ar-condicionado" pra essa foto valer, ex: "9000" +
-- "philco" casam com "9000 btu philco inverter").
create table if not exists product_reference_images (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model_pattern text not null,
  image_url text not null,
  created_at timestamptz not null default now()
);

alter table product_reference_images enable row level security;

create policy "authenticated users can read product_reference_images"
  on product_reference_images for select
  to authenticated
  using (true);
