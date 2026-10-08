-- Segundo papel preso a segmentos: gestor dos construtores, engenheiros e arquitetos
-- (segmentos BUILDER e ARCHITECT). Mesma lógica do installer_manager
-- (20261008_role_installer_manager.sql): fora de todas as políticas staff_read_*,
-- então o banco recusa leitura direta com o token dele e o dado passa pelas
-- rotas do CRM, filtrado por segmento (src/lib/server/segment-scope.ts).
alter type public.user_role add value if not exists 'builder_manager';
