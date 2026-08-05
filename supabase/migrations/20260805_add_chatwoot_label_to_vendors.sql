-- Fecha a tabela de tradução segmento -> Chatwoot. Sem ela, cada workflow do
-- n8n carrega o mapeamento hardcoded e eles divergem: hoje um lead INSTALLER
-- recebe a label tag_instaladores_parceiros no Chatwoot mas vendor_id da Ana
-- Paula no Supabase e intent NEW na conversa. Uma linha de vendors passa a
-- responder tudo: qual agente, qual time, qual label, qual inbox.

alter table public.vendors add column if not exists chatwoot_label text;

comment on column public.vendors.chatwoot_label is
  'Etiqueta do Chatwoot equivalente ao segmento. tag_arquitetos foi absorvida por tag_construtores.';

update public.vendors set chatwoot_label = 'tag_lead_novo'               where name = 'Renata';
update public.vendors set chatwoot_label = 'tag_consumidor_final'        where name = 'Ana Paula';
update public.vendors set chatwoot_label = 'tag_construtores'            where name = 'Claudio';
update public.vendors set chatwoot_label = 'tag_instaladores_parceiros'  where name = 'Thiago';
update public.vendors set chatwoot_label = 'tag_revendas'                where name = 'Katia';
