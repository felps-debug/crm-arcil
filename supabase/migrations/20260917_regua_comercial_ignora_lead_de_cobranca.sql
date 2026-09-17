-- A regua comercial nunca deve falar com cliente do financeiro.
--
-- Causa raiz, encontrada em 17/09/2026: o no `CRIA FOLLOWUP` do workflow n8n
-- AGENTE COBRANCA (HBAufxmIUsPEQuKA) inseria em followups sem informar `tipo`.
-- Como followups.tipo tem DEFAULT 'lead', todo devedor que respondia no numero
-- do financeiro (inbox 26/27 do Chatwoot) caia na fila da regua comercial.
--
-- Resultado: 16 das 23 linhas paradas eram clientes com boleto em atraso --
-- incluindo um que tinha acabado de mandar comprovante PIX, e outro a quem nos
-- mesmos prometemos que "a Simone do financeiro vai entrar em contato".
--
-- O no do n8n foi corrigido na mesma data (passou a gravar tipo='cobranca') e as
-- 16 linhas paradas foram encerradas. Esta clausula e a ultima milha: mesmo que
-- outro workflow volte a omitir `tipo` amanha, nenhuma mensagem comercial sai
-- para lead de cobranca. O n8n resolve a origem, isto resolve a saida.
--
-- Preserva a janela comercial de 20260917_janela_comercial_followup_leads.sql
-- (seg-sex 08-18, sabado 08-12, domingo nao dispara).

create or replace function public.disparar_followup_arcil()
returns void
language plpgsql
set search_path = public
as $function$
DECLARE
  r RECORD;
  minutos_diff INT;
  horas_diff INT;
  agora TIMESTAMPTZ := NOW();
  hora_local INT;
  dow_local INT;
BEGIN
  -- Fora da janela comercial nada sai. A régua espera a próxima janela em vez de
  -- disparar de madrugada ou no domingo.
  hora_local := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Sao_Paulo'));
  dow_local  := EXTRACT(DOW  FROM (now() AT TIME ZONE 'America/Sao_Paulo'));

  IF dow_local = 0 THEN                                   -- domingo
    RETURN;
  ELSIF dow_local = 6 THEN                                -- sábado: meio período
    IF hora_local < 8 OR hora_local >= 12 THEN
      RETURN;
    END IF;
  ELSE                                                    -- segunda a sexta
    IF hora_local < 8 OR hora_local >= 18 THEN
      RETURN;
    END IF;
  END IF;

  FOR r IN
    SELECT f.id, f.lead_id, f.numero_cliente, f.nome_cliente,
           f.ultima_msg_lead, f.followup_step, f.status,
           f.produto_negociado, f.preco_ofertado
    FROM followups f
    WHERE f.respondeu = false
      AND f.status = 'PENDING'
      AND f.ultima_msg_lead IS NOT NULL
      AND (f.tipo = 'lead' OR f.tipo IS NULL)
      -- Cliente do financeiro nao entra na regua comercial. Sem lead vinculado
      -- tambem nao entra: nao ha como provar que e comercial.
      AND EXISTS (
        SELECT 1 FROM leads l
        WHERE l.id = f.lead_id
          AND l.segment IS DISTINCT FROM 'COBRANCA'
      )
  LOOP
    minutos_diff := FLOOR(EXTRACT(EPOCH FROM (agora - r.ultima_msg_lead)) / 60);
    horas_diff := FLOOR(minutos_diff / 60);

    IF r.followup_step = 0 AND minutos_diff >= 30 THEN
      PERFORM net.http_post(
        url := 'https://arcil-n8n.47nukb.easypanel.host/webhook/FOLLOWUP',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'followup_id', r.id, 'lead_id', r.lead_id, 'step', 1,
          'nome_cliente', r.nome_cliente, 'numero_cliente', r.numero_cliente,
          'produto_negociado', r.produto_negociado, 'preco_ofertado', r.preco_ofertado
        )
      );
      UPDATE followups SET followup_step = 1 WHERE id = r.id;

    ELSIF r.followup_step = 1 AND horas_diff >= 2 THEN
      PERFORM net.http_post(
        url := 'https://arcil-n8n.47nukb.easypanel.host/webhook/FOLLOWUP',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'followup_id', r.id, 'lead_id', r.lead_id, 'step', 2,
          'nome_cliente', r.nome_cliente, 'numero_cliente', r.numero_cliente,
          'produto_negociado', r.produto_negociado, 'preco_ofertado', r.preco_ofertado
        )
      );
      UPDATE followups SET followup_step = 2 WHERE id = r.id;

    ELSIF r.followup_step = 2 AND horas_diff >= 24 THEN
      PERFORM net.http_post(
        url := 'https://arcil-n8n.47nukb.easypanel.host/webhook/FOLLOWUP',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'followup_id', r.id, 'lead_id', r.lead_id, 'step', 3,
          'nome_cliente', r.nome_cliente, 'numero_cliente', r.numero_cliente,
          'produto_negociado', r.produto_negociado, 'preco_ofertado', r.preco_ofertado
        )
      );
      UPDATE followups SET followup_step = 3 WHERE id = r.id;

    ELSIF r.followup_step = 3 AND horas_diff >= 48 THEN
      PERFORM net.http_post(
        url := 'https://arcil-n8n.47nukb.easypanel.host/webhook/FOLLOWUP',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'followup_id', r.id, 'lead_id', r.lead_id, 'step', 4,
          'nome_cliente', r.nome_cliente, 'numero_cliente', r.numero_cliente,
          'produto_negociado', r.produto_negociado, 'preco_ofertado', r.preco_ofertado
        )
      );
      UPDATE followups SET followup_step = 4 WHERE id = r.id;

    ELSIF r.followup_step = 4 AND horas_diff >= 72 THEN
      PERFORM net.http_post(
        url := 'https://arcil-n8n.47nukb.easypanel.host/webhook/FOLLOWUP',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'followup_id', r.id, 'lead_id', r.lead_id, 'step', 5, 'ultimo_aviso', true,
          'nome_cliente', r.nome_cliente, 'numero_cliente', r.numero_cliente,
          'produto_negociado', r.produto_negociado, 'preco_ofertado', r.preco_ofertado
        )
      );
      UPDATE followups SET respondeu = true WHERE id = r.id;
      UPDATE leads SET status = 'LOST' WHERE id = r.lead_id;
    END IF;
  END LOOP;
END;
$function$;
