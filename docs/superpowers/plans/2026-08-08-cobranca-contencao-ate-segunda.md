# Cobrança — contenção até segunda-feira

> **Para quem executa:** os passos usam checkbox (`- [ ]`). Marque conforme avança.
> Muitos passos são manuais em interfaces (easypanel, n8n, Supabase) — o caminho
> exato está em cada um.

**Objetivo:** deixar o primeiro disparo real de segunda-feira, 10/08, seguro — valor
correto, um remetente só, follow-up com horário, e nenhum caminho onde falha vira
silêncio.

**Arquitetura:** Python decide e escreve, Postgres guarda a verdade, n8n conversa.
Ver `docs/superpowers/specs/2026-08-08-cobranca-arquitetura-design.md`.

**Fora deste plano:** a tabela `cobranca_boletos` e a migração do follow-up para o
Python. Começar do zero compra uma semana — cobrança repetida só morde na segunda
planilha. Isso vira um plano próprio na semana de 10/08.

**Stack:** Python/FastAPI no easypanel · n8n · Supabase/Postgres · Redis · uazapi

---

## Fase 1 — Colocar o código corrigido no ar

### Task 1: Deploy do serviço de cobrança

Os PRs #1 e #2 já estão em `main` (`3e56d9e`), mas `autoDeploy` é `false` — nada subiu.

**Onde:** `47nukb.easypanel.host` → projeto `arcil` → serviço `arcil-cobranca-py`

- [ ] **Passo 1: Conferir as variáveis obrigatórias**

Aba **Environment**. O `config.py` exige as três abaixo com colchete — faltando uma, o
processo morre no import e o serviço devolve 502:

```
UAZAPI_TOKEN_PHB           488403a6-0dba-4a1d-a942-364531e0cb94
UAZAPI_TOKEN_HLB           (qualquer token válido)
UAZAPI_TOKEN_PROXY_FLUXO3  (qualquer token válido)
SUPABASE_URL               https://swcqvrowqwylcegrcesu.supabase.co
SUPABASE_KEY               (service role)
```

- [ ] **Passo 2: Deploy**

Botão **Deploy**. Leva cerca de dois minutos.

- [ ] **Passo 3: Verificar que subiu**

```bash
curl -s https://arcil-arcil-cobranca-py.47nukb.easypanel.host/
```

Esperado:
```json
{"status":"online","servico":"Disparo Cobrança","versao":"1.0.0"}
```

Se vier 502, abrir a aba **Logs** e procurar `KeyError` — o nome entre aspas diz qual
variável falta.

---

### Task 2: Ajustar espaçamento, janela e token reserva

**Onde:** mesma aba **Environment**

- [ ] **Passo 1: Restaurar o token do HLB**

Hoje ele guarda o token do PHB, por causa do contorno de ontem. Com o código novo o
`obter_token()` lê `UAZAPI_TOKEN_PHB`, então o HLB volta a ser o HLB:

```
UAZAPI_TOKEN_HLB=730b567c-45cc-4475-8d1f-1fd3467eedae
```

- [ ] **Passo 2: Devolver o espaçamento entre disparos**

Está em `0–0`, o que faz todos saírem no mesmo segundo. Em 07/08 isso engasgou a
uazapi e marcou 20 de 26 clientes como "não está no WhatsApp":

```
DELAY_MIN_FLUXO1_MINUTOS=0
DELAY_MAX_FLUXO1_MINUTOS=10
```

- [ ] **Passo 3: Devolver a janela comercial**

Está em `00h–24h`, o que permite disparo de madrugada para cliente real:

```
HORA_INICIO_COMERCIAL=8
HORA_FIM_COMERCIAL=18
```

- [ ] **Passo 4: Alinhar o fuso com o do Postgres**

```
TIMEZONE=America/Sao_Paulo
```

Fortaleza e São Paulo são ambos UTC−3 hoje, então nada muda na prática. Mas a
operação é no Paraná, a função `disparar_followup_cobranca()` usa
`America/Sao_Paulo`, e se o horário de verão voltar São Paulo observa e Fortaleza não
— a janela comercial deslizaria uma hora só de um lado.

