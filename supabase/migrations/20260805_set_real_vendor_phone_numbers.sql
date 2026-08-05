-- wa_phone estava com números de seed em sequência (5544999001001, ...002002,
-- ...003003, ...006006). Como o handoff passa a ser uma mensagem uazapi para o
-- número do vendedor, esse campo deixa de ser decorativo e vira o destino: com
-- os valores falsos, o vendedor nunca ficaria sabendo do lead.
--
-- Números confirmados contra os contatos do Chatwoot:
--   +5544991081911  ~Claudio Comercial Grupo Arcil
--   +5544991079670  ~Thiago Barsaglia
--   +5544991665959  ~Ana Paula Televendas
-- Formato 55 + DDD + 9 dígitos, igual ao usado em leads.wa_phone.

update public.vendors set wa_phone = '5544991081911' where name = 'Claudio';
update public.vendors set wa_phone = '5544991079670' where name = 'Thiago';
update public.vendors set wa_phone = '5544991665959' where name = 'Ana Paula';

-- Katia continua sem número; revenda ainda não foi definida.
update public.vendors set wa_phone = null where name = 'Katia';
