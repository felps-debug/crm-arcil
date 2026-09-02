# Redesign do fluxo /chatbot: questionário, marcação e resultado

## Contexto

`/chatbot` (Gerador de Imagem) hoje é um wizard disfarçado de chat: `page.tsx`
(1250 linhas) renderiza um card de altura fixa (`h-[min(600px,70dvh)]`) com bolhas de
mensagem, uma pergunta por vez, avanço com `setTimeout` de 550ms simulando "digitando...".
O questionário (`buildSteps()`) tem entre 8 e 12 passos dependendo do tipo de equipamento. A
marcação na foto (`marcador-instalacao.tsx`) roda dentro do rodapé desse mesmo card — sem
altura própria, dividindo espaço com o resto do layout.

Testado ao vivo pelo dono do produto, o veredito foi "ruim em tudo": pouco espaço pra marcar,
caixa de tamanho fixo (não redimensionável), instrução de toque/arrasto pouco clara, gesto
ruim no dedo, questionário longo, ritmo de chat lento, perguntas técnicas sem explicação, e a
metáfora de bolha de chat não serve pra isto (é um formulário, não uma conversa). Na tela de
resultado (comparação antes/depois + versões + ajuste + local da condensadora), o conteúdo
está certo mas empilhado sem hierarquia, e o slider de comparação é difícil de arrastar no
dedo.

Decisão de compatibilidade que orienta todo o resto: `route.ts` (`/api/generate-image`) só
lê o `answers` estruturado (por chave) e o `marcacao {caixa, rota}` — não depende de como a
UI apresenta isso, nem do texto exato das perguntas. `messages` (transcrito Q&A) só alimenta
um extractor de IA como *fallback*; os campos que já vêm estruturados sobrescrevem o que ele
extrai (`route.ts:230-245`). Isto significa que o redesign é front-end puro, com uma exceção:
`lib/marcacao.ts` corta `rota` para os 2 primeiros pontos (`.slice(0, 2)`), e a marcação nova
precisa mandar um traço livre com dezenas de pontos.

## Objetivo

Substituir a metáfora de chat por um wizard de tela cheia com grupos de perguntas por tema;
redesenhar a marcação como uma etapa própria de tela cheia com dois modos explícitos
(posicionar aparelho / desenhar tubulação); reorganizar (não recriar) a tela de resultado.
Mesmas chaves de `answers`, mesmo contrato com `/api/generate-image`.

## 1. Questionário: de bolhas de chat pra wizard de grupos

**Hoje:** `Step` é sempre um campo (`buildSteps()` gera de 7 a 12), renderizado um de cada
vez em bolha de chat, com pausa de "digitando..." entre cada avanço.

**Novo:** `Step` vira `StepGroup` — um array de campos exibidos juntos numa tela. Mesmas
chaves e mesma lógica de ramificação por `tipo_equipamento` (`buildSteps()` continua
decidindo o ramo; só a granularidade da unidade muda de "1 campo" pra "grupo de campos").
Navegação sequencial com botão "Voltar" sempre visível pra revisar/corrigir o grupo anterior
— sem pular etapas fora de ordem.

Agrupamento proposto (mantém as mesmas perguntas de hoje, só reagrupadas):

| Grupo | Campos | Ramos |
|---|---|---|
| Ambiente e aparelho | `ambiente`, `produto` (picker) | todos |
| Foto | `foto` (upload) | todos — tela própria, cheia, sem outros campos |
| Marcação | `marcacao` | todos — ver seção 2, tela própria |
| Forro | `tipo_forro`, `pe_direito`, `alcapao`, `ponto_eletrico` | Cassete |
| Forro e dutos | `tipo_forro`, `pe_direito`, `rede_dutos`, `ponto_eletrico` | Dutado |
| Estrutura | `tipo_parede`\*, `pe_direito`, `ponto_eletrico` | Hi-Wall |
| Estrutura | `superficie_fixacao`, `pe_direito`, `ponto_eletrico` | Piso-teto |
| Vão e elétrica | `vao_janela`, `pe_direito` (medida do vão), `ponto_eletrico` | Janela |
| Infraestrutura | `unidade_externa`, `nivel_condensadora`, `tubulacao`\*\*, `metragem_infra` | Hi-Wall, Cassete, Piso-teto |
| Infraestrutura | `unidade_externa`, `nivel_condensadora`, `metragem_infra` | Dutado |
| Infraestrutura | `metragem_infra` (só) | Janela — sem condensadora, como já é hoje |

