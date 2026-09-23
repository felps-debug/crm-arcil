# Especificação da Feature: Otimizar Performance do CRM

**Feature Branch**: `master` (nenhuma branch criada pela especificação)

**Criada em**: 2026-09-22

**Status**: Rascunho

**Entrada**: Auditoria de performance do CRM baseada em leitura do código, estatísticas e planos do banco e logs de borda, com solicitação para corrigir todos os gargalos identificados.

## Clarifications

### Session 2026-09-22

- Q: Quanto tempo os dados de uma tela visitada valem como frescos e o cache sobrevive a um recarregamento? → A: Só em memória da aba; fresco por 30 s, revalida ao retornar depois disso; recarregar a página (F5) começa do zero.
- Q: Onde as medições de antes e depois devem ser feitas pra valer como aceite? → A: Em deploy de preview da Vercel apontando para o banco de produção.
- Q: O que conta como "carga fria" nas medições do dashboard? → A: Contexto de navegador novo, sem cache e com sessão já válida; a função serverless pode estar quente.
- Q: A feature pode ser entregue antes do sincronizador ERP externo estar publicado? → A: Sim, em duas fases: o CRM entra em `master` quando CS-001 a CS-005 e CS-008 a CS-010 passam; o sincronizador (CS-006/CS-007) vira follow-up com responsável nomeado.
- Q: Onde devem ficar os traços de performance do RF-020? → A: Em tabela nova no Supabase (`performance_traces`).

## User Scenarios & Testing *(obrigatório)*

### User Story 1 - Abrir o dashboard sem espera operacional (Prioridade: P1)

Como integrante da operação, quero abrir o dashboard e visualizar os indicadores corretos em poucos segundos para começar meu trabalho sem aguardar uma sequência longa de carregamentos.

**Por que esta prioridade**: O dashboard medido levou cerca de 13 segundos para ficar utilizável e concentrou os maiores gargalos de leitura, fila e latência percebida.

**Teste independente**: Medir, em ambiente próximo de produção e com o volume atual, a jornada autenticada de abertura direta do dashboard. A entrega gera valor por si só quando os indicadores completos aparecem dentro do orçamento e coincidem com os dados de referência.

**Acceptance Scenarios**:

1. **Dado** um usuário autorizado com sessão válida e dados já existentes, **quando** ele abre o dashboard em uma carga fria, **então** os indicadores essenciais ficam utilizáveis dentro do orçamento definido e sem totais divergentes.
2. **Dado** que uma categoria de produto possui mais registros que o limite de uma leitura comum, **quando** o dashboard calcula suas métricas, **então** todos os registros elegíveis participam dos totais, sem truncamento silencioso.
3. **Dado** que uma origem de dados está vazia, indisponível ou ainda não sincronizada, **quando** o dashboard é aberto, **então** a interface distingue ausência real, dado não sincronizado e falha de carregamento sem apresentar zero enganoso.

---

### User Story 2 - Navegar e retornar sem recarregar tudo (Prioridade: P1)

Como usuário autenticado, quero alternar entre Dashboard, Leads e outras áreas e retornar a uma tela visitada com os dados disponíveis imediatamente, recebendo atualizações em segundo plano sem voltar ao skeleton completo.

**Por que esta prioridade**: Hoje cada retorno repete a carga integral e recria a espera, mesmo quando os dados acabaram de ser consultados.

**Teste independente**: Abrir o dashboard, navegar para Leads e retornar dentro do período de validade dos dados. O conteúdo anterior deve aparecer imediatamente, seguido de atualização discreta quando necessária.

**Acceptance Scenarios**:

1. **Dado** que o usuário visitou uma tela recentemente, **quando** retorna a ela, **então** vê o último estado válido sem bloqueio enquanto a atualização acontece em segundo plano.
2. **Dado** que a atualização em segundo plano encontra dados novos, **quando** ela termina, **então** somente os valores alterados são atualizados sem apagar temporariamente o restante da tela.
3. **Dado** que a atualização em segundo plano falha, **quando** existe um estado válido anterior, **então** ele permanece visível e o usuário recebe indicação não bloqueante de que os dados podem estar desatualizados.

