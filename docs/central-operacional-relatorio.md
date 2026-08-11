# Central Operacional ARCIL

## O que foi entregue

O dashboard principal do CRM passou a ser a **Central Operacional**: uma visão única, em tempo real, de Leads, Agentes IA, Cobranças, Follow-ups, Estoque e Atendimento.

Ela foi desenhada para ficar aberta na TV do proprietário e, ao mesmo tempo, continuar útil para quem trabalha no computador. A linguagem visual deixa de ser uma coleção de cards genéricos e passa a funcionar como uma pauta operacional: cada área tem seu estado, sua tendência e um caminho direto para a tela de trabalho correspondente.

## Como o Paulo usa a tela

1. Abre o CRM e deixa o Dashboard visível na TV.
2. Observa a faixa superior: se houver follow-up urgente, ela muda para um aviso de atenção com acesso direto a Cobranças.
3. Lê as seis faixas centrais para entender o pulso de cada operação.
4. Acompanha a coluna de atividade recente e o rodapé de eventos para perceber movimentações de IA, pessoas, leads e cobranças.

Não é necessário interagir com a TV. A tela serve para percepção rápida e contínua da operação.

## Como a equipe usa o CRM

- **Financeiro:** trabalha dentro de Cobranças. Os boletos são resolvidos individualmente como pago, renegociado ou em aberto; a decisão pode devolver o cliente ao bot ou programar retorno.
- **Comercial:** entra em Leads para trabalhar a carteira e vê, pela Central, o volume e a movimentação geral.
- **Atendimento:** abre Atendimento para tratar conversas; a Central registra eventos recentes sem confundir atividade comum com alerta crítico.
- **Gestão:** usa a Central para priorizar, depois abre a área indicada por cada faixa.

## O que é atualizado ao vivo

A Central reage a mudanças em leads, vendas, billing, cotações e follow-ups. O estado de follow-ups urgentes é usado como alerta factual. Eventos recentes vêm do histórico operacional real do CRM.

## Regra de alertas

O CRM não inventa criticidade. Hoje, o alerta de atenção é acionado quando existem follow-ups urgentes. A coluna lateral mostra **Atividade recente**, com tipo e horário reais do evento. Quando o back-end passar a fornecer severidade por evento, ela poderá ser promovida a uma fila priorizada sem alterar o desenho da tela.

## Padrão visual aplicado

- Superfícies azul-tinta e linhas finas de transmissão para leitura prolongada.
- Azul de broadcast para navegação e seções; âmbar e vermelho reservados para atenção real.
- Montserrat para interface e IBM Plex Mono para valores e horários.
- Mesmo conjunto de tokens aplicado à base de todas as páginas; a Central define a referência para as próximas evoluções de Leads, Cobranças, Atendimento e Login.
- Login validado em desktop e mobile.

## Publicação e validação

- Alteração mesclada no repositório `felps-debug/crm-arcil`, pull request #2.
- Deploy de produção na Vercel concluído com sucesso no commit `f04ed03`.
- Typecheck e build de produção passaram localmente.
- CI e E2E do GitHub passaram.

## Próxima evolução recomendada

1. Abrir o dashboard autenticado na TV e confirmar visualmente a densidade na distância real de uso.
2. Criar um campo de severidade factual nos eventos do back-end para habilitar fila de prioridade por evento.
3. Aplicar a mesma composição de “faixas operacionais” nas telas de Leads, Cobranças e Atendimento em uma segunda etapa, mantendo cada fluxo de trabalho focado.