- [ ] **Passo 5: Deploy e verificar**

```bash
curl -s https://arcil-arcil-cobranca-py.47nukb.easypanel.host/config
```

Esperado:
```json
{"horario_comercial":"08h–18h","delay_fluxo1_minutos":"0–10",
 "reenvio_pendentes":"10:00h","timezone":"America/Sao_Paulo","ddd_padrao":"44"}
```

**Sobre o `DDD_PADRAO`:** fica em `44` e não precisa mudar — medido nas planilhas de
22.06, **nenhuma linha vem sem DDD**, então esse valor nunca é usado. Mas é armadilha:
a planilha de Maringá traz números com DDD 43 e 47, e a de Londrina traz 18. A praça
não determina o DDD, logo não existe padrão correto. Se um dia vier telefone sem DDD,
qualquer chute inventa o número de outra pessoa.

O conserto é `normalizar_numero()` parar de chutar e mandar a linha para a lista de
cobrança manual, junto com os 7 sem telefone. Entra no plano da semana de 10/08, onde
essa lista é construída.

---

## Fase 2 — Fechar os caminhos que viram silêncio

### Task 3: `gera_pix` deixa de matar a conversa

**Onde:** n8n → `AGENTE COBRANÇA` → nó `gera_pix`

O nó fica entre o `Get a row1` e o agente. Hoje ele lança erro quando o documento não
casa com a lista, e o erro mata a execução inteira — o cliente fica sem resposta em
todas as mensagens seguintes.

- [ ] **Passo 1: Substituir o bloco do `throw`**

Está assim:

```js
if (!encontrado) {
  throw new Error(
    `Documento de cobranca nao reconhecido: "${documentoOriginal}". ` +
    "Esperado PHB Londrina, PHB Maringa, HLB Londrina, HLB Maringa ou ARCIL (PIX).",
  );
}
```

Trocar por:

```js
if (!encontrado) {
  // Sem throw: este nó fica entre o Get a row1 e o agente, então um erro aqui mata
  // a conversa inteira. Devolvendo vazio, o módulo 5B do prompt assume — ele manda
  // dizer que vai confirmar e chamar o humano.
  return {
    json: {
      pix: "",
      pix_erro: `Documento de cobranca nao reconhecido: "${documentoOriginal || "(vazio)"}"`,
    },
  };
}
```

- [ ] **Passo 2: Salvar o workflow**

Botão **Save**. Editar o campo não publica — se o workflow está ativo, salvar é o que
registra a versão nova.

- [ ] **Passo 3: Verificar que o prompt sabe usar o campo**

No mesmo workflow, nó `AGENTE COBRANÇA2` → **System Message**. Procurar por:

```
CHAVE PIX: {{ $json.pix }}
```

Se não existir, o agente recebe a chave e não sabe o que é — foi o que aconteceu em
07/08 às 18:42, quando ela disse "pague usando o CNPJ da empresa" sem dar o número.
Nesse caso, colar o `<modulo_5b_pix>` do arquivo
`PRISCILA - prompt completo v2.md` logo depois do `</modulo_5_ferramentas>`.

---

### Task 4: Devolver a conversa quando o humano terminar

**Onde:** n8n → `AGENTE COBRANÇA`

Hoje qualquer mensagem digitada pelo WhatsApp do 7195 grava uma trava no Redis e o
agente cala naquele contato. Em 07/08 alguém digitou "Oiii" às 14:12 e o contato ficou
mudo para sempre — a trava tem TTL de 600s que não está sendo aplicado.

O comando `/bot` devolve a conversa.

- [ ] **Passo 1: Confirmar que o TTL está mesmo quebrado**

easypanel → serviço `redis` → **Console**:

```
redis-cli -a 'Projetoarcil@2025' KEYS 'cobranca_*'
redis-cli -a 'Projetoarcil@2025' TTL cobranca_5544991210902_block
```

`-1` confirma chave permanente. `-2` significa que não existe.

- [ ] **Passo 2: Inserir um If antes do `Chaveblock`**

O caminho hoje é `fromMe?` → saída **false** (ou seja, `fromMe = true`) → `Chaveblock`.

