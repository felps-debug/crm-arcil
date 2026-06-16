<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# ARCIL CRM — Documentação Técnica

## Stack
- **Next.js 16** + React 19 + TypeScript
- **Supabase** (auth + database + storage + realtime)
- **n8n** (automação de workflows, webhooks)
- **OpenAI GPT-4o** (chatbot + vision)
- **Tailwind CSS v4** + Framer Motion + Recharts

## Estrutura de pastas relevantes

```
src/
  app/
    admin/           → Página de gestão de usuários (superadmin only)
    agentes/         → Monitoramento dos agentes IA por segmento
    api/
      admin/users/   → CRUD de usuários via Supabase Admin (service role)
      chat/          → GPT-4o conversação do chatbot
      cobranca/
        disparo/     → Insere leads na cobranca_log + notifica n8n
      generate-image/→ Extrai dados, chama n8n, retorna URL da imagem
    chatbot/         → Chatbot de visualização de instalação de AC
    cobranca/        → Disparos, upload de planilha, monitoramento realtime
    leads/           → Tabela de leads com filtros
    demanda-estoque/ → Catálogo de produtos + estoque
  components/
    layout/          → Sidebar, Header, MainWrapper, Providers
    ui/              → Card, Badge, MetricCard, SectionTitle, Skeleton, etc.
    charts/          → Recharts wrappers
  hooks/
    use-current-user.ts → Role e permissões do usuário logado
    use-supabase.ts     → Hook genérico para queries assíncronas
    use-theme.ts        → Tema claro/escuro
  lib/
    supabase/
      client.ts    → createClient (browser)
      server.ts    → createClient (server-side, com cookies)
      admin.ts     → createAdminClient (service role — só usar em API routes)
      queries.ts   → Queries reutilizáveis
  types/index.ts   → Todos os tipos mapeados às tabelas Supabase
```

## Supabase

- **Projeto ID:** `swcqvrowqwylcegrcesu`
- **URL:** `https://swcqvrowqwylcegrcesu.supabase.co`
- **Tabelas principais:** `leads`, `followups`, `cobranca_log`, `products_cache`, `vendors`, `conversations`, `messages`, `user_profiles`
- **Buckets:** `chatbot-images` (fotos da parede), `PDF` (imagens geradas)

### Tabela `user_profiles`
Colunas: `id` (FK auth.users), `email`, `full_name`, `role` (enum), `permissions` (jsonb), `created_at`, `updated_at`

Enum `user_role`: `superadmin`, `owner`, `manager`, `vendor`, `employee`, `client`

Criada automaticamente via trigger `on_auth_user_created` quando um usuário é adicionado ao Auth.

### RLS
- `user_profiles`: usuário lê/edita apenas o próprio perfil
- Admin (service role) bypassa RLS → usar sempre via API routes (`/api/admin/`)

## Roles e permissões

| Role        | Acesso                                      |
|-------------|---------------------------------------------|
| superadmin  | Tudo, incluindo `/admin`                   |
| owner       | Tudo exceto `/admin`                       |
| manager     | Leads, cobrança, follow-ups                |
| vendor      | Visualização de leads                       |
| employee    | Visualização de leads                       |
| client      | Restrito                                    |

Super admins atuais: `lukeottoboni@gmail.com`, `welisonfelipe132@gmail.com`

## Variáveis de ambiente necessárias (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://swcqvrowqwylcegrcesu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   ← obrigatório para /api/admin/* funcionar
OPENAI_API_KEY=...
N8N_CHATBOT_WEBHOOK=...         ← webhook do n8n para geração de imagem
N8N_COBRANCA_WEBHOOK=...        ← opcional: notifica n8n após disparar cobrança
```

## Fluxo de Cobrança (Disparos)

1. Usuário faz upload de CSV/XLSX na página `/cobranca`
2. Frontend parseia com `xlsx` (sheetjs) — aceita colunas: telefone/fone/celular, nome, valor, vencimento, documento
3. Preview exibe os leads antes de confirmar
4. Botão "Disparar" → POST `/api/cobranca/disparo` → insere na tabela `cobranca_log` com `status_disparo = PENDENTE`
5. (Opcional) notifica `N8N_COBRANCA_WEBHOOK` para processar
6. Realtime via Supabase Realtime (`postgres_changes`) atualiza a tabela ao vivo conforme n8n muda os status

## Fluxo do Chatbot (Gerador de Imagem AC)

1. Usuário envia foto da parede → upload direto para bucket `chatbot-images` via Supabase JS client
2. GPT-4o (via `/api/chat`) conduz conversa e coleta: modelo, pé direito, ponto elétrico, unidade externa, tubulação
3. Quando tudo coletado, `/api/chat` retorna `readyToGenerate: true` (sinalizado pelo `##READY##` no response)
4. `/api/generate-image` extrai dados estruturados + analisa imagem com Vision + chama n8n webhook
5. n8n gera imagem, salva no bucket `PDF/{lead_id}`, responde via "Respond to Webhook"
6. URL retornada é exibida no chat com opção de download

## Design System

- Tipografia: **Montserrat** (UI — mesma fonte do site institucional arcil.com.br) + **IBM Plex Mono** (dados numéricos)
- Tema: variáveis CSS em `globals.css` — sempre `var(--bg-surface)`, `var(--text-primary)`, etc.
- Dark/light via classe `.dark` — NÃO usar `bg-white` hardcoded
- Componentes base: `Card`, `Badge`, `MetricCard`, `SectionTitle`, `SectionTitle`, `ErrorState`, skeletons

## Deploy (Vercel)

- Quando pronto: `vercel --prod` (requer `vercel login` interativo do usuário)
- Configurar as mesmas env vars do `.env.local` no painel da Vercel
- Domínio custom: configurar via Vercel dashboard após deploy
- Criar login do Paulo (dono): via `/admin` → Criar usuário → role `owner`