---

### User Story 3 - Receber atualizações em tempo real sem tempestade de carga (Prioridade: P1)

Como operador acompanhando cobranças, leads, conversas e follow-ups, quero ver mudanças recentes refletidas na seção relacionada sem que uma única alteração recarregue todo o dashboard.

**Por que esta prioridade**: O comportamento atual pode repetir aproximadamente 45 operações de leitura após qualquer mudança observada, ampliando filas e degradando todos os usuários.

**Teste independente**: Alterar separadamente uma cobrança, um lead, uma conversa e um follow-up e observar quais partes do dashboard são atualizadas e quantas operações são disparadas.

**Acceptance Scenarios**:

1. **Dado** que ocorre uma mudança em uma origem monitorada, **quando** o evento chega ao dashboard, **então** apenas a seção dependente dessa origem é revalidada.
2. **Dado** que várias mudanças relacionadas chegam em uma janela curta, **quando** a janela termina, **então** elas são agrupadas em uma única atualização por seção afetada.
3. **Dado** que o usuário sai da página, **quando** novos eventos ocorrem, **então** nenhuma atualização ligada à página desmontada continua sendo executada.

---

### User Story 4 - Manter o CRM responsivo durante sincronizações (Prioridade: P1)

Como usuário do CRM, quero que sincronizações de estoque em segundo plano não tornem a navegação lenta para que eu possa trabalhar mesmo durante uma carga do ERP.

**Por que esta prioridade**: A sincronização externa é o maior consumidor de CPU observado e regrava milhões de versões de linhas, inclusive quando os valores não mudaram.

**Teste independente**: Executar uma sincronização com lote majoritariamente idêntico aos dados existentes enquanto se repete a jornada do dashboard, verificando escritas, correção dos valores e latência percebida.

**Acceptance Scenarios**:

1. **Dado** um item cujo estoque e estoque em trânsito permanecem iguais, **quando** o lote é sincronizado, **então** o item não é regravado.
2. **Dado** um item com valor alterado, **quando** o lote é sincronizado, **então** somente os campos efetivamente alterados são atualizados e o novo valor fica disponível no CRM.
3. **Dado** uma sincronização ativa, **quando** usuários navegam no CRM, **então** o orçamento de performance continua atendido na amostra de validação definida.

---

### User Story 5 - Entrar uma vez e manter a sessão sem trabalho duplicado (Prioridade: P2)

Como usuário autenticado, quero que meu perfil e minhas permissões sejam carregados uma única vez por evento relevante de sessão para entrar mais rápido e manter o acesso correto.

**Por que esta prioridade**: O login observado repetiu quatro verificações de usuário e quatro leituras de perfil em um segundo; as rotas protegidas também repetiram validações remotas em série.

**Teste independente**: Realizar login, renovar sessão, alternar o foco da aba e abrir o dashboard, comparando a quantidade de carregamentos de identidade e o resultado das permissões.

**Acceptance Scenarios**:

1. **Dado** um login bem-sucedido, **quando** os eventos iniciais de sessão são emitidos, **então** o perfil é carregado uma única vez para o estado resultante da sessão.
2. **Dado** um token renovado sem mudança de identidade ou permissões, **quando** a renovação ocorre, **então** ela não provoca uma nova cadeia redundante de carregamento do perfil.
3. **Dado** um usuário sem a permissão necessária, **quando** ele tenta acessar dados protegidos, **então** o acesso continua negado mesmo após as otimizações de autenticação.

---

### User Story 6 - Diagnosticar regressões com evidência ponta a ponta (Prioridade: P2)

Como mantenedor, quero correlacionar uma navegação às etapas de aplicação, autenticação e dados para localizar regressões sem repetir uma investigação manual extensa.

