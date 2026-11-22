<!--
Relatório de Impacto da Sincronização
- Mudança de versão: template não ratificado -> 1.0.0
- Princípios definidos:
  - Princípio modelo 1 -> I. Evidência Antes da Otimização
  - Princípio modelo 2 -> II. Orçamentos de Performance e Eficiência de Recursos
  - Princípio modelo 3 -> III. Correção dos Dados em Escala
  - Princípio modelo 4 -> IV. Fronteiras Seguras e Menor Privilégio
  - Princípio modelo 5 -> V. Observabilidade e Verificação em Produção
- Seções adicionadas:
  - Restrições Técnicas e Operacionais
  - Fluxo de Desenvolvimento e Portões de Qualidade
- Seções removidas: nenhuma
- Pendências: nenhuma
-->

# Constituição do ARCIL CRM

## Core Principles

### I. Evidência Antes da Otimização

Toda mudança de performance, confiabilidade ou capacidade DEVE começar com uma linha de base
reproduzível do fluxo afetado. A evidência DEVE identificar janela de medição, ambiente, volume de
requisições ou consultas, latência e lacunas conhecidas. A otimização proposta DEVE declarar qual
gargalo resolve e NÃO DEVE apoiar-se apenas em intuição, custo sintético de query ou tempo local.
Após a implementação, o mesmo método de medição DEVE ser repetido e comparado à linha de base.

Justificativa: o sistema atravessa navegador, Vercel, Supabase, Realtime e serviços externos.
Otimizar uma camada sem evidência ponta a ponta pode apenas deslocar o custo ou ocultar o gargalo.

### II. Orçamentos de Performance e Eficiência de Recursos

Fluxos de leitura percebidos pelo usuário DEVEM ter metas mensuráveis de latência e quantidade de
requisições na especificação da feature. Novas mudanças DEVEM evitar waterfalls dispensáveis,
autenticação duplicada, leitura de tabelas inteiras para agregações, payloads sem limite e caches
cujo escopo não atenda ao comportamento declarado. O trabalho do banco DEVE ser proporcional aos
dados solicitados ou alterados; sincronizações em segundo plano NÃO DEVEM regravar linhas iguais.
Upgrade de infraestrutura DEVE ocorrer depois da remoção de ineficiências demonstráveis, salvo
quando um incidente ativo exigir capacidade emergencial.

Justificativa: banco e pool do PostgREST são recursos compartilhados e limitados. Uma query rápida
isoladamente não basta quando fan-out, distância de rede ou escritas de fundo criam fila.

### III. Correção dos Dados em Escala

Métricas, contagens e decisões operacionais DEVEM preservar significado conforme os dados crescem.
Queries DEVEM tratar limites de linhas da API por agregação, paginação limitada ou invariante
documentada. Identidade e deduplicação DEVEM usar o identificador canônico do negócio quando ele
existir; identificadores nulos ou legados DEVEM ter fallback explícito. Otimizações que alterem
projeções, local de agregação ou cache DEVEM provar equivalência de resultados para dados normais,
vazios, duplicados, nulos e acima do limite da API.

Justificativa: um dashboard mais rápido que trunca registros ou muda totais financeiros e de
estoque é uma regressão, não uma otimização.

### IV. Fronteiras Seguras e Menor Privilégio

A autenticação DEVE ser verificada criptograficamente antes de uma identidade ser usada para
autorização. Acesso pelo navegador DEVE permanecer protegido por RLS e privilégios explícitos.
Credenciais de service role DEVEM existir somente em código confiável do servidor. Funções expostas
pela Data API DEVEM usar `SECURITY INVOKER` por padrão; toda exceção com `SECURITY DEFINER` exige
modelo de ameaça documentado, `search_path` fixo, referências qualificadas por schema e permissões
de execução explícitas. Funções e tabelas DEVEM ser inacessíveis a `anon` e `authenticated`, salvo
quando a especificação exigir o acesso e definir testes das respectivas políticas.

Justificativa: reduzir latência não pode enfraquecer autorização, expor funções privilegiadas ou
tratar dados de sessão não verificados como identidade confiável.

### V. Observabilidade e Verificação em Produção

Fluxos críticos DEVEM expor dados de tempo e correlação suficientes para separar latência de
navegador, aplicação, autenticação, banco, Realtime e serviços externos. Logs DEVEM evitar segredos
e dados pessoais, mantendo identificador da requisição, etapas nomeadas, duração e resultado da
falha. A aceitação de performance DEVE usar medições frias e quentes e informar, no mínimo,
quantidade de requisições e latências p50/p95 em amostra documentada. Uma mudança só está concluída
quando verificações automatizadas passam e a validação próxima de produção confirma performance e
correção dos resultados de negócio.

