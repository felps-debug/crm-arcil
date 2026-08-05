-- ARCHITECT e BUILDER são o mesmo segmento na operação e sempre compartilharam
-- o mesmo catálogo (products_builder_architect) e o mesmo vendedor (Claudio).
-- Manter os dois como valores distintos só criava caminhos duplicados: duas
-- regras no Switch do RAG, dois rótulos na UI e a chance de um lead ARCHITECT
-- não casar com um agente cadastrado como BUILDER.
--
-- BUILDER passa a ser o valor canônico. A edge function ainda aceita ARCHITECT
-- como alias, para não quebrar nó de n8n que ainda mande o valor antigo.
-- Nenhum lead ou conversa usava ARCHITECT (verificado), só o cadastro do Claudio.

update public.vendors set segment = array['BUILDER'] where name = 'Claudio';
update public.leads set segment = 'BUILDER' where segment = 'ARCHITECT';
update public.conversations set intent = 'BUILDER' where intent = 'ARCHITECT';
