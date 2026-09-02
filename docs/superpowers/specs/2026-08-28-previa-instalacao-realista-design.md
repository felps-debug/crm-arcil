# Prévia de instalação: realismo por IA, marcação simplificada, robustez

## Contexto

O gerador de imagem (`/chatbot`, Gerador de Imagem) entrega uma prévia técnica: foto do
ambiente editada com a IA (Gemini) mostrando o ar-condicionado instalado, mais uma camada
vetorial (satori) com cotas, callouts e cards. Dois bugs de regressão foram corrigidos na
mesma sessão que motivou este documento (ver commits anteriores): `renderGuideMask()`
quebrava sempre que a foto precisava encolher pra caber em 1280×1280 (qualquer foto de
celular real), e `formatarMetros()` convertia "2,7 cm" em "0,03 m" quando o vendedor
selecionava a unidade errada no pé-direito.

Com a imagem-guia funcionando pela primeira vez de verdade, dois problemas ficaram visíveis
que nunca tinham sido testados contra geração real:

1. **A infraestrutura frigorígena (tubulação/dreno/cabo) sai como uma listra colorida
   plana** desenhada por cima da foto (`feixeInfra`), não como algo fisicamente real —
   mesmo já existindo no código um modo `gemini_3d` (raio-x translúcido, atrás da flag
   `INFRA_VISUAL`) que a sessão anterior construiu e nunca ativou por padrão.
2. **A imagem-guia vazou para a cena final**: o Gemini reproduziu o retângulo magenta da
   guia (`#FF00FF`, confirmado por amostragem de pixel: `r232 g10 b231`) na foto entregue.
   O prompt do n8n já proíbe isso explicitamente e existe um detector
   (`detectarVazamentoDaGuia`), mas ele é hoje só informativo — a imagem já foi composta e
   entregue antes do aviso rodar.

Este documento cobre a resposta a esses dois achados mais os pedidos diretos do dono do
produto: marcação mais simples, cotas (pé-direito, distância ao teto) desenhadas como parte
da cena em vez de seta vetorial plana, QR code sem link quebrado, e consolidação das duas
marcas d'água em uma.

## Objetivo

Prévia mais realista (infraestrutura e cotas desenhadas fisicamente na cena pelo Gemini, não
como diagrama vetorial plano por cima), marcação do vendedor reduzida ao mínimo necessário
pra ancorar a geração, e duas falhas conhecidas (vazamento de guia, QR sem destino) tratadas
como o que são — não mais avisos que o vendedor precisa entender e contornar sozinho.

## 1. Marcação simplificada

**Hoje:** `marcador-instalacao.tsx` tem 3 abas — Aparelho (caixa arrastável/redimensionável),
Tubulação (rota de N pontos via cliques sucessivos), Elétrico (1 ponto). `Marcacao` em
`lib/marcacao.ts` guarda `{ caixa: {x,y,w,h}, rota: Ponto[], pontoEletrico: Ponto | null }`.

**Novo:** 1 toque (posição do aparelho, sem redimensionar — um ponto com margem implícita
fixa, do tamanho típico de um hi-wall/cassete) + 1 arrasto reto (direção geral da
infraestrutura: sobe, desce ou lateral, não uma rota com múltiplos pontos). O ponto elétrico
deixa de ter marcação própria — já existe a pergunta "Já existe ponto elétrico?" (sim/não) no
questionário; ela passa a bastar sozinha.

`Marcacao` passa a ser `{ ponto: {x,y}, direcaoInfra: {x,y} }` (dois pontos: onde o aparelho
vai, e um segundo ponto que só indica direção/sentido — não uma rota desenhada a mão). A
imagem-guia (`guide-mask.ts`) desenha uma cruz no primeiro ponto e uma seta simples do
primeiro pro segundo, no lugar dos cantos em L + rota poligonal atuais.

**Fora de escopo nesta etapa:** redesenhar a UI visual das abas/botões — só a interação de
marcação (quantidade de toques/arrastos) muda.

## 2. Infraestrutura realista por padrão

`INFRA_VISUAL` (`src/lib/env.ts`) passa a ter `gemini_3d` como padrão (hoje é `vetorial`).
Nesse modo, o prompt do n8n (`GERADOR DE PROMPT2`, bloco `# INFRASTRUCTURE`) já instrui o
Gemini a desenhar a tubulação/dreno/cabo como raio-x translúcido através da parede/gesso
quando embutida, ou canaleta real quando aparente — isso já existe e não muda.

O que muda é o nosso lado: hoje `preview-annotations.ts` desenha `feixeInfra()` (a listra de
4 cores) e o card "INFRAESTRUTURA FRIGORÍGENA" (legenda das cores) **sempre**, sem checar o
modo. Em `gemini_3d` isso duplica/conflita com o que o Gemini já desenhou. Os dois passam a
ser condicionais: só desenham quando `modoInfra === "vetorial"`. O label "LIGAÇÃO ATÉ
CONDENSADORA" (texto simples, sem a listra) continua nos dois modos.

## 3. Cotas (pé-direito, distância ao teto) desenhadas na cena

