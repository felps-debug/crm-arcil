import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL, OPENAI_API_KEY, N8N_CHATBOT_WEBHOOK } from "@/lib/env";

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, imageUrl }: { messages: ApiMessage[]; imageUrl?: string } =
    await request.json();

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

  // POST to n8n and wait for the response — n8n uses "Respond to Webhook" node
  const n8nRes = await fetch(N8N_CHATBOT_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lead_id: leadId,
      image_url: imageUrl,
      image_base64: imageBase64,
      image_description: imageDescription,
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

  return Response.json({ imageUrl: generatedImageUrl });
}