**Por que esta prioridade**: A auditoria não conseguiu incluir hidratação do navegador nem runtime do ambiente publicado, e logs isolados dificultam separar rede, fila e processamento.

**Teste independente**: Executar uma jornada instrumentada e demonstrar que cada carregamento possui um identificador correlacionável, durações por etapa e resultado, sem expor segredos ou dados pessoais.

**Acceptance Scenarios**:

1. **Dado** um carregamento do dashboard, **quando** o mantenedor consulta os registros permitidos, **então** consegue relacionar a jornada às suas etapas e identificar onde o tempo foi gasto.
2. **Dado** uma falha parcial, **quando** ela é registrada, **então** o registro contém etapa, duração, identificador e resultado suficientes para diagnóstico, sem credenciais nem conteúdo pessoal desnecessário.
3. **Dado** uma entrega candidata, **quando** a validação é executada, **então** há um relatório comparável de antes e depois com carga fria, carga quente, p50, p95, quantidade de operações e correção dos resultados.

### Edge Cases

- Mais de 1.000 leads, follow-ups ou produtos elegíveis não podem causar truncamento ou totais incorretos.
- Produtos com identificador canônico nulo, repetido ou legado devem seguir uma regra explícita e determinística de contagem, sem duplicação acidental.
- Tabelas vazias, categorias ausentes e estoque nulo devem preservar a distinção entre zero e “não sincronizado”.
- Mudanças simultâneas em várias origens devem atualizar cada seção necessária uma vez, sem perder eventos nem recarregar seções não afetadas.
- Uma revalidação lenta não pode permitir que uma resposta antiga sobrescreva dados mais novos já exibidos.
- Falha de uma seção do dashboard não deve ocultar seções independentes que carregaram corretamente.
- Sessão expirada, assinatura inválida ou perfil ausente devem continuar bloqueando acesso protegido de forma segura.
- Indisponibilidade temporária da fonte de dados deve preservar o último estado válido quando houver e informar sua defasagem.
- A sincronização deve tratar valores nulos e transições entre nulo e número como mudanças reais, mas não deve regravar nulo como nulo.
- Alterações de região ou topologia não podem impedir o deploy nem degradar usuários caso o local preferencial esteja temporariamente indisponível.

## Requirements *(obrigatório)*

### Functional Requirements

