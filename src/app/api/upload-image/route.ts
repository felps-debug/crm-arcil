import { NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const BUCKET = "chatbot-images";
const MAX_SIZE = 15 * 1024 * 1024; // 15MB

// Esse endpoint é público (chatbot não exige login), então o tipo do arquivo e a
// extensão NÃO podem vir de input do usuário (file.name/file.type) sem validação —
// senão dá pra hospedar HTML/SVG com script no bucket público com Content-Type
// controlado pelo atacante. Só aceita os tipos reais de imagem abaixo.
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return Response.json({ error: "Tipo de arquivo não permitido. Envie uma foto (JPEG, PNG ou WEBP)." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return Response.json({ error: "Arquivo muito grande (máx. 15MB)." }, { status: 400 });
  }

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const bytes = await file.arrayBuffer();

  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": file.type,
        "x-upsert": "false",
      },
      body: bytes,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    return Response.json(
      { error: err.message ?? `Supabase storage error ${uploadRes.status}` },
      { status: 500 }
    );
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`;
  return Response.json({ url: publicUrl, path: filename });
}
