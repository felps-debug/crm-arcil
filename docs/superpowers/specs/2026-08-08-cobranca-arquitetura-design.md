# Cobrança — arquitetura e reconstrução

**Data:** 08/08/2026
**Contexto:** a cobrança automatizada já envia para clientes reais. Começa do zero com
boletos novos na segunda-feira, 10/08.

---

## Por que mexer

Quatro sistemas independentes decidem mandar mensagem para o mesmo cliente, e nenhum
sabe da existência dos outros:

| Quem manda | Quando |
|---|---|
| Python `disparar_lead` | quando alguém sobe planilha |
| Python `scheduler` | todo dia às 10h, lê `status = PENDENTE` |
| n8n `DISPARO COBRANÇA` | cron às 10:41, lê a `cobranca_log` inteira |
| pg_cron job 6 → `FLUXO FOLLOWUP` | a cada minuto |

Isso produziu, em 07/08, um follow-up às 4h da manhã para um cliente que já tinha
respondido. Não foi defeito de código: foi um sistema fazendo o trabalho dele sem
saber que outro já tinha feito.

O mesmo vale para o estado. Hoje "esse cliente já foi cobrado?" mora em quatro
lugares — a trava no Redis, `cobranca_log.respondeu`, `followups.respondeu` e
`conversations.status`. Nenhum tem autoridade sobre os outros.

E "o que o cliente deve" mora num campo de texto (`conversations.summary`) que já foi
reescrito por LLM e já transformou três boletos em um, cobrando R$ 298,55 de uma
dívida de R$ 932,00.

---

## A decisão

Não sair do n8n nem do Supabase. Terminar uma migração que ficou pela metade — o
disparo já saiu do n8n, o esqueleto ficou ligado — e separar responsabilidades:

```
CRM          lê a planilha, mostra o preview, pede aprovação
  │
Python       decide quem cobrar, quando, quanto · escreve tudo
  │
Postgres     a verdade: boletos abertos, o que já foi comunicado
  │
n8n          conversa com o cliente · lê a verdade, nunca escreve nela
```

**A regra que fecha: o n8n lê, o Python escreve.** Foi a violação disso que produziu
os dois piores defeitos — a `MEMORIA_LONGA` reescrevendo os boletos e a `cobranca_log`
sendo escrita por dois lados.

### Por que Python para decisão

Comparando como os defeitos apareceram em 07/08:

- **No Python** — valor ×10, número de disparo errado, proxy da instância errada,
  agrupamento duplo. Todos lidos no código, causa explicada em uma linha, teste
  escrito, PR aberto. O `parseSheetRows` tem teste que reprova no CI se alguém
  reagrupar.
- **No n8n** — trava permanente no Redis, `MEMORIA_LONGA` reescrevendo a fonte,
  `gera_pix` com `throw` no meio do caminho. Todos descobertos por tentativa e erro,
  ao longo de um dia, porque não há diff, não há teste, e metade do tempo o workflow
  nem estava visível.

### Por que n8n para conversa

É o que muda toda semana — prompt, tom, regra nova. Em n8n isso é editar um campo; em
Python vira commit, PR e deploy. Mover a conversa para Python trocaria a parte que
funciona pela parte mais cara de iterar.

### Inventário do n8n depois

| Workflow | Depois |
|---|---|
| `AGENTE COBRANÇA` | fica, inteiro |
| `FLUXO MEMORIA LONGA` | fica, como leitura |
| `ENCAMINHADOR HUMANO` | fica |
| `FLUXO FOLLOWUP` | fica — muda só quem puxa o gatilho |
| `DISPARO COBRANÇA` | desativado |

---

## Dados

### `cobranca_boletos`

Uma linha por boleto. A chave é o que o ERP já garante.

```sql
create table cobranca_boletos (
  id             uuid primary key default gen_random_uuid(),

  empresa        text not null,          -- Emp: PHBMa, PHBLd, ARCIL, HLB
  documento      text not null,          -- Ser/Doc/Par: "TESTE 101 1/3"

  telefone       text,
  nome_cliente   text,
  codigo_cliente text,

  valor          numeric(12,2) not null, -- Receber = principal + juros + multa − pago
  juros          numeric(12,2),
  multa          numeric(12,2),
  vencimento     date,
  status_erp     text,                   -- ABER, PARC
  observacao     text,

  aberto            boolean not null default true,
  comunicado_em     timestamptz,
  fechado_em        timestamptz,
  importado_em      timestamptz not null default now(),
  motivo_pendencia  text,                -- por que não foi cobrado

  unique (empresa, documento)
);

create index on cobranca_boletos (telefone, aberto);
create index on cobranca_boletos (empresa, aberto);
```