\* Hi-Wall inclui `tipo_parede`, Piso-teto e Dutado não têm esse campo (já é assim hoje).
\*\* Dutado não pergunta `tubulacao` (rede de dutos já é uma pergunta própria em "Forro e
dutos").

Cada campo técnico ganha uma linha de hint abaixo do label (texto curto, sem ilustração
nova): ex. pé-direito → "altura do chão até o teto, medida na parede onde a unidade vai";
plenum/forro → "espaço entre a laje e o forro, onde a unidade fica escondida". Sem pausa de
"digitando..." — troca de grupo é imediata.

`buildAnswersForApi()` continua existindo como está: monta o array `messages` (Q&A) a partir
de `answers`, internamente, sem precisar renderizar como bolhas — vira puro dado enviado pro
`fetch("/api/generate-image")`, nunca mostrado na tela.

## 2. Marcação: tela cheia, dois modos explícitos, traço livre

**Hoje:** embutida no rodapé do card de chat (sem altura própria), 1 toque posiciona a caixa
(tamanho fixo por família, não redimensionável), 1 arrasto define uma reta de 2 pontos pra
direção da infraestrutura. Distinção toque-vs-arrasto é implícita (por distância percorrida
em pixels).

**Novo:** etapa própria em tela cheia (ou o mais próximo disso no viewport disponível — sem
dividir espaço com transcript/header de chat). Dois modos por botão explícito, nunca por
gesto adivinhado:

- **Modo "Aparelho"** (padrão ao entrar na etapa): toque posiciona a caixa (como hoje); a
  caixa ganha 4 alças nos cantos pra redimensionar arrastando — tamanho deixa de vir só do
  palpite por família, o palpite vira só o valor inicial.
- **Modo "Tubulação"**: dedo desenha um traço livre sobre a foto (like o rabisco de exemplo
  que o usuário mandou), não mais um arrasto reto de 2 pontos. Todo ponto do gesto
  (`pointermove`) é capturado em `PontoFrac[]`. Botão "Desfazer traço" limpa e deixa
  redesenhar. Precisão de ponta a ponta não importa — ver compatibilidade abaixo.

Botões "Pular" e "Confirmar marcação" continuam existindo como hoje.

### Compatibilidade com o pipeline (achado chave desta sessão)

`preview-annotations.ts` **já** tem o ferramental pra rota de dezenas de pontos, construído
mas nunca exercitado porque a UI só mandava 2 pontos:

- `simplificar()` — Ramer-Douglas-Peucker, descarta pontos quase colineares.
- `suavizar()` — Chaikin, corta cantos, dá aparência de tubo dobrado.
- `prolongarAteBorda()` — estende a rota até a borda do quadro na direção do último trecho.

`guide-mask.ts` já desenha a rota como polilinha genérica (`"M " + m.rota.map(...).join(" L
")`) — funciona pra 2 pontos ou 50 sem mudança nenhuma.

O único ponto que trava traço livre hoje é `lib/marcacao.ts:61-71`
(`parseMarcacao`), que corta `rota` pros 2 primeiros pontos com o comentário "a marcação é 1
arrasto, não uma rota ponto a ponto". Esse corte sai. Fica um teto de pontos (ex. 200) só
por sanidade de payload — o cliente já deveria rodar uma simplificação leve (distância
mínima entre pontos capturados) antes de mandar, então o volume real fica bem abaixo disso.

`descreverMarcacao()` (texto que também vai pro prompt do n8n como redundância da imagem-guia)
não precisa mudar — já descreve só "indicou a direção", frase que serve tanto pra reta quanto
pra traço livre.

## 3. Resultado: reorganizar, conteúdo já está certo

Sem mudança de funcionalidade — todas as ações de hoje continuam (comparar, gerar outra
versão, ajustar, opção de local da condensadora, baixar, notas de instalação). Duas mudanças:

- **Slider antes/depois**: alvo de toque da bolinha aumenta; clicar/tocar em qualquer ponto
  da faixa de comparação move o divisor pra lá direto, sem precisar acertar a bolinha
  pequena pra começar a arrastar.
- **Hierarquia visual**: painel de comparação fica sempre visível no topo; "Ajustar imagem",
  "Opção de local da condensadora" e "Versões" saem do empilhamento vertical fixo (hoje: 4
  blocos sempre abertos, um embaixo do outro) e viram abas dentro do mesmo card — só uma
  aberta por vez, escolhida pelo vendedor.

## Componentes afetados

- `src/app/chatbot/page.tsx` — reescrita do wizard: `Step` → `StepGroup`, navegação
  sequencial com voltar, remove metáfora de chat (transcript, bolhas, "digitando...").
  Reorganização da área de resultado em abas.
- `src/app/chatbot/_components/marcador-instalacao.tsx` — reescrita: tela cheia, alternância
  de modo por botão, alças de redimensionar, captura de traço livre em `pointermove`.
- `src/lib/marcacao.ts` — `parseMarcacao`: remove `.slice(0, 2)`, aplica teto de pontos
  (~200) em vez de corte pra 2.
- `src/app/chatbot/_components/produto-picker.tsx` — sem mudança de lógica; só o container
  que o hospeda muda (vira conteúdo do grupo "Ambiente e aparelho").

## Não muda

- `src/app/api/generate-image/route.ts` — contrato de `answers`/`marcacao`/`messages`
  idêntico.
- `preview-annotations.ts`, `guide-mask.ts` — já suportam traço livre, nenhuma edição
  necessária.
- Prompt do n8n (`GERADOR DE PROMPT2`) — já descreve a rota como "path"/"line" genérico.
- Upload e compressão de foto (`comprimirFoto`, bucket `chatbot-images`).
- Histórico (`HistóricoTab`, `PreviewModal`, `retomarDoHistorico`).

## Critérios de aceite

- Questionário: mesmo conjunto de perguntas por tipo de equipamento, agora em grupos por
  tema, navegação sequencial com voltar, sem bolha de chat nem pausa de "digitando...".
- Cada campo técnico tem uma linha de hint visível sem precisar de clique extra.
- Marcação ocupa a tela inteira (não divide espaço com outro conteúdo), tem os dois modos
  (Aparelho/Tubulação) como botões explícitos, caixa redimensionável por alças, tubulação
  desenhada em traço livre.
- Uma marcação com traço livre de várias dezenas de pontos chega inteira em
  `parseMarcacao`, aparece na imagem-guia como polilinha suave, e ancora o callout "LIGAÇÃO
  ATÉ CONDENSADORA" no fim do traço (comportamento que `preview-annotations.ts` já tem).
- Resultado: slider aceita toque em qualquer ponto da faixa; ajuste/condensadora/versões
  viram abas, painel de comparação nunca sai da tela.
- Geração de imagem ponta a ponta continua funcionando sem mudança em `route.ts` ou no n8n.

## Fora de escopo nesta etapa

- Qualquer mudança em `route.ts`, no prompt do n8n, ou na migração pro Seedream (ver
  memória `crm-arcil-seedream-migracao`, pausada esperando crédito).
- Redesenho do histórico ou do modal de prévia.
- Ilustrações/diagramas novos pros hints técnicos — só texto por enquanto.
- Geração da opção de local da condensadora (`condensadora-local/route.ts`) — só a
  apresentação (virar aba) muda, não a lógica.
