import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!

// ARCHITECT e BUILDER sao o mesmo segmento na operacao e compartilham o mesmo
// catalogo (products_builder_architect).
const RPC_BY_SEGMENT: Record<string, string> = {
  CONSUMER: 'hybrid_search_consumer',
  INSTALLER: 'hybrid_search_installer',
  RESELLER: 'hybrid_search_reseller',
  BUILDER: 'hybrid_search_builder',
  ARCHITECT: 'hybrid_search_builder',
}

// '' e null viram null. Antes era Number(min_price), e Number(null) e 0 — o
// filtro nao chegava a quebrar nada, mas gravava um piso de preco que ninguem
// pediu.
function toPrice(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

Deno.serve(async (req) => {
  const {
    query,
    agent_type,
    match_count = 10,
    min_price,
    max_price,
    sort_by = 'relevance',
  } = await req.json()

  const segment = String(agent_type ?? '').trim().toUpperCase()
  const rpcFunction = RPC_BY_SEGMENT[segment]

  // Sem segmento conhecido -> busca nos 4 catalogos e devolve de qual veio cada
  // linha, para quem chamou descobrir o segmento a partir do resultado.
  // Antes o default era hybrid_search_consumer, calado: um agent_type ausente
  // ou errado virava "busca no catalogo de consumidor final", 200 OK, com
  // produtos sem relacao nenhuma com o pedido. Foi assim que uma lista de
  // materiais de instalacao voltou como 10 unidades de ar-condicionado.
  const isAuto = !rpcFunction

  const openai = new OpenAI({ apiKey: openaiApiKey })
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })
  const [{ embedding }] = embeddingResponse.data

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

  const baseParams = {
    query_text: query,
    query_embedding: embedding,
    match_count: match_count,
    p_min_price: toPrice(min_price),
    p_max_price: toPrice(max_price),
  }

  // hybrid_search_any nao aceita p_sort: ordena por similaridade para os scores
  // ficarem comparaveis entre catalogos.
  const { data: documents, error } = await supabase.rpc(
    isAuto ? 'hybrid_search_any' : rpcFunction,
    isAuto ? baseParams : { ...baseParams, p_sort: sort_by },
  )

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(documents), {
    headers: { 'Content-Type': 'application/json' },
  })
})