- **RF-001**: O sistema DEVE entregar em uma única carga coerente todos os dados necessários às áreas de resumo, pendências e agentes do dashboard, evitando repetir a mesma leitura central durante essa jornada.
- **RF-002**: O sistema DEVE verificar identidade e autorização uma única vez por carga consolidada do dashboard, preservando todas as regras de acesso existentes.
- **RF-003**: O sistema DEVE calcular os totais de produtos distintos, com estoque, sem estoque e estado de sincronização sem transferir catálogos completos apenas para realizar agregações.
- **RF-004**: As métricas de produto DEVEM manter a mesma semântica de negócio para registros normais, vazios, duplicados, nulos, legados e volumes acima de 1.000 registros.
- **RF-005**: As contagens de inventário, pendências sem estoque e produtos disponíveis DEVEM compartilhar uma fonte de verdade coerente para impedir totais divergentes na mesma carga.
- **RF-006**: Toda leitura operacional DEVE solicitar somente os campos e registros necessários ao resultado apresentado, incluindo origens de planilha e histórico de cobrança.
- **RF-007**: Toda coleção que possa ultrapassar o limite de resposta da fonte DEVE ser agregada de forma completa ou percorrida com limite explícito, sem truncamento silencioso.
- **RF-008**: O ambiente publicado DEVE executar o processamento de navegação em localidade adequada à região primária dos dados e à geografia dos usuários, com a decisão e o comportamento de contingência documentados.
- **RF-009**: A identidade usada para autorizar uma operação DEVE ser verificada criptograficamente, sem transformar dados de sessão não verificados em identidade confiável.
- **RF-010**: A otimização de autenticação DEVE funcionar com o método de assinatura vigente; caso ele não permita verificação local segura, o sistema DEVE manter a verificação remota e registrar a dependência para migração, sem reduzir a segurança.
- **RF-011**: Carregamentos de perfil no navegador DEVEM aproveitar o usuário já presente em eventos confiáveis de sessão e evitar repetições causadas por eventos que não alteram identidade ou permissões.
- **RF-012**: Dados de telas visitadas DEVEM permanecer disponíveis para retorno imediato e ser revalidados em segundo plano de acordo com uma política explícita de atualidade, erro e invalidação: o estado fica apenas na memória da aba (nunca em `localStorage`, `sessionStorage` ou IndexedDB), é considerado fresco por 30 segundos após a obtenção, é revalidado em segundo plano no retorno após esse prazo ou ao receber invalidação em tempo real, e é descartado ao recarregar a página ou encerrar a sessão.
- **RF-013**: Durante revalidação, o sistema DEVE preservar o último estado válido e impedir que respostas fora de ordem substituam dados mais novos.
- **RF-014**: Eventos em tempo real DEVEM invalidar somente as seções dependentes da origem alterada e agrupar eventos próximos dentro de uma janela entre 2 e 5 segundos.
- **RF-015**: A contagem de follow-ups urgentes DEVE possuir uma única fonte compartilhada por todos os componentes visíveis na mesma sessão, sem consultas simultâneas equivalentes.
- **RF-016**: A sincronização externa de estoque DEVE atualizar somente itens cujos valores relevantes mudaram, incluindo transições envolvendo valores nulos.
- **RF-017**: A mudança da sincronização externa DEVE ter responsável, repositório ou serviço alvo, procedimento de publicação, recuperação e evidência de validação registrados separadamente das alterações deste repositório.
- **RF-018**: Políticas de acesso avaliadas por linha DEVEM preservar o resultado atual de autorização e evitar recomputações desnecessárias da identidade ou função do usuário.
- **RF-019**: Qualquer função de dados introduzida para agregação DEVE operar com o menor privilégio, negar acesso anônimo e não ampliar o acesso de usuários autenticados além do permitido atualmente.
- **RF-020**: Cada jornada crítica DEVE emitir um identificador de correlação e durações nomeadas suficientes para separar navegador, aplicação, autenticação, dados, tempo real e integrações externas quando aplicável. Os traços DEVEM ser gravados em uma tabela nova no Supabase (`performance_traces`), criada por migração versionada, com RLS habilitada, escrita apenas pelo servidor e leitura restrita a superadmin.
- **RF-021**: Logs e métricas NÃO DEVEM registrar chaves, tokens, credenciais ou dados pessoais além do mínimo necessário para diagnóstico.
- **RF-022**: A validação DEVE ser executada em deploy de preview da Vercel apontando para o banco de produção, com a mesma configuração de região da produção, repetir a mesma jornada e conjunto de dados da linha de base e documentar pelo menos 30 cargas frias e 30 cargas quentes, p50, p95, quantidade de operações, volume transferido e equivalência dos indicadores.
- **RF-023**: A entrega DEVE incluir testes de regressão para totais e permissões, cobrindo dados vazios, nulos, duplicados, legados e acima do limite comum de resposta.
- **RF-024**: A entrega NÃO DEVE introduzir nova camada de cache compartilhado, ampliar capacidade computacional ou otimizar pacotes do navegador sem medição posterior demonstrando que os requisitos permanecem não atendidos por causa desses fatores.

### Cobertura dos Achados da Auditoria