Justificativa: instâncias serverless, pools de conexão e jobs externos tornam logs isolados
insuficientes para diagnosticar regressões ou provar uma melhoria.

## Restrições Técnicas e Operacionais

- A stack suportada é Next.js 16, React 19, TypeScript, Supabase, Vercel, Tailwind CSS 4 e os
  serviços externos n8n/Python documentados pelo projeto. Antes de mudar comportamento do Next.js,
  o guia aplicável em `node_modules/next/dist/docs/` DEVE ser lido, pois esta versão contém quebras
  de convenção.
- Mudanças de schema Supabase DEVEM ser representadas por migrations revisadas. RPCs, policies RLS,
  views, grants e mudanças de Storage DEVEM incluir verificação positiva e negativa de permissão.
- Código servidor PODE usar service role somente pelo cliente administrativo designado. Código de
  cliente DEVE usar o cliente do navegador e permanecer sujeito a RLS.
- A região das Vercel Functions DEVE considerar a região primária dos dados e a geografia dos
  usuários. Um deploy deliberadamente inter-regional DEVE documentar o impacto em latência,
  disponibilidade e custo.
- Sistemas externos a este repositório DEVEM ser tratados como escopos de entrega separados. Suas
  mudanças, responsável, caminho de deploy e evidência de verificação DEVEM ser registrados, sem
  representá-los como concluídos por alterações feitas somente neste repositório.
- Redis, nova infraestrutura, aumento de compute do banco ou outra camada de cache NÃO DEVEM ser
  adicionados sem medições mostrando que consolidação de requests, queries adequadas e cache
  limitado no cliente não conseguem cumprir o orçamento aprovado.

## Fluxo de Desenvolvimento e Portões de Qualidade

1. Features materiais e atualizações amplas DEVEM seguir a sequência Spec Kit: especificação,
   esclarecimento quando necessário, plano, tarefas, análise quando útil, implementação e
   convergência.
2. Toda especificação de performance DEVE registrar linha de base, lacunas de medição, ambiente
   alvo, escopo, dependências fora do escopo e critérios mensuráveis de sucesso.
3. Planos que alterem Supabase DEVEM definir semântica dos dados, fronteiras de privilégio,
   estratégia de migration, recuperação ou rollback e queries de verificação antes da implementação.
4. A implementação DEVE incluir testes adequados à fronteira alterada: unitários para agregações
   puras, contrato ou integração para APIs e RPCs, permissão para RLS/grants e regressão para totais
   de negócio.
5. Antes da conclusão, o projeto DEVE passar pelas verificações relevantes de tipos, testes, lint e
   build de produção. Toda verificação ignorada DEVE registrar motivo e risco residual.
6. A conclusão de performance DEVE comparar a mesma jornada antes e depois e publicar quantidade
   de requests, volume de payload ou linhas quando relevante, latência fria, latência quente,
   p50/p95 e checagens de correção.
7. O trabalho DEVE permanecer no escopo aprovado. Melhorias em workers externos, acesso de
   infraestrutura, planos de cobrança ou responsabilidade de deploy DEVEM virar follow-up explícito,
   salvo quando a especificação as nomear como entregáveis e houver autorização suficiente.

## Governance

Esta constituição governa especificações, planos, tarefas, implementação e revisão do ARCIL CRM.
Quando outro documento do projeto entrar em conflito com ela, a constituição prevalece, salvo se
uma emenda aprovada alterar a regra.

Emendas DEVEM ser propostas por escrito com princípios afetados, justificativa, impacto de migração
e consequências de verificação. A aprovação pertence ao proprietário do projeto ou mantenedor
explicitamente delegado. Toda emenda DEVE atualizar versão e data conforme versionamento semântico:
MAJOR para mudanças incompatíveis de governança ou remoção de princípios; MINOR para novos
princípios ou obrigações materialmente ampliadas; PATCH para esclarecimentos sem mudança semântica.

Todo plano de feature e toda revisão de código DEVEM incluir uma checagem de conformidade com a
constituição. Não conformidades DEVEM ser corrigidas antes da conclusão ou registradas como exceção
aprovada e temporária, com responsável e follow-up. O Relatório de Impacto da Sincronização no topo
é material de revisão e DEVE ser removido antes do commit da constituição ratificada.

**Version**: 1.0.0 | **Ratified**: 2026-09-22 | **Last Amended**: 2026-09-22