Medido nas exportações reais de 17.06 e 22.06: o par `(Emp, Ser/Doc/Par)` se manteve
em **67/67 boletos de Maringá e 35/35 de Londrina**, enquanto o valor mudou em
**100%**. A identidade é o documento; o valor é atributo dele.

### Importação

```
escopo = só as empresas presentes NESTE arquivo

documento novo        → insere, aberto = true
documento já existe   → atualiza valor, juros, multa, vencimento, importado_em
documento não veio    → aberto = false, fechado_em = now()      ← pagou
```

O fechamento por ausência **só vale para as empresas do arquivo**. Subir só Maringá
não pode concluir que Londrina inteira pagou.

Boleto pago some da exportação — não existe status PAGO, só `ABER` e `PARC`.

### Quem dispara

```sql
select telefone
from cobranca_boletos
where aberto and comunicado_em is null
group by telefone;
```

Só quem tem boleto **nunca comunicado**. `comunicado_em` é marcado depois da uazapi
confirmar o envio — nunca antes, senão um envio que falha nunca é retentado.

Isso resolve dois casos de uma vez: subir a mesma planilha não dispara nada, e pagar
um boleto não dispara nada, porque pagar só remove documento.

### O que o agente lê

```sql
create view cobranca_posicao as
select telefone,
       count(*)                     boletos_abertos,
       sum(valor)                   total,
       min(vencimento)              vencimento_mais_antigo,
       array_agg(distinct empresa)  empresas
from cobranca_boletos
where aberto
group by telefone;
```

A `MEMORIA_LONGA` passa a consultar isso em vez de `conversations.summary`.

### Papéis depois

| Tabela | Papel |
|---|---|
| `cobranca_boletos` | a verdade sobre a dívida |
| `cobranca_posicao` | o que o agente lê |
| `conversations.summary` | volta a ser resumo de conversa |
| `cobranca_log` | log de evento: quem recebeu o quê, quando |
| `cobranca_empresas` | CNPJ e Pix por empresa — fonte única |

---

## Fluxo

```
1. OPERADOR sobe a planilha no CRM
2. CRM      parseSheetRows → uma linha por boleto · preview agrupado · aprovação
3. PYTHON   importa em cobranca_boletos (novo/atualiza/fecha)
4. PYTHON   seleciona quem tem boleto NUNCA comunicado
            └─ ninguém novo → termina, nenhuma mensagem sai
5. PYTHON   por telefone: sorteia atraso, checa horário
            └─ fora da janela → PENDENTE, tenta amanhã às 10h
6. PYTHON   envia a saudação · marca comunicado_em no sucesso
   ╌╌╌ cliente responde ╌╌╌
7. N8N      webhook → trava do Redis? → buffer → agente
8. N8N      MEMORIA_LONGA lê cobranca_posicao · gera_pix lê cobranca_empresas
9. N8N      responde · marca respondeu
10. PYTHON  follow-up: decide a hora, chama o FLUXO FOLLOWUP
```

---

## Follow-up

```
disparo
  +3h        toque 1
  +24h       toque 2
  +72h       toque 3      (pula um dia)
  +120h      toque 4      (pula um dia)
  +168h      toque 5      (pula um dia) — último
```

Todo toque respeita 8h–18h. Um toque que cairia fora escorrega para o início da janela
seguinte, com espalhamento aleatório para não disparar tudo às 8h em ponto.

**Para quando:**

| Condição | Efeito |
|---|---|
| cliente responde qualquer coisa | para |
| posição zera (pagou tudo) | para |
| humano assume | pausa; volta se ele devolver com `/bot` |
| chega boleto novo | a mensagem de boleto novo substitui o toque e zera o contador |
| toque 5 dado sem resposta | para; cliente vai para a lista de cobrança manual |

O `FLUXO FOLLOWUP` continua montando e enviando a mensagem em qualquer cenário. Muda
só quem decide a hora, em duas etapas:

- **Semana 1** — a função `disparar_followup_cobranca()` é reescrita com a régua acima
  e com janela de 8h–18h. Continua no pg_cron. Desligar o job antes de existir
  substituto deixaria a primeira semana sem follow-up nenhum.
- **Depois** — a decisão passa para o Python, junto do resto que já sabe horário,
  espaçamento e estado da conversa. O job 6 é desligado nesse momento.

---

## Estado da conversa

Três estados, não dois:

| Estado | Robô | Follow-up | Cobra de novo? |
|---|---|---|---|
| **Aberto** | conversa | correndo | sim |
| **Com humano** | calado | pausado | sim, se voltar para aberto |
| **Resolvido** | calado | parado | nunca |

Comandos, pelo próprio WhatsApp:

```
qualquer mensagem digitada por humano  →  COM HUMANO (automático)
/bot                                    →  volta para o robô
/pago                                   →  RESOLVIDO, encerra
TTL de 24h                              →  rede de segurança
```

Hoje a trava do Redis é permanente e sem saída: em 07/08 alguém digitou "Oiii" pelo
número de cobrança e aquele contato ficou mudo para sempre.

---

## Handoff

O `ENCAMINHADOR HUMANO` tinha duas metades quase idênticas. A que rodava era a antiga;
a corrigida — com `MARCA HANDOFF`, classificação por catálogo e busca por 8 dígitos
com `LIMIT 1` — nunca tinha sido ligada ao gatilho.

Depois da correção:

```
gatilho    a Priscila chama a tool HUMANO
busca      BUSCA_LEADS1 → join vendors por segmento → vendor_telefone
grava      MARCA HANDOFF → leads.handoff_sent_at + activity_log
envia      WhatsApp para o vendedor do segmento, pelo número 7195
efeito     conversa entra em COM HUMANO
```

Para cobrança, o destino é a linha `Cobrança` em `vendors`, telefone `5544998383330`.

**Pendente:** o total que chega ao financeiro hoje é deduzido por um LLM a partir do
resumo em texto. Deve vir de `cobranca_posicao.total`. O LLM continua útil para o
resumo e a prioridade, mas não toca em dinheiro.

---

## Erro

> **Falha nunca vira silêncio.** Toda falha vira retentativa ou vira humano.

### Importação

| Falha | Comportamento |
|---|---|
| Planilha sem coluna esperada | recusa a importação inteira e diz qual falta |
| Linha sem telefone | importa, marca `motivo_pendencia`, entra na lista manual |
| Linha sem `Emp` ou `Ser/Doc/Par` | recusa a linha e reporta qual |

Nas planilhas de 22.06 há **7 boletos sem telefone** (2 em Maringá, 5 em Londrina) que
hoje ninguém cobra e ninguém sabe.

### Disparo

| Falha | Comportamento |
|---|---|
| uazapi não confirma o número | 3 tentativas espaçadas, depois lista manual |
| Envio falha | `comunicado_em` fica nulo → entra no ciclo seguinte |
| Serviço cai no meio | boleto sem `comunicado_em` é retentado; nada se perde |

Em 07/08, 20 de 26 clientes foram marcados como "não está no WhatsApp" porque o
espaçamento estava em `0–0` e a uazapi engasgou com a rajada.

### Conversa

| Falha | Comportamento |
|---|---|
| `gera_pix` sem match | devolve vazio → agente chama HUMANO. Nunca `throw` |
| Sem posição para o telefone | agente diz que vai confirmar e chama HUMANO |
| Áudio sem transcrição | "não consegui ouvir, pode escrever?" |
| Modelo falha | error workflow do n8n avisa |

### Visibilidade

`cobranca_boletos.motivo_pendencia` guarda o porquê: `sem telefone`,
`nao esta no whatsapp`, `envio falhou 3x`, `empresa sem pix`. A tela de Cobranças
ganha um bloco **"não foram cobrados — N"**.

É a diferença entre "disparei 133" e "disparei 126, e estes 7 precisam de alguém".

---

## Teste

### No CI, com as planilhas reais

Números medidos em 08/08 nos arquivos de 17.06 e 22.06:

```
MARINGA    17.06 = 78 boletos   22.06 = 97
           30 novos · 11 fecharam · 67 em ambos
           valor mudou em 67 de 67 · 2 sem telefone

LONDRINA   17.06 = 35 boletos   22.06 = 36
           1 novo · 0 fecharam · 35 em ambos
           valor mudou em 35 de 35 · 5 sem telefone
```

| Teste | Asserção |
|---|---|
| Idempotência | importar `mga 22.06` duas vezes: a segunda não insere, não fecha, não torna ninguém elegível |
| Diff entre datas | `mga 17.06` → `mga 22.06`: exatamente 30 novos, 11 fechados, 67 atualizados |
| Juros não disparam | os 67 mudaram de valor e zero entram no disparo |
| Escopo por empresa | importar só Maringá não fecha nenhum boleto de Londrina |
| Sem telefone | os 7 entram com `motivo_pendencia`, não somem |
| Marca no sucesso | envio que falha deixa `comunicado_em` nulo e reaparece no ciclo seguinte |

Já existem e passam: `parseSheetRows` (uma linha por boleto, sem `|`) e `_parse_valor`
(formatos pt-BR e en-US).

### Na mão, com boletos fictícios

Três números, empresas diferentes (`PHBMa`, `PHBLd`, `ARCIL`) para validar o Pix:

```
número 1    1 boleto     conversa simples, pix, comprovante
número 2    3 boletos    cita os três, soma, pix da empresa certa
número 3    2 boletos    o ciclo:
                         planilha 1: os 2                    → dispara
                         planilha 2: os mesmos, valor maior  → NADA sai
                         planilha 3: 1 só (pagou o outro)    → NADA sai
                         planilha 4: os 2 + 1 novo           → aviso, sem "bom dia"
```

As quatro planilhas podem subir em sequência no mesmo dia — o sistema decide por
documento comunicado, não por data.

Mais:

```
manda áudio        → responde ao conteúdo
pede desconto      → chama HUMANO de verdade (conferir no n8n)
```

### Portão para voltar a cobrar

- CI verde nos seis testes
- Os testes manuais passando
- `delay` em `0–10` e janela em `8h–18h`
- `DISPARO COBRANÇA` desativado e pg_cron job 6 desligado
- Primeira volta com uma praça só

---

## Sequência

Começar do zero compra uma semana: a cobrança repetida só morde na **segunda**
planilha, então `cobranca_boletos` precisa existir antes da segunda importação, não
antes de segunda-feira.

### Até segunda, 10/08

| | Estado |
|---|---|
| Desativar `DISPARO COBRANÇA` | feito |
| Corrigir o `ENCAMINHADOR HUMANO` | feito |
| Reescrever `disparar_followup_cobranca()` com a régua nova e janela 8h–18h | pendente |
| Mergear e deployar os PRs #1 e #2 do serviço | pendente |
| `delay` `0–10`, janela `8h–18h` | pendente |
| `gera_pix` sem `throw` | pendente |
| Trava do Redis com saída (`/bot`) | pendente |
| Zerar a base e testar com os fictícios | pendente |

O PR #2 é o mais importante: traz proteção contra repetição via
`documentos_comunicados` no metadata. Não é a tabela definitiva, mas segura a segunda
planilha enquanto ela é construída.

### Semana de 10/08

| | |
|---|---|
| `cobranca_boletos` + `cobranca_posicao` | a base de verdade |
| Follow-up saindo do pg_cron para o Python | e o job 6 desligado |
| Lista de não-cobrados na tela | os sem telefone param de sumir |
| Total do handoff vindo da posição | o LLM para de deduzir dinheiro |
| `gera_pix` lendo `cobranca_empresas` | uma fonte só para o CNPJ |

---

## Fora de escopo

- Migrar a conversa para Python
- Sair do Supabase ou do n8n
- Reprocessar os boletos antigos: a operação recomeça do zero com boletos novos
- Memória qualitativa do cliente (forma de pagamento preferida, histórico de
  comportamento) — entra depois, em campo separado, sem encostar nos boletos

---

## Pendência de segurança

Independente de tudo acima: rotacionar a `service_role` do Supabase, os tokens uazapi,
a senha do Redis, as duas chaves da OpenAI que estão em texto puro dentro dos nós do
n8n, e o token de API do n8n. Vários foram expostos em conversa durante o
desenvolvimento.