| Achado | Resultado exigido pela especificação |
| --- | --- |
| 1. Contagem de produtos em série | Agregações completas e coerentes sem catálogos integrais nem sequências redundantes (RF-003 a RF-005) |
| 2. Tabelas centrais lidas repetidamente | Uma carga coerente e uma autorização por jornada do dashboard (RF-001 e RF-002) |
| 3. Sincronização regrava linhas iguais | Escrita apenas de valores alterados e entrega externa rastreável (RF-016 e RF-017) |
| 4. Distância geográfica | Processamento publicado em localidade adequada, com contingência documentada (RF-008) |
| 5. Verificação remota repetida de identidade | Verificação segura e não redundante, compatível com a assinatura vigente (RF-002, RF-009 e RF-010) |
| 6. Ausência de reaproveitamento no cliente | Retorno imediato, revalidação em segundo plano e proteção contra respostas antigas (RF-012 e RF-013) |
| 7. Atualização em tempo real recarrega tudo | Invalidação seletiva e agrupada (RF-014) |
| 8. Carga de campos desnecessários | Projeções e coleções limitadas ao uso real (RF-006) |
| 9. Perfil carregado repetidamente | Um carregamento por mudança relevante de identidade ou permissão (RF-011) |
| 10. Contagem duplicada de follow-ups | Fonte compartilhada por sessão (RF-015) |
| 11. Risco de truncamento acima de 1.000 linhas | Resultados completos e testes em escala (RF-004, RF-007 e RF-023) |
| 12. Avaliação repetitiva nas políticas de acesso | Autorização equivalente com avaliação eficiente e menor privilégio (RF-018 e RF-019) |
| Lacunas de observabilidade | Correlação ponta a ponta e relatório comparável (RF-020 a RF-022) |

### Key Entities

- **Snapshot do Dashboard**: conjunto coerente dos indicadores, pendências, agentes e atividade necessários para uma carga, associado ao momento de referência e ao usuário autorizado.
- **Métrica de Produto**: totais distintos por segmento, disponibilidade de estoque, ausência de estoque e estado de sincronização, calculados segundo uma regra única de identidade.
- **Estado de Tela em Cache**: último resultado válido de uma tela, mantido só em memória da aba, com instante de obtenção, validade de 30 segundos, estado de revalidação e erro mais recente.
- **Evento de Atualização**: mudança de negócio observada, contendo origem, seção afetada e instante, usada para invalidar apenas dados dependentes.
- **Item de Sincronização**: produto identificado canonicamente, com valores atuais e recebidos de estoque e estoque em trânsito, classificado como alterado ou inalterado.
- **Contexto de Identidade**: usuário verificado, perfil e permissões usados de forma coerente durante uma jornada autorizada.
- **Traço de Performance**: registro na tabela `performance_traces` com identificador de correlação com etapas, durações, resultado, modalidade fria ou quente e contagem de operações, sem segredos ou dados pessoais desnecessários.

## Success Criteria *(obrigatório)*

### Measurable Outcomes

- **CS-001**: Em pelo menos 30 cargas frias no ambiente alvo e com o volume de referência, o dashboard fica utilizável em até 1,5 segundo no p50 e até 2 segundos no p95, contra a linha de base aproximada de 13 segundos.
- **CS-002**: Em pelo menos 30 retornos a uma tela visitada recentemente, o último estado válido aparece em até 300 ms no p95, sem skeleton completo, e a atualização termina sem bloquear a interação.
- **CS-003**: Uma carga fria do dashboard realiza no máximo 12 operações de leitura na fonte principal de dados, contra aproximadamente 45 na linha de base, e nenhuma tabela central é lida mais de uma vez para compor a mesma resposta.
- **CS-004**: Uma mudança isolada em cobrança, lead, conversa ou follow-up provoca no máximo uma revalidação por seção afetada dentro da janela de agrupamento e zero revalidações de seções independentes.
- **CS-005**: Para conjuntos vazios, nulos, duplicados, legados e com mais de 1.000 registros, 100% dos indicadores do dashboard coincidem com os resultados de referência aprovados.
- **CS-006**: Um lote de sincronização cujos valores não mudaram produz zero regravações; em lote misto, o número de itens regravados é exatamente igual ao número de itens efetivamente alterados.
- **CS-007**: Durante a execução do lote de sincronização de validação, o p95 de abertura do dashboard permanece em até 2 segundos e nenhum indicador apresenta dados parciais ou divergentes.
- **CS-008**: Login, renovação de sessão e retorno de foco sem mudança de identidade resultam em no máximo um carregamento de perfil para o estado efetivo da sessão, preservando 100% dos testes positivos e negativos de autorização.
- **CS-009**: 100% das jornadas amostradas do dashboard possuem correlação ponta a ponta, durações por etapa e resultado suficientes para atribuir a latência, sem segredos ou dados pessoais indevidos nos registros.
- **CS-010**: Usuários autorizados conseguem concluir abertura, navegação de ida e volta e leitura dos indicadores sem bloqueio em pelo menos 95% das tentativas da amostra; falhas parciais mantêm as demais seções utilizáveis.