Inserir um nó **If** entre os dois, chamado `é /bot?`:

```
condição:  {{ $('DADOS').item.json.mensagem.trim().toLowerCase() }}
operador:  is equal to
valor:     /bot
```

- [ ] **Passo 3: Ligar as duas saídas**

```
é /bot?  saída true   →  novo nó Redis "DEVOLVE AO BOT"
é /bot?  saída false  →  Chaveblock          (comportamento atual)
```

- [ ] **Passo 4: Criar o nó `DEVOLVE AO BOT`**

Tipo **Redis**, mesma credencial dos outros:

```
operation: delete
key:       cobranca_{{ $('DADOS').item.json['numero de telefone'] }}_block
```

- [ ] **Passo 5: Alinhar a chave que grava com a que lê**

Hoje os dois nós montam a chave a partir de fontes diferentes:

```
Chaveblock (grava)  cobranca_{{ $('DADOS').item.json['numero de telefone'] }}_block
Redis8     (lê)     cobranca_{{ $('BUSCA LOGS').item.json.wa_phone }}_block
```

Uma vem do webhook, a outra do banco. Enquanto forem iguais funciona; no dia em que
a normalização divergir — e ela já divergiu uma vez com o número do Welison, que
apareceu como `559888059232` e `5598988059232` — a trava é gravada numa chave e
procurada em outra.

No nó `Redis8`, trocar a `key` para usar a mesma fonte do `Chaveblock`:

```
cobranca_{{ $('DADOS').item.json['numero de telefone'] }}_block
```

- [ ] **Passo 6: Aumentar o TTL do `Chaveblock`**

Negociação de cobrança dura dias; 10 minutos nunca serviu. No nó `Chaveblock`:

```
expire: true
ttl:    86400
```

Rede de segurança: se ninguém digitar `/bot`, a conversa volta ao robô em 24h.

O comando `/pago` do design **não entra agora**. Ele encerra a cobrança de vez, e
"encerrar" só tem significado quando existir a `cobranca_boletos` para marcar o que
foi quitado. Até lá, quem pagou é tratado pelo caminho natural: o boleto some da
planilha seguinte. Entra no plano da semana de 10/08.

- [ ] **Passo 7: Salvar e testar**

1. Digitar qualquer coisa pelo WhatsApp do 7195 para um número de teste
2. Mandar mensagem do número de teste → o agente **não** responde
3. Digitar `/bot` pelo 7195
4. Mandar mensagem de novo → o agente responde

---

## Fase 3 — Follow-up com horário e régua nova

### Task 5: Reescrever `disparar_followup_cobranca()`

A função atual roda a cada minuto sem olhar hora nenhuma, com régua
30min/24h/48h/72h/96h. Em 07/08 ela disparou às 4h da manhã para um cliente que já
tinha respondido.

Régua nova, definida com o cliente: **3h · 24h · 72h · 120h · 168h**, e para no quinto.

**Onde:** Supabase → SQL Editor

- [ ] **Passo 1: Ver quem dispararia hoje, antes de mudar nada**

```sql
select f.id, f.nome_cliente, f.numero_cliente, f.followup_step,
       round(extract(epoch from (now() - f.created_at))/3600, 1) horas
from followups f
where f.respondeu = false and f.status = 'PENDING' and f.tipo = 'cobranca';
```

Esperado agora: **0 linhas** (a base foi zerada). Se vier alguma coisa, resolver antes
de seguir — a função nova passaria a valer para elas.

- [ ] **Passo 2: Substituir a função**

