-- Histórico do Gerador de Imagem: quem gerou, quando, e com quais respostas.
create table if not exists image_generations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  wall_image_url text,
  generated_image_url text not null,
  answers jsonb,
  created_at timestamptz not null default now()
);

alter table image_generations enable row level security;

create policy "authenticated users can read image_generations"
  on image_generations for select
  to authenticated
  using (true);

create policy "authenticated users can insert own image_generations"
  on image_generations for insert
  to authenticated
  with check (auth.uid() = user_id);
