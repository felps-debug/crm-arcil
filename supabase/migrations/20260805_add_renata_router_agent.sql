-- A Renata (ROTEADORA no n8n) é quem recebe TODOS os leads no telefone único.
-- Os agentes de segmento (Thiago, Claudio, Ana) só entram no handoff.
--
-- Ela não existia em vendors, e o segmento NEW — que significa exatamente
-- "ainda na roteadora, sem segmento definido" — estava pendurado na Ana Paula.
-- Consequência: todo lead novo era atribuído à Ana Paula. É a origem de
-- conversations.vendor_id = Ana Paula em 100% das conversas, inclusive num lead
-- INSTALLER, e do rótulo errado "Fila IA · Ana Paula" na aba de leads.
--
-- inbox 28 = "Whatsapp - Teste", o número único usado nos testes hoje.
-- Trocar quando o número de produção entrar.

insert into public.vendors (name, segment, chatwoot_agent_id, wa_phone, active, chatwoot_inbox_id)
values ('Renata', array['NEW'], 'roteadora', null, true, 28)
on conflict do nothing;

-- Ana Paula atende Consumidor Final e mais nada.
update public.vendors set segment = array['CONSUMER'] where name = 'Ana Paula';