```sql
create or replace function disparar_followup_cobranca()
returns void
language plpgsql
as $$
declare
  r          record;
  horas      numeric;
  hora_local int;
  proximo    int;
  alvo       numeric;
begin
  -- Fora da janela comercial nada sai. A régua espera a próxima janela em vez de
  -- disparar de madrugada — em 07/08 a versão anterior mandou às 4h da manhã.
  hora_local := extract(hour from (now() at time zone 'America/Sao_Paulo'));
  if hora_local < 8 or hora_local >= 18 then
    return;
  end if;

  for r in
    select id, lead_id, numero_cliente, nome_cliente, created_at, followup_step
    from followups
    where respondeu = false
      and status = 'PENDING'
      and tipo = 'cobranca'
      and created_at is not null
  loop
    horas   := extract(epoch from (now() - r.created_at)) / 3600;
    proximo := coalesce(r.followup_step, 0) + 1;

    -- 3h · 24h · 72h · 120h · 168h. Depois do quinto, para.
    alvo := case proximo
              when 1 then 3
              when 2 then 24
              when 3 then 72
              when 4 then 120
              when 5 then 168
              else null
            end;

    if alvo is null or horas < alvo then
      continue;
    end if;

    perform net.http_post(
      url     := 'https://arcil-n8n.47nukb.easypanel.host/webhook/followupcobranca',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'followup_id',       r.id,
        'lead_id',           r.lead_id,
        'step',              proximo,
        'nome_cliente',      r.nome_cliente,
        'numero_cliente',    r.numero_cliente,
        'horas_apos_insert', round(horas)
      )
    );

    if proximo >= 5 then
      -- Quinto e último toque. Encerra a régua; o cliente vai para cobrança manual.
      -- Diferente da versão anterior, NÃO marca o lead como LOST: ele continua
      -- devendo, só deixa de ser perseguido automaticamente.
      update followups
      set followup_step = proximo, status = 'LOST', respondeu = true
      where id = r.id;
    else
      update followups set followup_step = proximo where id = r.id;
    end if;
  end loop;
end;
$$;
```

- [ ] **Passo 3: Verificar que a função foi criada**

```sql
select prosrc like '%America/Sao_Paulo%' tem_janela,
       prosrc like '%when 3 then 72%'    tem_regua_nova
from pg_proc where proname = 'disparar_followup_cobranca';
```

Esperado: `tem_janela = true`, `tem_regua_nova = true`

- [ ] **Passo 4: Verificar que roda sem erro fora do horário**

```sql
select disparar_followup_cobranca();
```

Esperado: executa e retorna vazio, sem erro. Com a base zerada e/ou fora da janela,
não dispara nada.

- [ ] **Passo 5: Confirmar que o cron continua ativo**

```sql
select jobid, schedule, command, active from cron.job where jobid = 6;
```

Esperado: `* * * * *`, `active = true`. O job continua; quem mudou foi a função.

---

## Fase 4 — Validar antes de segunda

### Task 6: Zerar a base

- [ ] **Passo 1: Apagar os dados de teste**

Supabase → SQL Editor:

```sql
delete from session_memory_cobranca;
delete from followups where tipo = 'cobranca';
delete from conversations where intent = 'COBRANCA';
delete from cobranca_log;
delete from leads where segment = 'COBRANCA';
```

- [ ] **Passo 2: Confirmar**

```sql
select (select count(*) from cobranca_log)                          log,
       (select count(*) from leads where segment='COBRANCA')        leads,
       (select count(*) from conversations where intent='COBRANCA') conversas,
       (select count(*) from followups where tipo='cobranca')       followups,
       (select count(*) from session_memory_cobranca)               memoria;
```

Esperado: cinco zeros.

- [ ] **Passo 3: Limpar o Redis**

easypanel → `redis` → Console:

```
redis-cli -a 'Projetoarcil@2025' KEYS 'cobranca_*'
```

Se aparecer alguma chave, apagar com `DEL <chave>`. Travas velhas fariam o agente
ficar mudo no teste.

---

### Task 7: Testar o ciclo com boletos fictícios

Três números seus, empresas diferentes para validar o Pix.

- [ ] **Passo 1: Montar as planilhas**

Formato do ERP, com as colunas `Cód / Cliente`, `Celular`, `Emp`, `Ser/Doc/Par`,
`Prorrog`, `Receber`, `Status`, `Observação`.

```
número 1   1 boleto    Emp = PHBMa
número 2   3 boletos   Emp = PHBLd
número 3   2 boletos   Emp = ARCIL
```

E mais três planilhas para o ciclo do número 3:

```
planilha 2   os mesmos 2 boletos, com Receber maior   (juros correram)
planilha 3   só 1 dos 2                               (pagou o outro)
planilha 4   os 2 originais + 1 novo
```

