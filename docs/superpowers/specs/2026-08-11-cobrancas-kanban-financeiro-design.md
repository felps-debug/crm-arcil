# Cobranças: Kanban operacional financeiro

## Objetivo

Centralizar a rotina da equipe financeira na área **Cobranças**, sem exigir navegação pelo Kanban geral ou pela tela de Leads. A tabela atual continua responsável por disparos, consulta e auditoria; uma nova aba operacional organiza os atendimentos humanos em um Kanban.

## Experiência proposta

Adicionar uma aba **Atendimentos financeiros** dentro de Cobranças, ao lado de Monitoramento, Follow-ups e Logs. O Kanban terá quatro colunas:

1. **Aguardando resposta** — cobrança enviada, aguardando manifestação do cliente.
2. **Em atendimento humano** — a financeira assumiu o handoff no Chatwoot.
3. **Aguardando retorno** — a financeira encerrou como “Sem retorno”; a próxima tentativa será em três dias úteis.
4. **Resolvido** — não há boleto aberto ou o atendimento foi encerrado sem novas cobranças.

Cada cliente aparece em um cartão com nome, telefone, quantidade de boletos em aberto, valor total, última movimentação e próxima ação. O cartão é expansível no próprio Kanban. Ao expandir, a financeira decide cada boleto individualmente: **Pago**, **Renegociado** ou **Manter em aberto**.

As ações finais são:

- **Devolver ao bot**: salva as decisões, libera o bot imediatamente e mantém somente boletos em aberto na posição financeira da IA.
- **Sem retorno**: salva as decisões, libera o bot e registra a retomada para três dias úteis; quando chegar a data, somente documentos ainda abertos entram no próximo follow-up.

O botão em massa “Marcar como pago” não será o caminho principal da operação financeira, pois não permite identificar qual boleto foi quitado. A decisão detalhada por boleto será a fonte de verdade.

## Permissões

O acesso continuará sendo controlado pelas permissões já administradas pelo dono. A nova aba respeita a permissão de Cobranças; não exige que o usuário tenha acesso à tela de Leads ou ao Kanban geral.

## Fluxo de dados

```text
Chatwoot assume
      ↓
Atendimento aparece em “Em atendimento humano”
      ↓
Financeira expande o cartão e decide boleto a boleto
      ↓
RPC/API salva decisões no Supabase
      ↓
Webhook financeiro do n8n libera o bot
      ├─ Devolver ao bot: IA continua imediatamente
      └─ Sem retorno: registra retomada em 3 dias úteis
```

O estado exibido no Kanban deve ser derivado das decisões financeiras e dos timestamps existentes, sem duplicar uma segunda fonte de verdade. Falhas na entrega ao n8n não desfazem a decisão salva: o cartão permanece sinalizado para tentar novamente.

## Componentes previstos

- Aba e layout do Kanban em `src/app/cobranca`.
- Cartão expansível reutilizando o formulário de decisão financeira existente.
- Query server-side/realtime para listar atendimentos e posição atual dos boletos.
- Ação de retry para falhas de integração com n8n.
- Cálculo de três dias úteis para a data de retomada.

## Critérios de aceite

- Um usuário com permissão de Cobranças consegue finalizar um atendimento sem abrir Leads.
- É possível marcar boletos diferentes com decisões diferentes no mesmo cartão.
- “Devolver ao bot” libera a IA e ela não menciona documentos pagos/renegociados.
- “Sem retorno” move o cartão para Aguardando retorno e exibe uma data de três dias úteis.
- O Kanban atualiza após novas mensagens, decisões ou mudanças na posição financeira.
- Uma falha no webhook mostra erro recuperável e mantém a decisão financeira salva.
- A tabela de Monitoramento e o histórico continuam funcionando.

## Fora de escopo nesta etapa

- Criar um novo módulo financeiro separado.
- Alterar o Kanban geral de atendimento.
- Trocar o modelo de permissões existente.
- Automatizar renegociação ou conciliação bancária com o ERP.
