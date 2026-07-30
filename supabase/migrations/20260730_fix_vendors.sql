-- Corrige tabela vendors: remove os 6 vendedores fake do scripts/seed.mjs
-- e insere os 4 responsaveis reais por segmento, confirmados por Lucas em 30/07/2026.
delete from vendors;

insert into vendors (name, segment, active) values
  ('Ana Paula', array['CONSUMER', 'NEW'], true),
  ('Claudio',   array['BUILDER'],         true),
  ('Thiago',    array['INSTALLER'],       true),
  ('Katia',     array['RESELLER'],        true);
