import sharp from "sharp";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiPermission } from "@/lib/server/api-auth";
import { SUPABASE_URL, OPENAI_API_KEY, N8N_CHATBOT_WEBHOOK, INFRA_VISUAL } from "@/lib/env";
import { assertEnv } from "@/lib/server/env-guard";
import { ARCIL_WATERMARK_BADGE_BASE64, ARCIL_WATERMARK_BADGE_WIDTH, ARCIL_WATERMARK_BADGE_HEIGHT } from "@/lib/watermark-badge";
import { comporPrevia } from "@/lib/server/installation-overlay";
import type { DadosOverlay } from "@/lib/server/previa-tipos";
import { parseMarcacao, descreverMarcacao, type Marcacao } from "@/lib/marcacao";
import { renderGuideMask } from "@/lib/server/guide-mask";
import { resolveEquipmentSpecs, type EquipmentSpecs, type HvacStandardRule } from "@/constants/hvac-standards";

// A rota espera o n8n desenhar a imagem, o que passa de um minuto. O padrão da
// plataforma corta antes e o vendedor recebe um erro genérico enquanto a geração
// ainda está em pé do outro lado.
export const maxDuration = 300;

// Selo menor e mais discreto (pedido do Luke: "mais profissional") — em vez de
// regenerar o PNG de origem, reduz o mesmo badge em 65% na hora de compor.
// Cacheado porque o buffer de origem é sempre o mesmo, não precisa reprocessar
// a cada geração.
const SELO_ESCALA = 0.65;
const SELO_LARGURA = Math.round(ARCIL_WATERMARK_BADGE_WIDTH * SELO_ESCALA);
const SELO_ALTURA = Math.round(ARCIL_WATERMARK_BADGE_HEIGHT * SELO_ESCALA);
let seloReduzidoCache: Buffer | null = null;
async function seloReduzido(): Promise<Buffer> {
  if (!seloReduzidoCache) {
    seloReduzidoCache = await sharp(Buffer.from(ARCIL_WATERMARK_BADGE_BASE64, "base64"))
      .resize(SELO_LARGURA, SELO_ALTURA)
      .png()
      .toBuffer();
  }
  return seloReduzidoCache;
}

