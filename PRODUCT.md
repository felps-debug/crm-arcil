# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Paulo (Dono):** Acompanha saúde geral da operação em tempo real, em desktop e TV. Precisa entender rapidamente o que está acontecendo com os leads, onde a IA está trabalhando e onde há risco ou ação pendente.
- **Equipes (Comercial, Operacional, Financeira):** Trabalham em desktop. Cada uma tem uma superfície focada:
  - Comercial: leads, funil, handoffs, follow-ups
  - Financeira: cobranças, disparos, boletos, confirmação de pagamento
  - Operacional: agentes IA, estoque, demanda
- **Administradores:** Controlam usuários, permissões, integrações.

## Product Purpose

ARCIL CRM centraliza operação comercial e financeira: captação de leads, acompanhamento por agentes IA, atendimento humano, cobranças, follow-ups e estoque. Transforma eventos distribuídos (CRM, WhatsApp, Chatwoot, n8n, ERP) em operação compreensível e acionável em tempo real.

## Positioning

Diferente de uma lista genérica de leads, o ARCIL torna visível a cadeia completa: qual agente IA está atendendo cada lead, quais leads estão aguardando humano, que boletos estão abertos, qual agente está pausado, onde há follow-up atrasado. Cada superfície (leads, cobrança, agentes, estoque) é um domínio da operação com sua própria agenda de trabalho.

## Operating Context

- **Uso contínuo em escritório:** Desktop para equipes durante trabalho; TV na sala exibindo painel operacional geral (Paulo + visitantes entendem o estado em uma olhada).
- **Realtime:** Supabase realtime atualiza leads, follow-ups, cobranças_log, conversas conforme mudam.
- **Fluxo de dados:** ERP → Supabase (produtos), WhatsApp/Chatwoot → Supabase (conversas), n8n → Supabase (automações, webhooks).
- **Domínios de trabalho separados:** Cobrança é seu próprio domínio; leads têm seu próprio Kanban; agentes têm seu próprio painel de monitoramento.

## Capabilities and Constraints

### Capabilities (Built & Live)
- **Dashboard Central:** "O que está acontecendo com os leads?" — painel operacional com agentes ativos, leads no funil, fila de trabalho, sinal financeiro, eventos em tempo real.
- **Leads:** 3 modos de visualização (tabela, Kanban, cards); filtros (status, segmento, período, responsável, handoff, late, respondeu, com orçamento, com venda); 5 estágios de pipeline (NOVO → CONVERSANDO → FOLLOWUP → ENCAMINHADO → PERDIDO).
- **Agentes IA:** Monitoramento por segmento (NEW, CONSUMER, BUILDER, INSTALLER, RESELLER, COBRANCA); métricas por agente (leads ativos, conversas, perdidos); habilitação/pausar agente.
- **Cobranças:** Upload CSV/XLSX com disparos; monitoramento realtime de status (PENDENTE, DISPARADO, NAO DISPARADO); confirmação de pagamento; Financial Handoff Board; follow-up tecnico.
- **Gerador de Imagem (Chatbot AC):** Chat multi-step para coletar dados de instalação (ambiente, parede, modelo, pé direito, ponto elétrico, unidade externa, tubulação); upload de foto para análise com Vision; chamada a n8n para gerar imagem; histórico de gerações com download.
- **Demanda & Estoque:** Catálogo de produtos por segmento (4 tabelas); out-of-stock requests; sincronização com ERP (parcial — estoque ainda null na maioria dos casos).
- **Atendimento (Chatwoot):** Integração com inbox do Chatwoot; visualização de conversas abertas.
- **Admin:** Gestão de usuários (criar, editar, deletar); atribuição de roles (superadmin, owner, manager, vendor, employee, client); permissões por módulo.

### Constraints
- **Estoque:** Coluna `estoque` é null em todas as linhas; sem sincronização real do ERP. Tela mostra "não sincronizado" em vez de zero.
- **Cerebro Arcil:** Ainda em construção (under-construction placeholder).
- **Dados sintéticos:** Nenhuma métrica, cliente ou resultado comercial pode ser fabricado; interfaces demonstrativas devem declarar dados de teste.
- **Mobile:** Desktop-first. Leads/Cobrança têm responsividade, mas não é o foco.

## Brand Commitments

- **Marca ARCIL:** Assinatura "Operacional Comercial"; logos em `public/logo-icon.png`, `public/logo.png`, `public/logo-arcil-full.png`.
- **Tipografia:** Montserrat para UI (mesma do site arcil.com.br), IBM Plex Mono para dados numéricos — legibilidade a distância é crítica (TV mode).
- **Design Language:** Console-style (deep teal, mineral text, disciplined signal colors). Sem aparência genérica de dashboard gerado por IA.
- **TV Mode:** Painel central deve ser legível em uma TV de sala sem mouse, com fontes e contrastes que funcionem a distância.

## Evidence on Hand

- **Código atual:** Implementação completa em `src/app/` com 9 páginas (dashboard, leads, agentes, cobrança, chatbot, estoque, atendimento, cerebro, admin).
- **APIs funcionando:** `/api/dashboard/summary`, `/api/agents/summary`, `/api/dashboard/pending-center`, `/api/inventory/summary`, `/api/chat`, `/api/generate-image`, `/api/leads`, `/api/check-result`.
- **Integração Supabase:** Tabelas principais (leads, conversations, followups, cobranca_log, user_profiles, vendors) com RLS.
- **Realtime:** Subscriptions ativas em postgres_changes para leads, followups, cobranca_log, conversations.
- **Webhooks n8n:** Integração ativa para geração de imagem e disparos de cobrança.

## Product Principles

1. **Ação antes de decoração:** Cada estado deve deixar cristalino quem precisa agir e qual é o próximo passo. Sem informação dispersa.
2. **Uma visão para o dono, superfícies focadas para cada equipe:** Paulo vê saúde geral (leads, agentes, riscos); comercial ve funil; financeiro vê boletos abertos.
3. **Dados vivos parecem confiáveis:** Origem, atualização, exceções, síncronos/assincronos devem ser óbvios. "Não sincronizado" ≠ "zero".
4. **Humano e IA são a mesma operação:** Transição entre agente IA → handoff → humano → cobrança é explícita no pipeline.
5. **Clareza à distância:** TV mode não é um luxo; sinais principais (agentes pausados, follow-up atrasado, boleto aberto) devem ser legíveis sem mouse ou interação.
6. **Sem dados fabricados:** O que é teste, síntese ou projeção deve ser marcado claramente. O que é real é real.

## Accessibility & Inclusion

- Contraste WCAG AA em ambos os temas (light/dark).
- Estados não podem depender apenas de cor (use ícones, rótulos, status).
- Foco de teclado em todos os botões e inputs.
- Fontes legíveis em tamanhos pequenos e grandes (TV vs. desktop).
- Descrições alt em imagens; labels em inputs.
