# Padrão de Imagem Arcil — prancha, inspetor de qualidade e foto preservada

## Contexto

O Gerador de Imagem (`/chatbot`) entrega ao vendedor uma prévia da instalação do
ar-condicionado no ambiente real do cliente. A prévia vai para o cliente e para o
instalador parceiro (o vendedor repassa, normalmente por WhatsApp). O objetivo é que
toda prévia saia num padrão visual único da Arcil e mostre a forma correta de instalar
para não perder a garantia do fabricante.

Achados que motivam este trabalho:

1. **Texto sem acento chega na imagem.** As opções do questionário em
   `src/app/chatbot/_components/step-groups.ts` não têm acento ("Mesmo nivel do
   ambiente", "pe-direito", "tubulacao", "sera aberto") e são impressas literalmente.
   Texto livre do vendedor (unidade externa) também vai cru — já saiu
   "Distância aproximada: Sacada".
2. **A foto real não é protegida.** O Seedream redesenha a imagem inteira; nada
   garante que móveis, janelas e cores continuem iguais.
3. **A condensadora não aparece realista na mesma imagem.** O inset desenhado pelo
   modelo foi desligado (`route.ts`, `desenharInsetCondensadora = false`) porque o
   Seedream colou o quadro na persiana da porta. Hoje há um mini-esquema vetorial e
   uma geração separada, sob demanda (`/api/generate-image/condensadora-local`).
4. **Os cards cobrem parte do ambiente.** A camada do CRM é desenhada por cima da
   foto (coluna de cards ~21% da largura + véu escuro nas bordas).
5. **Nota de garantia por marca inventada por IA.** As 5 linhas de
   `brand_warranty_notes` (Philco, Agratto, Springer Midea, Hisense, Carrier) têm
   `origem = 'ia'`. Texto de garantia sem responsável humano é risco.
6. **Chamada GPT morta.** `route.ts` ainda chama o GPT para "extrair dados da
   conversa" a cada geração, mas o wizard já manda `answers` estruturadas que
   sobrescrevem tudo. `/api/chat` não é mais chamada pela tela.

Fora de escopo (etapas futuras, specs próprios): ficha técnica por modelo preenchida
por técnico (Motor de Conformidade), link público cliente/instalador, certificado de
instalação com fotos.

## Decisões tomadas com o dono do produto

- Público: cliente **e** instalador (a prancha serve aos dois).
- Aparelho: o seletor já só oferece produto com saldo — nada muda.
- Materiais de instalação (canaleta, suporte, tubulação): a IA desenha livremente.
- Infraestrutura: **transparente/raio-x por dentro** da canaleta, da parede ou do gesso.
- Condensadora: cena realista gerada **junto**, encaixada pelo CRM numa moldura.
- n8n continua no fluxo (prompt fica lá).
- Custo alvo: ~R$ 1,60 por prévia; no máximo **1 regeneração automática**, só da cena
  principal (pior caso ~R$ 2,45).
- Layout: **prancha com faixa lateral direita**.
- Validação: só local (`npm run dev`) até o dono aprovar; sem push nem deploy.

## 1. Questionário

Mudanças em `step-groups.ts` (fonte da verdade `buildSteps`; `buildStepGroups` só
reagrupa — o teste existente que compara os dois continua valendo):

| Campo | Antes | Depois | Tipos |
|---|---|---|---|
| `ambiente` | texto livre | escolha: Sala, Quarto, Escritório, Cozinha, Comércio, Outro | todos |
| `unidade_externa` | texto livre | **`local_condensadora`** (escolha): Telhado, Laje técnica, Sacada técnica, Parede externa (suporte), Chão (base) | todos menos Janela |
| — | — | **`distancia_condensadora`** (medida, m): distância até a evaporadora | todos menos Janela |
| `metragem_infra` | medida combinada | **removido** — a distância acima é a metragem da tubulação | todos |
| — | — | **`dreno`** (escolha): Para fora pela parede, Ligado em ralo ou esgoto, Precisa de bomba de dreno | todos menos Janela |
| — | — | **`tensao`** (escolha): 127 V, 220 V, Não sei | todos |
| — | — | **`obstaculos`** (escolha Sim/Não): sanca, viga, cortina ou armário a menos de 30 cm | Split Hi-Wall |

- Todas as opções e perguntas ganham acentuação correta.
- `HINTS` ganha linha para os campos novos.
- Alertas (não bloqueiam a geração; aparecem no grupo e no card de garantia):
  - `tensao` diferente da tensão do produto (quando o catálogo informa) → "Tensão do
    ponto diferente da do aparelho".
  - `obstaculos = Sim` → "Manter afastamento mínimo de {cota_lateral/cota_teto}".
  - `dreno = Precisa de bomba de dreno` → item "Bomba de dreno" na garantia.
- `ambiente = Outro` abre um campo de texto curto (único texto livre restante).
- Compatibilidade: `route.ts` aceita `unidade_externa`/`metragem_infra` antigos se
  vierem (versões salvas), mas a tela nova só envia os campos novos.

## 2. Fluxo da geração (`/api/generate-image`)

```
answers ─► [1] revisão de texto (só campos livres) ─┐
                                                   ├─► [2a] cena principal (n8n)   ┐ Promise.all
                                                   └─► [2b] cena condensadora (n8n)┘
[3] inspetor (cena principal) ── reprovou e tentativa 1? ─► repete [2a] uma vez
[4] preservação da foto (cena principal)
[5] prancha Arcil (satori + sharp) ─► upload `PDF/` ─► resposta
```

- **[1] Revisão de texto** — `lib/server/revisao-texto.ts`. Uma chamada GPT
  (`MODELO_TEXTO`) só se houver texto livre (hoje: `ambiente` quando "Outro").
  Prompt: corrigir ortografia e acentuação em pt-BR sem mudar sentido; saída JSON.
  Falha → texto original.
- **Remover** a chamada GPT de extração da conversa e o campo `messages` do body;
  apagar `src/app/api/chat/route.ts` (e `types/api.ts` correspondente) se nada mais
  importar.
- **Remover** a geração da nota de marca por IA em `getInstallationNotes`: só usa
  linha com `origem = 'manual'`; sem ela, `notes = null`. Linhas `ia` existentes
  ficam no banco (não apagar dado), apenas ignoradas.
- **[2b] Condensadora** — extrair o miolo de
  `condensadora-local/route.ts` para `lib/server/cena-condensadora.ts` (gera só a
  cena, sem texto) e chamar em paralelo com a principal. A rota sob demanda continua
  existindo para o botão do painel, usando o mesmo módulo. Os novos locais
  `parede_externa` e `chao` exigem casos novos no prompt do webhook
  `N8N_CONDENSADORA_WEBHOOK` (ver §6).

## 3. Inspetor de qualidade

`lib/server/inspetor-cena.ts` — `inspecionarCena({ fotoOriginal, cena, produto,
marcacao, tubulacao })`:

- GPT-4o com visão; imagens reduzidas a ≤1024 px de lado (JPEG) para custo.
- Resposta JSON validada (sem zod novo se o projeto não usar; validação manual):
  `{ ambiente_preservado, infra_por_dentro, aparelho_confere, sem_texto,
  posicao_confere, motivo }`, todos booleanos + `motivo` string pt-BR.
- Reprova (regenera) se qualquer um de `ambiente_preservado`, `infra_por_dentro`,
  `aparelho_confere`, `sem_texto` for `false`. `posicao_confere = false` só avisa.
  `infra_por_dentro` é ignorado quando o tipo é Janela.
- O laço existente de vazamento da guia é unificado: até **2 gerações da cena
  principal no total**, contando vazamento da guia e reprovação do inspetor
  (antes eram até 3 só para vazamento).
- Resultado vai na resposta (`inspecao: { aprovada, motivo } | null`) e o painel
  mostra o aviso quando não aprovada. Falha da chamada → `null`, segue sem inspeção.

## 4. Preservação da foto

`lib/server/preservar-foto.ts` — `preservarFoto(original, cena, marcacao)`:

1. Redimensiona a foto original para o tamanho da cena.
2. **Checagem de alinhamento**: compara as duas em 64 px de lado fora da zona da
   instalação; diferença média acima de um limiar (constante calibrada no teste
   local) → devolve a cena sem mistura.
3. **Zona da instalação**: retângulo do aparelho ∪ caixa envolvente da rota de
   infraestrutura, expandida em 10% do lado menor da imagem, com borda suavizada
   (blur ~2% do lado menor).
4. Composição: cena dentro da zona, original fora.

Sem marcação → devolve a cena sem mistura.

## 5. Prancha Arcil

Substitui `camadaAncorada`, `camadaCards` e `camadaCassetteV2` em
`installation-overlay.ts` por uma única composição (`comporPrevia` mantém a
assinatura, recebendo também a cena da condensadora opcional):

- **Canvas**: altura = altura da cena (normalizada para 1600 px); largura =
  largura da cena + faixa. Faixa = `max(480, 0.30 × altura)` px, à direita, fundo
  sólido escuro do console (tokens de `satori-nodes.ts`).
- **Sobre a foto**: só o que é ancorado ao aparelho (`preview-annotations.ts`:
  callouts com linha, cota do pé-direito, fluxo de ar). Sem véu escuro. A
  infraestrutura é desenhada pelo modelo (modo `modelo_3d`).
- **Faixa, de cima para baixo**: logo Arcil · CONDENSADORA (cena gerada em moldura
  com cantos arredondados + legenda "Ilustração: forma correta de instalação"; se a
  cena falhou, o esquema de `install-schematic.ts`) · MODELO (foto do catálogo,
  nome do ERP, BTU, dimensões com "aprox." quando estimadas) · CUIDADOS DE
  GARANTIA (`HVAC_STANDARDS[tipo].recomendacoes_garantia` + alertas do §1, ícones
  existentes) · QR + rótulo.
- **Rodapé da faixa**: rodapé legal existente e "Imagem gerada pela IA da Arcil"
  em ~9 px.
- O ponto do layout em que se escolhe lado da coluna (`cardsNaDireita`) deixa de
  existir; a flag `V2_CASSETTE_LAYOUT` e `layouts/cassette-commercial-layout.ts` são
  removidos se nada mais os usar.

## 6. Mudanças no n8n (entregues como código para colar)

O conector n8n desta sessão não está autenticado. Entrego blocos prontos para o
dono colar, com instrução de recarregar a aba do editor antes (armadilha do
AGENTS.md):

- **MONTA PROMPT SEEDREAM** (workflow `PVtyGZ6gQrBABe83`): bloco de estilo
  "raio-x" padronizado por caso — canaleta aparente (canaleta branca semitransparente
  mostrando cobre isolado, dreno e cabo dentro), embutida na parede (corte
  translúcido na alvenaria/drywall), sob o forro/gesso (forro translúcido sobre a
  rota). Mesma cor e opacidade sempre. Reforço: nenhuma letra, não alterar nada fora
  da zona da instalação. Exige o código atual do nó (o JSON em `docs/` é anterior à
  troca para Seedream) — peço ao dono que cole o código atual antes.
- **Webhook da condensadora**: casos `parede_externa` e `chao`.

## 7. Erros

| Falha | Comportamento |
|---|---|
| Cena principal | erro como hoje (nenhuma prévia) |
| Cena da condensadora | moldura com esquema vetorial; prévia sai |
| Inspetor | segue sem inspeção, log `[generate-image]` |
| Revisão de texto | texto original |
| Preservação (alinhamento) | cena sem mistura |

## 8. Testes

- `step-groups.test.ts`: campos novos por tipo; nenhum texto de pergunta/opção com
  palavra da lista de proibidas sem acento (`instalacao`, `tubulacao`, `nivel`,
  `sera`, `pe-direito`, `eletrico`, `distancia`, `alcapao`, `manutencao`, ...).
- Mesmo verificador aplicado às strings de `installation-overlay.ts`,
  `preview-annotations.ts`, `hvac-standards.ts`, `condensadora-local`.
- `preservar-foto.test.ts`: zona correta, cena desalinhada → sem mistura.
- `inspetor-cena.test.ts`: parse de resposta válida, inválida, decisão de regenerar.
- `installation-overlay.test.ts`: dimensões da prancha, com e sem cena de
  condensadora, com e sem marcação.
- Gate: `npm run typecheck`, `npx eslint src e2e scripts`, `npm run test`; depois
  teste manual local pelo dono.
