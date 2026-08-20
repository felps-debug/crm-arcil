import sharp from "sharp";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiPermission } from "@/lib/server/api-auth";
import { SUPABASE_URL, OPENAI_API_KEY, N8N_CHATBOT_WEBHOOK } from "@/lib/env";
import { assertEnv } from "@/lib/server/env-guard";
import { ARCIL_WATERMARK_BADGE_BASE64, ARCIL_WATERMARK_BADGE_WIDTH } from "@/lib/watermark-badge";
import { comporPrevia, type DadosOverlay } from "@/lib/server/installation-overlay";

// A rota espera o n8n desenhar a imagem, o que passa de um minuto. O padrão da
// plataforma corta antes e o vendedor recebe um erro genérico enquanto a geração
// ainda está em pé do outro lado.
export const maxDuration = 300;

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

// Só o hi-wall tem cota fixa aqui, porque foi a única validada contra a
// prática da ARCIL (era o único tipo que o gerador desenhava até hoje). Para
// os demais tipos é melhor apontar para o manual do fabricante do que inventar
// um número — foi exatamente inventar "2,80m" onde o vendedor respondeu 2,70
// que fez este overlay nascer com valor vindo do banco, não do modelo de
// imagem. Mesma regra vale aqui: sem confirmação, sem número.
const CONSULTAR_MANUAL = "conforme manual do fabricante";

function overlayCotas(type: unknown): { alturaInstalacao: string; distanciaTeto: string; espacamentoLateral: string } {
  const normalized = typeof type === "string" ? type.trim().toLowerCase() : "";
  if (normalized === "split hi-wall") {
    return { alturaInstalacao: "aprox. 2,20 m", distanciaTeto: "15 a 20 cm", espacamentoLateral: "mín. 15 cm" };
  }
  return { alturaInstalacao: CONSULTAR_MANUAL, distanciaTeto: CONSULTAR_MANUAL, espacamentoLateral: CONSULTAR_MANUAL };
}

function equipmentGuidance(type: unknown) {
  const normalized = typeof type === "string" ? type.trim().toLowerCase() : "";
  return EQUIPMENT_GUIDANCE[normalized] ?? "Usar o tipo informado sem substituí-lo por outro; manter espaço para manutenção e respeitar o manual do fabricante.";
}

async function openAI(body: object) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("OpenAI error");
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
  }: { messages: ApiMessage[]; imageUrl?: string; answers?: Record<string, string>; referenceImageUrl?: string; revisionPrompt?: string } = await request.json();

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
      model: "gpt-4o",
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

  // Analyze image with Vision
  let imageDescription = "";
  if (imageUrl) {
    try {
      imageDescription = await openAI({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
              {
                type: "text",
                text: "Descreva tecnicamente esta parede para instalação de ar-condicionado: tipo de parede, cor, dimensões estimadas, presença de tomadas/marcações/pontos elétricos, objetos próximos, e posição ideal para o equipamento. Seja técnico e conciso.",
              },
            ],
          },
        ],
        max_tokens: 400,
      });
    } catch {}
  }

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
    imageDescription ? `Descrição do ambiente: ${imageDescription}` : null,
    `Diretriz técnica do equipamento: ${equipmentGuidance(collectedData.tipo_equipamento)}`,
    "A simulação deve ser executável para vendedor, instalador ou orçamento. Não esconder tubulação, dreno, suportes ou acessos necessários; seguir o manual oficial da marca e do modelo para preservar a garantia.",
    revisionPrompt?.trim() ? `AJUSTE SOLICITADO: ${revisionPrompt.trim()}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  const technicalGuidance = equipmentGuidance(collectedData.tipo_equipamento);
  const revisionInstruction = revisionPrompt?.trim()
    ? `AJUSTE SOLICITADO PELO USUÁRIO: ${revisionPrompt.trim()}`
    : null;

  // Fetch image and convert to base64 to include in webhook payload
  let imageBase64 = "";
  if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl);
      const imgBuffer = await imgRes.arrayBuffer();
      const mimeType = imgRes.headers.get("content-type") || "image/jpeg";
      imageBase64 = `data:${mimeType};base64,${Buffer.from(imgBuffer).toString("base64")}`;
    } catch {}
  }

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
        lead_id: leadId,
        image_url: imageUrl,
        image_base64: imageBase64,
        image_description: imageDescription,
        product_image_url: productImageUrl,
        product_image_base64: productImageBase64,
        reference_image_url: referenceImageUrl ?? null,
        revision_prompt: revisionPrompt?.trim() ?? null,
        generation_mode: referenceImageUrl ? "revision" : "initial",
        equipment_guidance: technicalGuidance,
        revision_instruction: revisionInstruction,
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

  // Accept the image URL under any field n8n might return
  const primeiraString = (...valores: unknown[]): string | null =>
    valores.find((v): v is string => typeof v === "string" && v.length > 0) ?? null;

  const rawUrl = primeiraString(
    n8nData.url_imagem_final,
    n8nData.image_url,
    n8nData.imageUrl,
    n8nData.url
  );

  // Strip _{timestamp} suffix that n8n may append to storage filenames
  const generatedImageUrl = rawUrl ? rawUrl.replace(/_\d+$/, "") : null;

  if (!generatedImageUrl) {
    return Response.json({ error: "n8n não retornou a URL da imagem" }, { status: 500 });
  }

  // A camada técnica (título, cotas, passo a passo, cards) é composta aqui, não
  // desenhada pelo modelo: texto de modelo de imagem sai errado. Já veio "2,80m"
  // onde o vendedor respondeu 2,70. Agora o número vem do que ele respondeu.
  const finalImageUrl = await comporEEnviar(generatedImageUrl, leadId, {
    produto: String(collectedData.modelo ?? "Ar-condicionado"),
    marca: typeof collectedData.marca === "string" ? collectedData.marca : null,
    sku: typeof collectedData.sku === "string" ? collectedData.sku : null,
    tipoEquipamento: String(collectedData.tipo_equipamento ?? "Split Hi-Wall"),
    peDireito: typeof collectedData.pe_direito === "string" ? formatarMetros(collectedData.pe_direito) : null,
    ...overlayCotas(collectedData.tipo_equipamento),
    tubulacao: typeof collectedData.tubulacao === "string" ? collectedData.tubulacao : null,
    pontoEletrico: typeof collectedData.ponto_eletrico === "boolean" ? collectedData.ponto_eletrico : null,
    produtoImagemBase64: productImageBase64 ? `data:image/jpeg;base64,${productImageBase64}` : null,
  });

  const { installationNotes, notesSource } = await getInstallationNotes(
    supabase,
    String([collectedData.marca, collectedData.modelo, collectedData.tipo_equipamento].filter(Boolean).join(" "))
  );

  const { data: profile } = await supabase.from("user_profiles").select("full_name").eq("id", user.id).single();
  await supabase.from("image_generations").insert({
    lead_id: leadId,
    user_id: user.id,
    user_name: profile?.full_name ?? user.email ?? null,
    wall_image_url: imageUrl ?? null,
    generated_image_url: finalImageUrl,
    answers: collectedData,
    installation_notes: installationNotes,
    installation_notes_source: notesSource,
  });

  return Response.json({ imageUrl: finalImageUrl, installationNotes, installationNotesSource: notesSource });
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
  const n = Number(valor.replace(",", ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n.toFixed(2).replace(".", ",")} m`;
}