Hoje `preview-annotations.ts` desenha a seta/linha da cota (`setaDuplaVertical`) E o texto
("PÉ-DIREITO APROX. 2,70 m") como vetor. A seta passa a ser responsabilidade do Gemini —
mesma classe visual do raio-x da infraestrutura (linha fantasma/translúcida com traços de
medição) — e nosso código desenha só o texto do valor, ancorado na mesma posição fracionária
que já calcula hoje (`xPe`, `yTopo`, `yBase`), sem precisar de nenhuma detecção nova de onde
o Gemini desenhou a linha: a posição é prescrita no prompt, não descoberta depois.

O prompt do n8n ganha uma instrução nova (`# DIMENSION LINES`, análoga a `# INFRASTRUCTURE`)
descrevendo posição e estilo dessa linha fantasma, recebendo as mesmas frações que
`preview-annotations.ts` já calcula (novos campos no payload do webhook, ex.
`cota_pe_direito_frac: {x, yTopo, yBase}`).

## 4. Vazamento de guia vira bloqueante com retry automático

`detectarVazamentoDaGuia()` já existe e roda depois de `comporEEnviar()` — ou seja, depois
que a imagem final já foi composta, salva no Storage e devolvida. Ordem muda:

1. Gera a cena (chamada ao n8n).
2. Se havia guia (`guideImageBase64`), roda `detectarVazamentoDaGuia()` **antes** de compor.
3. Vazamento detectado → gera de novo (nova chamada ao n8n), até 2 tentativas extras.
4. Todas as tentativas vazaram → segue o fluxo atual (compõe e entrega com o aviso
   `posicionamento`), porque uma prévia com aviso ainda vende mais que nenhuma prévia.

Vendedor só vê o resultado limpo no caminho feliz; o aviso existente continua como rede de
segurança pro caso raro de esgotar as tentativas.

## 5. QR code

Enquanto não existir `manual_url` real (nenhuma das 4 tabelas de produto tem essa coluna
hoje), o QR aponta para `https://arcil.com.br` em vez da própria imagem no Storage. Sem
mudança de schema nesta etapa — fica registrado como pendência separada para quando os
manuais dos fabricantes forem anexados ao catálogo.

## 6. Marca d'água única

Remove o selo pequeno "Design created by ARCIL AI" (canto superior direito, composto em
`route.ts`/`comporEEnviar`). Mantém a logo "GRUPO ARCIL" grande (canto inferior esquerdo,
`logoNo()` em `installation-overlay.ts`) — é a referência já aprovada. O aviso "Prévia para
visualização. A instalação final deve ser validada..." no rodapé já cobre a transparência de
que é uma simulação gerada, então a remoção do selo não perde essa informação.

## Componentes afetados

- `src/lib/env.ts` — `INFRA_VISUAL` padrão `gemini_3d`.
- `src/lib/marcacao.ts` — schema `Marcacao` simplificado (`ponto` + `direcaoInfra`).
- `src/app/chatbot/_components/marcador-instalacao.tsx` — 1 toque + 1 arrasto, remove aba
  elétrico.
- `src/lib/server/guide-mask.ts` — desenha cruz + seta em vez de cantos em L + rota
  poligonal.
- `src/lib/server/preview-annotations.ts` — `feixeInfra`/legenda condicionais ao modo; cota
  de pé-direito/distância-teto sem seta própria, só texto.
- `src/lib/server/installation-overlay.ts` — remove aplicação do selo pequeno.
- `src/app/api/generate-image/route.ts` — retry em vazamento antes de compor; QR fallback;
  novos campos de fração pro payload do n8n (cotas).
- n8n `PVtyGZ6gQrBABe83`, nó `GERADOR DE PROMPT2` — bloco novo `# DIMENSION LINES`
  (fora do repositório; editar via API, ver armadilha do editor aberto sobrescrevendo).

## Critérios de aceite

- Marcação: 1 toque + 1 arrasto substitui as 3 abas; ponto elétrico só pela pergunta
  sim/não.
- `INFRA_VISUAL=gemini_3d` é o padrão; nenhuma listra colorida nem card de legenda aparece
  nesse modo.
- Pé-direito e distância ao teto aparecem como texto vetorial sobre uma linha desenhada pelo
  Gemini, sem seta vetorial nossa duplicando.
- Uma geração que vaza a guia (magenta/ciano detectável) tenta de novo automaticamente antes
  de entregar; só mostra o aviso atual se todas as tentativas vazarem.
- QR aponta para `arcil.com.br`, nunca mais para a própria imagem gerada.
- Só uma marca d'água aparece na prévia final (logo Grupo Arcil, canto inferior esquerdo).

## Fora de escopo nesta etapa

- Coluna `manual_url` real e upload dos manuais dos fabricantes.
- Redesenho visual das abas/botões da marcação (só a interação muda).
- Cassete comercial / `V2_CASSETTE_LAYOUT` (fluxo separado, não tocado aqui).
- Geração do local da condensadora (`condensadora-local/route.ts`, feature separada).
