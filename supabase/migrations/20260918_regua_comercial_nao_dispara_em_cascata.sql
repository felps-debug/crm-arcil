-- Regua atrasada nao cobra o atraso todo de uma vez.
--
-- Todos os degraus eram medidos a partir de ultima_msg_lead, nao do toque
-- anterior. Um lead de 49 horas satisfazia os quatro primeiros limiares ao mesmo
-- tempo; como so um ramo do ELSIF roda por execucao, ele subia um degrau por
-- tick do cron -- uma mensagem por minuto, ate quatro seguidas para a mesma
-- pessoa. Nunca mordeu porque a regua rodando de minuto em minuto jamais
-- acumulava atraso; so apareceu quando o pg_cron ficou 5 semanas fora do ar
-- (12/08 a 18/09/2026).
--
-- Decisao da operacao em 18/09/2026: quem ficou para tras nao recebe nada.
-- A regua vale para lead novo. Em vez de disparar a rajada, encerra o
-- followup -- e isso passa a valer para sempre, nao so para a limpeza de hoje:
-- se o cron cair de novo, o acumulo e descartado em vez de virar enxurrada.
--
-- Mecanica: um toque so sai se ja venceu (horas >= alvo) E ainda nao passou do
-- limiar do toque SEGUINTE. Passou dos dois, ha mais de um toque devido, e o
-- caso e encerrado. Tolera atraso menor que um degrau, que e operacao normal.
--
-- NOTA: disparar_followup_cobranca() tem a mesma fragilidade adormecida (avanca
-- um degrau por execucao, medindo tudo desde created_at). Nunca mordeu porque
-- aquela regua nao parou -- ela migrou para o servico Python. Se um dia parar,
-- aplicar a mesma guarda la.
--
-- Preserva a janela comercial (seg-sex 08-18, sab 08-12, domingo nao) e a
-- exclusao de lead de cobranca.

create or replace function public.disparar_followup_arcil()
returns void
language plpgsql
set search_path = public
as $function$
DECLARE
  r RECORD;
  horas numeric;
  proximo INT;
  alvo numeric;
  limite numeric;
  agora TIMESTAMPTZ := NOW();
  hora_local INT;
  dow_local INT;
BEGIN
  hora_local := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Sao_Paulo'));
  dow_local  := EXTRACT(DOW  FROM (now() AT TIME ZONE 'America/Sao_Paulo'));

  IF dow_local = 0 THEN
    RETURN;
  ELSIF dow_local = 6 THEN
    IF hora_local < 8 OR hora_local >= 12 THEN
      RETURN;
    END IF;
  ELSE
    IF hora_local < 8 OR hora_local >= 18 THEN
      RETURN;
    END IF;
  END IF;

  FOR r IN
    SELECT f.id, f.lead_id, f.numero_cliente, f.nome_cliente,
           f.ultima_msg_lead, f.followup_step,
           f.produto_negociado, f.preco_ofertado
    FROM followups f
    WHERE f.respondeu = false
      AND f.status = 'PENDING'
      AND f.ultima_msg_lead IS NOT NULL
      AND (f.tipo = 'lead' OR f.tipo IS NULL)
      AND EXISTS (
        SELECT 1 FROM leads l
        WHERE l.id = f.lead_id
          AND l.segment IS DISTINCT FROM 'COBRANCA'
      )
  LOOP
    horas   := EXTRACT(EPOCH FROM (agora - r.ultima_msg_lead)) / 3600;
    proximo := coalesce(r.followup_step, 0) + 1;

    -- Marcos desde a ultima mensagem do lead. 0.5 = os 30 minutos do 1o toque.
    alvo := case proximo when 1 then 0.5 when 2 then 2 when 3 then 24
                         when 4 then 48 when 5 then 72 else null end;
    limite := case proximo when 1 then 2 when 2 then 24 when 3 then 48
                           when 4 then 72 else null end;

    IF alvo IS NULL THEN
      CONTINUE;                       -- regua terminada
    END IF;

    IF horas < alvo THEN
      CONTINUE;                       -- ainda nao venceu
    END IF;

    IF limite IS NOT NULL AND horas >= limite THEN
      -- Mais de um toque devido: a regua esteve parada. Nao dispara a rajada.
      UPDATE followups
         SET status = 'ENCERRADO',
             motivo_nao_converteu = coalesce(motivo_nao_converteu,
               'Encerrado pela regua: ficou ' || round(horas) || 'h sem toque, '
               || 'mais de um degrau vencido de uma vez. Acumulo descartado em '
               || 'vez de enviar varias mensagens seguidas ao cliente.')
       WHERE id = r.id;
      CONTINUE;
    END IF;

    PERFORM net.http_post(
      url := 'https://arcil-n8n.47nukb.easypanel.host/webhook/FOLLOWUP',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'followup_id', r.id, 'lead_id', r.lead_id, 'step', proximo,
        'ultimo_aviso', proximo >= 5,
        'nome_cliente', r.nome_cliente, 'numero_cliente', r.numero_cliente,
        'produto_negociado', r.produto_negociado, 'preco_ofertado', r.preco_ofertado
      )
    );

    IF proximo >= 5 THEN
      UPDATE followups SET followup_step = proximo, respondeu = true WHERE id = r.id;
      UPDATE leads SET status = 'LOST' WHERE id = r.lead_id;
    ELSE
      UPDATE followups SET followup_step = proximo WHERE id = r.id;
    END IF;
  END LOOP;
END;
$function$;