/**
 * Compõe a camada técnica sobre a cena e sobe o resultado no mesmo lugar onde a
 * marca d'água já subia. Se qualquer etapa falhar, cai no caminho antigo (só a
 * marca d'água) — a prévia sem moldura ainda vende, um erro não.
 */
async function comporEEnviar(imageUrl: string, leadId: string, dados: DadosOverlay): Promise<string> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`fetch cena -> HTTP ${res.status}`);
    const composta = await comporPrevia(Buffer.from(await res.arrayBuffer()), dados);

    // O selo ARCIL só era carimbado no caminho de fallback (watermarkImage),
    // que só roda quando a camada técnica FALHA. Com a camada técnica no ar,
    // a prévia saía sem selo nenhum — corrigido carimbando aqui também, mesmo
    // badge e posição do watermarkImage.
    const { width: larguraComposta = 1536 } = await sharp(composta).metadata();
    const leftBadge = Math.max(0, larguraComposta - ARCIL_WATERMARK_BADGE_WIDTH - 16);
    const comSelo = await sharp(composta)
      .composite([{ input: Buffer.from(ARCIL_WATERMARK_BADGE_BASE64, "base64"), top: 16, left: leftBadge }])
      .jpeg({ quality: 94 })
      .toBuffer();

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
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const original = Buffer.from(await res.arrayBuffer());
    const normalizada = await sharp(original)
      .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 86 })
      .toBuffer();
    return normalizada.toString("base64");
  } catch (err) {
    console.error("[generate-image] foto do produto indisponível:", err instanceof Error ? err.message : err);
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
  // adivinhar. Só as três tabelas com `marca` interessam — o gerador desenha ar
  // condicionado, e é onde eles estão.
  if (codigoErp) {
    for (const tabela of ["products_consumer", "products_reseller", "products_installer"]) {
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
    const left = Math.max(0, width - ARCIL_WATERMARK_BADGE_WIDTH - 16);
    const watermarked = await base
      .composite([{ input: Buffer.from(ARCIL_WATERMARK_BADGE_BASE64, "base64"), top: 16, left }])
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
  modelo: string
): Promise<{ installationNotes: string | null; notesSource: "manual" | "ia" | null }> {
  if (!modelo.trim()) return { installationNotes: null, notesSource: null };

  const { data: notes } = await supabase.from("brand_warranty_notes").select("brand,content");
  const modeloLower = modelo.toLowerCase();
  const match = (notes ?? []).find((n) => modeloLower.includes(n.brand.toLowerCase()));
  if (match) return { installationNotes: match.content, notesSource: "manual" };

  try {
    const content = await openAI({
      model: "gpt-4o",
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
    return { installationNotes: content, notesSource: "ia" };
  } catch {
    return { installationNotes: null, notesSource: null };
  }
}
