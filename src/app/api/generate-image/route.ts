import sharp from "sharp";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiPermission } from "@/lib/server/api-auth";
import { SUPABASE_URL, OPENAI_API_KEY, N8N_CHATBOT_WEBHOOK } from "@/lib/env";
import { ARCIL_LOGO_BASE64 } from "@/lib/logo-base64";

interface ApiMessage {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
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
  const { user, response } = await requireApiPermission("manage_gerador_imagem");
  if (response) return response;

  const supabase = await createClient();

  const {
    messages,
    imageUrl,
    answers,
  }: { messages: ApiMessage[]; imageUrl?: string; answers?: Record<string, string> } = await request.json();

  if (imageUrl) {
    const allowedHost = new URL(SUPABASE_URL).hostname;
    try {
      const parsed = new URL(imageUrl);
      if (parsed.hostname !== allowedHost) {
        return Response.json({ error: "imageUrl não permitido" }, { status: 400 });
      }
    } catch {
      return Response.json({ error: "imageUrl inválida" }, { status: 400 });
    }
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
            "Extraia as informações da conversa e retorne um JSON com os campos: modelo, pe_direito, ponto_eletrico (boolean), unidade_externa, tubulacao. Retorne APENAS o JSON válido, sem markdown.",
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
  if (answers?.modelo) collectedData.modelo = answers.modelo;
  if (answers?.pe_direito) collectedData.pe_direito = answers.pe_direito;
  if (answers?.tubulacao) collectedData.tubulacao = answers.tubulacao;
  if (answers?.unidade_externa) collectedData.unidade_externa = answers.unidade_externa;
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
    collectedData.modelo ? `Modelo: ${collectedData.modelo}` : null,
    collectedData.tipo_parede ? `Tipo de parede: ${collectedData.tipo_parede}` : null,
    collectedData.pe_direito ? `Pé direito: ${collectedData.pe_direito}` : null,
    typeof collectedData.ponto_eletrico === "boolean"
      ? `Ponto elétrico: ${collectedData.ponto_eletrico ? "já existe" : "não existe"}`
      : null,
    collectedData.unidade_externa ? `Unidade externa: ${collectedData.unidade_externa}` : null,
    collectedData.tubulacao ? `Tubulação: ${collectedData.tubulacao}` : null,
    imageDescription ? `Descrição do ambiente: ${imageDescription}` : null,
  ]
    .filter(Boolean)
    .join(". ");

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

  const productImageUrl = await getProductImageUrl(supabase, String(collectedData.modelo ?? ""));

  // POST to n8n and wait for the response — n8n uses "Respond to Webhook" node
  const n8nRes = await fetch(N8N_CHATBOT_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lead_id: leadId,
      image_url: imageUrl,
      image_base64: imageBase64,
      image_description: imageDescription,
      product_image_url: productImageUrl,
      prompt,
      ...collectedData,
    }),
  });

  if (!n8nRes.ok) {
    return Response.json({ error: "Erro ao processar no n8n" }, { status: 500 });
  }

  const n8nData = await n8nRes.json();

  // Accept the image URL under any field n8n might return
  const rawUrl: string | null =
    n8nData.url_imagem_final ??
    n8nData.image_url ??
    n8nData.imageUrl ??
    n8nData.url ??
    null;

  // Strip _{timestamp} suffix that n8n may append to storage filenames
  const generatedImageUrl = rawUrl ? rawUrl.replace(/_\d+$/, "") : null;

  if (!generatedImageUrl) {
    return Response.json({ error: "n8n não retornou a URL da imagem" }, { status: 500 });
  }

  const finalImageUrl = await watermarkImage(generatedImageUrl, leadId);

  const { installationNotes, notesSource } = await getInstallationNotes(supabase, String(collectedData.modelo ?? ""));

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

/**
 * Looks up a curated reference photo for the selected model/brand
 * (product_reference_images, populated manually — empty until real product
 * photos are uploaded). Passed to n8n as `product_image_url` so the image
 * generation prompt can use it as a real visual reference instead of
 * inventing a generic unit.
 */
async function getProductImageUrl(supabase: SupabaseClient, modelo: string): Promise<string | null> {
  if (!modelo.trim()) return null;
  const { data: refs } = await supabase.from("product_reference_images").select("brand,model_pattern,image_url");
  const modeloLower = modelo.toLowerCase();
  const match = (refs ?? []).find(
    (r) => modeloLower.includes(r.brand.toLowerCase()) && modeloLower.includes(r.model_pattern.toLowerCase())
  );
  return match?.image_url ?? null;
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

    stage = "resize logo";
    // Logo is embedded as base64 in source — no filesystem or network
    // dependency, since public/ assets aren't guaranteed to be reachable
    // (filesystem) or unauthenticated (Vercel deployment protection) from
    // inside the serverless function.
    const logoBuffer = await sharp(Buffer.from(ARCIL_LOGO_BASE64, "base64")).resize(28, 28).png().toBuffer();

    stage = "read image metadata";
    const base = sharp(imgBuffer);
    const { width = 1536 } = await base.metadata();

    stage = "composite watermark";
    const badgeWidth = 260;
    const badgeHeight = 44;
    const left = Math.max(0, width - badgeWidth - 16);
    const badgeSvg = Buffer.from(
      `<svg width="${badgeWidth}" height="${badgeHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${badgeWidth}" height="${badgeHeight}" rx="8" fill="rgba(5,11,20,0.72)"/>
        <text x="44" y="27" font-family="sans-serif" font-size="14" font-weight="700" fill="#ffffff">Design created by ARCIL AI</text>
      </svg>`
    );

    const watermarked = await base
      .composite([
        { input: badgeSvg, top: 16, left },
        { input: logoBuffer, top: 16 + (badgeHeight - 28) / 2, left: left + 8 },
      ])
      .jpeg({ quality: 95 })
      .toBuffer();

    stage = "upload to storage";
    const storagePath = `watermarked/${leadId}.jpg`;
    const { error: uploadError } = await admin.storage
      .from("PDF")
      .upload(storagePath, watermarked, { contentType: "image/jpeg", upsert: true });
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
