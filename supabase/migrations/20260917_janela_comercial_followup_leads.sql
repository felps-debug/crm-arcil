-- Janela comercial na régua de follow-up de leads.
--
-- disparar_followup_cobranca() ganhou uma guarda de horário em
-- 20260808_followup_cobranca_regua_nova_e_janela_comercial.sql. A régua de
-- leads ficou de fora e manda mensagem em qualquer hora do dia.
--
-- Hoje isso é inofensivo porque o pg_cron que chamava esta função foi removido
-- em 12/08/2026 (jobid 5, 141.468 execuções, última com "job startup timeout"),
-- e nada assumiu o lugar -- os 22 follow-ups tipo='lead' estão parados no step 0
-- desde então. Esta migração NÃO religa o cron: só garante que, quando religar,
-- nenhuma mensagem saia fora de hora.
--
-- Janela definida pela operação:
--   segunda a sexta  08:00 - 18:00
--   sábado           08:00 - 12:00
--   domingo          não dispara
--
-- Fora da janela a função retorna sem fazer nada. Como o gatilho de cada step é
-- "tempo decorrido desde ultima_msg_lead", nada se perde: o toque sai na próxima
-- execução dentro da janela.
--
-- O resto do corpo é idêntico ao que já estava em produção.

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
    SELECT id, lead_id, numero_cliente, nome_cliente,
           ultima_msg_lead, followup_step, status,
           produto_negociado, preco_ofertado
    FROM followups
    WHERE respondeu = false
      AND status = 'PENDING'
      AND ultima_msg_lead IS NOT NULL
      AND (tipo = 'lead' OR tipo IS NULL)
  LOOP
    minutos_diff := FLOOR(EXTRACT(EPOCH FROM (agora - r.ultima_msg_lead)) / 60);
    horas_diff := FLOOR(minutos_diff / 60);

    IF r.followup_step = 0 AND minutos_diff >= 30 THEN
      PERFORM net.http_post(
        url := 'https://arcil-n8n.47nukb.easypanel.host/webhook/FOLLOWUP',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'followup_id', r.id,
          'lead_id', r.lead_id,
          'step', 1,
          'nome_cliente', r.nome_cliente,
          'numero_cliente', r.numero_cliente,
          'produto_negociado', r.produto_negociado,
          'preco_ofertado', r.preco_ofertado
        )
      );
      UPDATE followups SET followup_step = 1 WHERE id = r.id;

    ELSIF r.followup_step = 1 AND horas_diff >= 2 THEN
      PERFORM net.http_post(
        url := 'https://arcil-n8n.47nukb.easypanel.host/webhook/FOLLOWUP',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'followup_id', r.id,
          'lead_id', r.lead_id,
          'step', 2,
          'nome_cliente', r.nome_cliente,
          'numero_cliente', r.numero_cliente,
          'produto_negociado', r.produto_negociado,
          'preco_ofertado', r.preco_ofertado
        )
      );
      UPDATE followups SET followup_step = 2 WHERE id = r.id;

    ELSIF r.followup_step = 2 AND horas_diff >= 24 THEN
      PERFORM net.http_post(
        url := 'https://arcil-n8n.47nukb.easypanel.host/webhook/FOLLOWUP',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'followup_id', r.id,
          'lead_id', r.lead_id,
          'step', 3,
          'nome_cliente', r.nome_cliente,
          'numero_cliente', r.numero_cliente,
          'produto_negociado', r.produto_negociado,
          'preco_ofertado', r.preco_ofertado
        )
      );
      UPDATE followups SET followup_step = 3 WHERE id = r.id;

    ELSIF r.followup_step = 3 AND horas_diff >= 48 THEN
      PERFORM net.http_post(
        url := 'https://arcil-n8n.47nukb.easypanel.host/webhook/FOLLOWUP',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'followup_id', r.id,
          'lead_id', r.lead_id,
          'step', 4,
          'nome_cliente', r.nome_cliente,
          'numero_cliente', r.numero_cliente,
          'produto_negociado', r.produto_negociado,
          'preco_ofertado', r.preco_ofertado
        )
      );
      UPDATE followups SET followup_step = 4 WHERE id = r.id;

    ELSIF r.followup_step = 4 AND horas_diff >= 72 THEN
      PERFORM net.http_post(
        url := 'https://arcil-n8n.47nukb.easypanel.host/webhook/FOLLOWUP',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'followup_id', r.id,
          'lead_id', r.lead_id,
          'step', 5,
          'ultimo_aviso', true,
          'nome_cliente', r.nome_cliente,
          'numero_cliente', r.numero_cliente,
          'produto_negociado', r.produto_negociado,
          'preco_ofertado', r.preco_ofertado
        )
      );
      UPDATE followups SET respondeu = true WHERE id = r.id;
      UPDATE leads SET status = 'LOST' WHERE id = r.lead_id;
    END IF;
  END LOOP;
END;
$function$;
