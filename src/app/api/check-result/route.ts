import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return Response.json({ error: "sessionId obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("generated_images")
    .select("url_imagem_final")
    .eq("phone_number", sessionId)
    .single();

  if (error || !data) {
    return Response.json({ done: false });
  }

  if (data.url_imagem_final) {
    return Response.json({ done: true, imageUrl: data.url_imagem_final });
  }

  return Response.json({ done: false });
}
