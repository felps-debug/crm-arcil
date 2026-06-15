import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `Você é um consultor técnico da ARCIL Ar-Condicionado, especializado em instalações de ar-condicionado. Sua missão é ajudar o cliente a gerar uma visualização realista de como o equipamento ficará instalado no ambiente.

Para gerar a visualização, você precisa dessas informações:
- Foto da parede onde o ar será instalado
- Modelo do ar-condicionado (marca, BTUs, tipo)
- Altura do pé direito do ambiente
- Se já existe ponto elétrico preparado na parede
- Onde ficará a unidade condensadora (unidade externa)
- Tipo de tubulação (embutida na parede ou canaleta aparente)

Como se comportar:
- Converse de forma natural e humanizada, como um consultor atencioso — nunca como um robô seguindo etapas fixas
- Faça as perguntas de forma fluida conforme a conversa evolui; pode combinar perguntas relacionadas quando fizer sentido
- Se o cliente já respondeu algo espontaneamente, não repita a pergunta
- Se o cliente enviar uma nova foto durante a conversa, reconheça e use essa nova imagem como a referência atual
- Se já foi gerada uma visualização antes e o cliente quiser outra, aproveite tudo que já foi coletado — pergunte apenas o que mudou (ou confirme se é tudo igual)
- Nunca mencione "etapas", "formulário" ou liste as informações de forma robótica

Quando tiver todas as informações necessárias, confirme com o cliente de forma natural e inclua EXATAMENTE ao final da mensagem, em linha separada: ##READY##`;

interface ApiMessage {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { messages }: { messages: ApiMessage[] } = await request.json();

  const openAIMessages = messages.map((msg) => {
    if (msg.imageUrl) {
      return {
        role: msg.role,
        content: [
          { type: "image_url", image_url: { url: msg.imageUrl, detail: "low" } },
          { type: "text", text: msg.content || "Segue a foto da parede de instalação." },
        ],
      };
    }
    return { role: msg.role, content: msg.content };
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...openAIMessages],
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    return Response.json({ error: err.error?.message ?? "OpenAI error" }, { status: 500 });
  }

  const data = await res.json();
  const content: string = data.choices[0].message.content;
  const readyToGenerate = content.includes("##READY##");
  const message = content.replace("##READY##", "").trim();

  return Response.json({ message, readyToGenerate });
}