## Assumptions

- A linha de base aceita é a auditoria de 22/09/2026: cerca de 13 segundos para o dashboard, aproximadamente 45 operações de leitura, processamento publicado distante da região dos dados e lacunas de medição no navegador e no runtime publicado.
- O ambiente alvo de validação é um deploy de preview da Vercel apontando para o banco de produção, acessado a partir do Brasil, com a mesma configuração de região e plano da produção; com isso o conjunto de dados é o próprio volume de produção.
- O comportamento e as permissões visíveis atuais devem permanecer compatíveis; esta iniciativa melhora desempenho, escalabilidade e diagnóstico, mas não redesenha o produto.
- “Carga fria” significa abrir o dashboard em um contexto de navegador novo, sem cache HTTP nem estado de cliente, com sessão já válida; não exige que a função serverless esteja fria. “Carga quente” é o retorno à tela dentro da mesma aba.
- “Tela utilizável” significa que os indicadores essenciais estão visíveis, corretos e interativos; atualizações secundárias podem continuar em segundo plano sem bloquear o usuário.
- O último estado válido pode ser exibido durante revalidação, desde que sua defasagem e eventuais erros sejam tratados de modo não enganoso.
- A regra canônica de identidade de produto existente será preservada e documentada no plano; onde faltar identificador, será adotado fallback determinístico coberto por testes.
- A modificação do sincronizador de estoque ocorre fora deste repositório e depende de acesso ao serviço responsável; ela integra o escopo de resultado como Fase 2, não bloqueia a entrega da Fase 1 no CRM e não pode ser declarada concluída apenas com mudanças no CRM.
- A mudança da localidade do ambiente publicado depende de acesso ao projeto de hospedagem e deve ser validada antes de ser considerada concluída.
- A forma vigente de assinatura de identidade deve ser verificada no planejamento antes de escolher uma otimização; segurança e revogação prevalecem sobre o ganho de latência.
- Otimização de pacotes do navegador, adoção de nova infraestrutura de cache e aumento do plano computacional ficam fora do escopo inicial por falta de evidência de que sejam gargalos determinantes.
- Integrações de geração de imagem, cobrança e automações externas não fazem parte do caminho de leitura e permanecem fora do escopo, exceto o sincronizador de estoque explicitamente citado.

## Dependências e Limites de Escopo

- **Dentro deste repositório**: composição do dashboard, consultas e agregações, seleção de dados, autenticação e perfil, reaproveitamento de estado no cliente, invalidação em tempo real, contagem compartilhada, políticas de acesso relacionadas e instrumentação.
- **Fora deste repositório, mas necessário para o resultado completo**: alteração e publicação do sincronizador ERP, acesso ao ambiente de hospedagem para definição regional e acesso aos registros do runtime publicado para validação.
- **Fora do escopo nesta fase**: Redis ou cache compartilhado novo, upgrade do banco, reestruturação de n8n/Python não relacionada ao estoque, otimização especulativa de bundle e redesign visual.
- A entrega acontece em duas fases. **Fase 1 (CRM)**: entra em `master` quando CS-001 a CS-005 e CS-008 a CS-010 são atendidos; não depende do sincronizador. **Fase 2 (sincronizador ERP)**: CS-006 e CS-007 ficam como follow-up explícito com responsável nomeado, e a feature só é considerada totalmente concluída quando essa fase tiver evidência de execução.