interface ApiMessage {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

const EQUIPMENT_GUIDANCE: Record<string, string> = {
  "split hi-wall": "Representar a evaporadora horizontal fixada na parede; respeitar afastamentos, dreno, linha frigorígena e acesso para manutenção.",
  cassete: "Representar a unidade interna embutida no forro, com painel quadrado alinhado ao teto; não tratar como equipamento de parede e prever acesso técnico, dreno e distribuição de ar compatíveis.",
  "piso-teto": "Representar a unidade interna na configuração piso-teto indicada pelo ambiente, sem transformá-la em split de parede; respeitar suportes, peso, dreno, tubulação e manutenção.",
  dutado: "Representar a unidade dutada conectada à rede de dutos e grelhas, sem inventar uma evaporadora aparente na parede; prever espaço técnico, retorno, insuflamento, dreno e manutenção.",
  janela: "Representar a unidade única embutida no vão da janela ou da parede, sem separar evaporadora e condensadora — é uma peça só, com a face traseira voltada para fora; não desenhar tubulação frigorígena externa nem unidade externa à parte.",
};

// Até aqui só o hi-wall tinha cota fixa, porque era a única validada contra a
// prática da ARCIL — pros demais tipos, "conforme manual do fabricante" era
// mais seguro que inventar um número (foi exatamente inventar "2,80m" onde o
// vendedor respondeu 2,70 que fez este overlay nascer com valor vindo do
// banco, não do modelo de imagem). Isso mudou: `regra` agora vem do padrão
// NBR 16655/5410 (hvac-standards.ts), que existe exatamente pra servir de
// fallback de garantia enquanto não temos os PDFs dos manuais cadastrados —
// não é mais "sem confirmação", é norma pública, igual ao que já alimenta o
// `equipment_guidance` mandado pro n8n.
//
// `cota_teto` não significa a mesma coisa pra todo tipo: em Hi-Wall e
// Piso-Teto é mesmo distância até o teto, mas em Cassete e Dutado (família
// forro) é texto descritivo ("Embutido flush no forro") — a medida real de
// vão de plenum desses dois vive em `regra.plenum_minimo`. Por isso o tipo
// entra aqui: só pra decidir qual campo vira `distanciaTeto`.
// A resposta real do vendedor (`peDireitoFormatado`) sempre ganha da norma
// quando existe — mostrar "26 cm a 35 cm" (mínimo genérico da NBR) enquanto
// o vendedor já respondeu "0,60 m" pra ESSA instalação é mostrar o dado menos
// relevante pro cliente na frente do mais relevante. A norma só é fallback
// pra quando ninguém confirmou nada ainda.
function overlayCotas(
  tipo: unknown,
  regra: HvacStandardRule,
  peDireitoFormatado: string | null
): { alturaInstalacao: string; distanciaTeto: string; espacamentoLateral: string } {
  const tipoNormalizado = typeof tipo === "string" ? tipo.trim().toLowerCase() : "";
  const ehForro = tipoNormalizado === "cassete" || tipoNormalizado === "dutado";
  const distanciaTeto = ehForro ? peDireitoFormatado ?? regra.plenum_minimo ?? regra.cota_teto : regra.cota_teto;
  return { alturaInstalacao: regra.cota_piso, distanciaTeto, espacamentoLateral: regra.cota_lateral };
}

function equipmentGuidance(type: unknown) {
  const normalized = typeof type === "string" ? type.trim().toLowerCase() : "";
  return EQUIPMENT_GUIDANCE[normalized] ?? "Usar o tipo informado sem substituí-lo por outro; manter espaço para manutenção e respeitar o manual do fabricante.";
}

/**
 * Acrescenta à diretriz de equipamento as distâncias mínimas de garantia da
 * NBR 16655/NBR 5410 — fallback enquanto não temos os PDFs dos manuais dos
 * fabricantes cadastrados. Isso NÃO substitui `overlayCotas()` (que só cravou
 * número pro hi-wall depois de um "2,80m" inventado onde o vendedor respondeu
 * 2,70 — ver comentário ali); aqui é padrão de norma, não número específico
 * deste aparelho, e vai só pra diretriz textual que o n8n recebe.
 */
function comDiretrizNbr(type: unknown, guidance: string, specs: EquipmentSpecs): string {
  const tipo = typeof type === "string" && type.trim() ? type.trim() : "Hi-Wall";
  const { regra } = specs;
  const capacidade = specs.btu ? `${specs.btu.toLocaleString("pt-BR")} BTU/h ` : "";
  const dimensao = `(${specs.dimensoesFormatadas}${specs.origemDimensoes === "padrao_estimado" ? ", estimado por tipo/capacidade" : ""})`;
  const resumoNbr = `Equipamento ${tipo} ${capacidade}${dimensao}. Padrão NBR 16655/5410: teto ${regra.cota_teto}, laterais ${regra.cota_lateral}, piso ${regra.cota_piso}${regra.plenum_minimo ? `, plenum ${regra.plenum_minimo}` : ""}${regra.alcapao ? `, alçapão ${regra.alcapao}` : ""}; tubulação ${regra.tubulacao_minima}; vácuo ${regra.vacuo_obrigatorio}; elétrica ${regra.eletrica_norma}; dreno ${regra.dreno_norma}.`;
  return `${guidance} ${resumoNbr}`;
}

/** Modelo usado em todas as chamadas de texto e visão desta rota.
 *
 *  gpt-5.1 custa metade do gpt-4o na entrada (US$ 1,25 contra US$ 2,50 por
 *  milhão), e entrada é o grosso do gasto aqui — a análise da foto sozinha
 *  manda quase mil tokens de imagem. */
const MODELO_TEXTO = "gpt-5.1";

async function openAI(body: object) {
  // A família gpt-5 recusa `max_tokens` e exige `max_completion_tokens`. Como
  // as chamadas desta rota nasceram no gpt-4o, a tradução fica aqui em vez de
  // em cada chamada — trocar o modelo não pode obrigar a revisar cinco lugares.
  const corpo = body as Record<string, unknown>;
  if (typeof corpo.model === "string" && corpo.model.startsWith("gpt-5") && "max_tokens" in corpo) {
    const { max_tokens, ...resto } = corpo;
    body = { ...resto, max_completion_tokens: max_tokens };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // "OpenAI error" sem corpo custou uma rodada de investigação inteira pra
    // achar que era "Error while downloading file" (imagem ainda não
    // propagada no Storage) — o status/corpo real vai no log a partir daqui.
    const corpo = await res.text().catch(() => "");
    throw new Error(`OpenAI error (HTTP ${res.status}): ${corpo.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content as string;
}

export async function POST(request: NextRequest) {
  try {
    assertEnv("OPENAI_API_KEY", OPENAI_API_KEY);
    assertEnv("N8N_CHATBOT_WEBHOOK", N8N_CHATBOT_WEBHOOK);
  } catch (err) {
    console.error("[generate-image]", err);
    return Response.json({ error: "Configuração do servidor incompleta" }, { status: 500 });
  }

  const { user, response } = await requireApiPermission("manage_gerador_imagem");
  if (response) return response;

  const supabase = await createClient();

  const {
    messages,
    imageUrl,
    answers,
    referenceImageUrl,
    revisionPrompt,
    marcacao: marcacaoBruta,
  }: {
    messages: ApiMessage[];
    imageUrl?: string;
    answers?: Record<string, string>;
    referenceImageUrl?: string;
    revisionPrompt?: string;
    marcacao?: unknown;
  } = await request.json();

  // `null` aqui nao e erro: significa "vendedor pulou a marcacao", e o pipeline
  // inteiro tem que seguir funcionando sem ela — e o comportamento que existia
  // antes desta feature.
  const marcacao: Marcacao | null = parseMarcacao(marcacaoBruta);

  if (imageUrl) {
    const allowedHost = new URL(SUPABASE_URL).hostname;
    const allowedPathPrefix = "/storage/v1/object/public/chatbot-images/";
    try {
      const parsed = new URL(imageUrl);
      if (parsed.hostname !== allowedHost || !parsed.pathname.startsWith(allowedPathPrefix)) {
        return Response.json({ error: "imageUrl não permitido" }, { status: 400 });
      }
    } catch {
      return Response.json({ error: "imageUrl inválida" }, { status: 400 });
    }
  }

  if (referenceImageUrl) {
    const allowedHost = new URL(SUPABASE_URL).hostname;
    const allowedPathPrefixes = ["/storage/v1/object/public/PDF/", "/storage/v1/object/public/chatbot-images/"];
    try {
      const parsed = new URL(referenceImageUrl);
      if (parsed.hostname !== allowedHost || !allowedPathPrefixes.some((prefix) => parsed.pathname.startsWith(prefix))) {
        return Response.json({ error: "referenceImageUrl não permitido" }, { status: 400 });
      }
    } catch {
      return Response.json({ error: "referenceImageUrl inválida" }, { status: 400 });
    }
  }

  if (revisionPrompt && (typeof revisionPrompt !== "string" || revisionPrompt.trim().length < 4 || revisionPrompt.length > 1200)) {
    return Response.json({ error: "Descreva o ajuste desejado em até 1200 caracteres" }, { status: 400 });
  }

  const leadId = crypto.randomUUID();

  // Extract structured data from conversation
  let collectedData: Record<string, unknown> = {};
  try {
    const raw = await openAI({
      model: MODELO_TEXTO,
      messages: [
        {
          role: "system",
          content:
            "Extraia as informações da conversa e retorne um JSON com os campos: tipo_equipamento, marca, modelo, pe_direito, ponto_eletrico (boolean), unidade_externa, nivel_condensadora, tubulacao. Retorne APENAS o JSON válido, sem markdown.",
        },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      max_tokens: 300,
    });
    collectedData = JSON.parse(raw);
  } catch {}

  // Respostas do usuário sobrescrevem o que a IA extraiu do texto — a
  // reextração por IA já causou perda/troca de valor (ex: "embutida" virou
  // "canaleta", "pé direito 2.50" virou o padrão genérico "aprox. 2,20m").
  // Já temos a resposta exata de cada pergunta fixa, não precisa reextrair.
  if (answers?.tipo_equipamento) collectedData.tipo_equipamento = answers.tipo_equipamento;
  if (answers?.marca) collectedData.marca = answers.marca;
  if (answers?.modelo) collectedData.modelo = answers.modelo;
  // Vem do seletor de produto. Com ele a foto oficial é lookup exato; sem ele
  // (histórico antigo, antes do seletor existir) cai na busca por semelhança.
  if (answers?.codigo_erp) collectedData.codigo_erp = answers.codigo_erp;
  if (answers?.sku) collectedData.sku = answers.sku;
  if (answers?.pe_direito) collectedData.pe_direito = answers.pe_direito;
  if (answers?.tubulacao) collectedData.tubulacao = answers.tubulacao;
  if (answers?.unidade_externa) collectedData.unidade_externa = answers.unidade_externa;
  if (answers?.nivel_condensadora) collectedData.nivel_condensadora = answers.nivel_condensadora;
  if (answers?.ponto_eletrico) collectedData.ponto_eletrico = answers.ponto_eletrico === "Sim";
  if (answers?.tipo_parede) collectedData.tipo_parede = answers.tipo_parede;
  if (answers?.tipo_forro) collectedData.tipo_forro = answers.tipo_forro;
  if (answers?.alcapao) collectedData.alcapao = answers.alcapao === "Sim";
  if (answers?.metragem_infra) collectedData.metragem_infra = answers.metragem_infra;

  // Analyze image with Vision. Pede em JSON pra separar a descrição livre
  // (compatibilidade — é o texto que sempre foi mandado ao n8n como "resumo
  // da imagem") da ancoragem espacial estruturada: onde instalar, de onde vem
  // a luz e o que desviar. Cada campo puxado à parte rende uma frase melhor
  // que tentar recortar isso de um parágrafo solto depois.
  let imageDescription = "";
  let ancoragemRecomendada = "";
  let direcaoIluminacao = "";
  let obstaculosDesvio = "";
  if (imageUrl) {
    try {
      const raw = await openAI({
        model: MODELO_TEXTO,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
              {
                type: "text",
                text:
                  "Analise esta foto de ambiente para instalação de ar-condicionado e retorne APENAS um JSON válido, sem markdown, com os campos: " +
                  '"descricao_tecnica" (tipo de parede/forro, cor, dimensões estimadas, tomadas/marcações elétricas, objetos próximos — técnico e conciso), ' +
                  '"ancoragem_recomendada" (onde exatamente instalar, ex: "Na parede frontal de alvenaria, centralizado acima da TV, respeitando 20cm abaixo do teto"), ' +
                  '"direcao_iluminacao" (de onde vem a luz principal, ex: "Luz natural vindo da janela lateral esquerda"), ' +
                  '"obstaculos_desvio" (elementos a desviar, ex: "Evitar cortinas à direita e molduras de gesso"; string vazia se não houver).',
              },
            ],
          },
        ],
        max_tokens: 500,
      });
      const parsed = JSON.parse(raw);
      imageDescription = typeof parsed.descricao_tecnica === "string" ? parsed.descricao_tecnica : "";
      ancoragemRecomendada = typeof parsed.ancoragem_recomendada === "string" ? parsed.ancoragem_recomendada : "";
      direcaoIluminacao = typeof parsed.direcao_iluminacao === "string" ? parsed.direcao_iluminacao : "";
      obstaculosDesvio = typeof parsed.obstaculos_desvio === "string" ? parsed.obstaculos_desvio : "";
    } catch (err) {
      console.error("[generate-image] Vision estruturada falhou:", err instanceof Error ? err.message : err);
    }
  }
  const ancoragemEspacial = [
    ancoragemRecomendada,
    direcaoIluminacao ? `Iluminação: ${direcaoIluminacao}` : null,
    obstaculosDesvio ? `Evitar: ${obstaculosDesvio}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  const prompt = [
    collectedData.tipo_equipamento ? `Tipo de equipamento: ${collectedData.tipo_equipamento}` : null,
    collectedData.marca ? `Marca: ${collectedData.marca}` : null,
    collectedData.modelo ? `Modelo: ${collectedData.modelo}` : null,
    collectedData.tipo_parede ? `Tipo de parede: ${collectedData.tipo_parede}` : null,
    collectedData.pe_direito ? `Pé direito: ${collectedData.pe_direito}` : null,
    typeof collectedData.ponto_eletrico === "boolean"
      ? `Ponto elétrico: ${collectedData.ponto_eletrico ? "já existe" : "não existe"}`
      : null,
    collectedData.unidade_externa ? `Unidade externa: ${collectedData.unidade_externa}` : null,
    collectedData.nivel_condensadora ? `Nível da condensadora em relação ao ambiente: ${collectedData.nivel_condensadora}` : null,
    collectedData.tubulacao ? `Tubulação: ${collectedData.tubulacao}` : null,
    typeof collectedData.alcapao === "boolean"
      ? `Alçapão de inspeção: ${collectedData.alcapao ? "deve ser incluído na instalação" : "não será incluído"}`
      : null,
    collectedData.metragem_infra ? `Metragem estimada de tubulação/dreno/cabo: ${collectedData.metragem_infra}` : null,
    imageDescription ? `Descrição do ambiente: ${imageDescription}` : null,
    // A marcação do vendedor vem DEPOIS da ancoragem sugerida pela visão e
    // sobrescreve o sentido dela de propósito: uma é palpite de IA sobre a
    // foto, a outra é o vendedor apontando o dedo no lugar. Quando as duas
    // existem, a última frase do prompt é a que manda.
    ancoragemEspacial ? `Ancoragem espacial sugerida pela análise da foto: ${ancoragemEspacial}` : null,
    marcacao ? `POSIÇÃO DEFINIDA PELO VENDEDOR (tem prioridade sobre a sugestão acima): ${descreverMarcacao(marcacao)}` : null,
    `Diretriz técnica do equipamento: ${equipmentGuidance(collectedData.tipo_equipamento)}`,
    "A simulação deve ser executável para vendedor, instalador ou orçamento. Não esconder tubulação, dreno, suportes ou acessos necessários; seguir o manual oficial da marca e do modelo para preservar a garantia.",
    revisionPrompt?.trim() ? `AJUSTE SOLICITADO: ${revisionPrompt.trim()}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  // Passo 0 (2026-08-26): nenhuma das 4 tabelas de produto do ERP tem coluna
  // de dimensão, e `btu` está null em toda linha — a capacidade só existe
  // dentro do texto do nome/modelo. `resolveEquipmentSpecs` tenta o ERP
  // primeiro (pronto pro dia em que passar a vir) e cai pro padrão por
  // tipo+BTU extraído do nome quando não vier nada.
  const equipmentSpecs = resolveEquipmentSpecs(String(collectedData.tipo_equipamento ?? ""), String(collectedData.modelo ?? ""), {
    nome: collectedData.modelo,
  });
  const regrasInstalacao = equipmentSpecs.regra;
  const technicalGuidance = comDiretrizNbr(collectedData.tipo_equipamento, equipmentGuidance(collectedData.tipo_equipamento), equipmentSpecs);
  const revisionInstruction = revisionPrompt?.trim()
    ? `AJUSTE SOLICITADO PELO USUÁRIO: ${revisionPrompt.trim()}`
    : null;

  // Fetch image and convert to base64 to include in webhook payload
  let imageBase64 = "";
  let fotoBuffer: Buffer | null = null;
  if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl);
      const imgBuffer = await imgRes.arrayBuffer();
      const mimeType = imgRes.headers.get("content-type") || "image/jpeg";
      fotoBuffer = Buffer.from(imgBuffer);
      imageBase64 = `data:${mimeType};base64,${fotoBuffer.toString("base64")}`;
    } catch {}
  }

  // Imagem-guia: a foto do ambiente com o retângulo/rota que o vendedor
  // desenhou, mandada como uma imagem a mais pro Gemini. Modelo de imagem
  // obedece máscara visual; não obedece coordenada escrita — foi exatamente
  // por isso que a ancoragem por grade 3x3 do Vision foi abandonada. `null`
  // (sem marcação, ou falha ao desenhar) só faz o modelo voltar a decidir a
  // posição sozinho, como antes desta feature.
  const guideImageBase64 = marcacao && fotoBuffer ? await renderGuideMask(fotoBuffer, marcacao) : null;

  // Modo revisão: o Gemini precisa receber a IMAGEM já gerada antes, não a foto
  // original — senão ele reinstala do zero e perde o posicionamento que o
  // vendedor tinha aprovado. O CRM baixa e normaliza aqui, em vez de o n8n
  // fazer isso em nós separados: menos superfície de fluxo pra desaparecer
  // quando alguém salva o editor do n8n com uma aba antiga aberta (já
  // aconteceu — o ramo de ajuste inteiro sumiu assim).
  const referenceImageBase64 = referenceImageUrl ? await fetchImagemBase64(referenceImageUrl, 1536) : null;

  const productLookup = [collectedData.marca, collectedData.modelo].filter(Boolean).join(" ");
  // Sem try/catch, uma falha aqui (Supabase fora do ar, timeout) derrubava a
  // rota inteira ANTES do fetch pro n8n — mesmo sintoma do fetch sem guarda:
  // "Erro de conexao" genérico na tela e nenhuma execução criada no n8n. Uma
  // foto de referência ausente não devia custar a geração inteira.
  let productImageUrl: string | null = null;
  try {
    productImageUrl = await getProductImageUrl(
      supabase,
      String(productLookup),
      collectedData.tipo_equipamento,
      typeof collectedData.codigo_erp === "string" ? collectedData.codigo_erp : undefined
    );
  } catch (err) {
    console.error("[generate-image] busca da foto de referência falhou:", err instanceof Error ? err.message : err);
  }

  const productImageBase64 = await fetchProductImageBase64(productImageUrl);
  const familia = familiaDoTipo(collectedData.tipo_equipamento);
  const referenciaBase64 = await referenciaDaFamilia(supabase, familia);

  // Accept the image URL under any field n8n might return
  const primeiraString = (...valores: unknown[]): string | null =>
    valores.find((v): v is string => typeof v === "string" && v.length > 0) ?? null;

  // Vazamento da guia (o retângulo magenta reproduzido na cena) é falha visível
  // e indefensável perante o cliente — o prompt do n8n já proíbe, mas proibição
  // não é garantia com IA de imagem. Em vez de só avisar depois de entregar,
  // tenta gerar de novo (até 2 vezes) ANTES de compor e subir qualquer coisa.
  // Sem marcação (ou sem guia) não há o que vazar, então roda uma vez só.
  const MAX_TENTATIVAS_GERACAO = marcacao && guideImageBase64 ? 3 : 1;
  let generatedImageUrl: string | null = null;
  let vazamentoPersistente = false;

  // Pede pro Gemini desenhar, na mesma chamada (mesmo custo de uma geração
  // só), um inset com a condensadora real instalada no local que o vendedor
  // respondeu — substitui o card estático "EQUIPAMENTO" (foto de vitrine)
  // que existia antes. Só faz sentido com marcação (é a mesma faixa lateral
  // reservada pros cards vetoriais), local respondido e foto do produto pra
  // o modelo copiar o aparelho real — sem qualquer um dos três o Gemini não
  // teria o que precisa e o inset saía inventado ou genérico demais.
  const unidadeExternaTexto = typeof collectedData.unidade_externa === "string" ? collectedData.unidade_externa.trim() : "";
  const desenharInsetCondensadora = Boolean(marcacao) && Boolean(unidadeExternaTexto) && Boolean(productImageBase64);
  // Mesmo lado que `installation-overlay.ts` (`camadaAncorada`) vai calcular
  // depois pra coluna de cards — os dois olham só `marcacao.caixa`, então
  // ficam sempre de acordo mesmo calculados em processos/momentos diferentes.
  const ladoInsetCondensadora: "esquerda" | "direita" =
    marcacao && marcacao.caixa.x + marcacao.caixa.w / 2 <= 0.55 ? "direita" : "esquerda";

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_GERACAO; tentativa++) {
    // POST to n8n and wait for the response — n8n uses "Respond to Webhook" node.
    // O fetch fica dentro de try/catch porque, sem ele, uma falha de rede virava um
    // 500 sem corpo: o cliente tentava `res.json()`, estourava e mostrava "Erro de
    // conexao", indistinguível de um erro dentro da automação. Os dois casos se
    // investigam em lugares diferentes — um no n8n, outro aqui.
    let n8nRes: Response;
    try {
      n8nRes = await fetch(N8N_CHATBOT_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(240_000),
        body: JSON.stringify({
          // Repetir com o MESMO lead_id faz o node "COLOCA NO STORAGE3" do n8n
          // tentar gravar de novo em `PDF/{lead_id}` — chave que a primeira
          // tentativa já ocupou — e o Storage devolve 409 Duplicate. Só a
          // retentativa (guia vazou) precisa de chave própria; a chamada normal
          // (99% dos casos) mantém o lead_id puro, sem mudar nada pra ela.
          lead_id: tentativa > 1 ? `${leadId}-retry${tentativa}` : leadId,
          image_url: imageUrl,
          image_base64: imageBase64,
          image_description: imageDescription,
          product_image_url: productImageUrl,
          product_image_base64: productImageBase64,
          reference_image_url: referenceImageUrl ?? null,
          reference_image_base64: referenceImageBase64,
          guide_image_base64: guideImageBase64,
          marcacao_descricao: marcacao ? descreverMarcacao(marcacao) : null,
          tem_marcacao: Boolean(guideImageBase64),
          familia_equipamento: familia,
          reference_scene_base64: referenciaBase64,
          // Quem desenha a tubulação nesta geração. O n8n usa isso para escolher
          // entre "não desenhe infraestrutura nenhuma" e "desenhe o line set em
          // 3D semitransparente" — os dois nunca podem valer ao mesmo tempo.
          modo_infra: INFRA_VISUAL,
          desenhar_inset_condensadora: desenharInsetCondensadora,
          lado_inset_condensadora: ladoInsetCondensadora,
          revision_prompt: revisionPrompt?.trim() ?? null,
          generation_mode: referenceImageUrl ? "revision" : "initial",
          equipment_guidance: technicalGuidance,
          revision_instruction: revisionInstruction,
          regras_instalacao: regrasInstalacao,
          ancoragem_espacial: ancoragemEspacial || null,
          capacidade_btus: equipmentSpecs.btu ? `${equipmentSpecs.btu.toLocaleString("pt-BR")} BTU/h` : null,
          dimensoes_finais: equipmentSpecs.dimensoesFormatadas,
          origem_dimensoes: equipmentSpecs.origemDimensoes,
          prompt,
          ...collectedData,
        }),
      });
    } catch (err) {
      const motivo = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error("[generate-image] a chamada ao n8n nem completou:", motivo);
      return Response.json(
        { error: `Não consegui falar com a automação de imagem (${motivo}). Nenhuma execução foi criada no n8n.` },
        { status: 502 }
      );
    }

    // O corpo é lido como texto antes de virar JSON porque o n8n responde vazio
    // quando um nó do meio falha: o "Respond to Webhook" nunca é alcançado, e
    // `res.json()` estourava com "Unexpected end of JSON input". O que chegava na
    // tela era um 500 genérico enquanto o n8n sabia exatamente o problema — numa
    // ocasião, "You have no credits remaining" da OpenAI.
    const n8nBody = await n8nRes.text();

    if (!n8nRes.ok) {
      console.error(`[generate-image] n8n HTTP ${n8nRes.status}:`, n8nBody.slice(0, 600) || "(corpo vazio)");
      return Response.json(
        { error: `A automação de imagem respondeu ${n8nRes.status}. Verifique a execução no n8n.` },
        { status: 502 }
      );
    }

    if (!n8nBody.trim()) {
      console.error("[generate-image] n8n respondeu 200 com corpo vazio — algum nó falhou antes do Respond to Webhook.");
      return Response.json(
        { error: "A automação de imagem parou no meio e não devolveu resultado. Verifique a última execução no n8n." },
        { status: 502 }
      );
    }

    let n8nData: Record<string, unknown>;
    try {
      n8nData = JSON.parse(n8nBody);
    } catch {
      console.error("[generate-image] n8n devolveu algo que não é JSON:", n8nBody.slice(0, 600));
      return Response.json(
        { error: "A automação de imagem devolveu uma resposta inesperada. Verifique a última execução no n8n." },
        { status: 502 }
      );
    }

    const rawUrl = primeiraString(
      n8nData.url_imagem_final,
      n8nData.image_url,
      n8nData.imageUrl,
      n8nData.url
    );

    // Strip _{timestamp} suffix that n8n may append to storage filenames
    const urlDestaTentativa = rawUrl ? rawUrl.replace(/_\d+$/, "") : null;

    if (!urlDestaTentativa) {
      return Response.json({ error: "n8n não retornou a URL da imagem" }, { status: 500 });
    }

    if (marcacao && guideImageBase64) {
      try {
        const cenaRes = await fetch(urlDestaTentativa);
        if (cenaRes.ok && (await detectarVazamentoDaGuia(Buffer.from(await cenaRes.arrayBuffer())))) {
          console.error(`[generate-image] guia vazou na tentativa ${tentativa}/${MAX_TENTATIVAS_GERACAO}`);
          if (tentativa < MAX_TENTATIVAS_GERACAO) continue; // tenta de novo
          vazamentoPersistente = true;
        }
      } catch (err) {
        console.error("[generate-image] não consegui reler a cena para checar vazamento:", err instanceof Error ? err.message : err);
      }
    }

    generatedImageUrl = urlDestaTentativa;
    break;
  }

  if (!generatedImageUrl) {
    return Response.json({ error: "n8n não retornou a URL da imagem" }, { status: 500 });
  }

  // A camada técnica (título, cotas, passo a passo, cards) é composta aqui, não
  // desenhada pelo modelo: texto de modelo de imagem sai errado. Já veio "2,80m"
  // onde o vendedor respondeu 2,70. Agora o número vem do que ele respondeu.
  //
  // Não existe mais um corte técnico desenhado em cima da foto (setas de cota,
  // legenda de tubulação, badges de dreno/elétrica/inspeção, pétalas de fluxo de
  // ar): decisão de produto, porque aquele desenho dependia de uma âncora
  // adivinhada por IA de visão (célula 3x3) que acertava a posição do aparelho
  // de forma inconsistente, e ainda duplicava com a infraestrutura que o
  // próprio modelo de imagem insistia em desenhar (às vezes com legendas
  // ilegíveis coladas na foto). A mesma informação técnica (afastamentos,
  // tubulação, ponto elétrico, alçapão, metragem) já está no card
  // ESPECIFICAÇÕES abaixo, que não depende de saber onde o aparelho está na
  // cena.
  const peDireitoFormatado = typeof collectedData.pe_direito === "string" ? formatarMetros(collectedData.pe_direito) : null;
  const qr = await destinoDoQr(supabase, typeof collectedData.marca === "string" ? collectedData.marca : null, leadId);
  const finalImageUrl = await comporEEnviar(generatedImageUrl, leadId, {
    produto: String(collectedData.modelo ?? "Ar-condicionado"),
    marca: typeof collectedData.marca === "string" ? collectedData.marca : null,
    sku: typeof collectedData.sku === "string" ? collectedData.sku : null,
    tipoEquipamento: String(collectedData.tipo_equipamento ?? "Split Hi-Wall"),
    peDireito: peDireitoFormatado,
    ...overlayCotas(collectedData.tipo_equipamento, regrasInstalacao, peDireitoFormatado),
    tubulacao: typeof collectedData.tubulacao === "string" ? collectedData.tubulacao : null,
    pontoEletrico: typeof collectedData.ponto_eletrico === "boolean" ? collectedData.ponto_eletrico : null,
    alcapao: typeof collectedData.alcapao === "boolean" ? collectedData.alcapao : null,
    tipoForro: typeof collectedData.tipo_forro === "string" ? collectedData.tipo_forro : null,
    metragemInfra: typeof collectedData.metragem_infra === "string" ? metragemLegivel(collectedData.metragem_infra) : null,
    alturaGabineteCm: equipmentSpecs.dimensoes.altura_cm,
    larguraGabineteCm: equipmentSpecs.dimensoes.largura_cm,
    origemDimensoes: equipmentSpecs.origemDimensoes,
    produtoImagemBase64: productImageBase64 ? `data:image/jpeg;base64,${productImageBase64}` : null,
    recomendacoesGarantia: regrasInstalacao.recomendacoes_garantia,
    unidadeExterna: typeof collectedData.unidade_externa === "string" && collectedData.unidade_externa.trim() ? collectedData.unidade_externa.trim() : null,
    nivelCondensadora: typeof collectedData.nivel_condensadora === "string" ? collectedData.nivel_condensadora : null,
    capacidade: equipmentSpecs.btu ? `${equipmentSpecs.btu.toLocaleString("pt-BR")} BTU/h` : null,
    // Presente => camada ancorada (callouts presos ao aparelho); ausente =>
    // camada de cards, que não depende de saber onde o aparelho está na cena.
    marcacao,
    // O caminho no Storage é determinístico (`previa/{leadId}.jpg`), então dá
    // pra saber a URL final ANTES do upload — que é o que permite o QR da
    // própria prévia ser desenhado dentro dela.
    urlPrevia: qr.url,
    qrEhManual: qr.ehManual,
    modoInfra: INFRA_VISUAL,
  });

  // A conferência de posição olha a cena que o modelo devolveu, e o resultado
  // dela não muda o desenho — só o aviso na tela. O vazamento da guia já foi
  // checado (com retry) antes de chegar aqui; se persistiu mesmo depois de
  // tentar de novo, esse aviso ganha do resultado da conferência de posição.
  let posicionamento = marcacao ? await conferirPosicionamento(generatedImageUrl, marcacao) : null;
  if (vazamentoPersistente) {
    posicionamento = {
      ok: false,
      mensagem: "A marcação da foto foi desenhada na imagem gerada mesmo após tentar novamente. Gere outra versão antes de enviar ao cliente.",
    };
  }

  const { installationNotes, notesSource } = await getInstallationNotes(
    supabase,
    String([collectedData.marca, collectedData.modelo, collectedData.tipo_equipamento].filter(Boolean).join(" ")),
    typeof collectedData.marca === "string" ? collectedData.marca : null
  );

  const { data: profile } = await supabase.from("user_profiles").select("full_name").eq("id", user.id).single();
  await supabase.from("image_generations").insert({
    lead_id: leadId,
    user_id: user.id,
    user_name: profile?.full_name ?? user.email ?? null,
    wall_image_url: imageUrl ?? null,
    generated_image_url: finalImageUrl,
    // A marcação entra no registro junto das respostas: sem ela, uma prévia que
    // saiu torta não é reproduzível depois — a posição do aparelho e a rota
    // eram o único dado do fluxo que não ficava gravado em lugar nenhum.
    answers: { ...collectedData, marcacao },
    installation_notes: installationNotes,
    installation_notes_source: notesSource,
  });

  return Response.json({ imageUrl: finalImageUrl, installationNotes, installationNotesSource: notesSource, posicionamento });
}

type Posicionamento = { ok: boolean; mensagem: string };

/**
 * Procura na cena gerada as cores da imagem-guia.
 *
 * Aconteceu em produção: o modelo pintou o retângulo magenta da guia na parede
 * do cliente e a prévia foi entregue assim, sem ninguém perceber. O prompt
 * proíbe, mas proibição não é garantia — e esta checagem é determinística,
 * custa milissegundos e não depende de IA nenhuma.
 *
 * Só magenta e ciano saturados contam. Amarelo forte existe em ambiente real
 * (luminária, almofada, madeira clara), então incluí-lo geraria alarme falso.
 */
async function detectarVazamentoDaGuia(cena: Buffer): Promise<boolean> {
  try {
    // 640 px, não 160: o traço da guia é fino, e reduzir demais mistura ele com
    // a parede antes da contagem. Na primeira versão o vazamento real passou
    // batido exatamente por isso.
    const { data, info } = await sharp(cena).resize(640, 640, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
    const canais = info.channels;
    let suspeitos = 0;
    for (let i = 0; i < data.length; i += canais) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Critério relativo, não absoluto: o magenta que o modelo pinta sai
      // dessaturado pela iluminação da cena (medido em rgb(176,80,176) no
      // vazamento real), e um corte fixo em 170/110 não pegava.
      const magenta = r > 140 && b > 140 && g < r - 45 && g < b - 45;
      const ciano = g > 140 && b > 140 && r < g - 45 && r < b - 45;
      if (magenta || ciano) suspeitos++;
    }
    const total = (data.length / canais) || 1;
    // Aferido contra cenas reais: o vazamento deu 0,35% da imagem e as cenas
    // limpas não passaram de 0,02%. O corte fica no meio, com folga dos dois
    // lados.
    return suspeitos / total > 0.0012;
  } catch (err) {
    console.error("[generate-image] checagem de vazamento da guia falhou:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Confere se o modelo de imagem instalou o aparelho onde o vendedor marcou.
 *
 * A imagem-guia melhora muito a obediência, mas não garante: o Gemini às vezes
 * desloca a unidade para onde a cena "pede" melhor. Sem esta conferência, uma
 * prévia com o aparelho no lugar errado chega ao cliente exatamente igual a uma
 * certa — e o vendedor não tem como saber qual das duas está na tela.
 *
 * Custa uma chamada de visão (~2,5% do custo da geração) e nunca bloqueia:
 * qualquer falha devolve `null`, e a prévia segue como antes.
 */
async function conferirPosicionamento(imagemUrl: string, marcacao: Marcacao): Promise<Posicionamento | null> {
  try {
    const raw = await openAI({
      model: MODELO_TEXTO,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imagemUrl, detail: "low" } },
            {
              type: "text",
              text:
                "Nesta foto de ambiente, localize a unidade interna do ar-condicionado (evaporadora). " +
                "Responda APENAS um JSON válido, sem markdown, no formato " +
                '{"encontrado": true/false, "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0} ' +
                "onde x,y são o canto superior esquerdo e w,h o tamanho, todos em fração da " +
                "largura/altura da imagem (0 a 1). Se não houver ar-condicionado visível, " +
                'responda {"encontrado": false}.',
            },
          ],
        },
      ],
      max_tokens: 120,
    });
    const achado = JSON.parse(raw) as { encontrado?: boolean; x?: number; y?: number; w?: number; h?: number };
    if (!achado?.encontrado || typeof achado.x !== "number" || typeof achado.y !== "number") {
      return { ok: false, mensagem: "Não consegui localizar o aparelho na imagem gerada. Confira antes de enviar ao cliente." };
    }

    const centroMarcado = { x: marcacao.caixa.x + marcacao.caixa.w / 2, y: marcacao.caixa.y + marcacao.caixa.h / 2 };
    const centroGerado = { x: achado.x + (achado.w ?? 0) / 2, y: achado.y + (achado.h ?? 0) / 2 };
    const desvio = Math.hypot(centroGerado.x - centroMarcado.x, centroGerado.y - centroMarcado.y);
    // Tolerância proporcional ao que foi marcado: numa marcação pequena, 8% da
    // imagem já joga o aparelho para fora dela; numa grande, ainda está dentro.
    const tolerancia = Math.max(0.08, Math.max(marcacao.caixa.w, marcacao.caixa.h) * 0.8);
    if (desvio <= tolerancia) return { ok: true, mensagem: "Aparelho instalado na posição marcada." };

    return {
      ok: false,
      mensagem: `O aparelho saiu a cerca de ${Math.round(desvio * 100)}% da imagem de distância do ponto marcado. Vale gerar outra versão.`,
    };
  } catch (err) {
    console.error("[generate-image] conferência de posicionamento falhou:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Família do equipamento, no vocabulário do cadastro de referências. */
function familiaDoTipo(tipo: unknown): string {
  const t = typeof tipo === "string" ? tipo.trim().toLowerCase() : "";
  if (t === "cassete") return "cassete";
  if (t === "dutado") return "dutado";
  if (t === "janela") return "janela";
  if (t.includes("piso")) return "piso_teto";
  return "hi_wall";
}

/**
 * Cena de referência da família, para o modelo ver como a ARCIL representa
 * aquele tipo de instalação antes de gerar.
 *
 * Só envia referência marcada como `sem_texto`: uma referência com texto
 * embutido faz o modelo copiar o texto, e texto dele sai errado — é a razão de
 * toda a camada vetorial existir.
 */
async function referenciaDaFamilia(supabase: SupabaseClient, familia: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("visual_reference_scenes")
      .select("image_url")
      .eq("familia", familia)
      .eq("ativa", true)
      .eq("sem_texto", true)
      .limit(1);
    const url = data?.[0]?.image_url;
    return url ? await fetchImagemBase64(url as string, 1280) : null;
  } catch (err) {
    console.error("[generate-image] referência visual indisponível:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Destino do QR impresso na prévia.
 *
 * Manual oficial do fabricante quando cadastrado; a própria prévia enquanto não
 * houver. Um QR que não abre nada é pior que nenhum: o cliente escaneia na
 * frente do vendedor e não acontece nada.
 */
async function destinoDoQr(supabase: SupabaseClient, marca: string | null, leadId: string): Promise<{ url: string; ehManual: boolean }> {
  if (marca?.trim()) {
    try {
      const { data } = await supabase.from("brand_warranty_notes").select("manual_url").ilike("brand", marca.trim()).limit(1);
      const manual = data?.[0]?.manual_url;
      if (typeof manual === "string" && manual.trim()) return { url: manual.trim(), ehManual: true };
    } catch (err) {
      console.error("[generate-image] busca do manual falhou:", err instanceof Error ? err.message : err);
    }
  }
  // Sem manual_url cadastrado pra marca: aponta pro site institucional em vez
  // da própria imagem. "Escaneie pra ver esta prévia que você já está vendo"
  // não ajuda ninguém — pelo menos assim o QR leva a algum lugar real.
  return { url: "https://arcil.com.br", ehManual: false };
}

/** Minúsculas, sem acento, só palavras — para comparar "Q/F" com "q f" e
 *  "INVERTER" com "inverter" sem depender de como o cliente digitou. */
function normalizar(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** "2,70" e "2.70" viram "2,70 m"; "2,70 m" fica como está. O vendedor digita
 *  livre e o card não pode expor essa variação. */
function formatarMetros(valor: string): string | null {
  const texto = valor.trim().toLowerCase();
  const bruto = Number(texto.replace(",", ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(bruto) || bruto <= 0) return null;
  // "80cm" batia direto em "80,00 m" — mesma classe de erro do "2,80m" vs
  // "2,70m" documentado acima: dígito certo, unidade ignorada, número 100x
  // maior no cartão. A pergunta de altura do plenum (forro) normalmente
  // recebe resposta em cm; a de pé-direito, em m.
  //
  // O sufixo "cm" sozinho não bastava: o vendedor respondeu só "60" (sem
  // unidade nenhuma) e saiu "60,00 m" — um plenum ou pé-direito de 60 METROS
  // não existe. Acima de 10, nenhuma das duas perguntas tem resposta legítima
  // em metros (pé-direito real não passa de uns 6m, plenum nem chega a 2m) —
  // então um número "cru" grande também vira cm, com ou sem o vendedor
  // escrever a unidade.
  const emCentimetros = /cm\b/.test(texto) || (bruto > 10 && !/\bm\b/.test(texto));
  let metros = emCentimetros ? bruto / 100 : bruto;
  // Espelha a heurística acima na direção oposta: "cm" explícito que produz
  // menos de 10cm não é um plenum nem um pé-direito reais, é o vendedor tendo
  // marcado a unidade errada — "2,7 cm" virou "0,03 m" numa prévia real
  // porque o dígito certo (2,7, plausível em METROS de pé-direito) foi tratado
  // como centímetros ao pé da letra.
  if (emCentimetros && metros < 0.1) metros = bruto;
  return `${metros.toFixed(2).replace(".", ",")} m`;
}

/** "Metragem de infra" é resposta livre, sem opções fixas — um vendedor
 *  respondeu "NAO SEI DIZER" e isso foi parar, em caixa alta, direto na
 *  prévia que vai pro cliente. Sem nenhum dígito na resposta, não é uma
 *  medida, é o vendedor dizendo que não sabe — troca por um texto neutro em
 *  vez de ecoar o que foi digitado sem filtro. */
function metragemLegivel(valor: string): string | null {
  const texto = valor.trim();
  if (!texto) return null;
  return /\d/.test(texto) ? texto : "a confirmar no local";
}

/**
 * Compõe a camada de título/cards sobre a cena e o selo d'água, e sobe o
 * resultado no mesmo lugar onde a marca d'água já subia. Se qualquer etapa
 * falhar, cai no caminho antigo (só a marca d'água) — a prévia sem moldura
 * ainda vende, um erro não.
 *
 * Um único `.jpeg()` no final: `comporPrevia` devolve PNG (cena + camada de
 * título/cards, sem perda), e o selo d'água entra no MESMO `.composite()` que
 * faz o encode. Antes disso passava por três gerações de JPEG (corte técnico
 * -> installation-overlay -> selo), cada uma reencodando o que a anterior já
 * tinha comprimido — a origem da reclamação de qualidade baixa na imagem
 * baixada.
 */
async function comporEEnviar(imageUrl: string, leadId: string, dados: DadosOverlay): Promise<string> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`fetch cena -> HTTP ${res.status}`);
    const cenaBuffer = Buffer.from(await res.arrayBuffer());

    // Uma marca d'água só: a logo Grupo Arcil que `comporPrevia` já desenha
    // (canto inferior esquerdo, referência aprovada). O selo pequeno "Design
    // created by ARCIL AI" que ia aqui em cima foi removido — duas marcas na
    // mesma prévia era ruído, e o aviso "Prévia para visualização..." no
    // rodapé já cobre a transparência de que é gerado. `seloReduzido` continua
    // existindo só para o fallback (`watermarkImage`), quando a composição
    // completa falha e não há logo nenhuma na imagem.
    const composta = await comporPrevia(cenaBuffer, dados);
    const comSelo = await sharp(composta).jpeg({ quality: 94 }).toBuffer();

    const admin = createAdminClient();
    const storagePath = `previa/${leadId}.jpg`;
    // Blob e não Buffer: o SDK de storage embaralhava o Buffer no bundle da
    // Vercel, devolvendo bytes de substituição UTF-8 (ef bf bd). Mesmo motivo
    // documentado no watermarkImage.
    const blob = new Blob([new Uint8Array(comSelo)], { type: "image/jpeg" });
    const { error } = await admin.storage.from("PDF").upload(storagePath, blob, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`upload -> ${error.message}`);

    return admin.storage.from("PDF").getPublicUrl(storagePath).data.publicUrl;
  } catch (err) {
    console.error("[comporPrevia] falhou, caindo na marca d'água:", err instanceof Error ? err.message : err);
    return watermarkImage(imageUrl, leadId);
  }
}

/**
 * Baixa a foto do produto e devolve o base64 dos bytes, sem o prefixo `data:`.
 *
 * A foto precisa chegar ao Gemini como IMAGEM, não como link: até aqui ela ia
 * dentro do texto do prompt ("reference image URL: https://…"), e modelo de
 * imagem não abre URL. O resultado era o aparelho desenhado genérico em toda
 * geração, mesmo com a marca escrita no rótulo.
 *
 * Normaliza para JPEG e limita a 768 px porque o ERP serve PNG de até 620 KB —
 * uma referência de forma e acabamento não precisa disso, e o payload do webhook
 * carrega a foto da parede junto.
 *
 * Devolve `null` em qualquer falha: gerar sem a referência é pior que gerar com,
 * mas é muito melhor que não gerar.
 */
async function fetchProductImageBase64(url: string | null): Promise<string | null> {
  return fetchImagemBase64(url, 768, "#ffffff");
}

/**
 * Baixa uma imagem e devolve o base64 dos bytes normalizados em JPEG.
 *
 * `maxLado` existe porque os dois usos pedem tamanhos diferentes: a foto do
 * produto é referência de forma e acabamento e 768 px basta, enquanto a imagem
 * de referência de um AJUSTE é a prévia anterior inteira — reduzi-la a 768 px
 * devolveria a correção numa resolução menor que a da geração original, e cada
 * rodada de ajuste encolheria a imagem de novo.
 *
 * `fundo` só é aplicado quando informado: achatar sobre branco é certo para o
 * PNG com transparência que o ERP serve, e errado para uma cena fotográfica.
 */
async function fetchImagemBase64(url: string | null, maxLado: number, fundo?: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const original = Buffer.from(await res.arrayBuffer());
    let pipeline = sharp(original).resize({ width: maxLado, height: maxLado, fit: "inside", withoutEnlargement: true });
    if (fundo) pipeline = pipeline.flatten({ background: fundo });
    const normalizada = await pipeline.jpeg({ quality: 86 }).toBuffer();
    return normalizada.toString("base64");
  } catch (err) {
    console.error(`[generate-image] imagem indisponível (${url.slice(0, 80)}):`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** O ERP quebra um split em quatro cadastros: o aparelho, as duas metades
 *  (UNID EXT / UNID INT), o PAINEL do cassete e o KIT de controle remoto. Só o
 *  primeiro serve de referência visual — com as metades dentro, uma busca por
 *  "springer cassete 24000" empatava e o gerador desenhava a moldura. */
const APARELHO_INTEIRO = /^\s*(SPLIT|BISPLIT|TRISPLIT|QUADRISPLIT|ACJ|CJTO|AR)\b/i;

type ReferenciaVisual = { marca: string; padrao: string; url: string };

/**
 * Looks up a reference photo for the selected model/brand. Passed to n8n as
 * `product_image_url` so the image generation prompt can use it as a real visual
 * reference instead of inventing a generic unit.
 *
 * Duas fontes, nesta ordem: `product_reference_images` é curadoria manual e
 * ganha; `products_*.imagem_url` é a foto oficial que o ERP entrega, sincronizada
 * de hora em hora. A curadoria existe justamente para corrigir ou cobrir o que o
 * ERP não fotografou, então não pode perder para ele.
 *
 * A busca é texto livre que o GPT extraiu da conversa ("hisense 12000 wifi"),
 * não o nome de catálogo. `busca.includes(padrão)` só acertava quando o cliente
 * repetia a descrição inteira na ordem exata, então a comparação é por token:
 * vence quem casa mais palavras. É isso que separa o modelo WiFi do irmão sem
 * WiFi, já que os dois só diferem por uma palavra.
 */
async function getProductImageUrl(
  supabase: SupabaseClient,
  modelo: string,
  tipoEquipamento?: unknown,
  codigoErp?: string
): Promise<string | null> {
  // Caminho exato: o vendedor escolheu o produto do catálogo, então não há o que
  // adivinhar. `products_builder_architect` entra aqui mesmo sem coluna `marca`
  // (que as outras três têm) porque este loop nunca toca em `marca` — é busca
  // direta por `codigo_erp -> imagem_url`. Faltar essa tabela aqui é o que fez
  // o Paulo pegar um aparelho errado num teste real: catálogo do segmento
  // construtor/arquiteto tinha a foto, a busca exata não olhava lá, caiu no
  // fuzzy match e o fuzzy escolheu outro modelo.
  if (codigoErp) {
    for (const tabela of ["products_consumer", "products_reseller", "products_installer", "products_builder_architect"]) {
      const { data } = await supabase.from(tabela).select("imagem_url").eq("codigo_erp", codigoErp).limit(1);
      const url = data?.[0]?.imagem_url;
      if (url) return url as string;
    }
    // Sem foto para esse código, segue para a busca por semelhança: uma foto de
    // outro aparelho do mesmo tipo erra menos que nenhuma referência.
  }

  const busca = normalizar(modelo);
  const tipo = normalizar(typeof tipoEquipamento === "string" ? tipoEquipamento : "");
  if (!busca.length && !tipo.length) return null;

  const [curadas, doErp] = await Promise.all([
    supabase.from("product_reference_images").select("brand,model_pattern,image_url"),
    supabase.from("products_consumer").select("nome,marca,imagem_url").not("imagem_url", "is", null),
  ]);

  const linhas: ReferenciaVisual[] = [
    ...(curadas.data ?? []).map((r) => ({ marca: r.brand ?? "", padrao: r.model_pattern ?? "", url: r.image_url })),
    ...(doErp.data ?? [])
      .filter((r) => APARELHO_INTEIRO.test(r.nome ?? ""))
      .map((r) => ({ marca: r.marca ?? "", padrao: r.nome ?? "", url: r.imagem_url as string })),
  ];

  const pontuar = (alvo: string[], padrao: string) => {
    const tokens = normalizar(padrao);
    if (!tokens.length) return 0;
    return tokens.filter((t) => alvo.includes(t)).length;
  };

  // Curadas vêm primeiro no array e a comparação é `>`, não `>=`: em empate de
  // pontuação quem chegou antes fica, que é como a precedência se sustenta.
  const melhorDe = (alvo: string[], minimo: number, exigirMarca: boolean) => {
    let melhor: { url: string; pontos: number } | null = null;
    for (const r of linhas) {
      if (exigirMarca && !pontuar(alvo, r.marca)) continue;
      const pontos = pontuar(alvo, r.padrao);
      if (pontos >= minimo && (!melhor || pontos > melhor.pontos)) melhor = { url: r.url, pontos };
    }
    return melhor?.url ?? null;
  };

  // 1ª passada: exige a marca e pontua o modelo. Dois tokens é o piso — casar só
  // "12000" acha qualquer aparelho daquela capacidade, de qualquer tipo.
  if (busca.length) {
    const exata = melhorDe(busca, 2, true);
    if (exata) return exata;
  }

  // 2ª passada: só o tipo. Exigir a marca deixava a geração sem referência
  // nenhuma quando o vendedor abreviava ou errava o nome dela — e aí o gerador
  // inventava o equipamento. Uma foto do tipo certo de outra marca erra menos
  // que nenhuma foto, porque o que precisa acertar é onde e como se instala.
  if (!tipo.length) return null;
  return melhorDe(tipo, 1, false);
}

/**
 * Stamps the ARCIL logo + "Design created by ARCIL AI" onto the generated
 * image and re-uploads it, so branding doesn't depend on the image model
 * reliably rendering text. Falls back to the unmodified n8n URL on any
 * failure — a missing watermark should never block delivering the image.
 */
async function watermarkImage(imageUrl: string, leadId: string): Promise<string> {
  let stage = "start";
  try {
    // Use the admin (service-role) client for the upload — the SSR-wrapped
    // user client corrupted the binary buffer on upload (bytes came out as
    // repeated UTF-8 replacement characters, ef bf bd), most likely because
    // its fetch wrapper coerces the body through a text path somewhere.
    const admin = createAdminClient();
    stage = "fetch generated image";
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`fetch imageUrl -> HTTP ${imgRes.status}`);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    stage = "read image metadata";
    const base = sharp(imgBuffer);
    const { width = 1536 } = await base.metadata();

    stage = "composite watermark";
    // The badge (logo + "Design created by ARCIL AI" text) is a pre-rendered
    // PNG embedded as base64 — rendering <text> via SVG at request time
    // silently produced blank text, because the serverless runtime has no
    // system font for libvips/librsvg to draw with. Pre-rendering once,
    // where a font is available, sidesteps that entirely.
    const left = Math.max(0, width - SELO_LARGURA - 14);
    const watermarked = await base
      .composite([{ input: await seloReduzido(), top: 14, left }])
      .jpeg({ quality: 95 })
      .toBuffer();

    stage = "upload to storage";
    const storagePath = `watermarked/${leadId}.jpg`;
    // Upload a Blob, not the raw Buffer — the Supabase storage SDK's binary
    // handling on the Vercel bundle was mangling the Buffer into repeated
    // UTF-8 replacement bytes (ef bf bd) somewhere before it hit the wire.
    // Blob is the type its own docs/browser usage exercise most, so it's
    // the safer bet here.
    const blob = new Blob([new Uint8Array(watermarked)], { type: "image/jpeg" });
    const { error: uploadError } = await admin.storage
      .from("PDF")
      .upload(storagePath, blob, { contentType: "image/jpeg", upsert: true });
    if (uploadError) {
      console.error("[watermarkImage] upload failed:", uploadError.message);
      return imageUrl;
    }

    const { data } = admin.storage.from("PDF").getPublicUrl(storagePath);
    return data.publicUrl;
  } catch (err) {
    console.error(`[watermarkImage] failed at "${stage}":`, err instanceof Error ? err.message : err);
    return imageUrl;
  }
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function getInstallationNotes(
  supabase: SupabaseClient,
  modelo: string,
  marca: string | null
): Promise<{ installationNotes: string | null; notesSource: "manual" | "ia" | null }> {
  if (!modelo.trim()) return { installationNotes: null, notesSource: null };

  const { data: notes } = await supabase.from("brand_warranty_notes").select("brand,content,origem");
  const modeloLower = modelo.toLowerCase();
  // Texto cadastrado por pessoa ganha do cache da IA, sempre — mesmo que o da
  // IA seja mais recente.
  const candidatos = (notes ?? []).filter((n) => modeloLower.includes(n.brand.toLowerCase()));
  const match = candidatos.find((n) => n.origem === "manual") ?? candidatos[0];
  if (match) return { installationNotes: match.content, notesSource: match.origem === "ia" ? "ia" : "manual" };

  try {
    const content = await openAI({
      model: MODELO_TEXTO,
      messages: [
        {
          role: "system",
          content:
            "Você orienta instaladores de ar-condicionado sobre como instalar preservando a garantia de fábrica. " +
            "Dado o modelo/marca informado, escreva um parágrafo curto (máx. 5 frases) com as boas práticas gerais " +
            "de instalação que costumam ser exigidas pela maioria dos fabricantes para não perder garantia " +
            "(ex: distância mínima de paredes/teto, tubulação isolada, dreno com caimento correto, ponto elétrico " +
            "dedicado, teste de vácuo). NÃO invente números ou regras específicas dessa marca que você não tenha " +
            "certeza — se não souber um detalhe exato da marca, fale em termos gerais e termine recomendando " +
            "expressamente consultar o manual oficial do fabricante antes de instalar.",
        },
        { role: "user", content: `Modelo/marca: ${modelo}` },
      ],
      max_tokens: 300,
    });
    // Guarda para a próxima simulação da mesma marca. O texto não depende do
    // ambiente nem do cliente, então reescrevê-lo a cada geração é gastar por
    // um resultado que já existe. `origem: "ia"` preserva o aviso na tela.
    if (marca?.trim()) {
      const { error } = await createAdminClient()
        .from("brand_warranty_notes")
        .upsert({ brand: marca.trim(), content, origem: "ia" }, { onConflict: "brand" });
      if (error) console.error("[generate-image] não consegui guardar a nota da marca:", error.message);
    }
    return { installationNotes: content, notesSource: "ia" };
  } catch {
    return { installationNotes: null, notesSource: null };
  }
}