- [ ] **Passo 2: Recarregar o CRM antes de subir**

Fechar a aba e abrir de novo, ou `Ctrl+Shift+R`. O parsing da planilha roda no
navegador — em 07/08 um teste inteiro se perdeu porque o bundle antigo estava em
memória e reagrupou os boletos.

- [ ] **Passo 3: Subir a planilha 1 e conferir o preview**

Esperado na tela: **3 clientes · 6 boletos**. A linha do número 2 tem que mostrar
`3` na coluna de boletos, não `1`.

- [ ] **Passo 4: Disparar e verificar o que gravou**

```sql
select telefone, nome, valor, boleto_count, documento, status_disparo
from cobranca_log order by created_at;

select session_id, jsonb_array_length(summary::jsonb) qtd_boletos
from conversations where intent = 'COBRANCA';
```

Esperado: `boleto_count` de 1, 3 e 2. E `qtd_boletos` idem — se vier 1 para o cliente
de três boletos, o navegador rodou código antigo.

- [ ] **Passo 5: Conversar com cada número**

| O que fazer | Esperado |
|---|---|
| Responder a saudação | uma mensagem só, com nome + valores + vencimentos + pergunta de ciência |
| Dizer "boa tarde" | ela **não** devolve o cumprimento |
| Olhar qualquer mensagem | zero emoji |
| No número 2, perguntar "é só essa parcela?" | responde que não, cita as três |
| Pedir o pix | CNPJ da empresa daquele boleto, escrito por extenso, com pedido de comprovante |
| Mandar áudio | responde ao conteúdo do áudio |
| Pedir desconto | chama o humano de verdade — conferir em n8n → `ENCAMINHADOR HUMANO` → Executions, e se chegou WhatsApp no `5544998383330` |

- [ ] **Passo 6: Testar o ciclo no número 3**

Subir as planilhas 2, 3 e 4 em sequência, sem esperar. O sistema decide por documento
comunicado, não por data.

| Planilha | Esperado |
|---|---|
| 2 — mesmos boletos, valor maior | **nada sai** |
| 3 — um boleto a menos | **nada sai** |
| 4 — um boleto novo | sai aviso de boleto novo, **sem** "bom dia" |

Verificar depois de cada uma:

```sql
select telefone, boleto_count, valor,
       metadata->'documentos_comunicados' comunicados
from cobranca_log order by created_at;
```

- [ ] **Passo 7: Testar o `/bot`**

1. Digitar qualquer coisa pelo WhatsApp do 7195 para o número 1
2. Responder pelo número 1 → agente **não** responde
3. Digitar `/bot` pelo 7195
4. Responder de novo → agente responde

- [ ] **Passo 8: Zerar antes de segunda**

Repetir a Task 6. A carteira real entra numa base limpa.

---

## Portão para segunda-feira

Só subir a planilha real quando todos estiverem verdes:

- [ ] `/config` mostrando `08h–18h` e `0–10`
- [ ] Disparo saindo do **7195**
- [ ] Cliente com três boletos recebendo os três valores
- [ ] Pix saindo com o CNPJ certo por empresa
- [ ] Pedido de desconto chegando no `5544998383330`
- [ ] Segunda planilha idêntica **não** disparando nada
- [ ] `/bot` devolvendo a conversa
- [ ] `DISPARO COBRANÇA` desativado no n8n
- [ ] Base zerada

**Primeira volta com uma praça só** — Londrina, 36 boletos, não os 133.

---

## Depois de segunda

Vira plano próprio:

| | |
|---|---|
| `cobranca_boletos` + `cobranca_posicao` | a base de verdade, antes da segunda importação |
| Follow-up do pg_cron para o Python | e o job 6 desligado |
| Lista de não-cobrados na tela | os 7 sem telefone param de sumir |
| Total do handoff vindo da posição | o LLM para de deduzir dinheiro |
| `gera_pix` lendo `cobranca_empresas` | uma fonte só para o CNPJ |
| Rotacionar os segredos expostos | service role, tokens uazapi, Redis, OpenAI, n8n |
