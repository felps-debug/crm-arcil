# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Paulo, o proprietário, acompanha a operação em uma TV e precisa entender rapidamente o que está acontecendo ao vivo e onde há risco ou ação pendente.
- Equipes operacional, comercial e financeira trabalham no CRM em desktop para acompanhar leads, agentes de IA, cobranças, follow-ups e atendimentos humanos.
- Administradores controlam usuários, permissões e integrações.

## Product Purpose

ARCIL CRM centraliza a operação comercial: captação e acompanhamento de leads, agentes de IA, atendimentos, estoque, cobranças e follow-ups. O produto deve transformar eventos distribuídos entre CRM, WhatsApp, Chatwoot, n8n, Supabase e ERP em uma operação compreensível e acionável em tempo real.

## Positioning

Em vez de ser apenas uma lista de leads, o ARCIL CRM torna visível a cadeia completa da operação: o que a IA fez, o que precisa de humano, o estado financeiro boleto a boleto e o próximo passo de cada atendimento.

## Operating Context

- Uso contínuo em escritório, com uma visão operacional geral exibida em TV.
- Cobrança é operada dentro de uma área própria, incluindo disparos, boletos, follow-ups e handoff financeiro.
- Os dados são atualizados a partir do Supabase em tempo real e de automações no n8n, Chatwoot, WhatsApp e ERP.
- O proprietário precisa enxergar o panorama geral; a equipe financeira precisa concluir decisões sem navegar pelo Kanban geral de leads.

## Capabilities and Constraints

- Next.js 16, React 19, TypeScript, Tailwind CSS v4, Supabase, n8n, OpenAI, Framer Motion e Recharts.
- Perfis e permissões existentes devem ser preservados: owner, manager, vendor, employee, client e superadmin.
- A operação financeira pode marcar cada boleto como pago, renegociado ou em aberto; pode devolver ao bot ou programar retorno após 3 dias úteis.
- Não inventar métricas, clientes, resultados comerciais ou integrações. Interfaces demonstrativas devem identificar claramente dados sintéticos quando isso for necessário.
- A nova central deve continuar útil em desktop e TV, sem perder a operação móvel existente.

## Brand Commitments

- Marca: ARCIL, com a assinatura "Operacional Comercial" e ativos em `public/logo-icon.png`, `public/logo.png` e `public/logo-arcil-full.png`.
- O usuário quer um frontend memorável e de nível demonstrável para futuros clientes, sem aparência genérica de interface gerada por IA.
- A tipografia atual usa Montserrat para interface e IBM Plex Mono para dados; qualquer evolução deve preservar legibilidade operacional e a identidade ARCIL.

## Evidence on Hand

- Implementação existente em `src/app`, incluindo dashboard, cobrança, leads, agentes, atendimento e estoque.
- Dados e fluxos reais de cobrança, handoff financeiro e acompanhamento exibidos no CRM.
- Capturas do fluxo operacional e da área de Cobranças fornecidas pelo usuário nesta conversa.
- Não há depoimentos, benchmarks, cases públicos ou métricas comerciais verificadas para uso como prova externa.

## Product Principles

1. Ação antes de decoração: cada estado operacional deve deixar claro quem precisa agir e qual é o próximo passo.
2. Uma visão para o dono, superfícies focadas para cada equipe: panorama total não deve tornar o trabalho de cobrança mais complexo.
3. Dados vivos precisam parecer confiáveis: origem, atualização e exceções devem ser fáceis de perceber.
4. Automação e humano são uma mesma operação: o CRM deve tornar a transição entre IA, Chatwoot e financeiro explícita.
5. Clareza à distância: os sinais principais devem poder ser entendidos em uma TV, sem depender de passar o mouse ou ler texto pequeno.

## Accessibility & Inclusion

- Contraste, estados não dependentes apenas de cor, foco de teclado e tamanhos legíveis devem ser preservados.
- A visão de TV deve continuar legível a distância e não depender exclusivamente de interação para revelar alertas importantes.
