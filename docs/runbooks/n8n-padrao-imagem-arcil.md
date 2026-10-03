# n8n — Padrão de Imagem Arcil

O CRM passou a mandar mais coisas para os dois webhooks de imagem. Nada quebra se o
n8n não for alterado, mas duas partes só ficam completas com os ajustes abaixo.

> **Antes de editar:** recarregue a aba do editor do n8n. Salvar de uma aba aberta
> antes de uma alteração via API sobrescreve tudo (já sumiu um ramo inteiro assim).

## 1. Cena principal — feito em 2026-10-02

Workflow `PVtyGZ6gQrBABe83` ("GERAÇÃO DE IMAGEM VENDEDOR").

- **Edit Fields2** repassa `estilo infra` (de `estilo_infra`, enviado pelo CRM).
- **MONTA PROMPT SEEDREAM**: quando `estilo infra` vem, ele É a regra de
  infraestrutura (raio-x padronizado do CRM, `lib/server/diretriz-raio-x.ts`). As
  regras antigas ("volume fantasma" do forro, "canaleta opaca sem cobre visível")
  ficam só como fallback — eram elas que faziam o cassete sair pendurado e a
  canaleta esconder a tubulação.
- Geometria do forro: só o painel aparece, rente ao forro; o corpo do cassete fica
  escondido acima dele, nunca pendurado.

**Queda do Seedream (`ECONNRESET`, mensagem `aborted`) — causa e correção, 2026-10-03.**
`aborted` no Node só acontece quando o servidor já começou a responder e a conexão cai
no meio do corpo (sem resposta nenhuma seria `socket hang up`). Nas 6 gerações do
histórico, as 2 quedas aconteceram aos 53 s e 60 s — exatamente quando a imagem fica
pronta — enquanto houve sucesso aos 72 s: não é tempo-limite fixo, é a transferência da
imagem embutida (`b64_json`, ~0,9 MB de Singapura) que se partia. A imagem já tinha sido
gerada e cobrada.

Correção: `HTTP Request1` pede `response_format: "url"` (resposta de poucos bytes) e o
nó novo **BAIXA IMAGEM SEEDREAM** baixa a imagem do link (vale 24 h) com até 4 tentativas
— repetir o download não gera nem cobra de novo. Os nós `Edit Fields3` e
`Convert to File2` saíram. Testado com uma geração real (execução 257273): link em
137,7 s (carga da BytePlus), download em 4 s.

## 2. Condensadora — feito em 2026-10-02

Workflow `ieGHO3BQTCSMfac0` ("GERAÇÃO CONDENSADORA - LOCAL", Gemini 3 Pro Image).
Desde 2026-09-02 o nó **Monta Prompt** exigia `location_image_base64` (foto real do
local) e recusava qualquer chamada sem ela — inclusive o botão "Local da
condensadora" do CRM, que nunca mandou essa foto.

O nó agora tem dois caminhos:

- **sem `location_image_base64`** (o que o CRM manda): ilustração genérica do tipo de
  local, com a condensadora real copiada da foto de catálogo (`product_image_base64`);
- **com `location_image_base64`**: edita a foto real do local, como antes.

`tipo_local` aceita `telhado`, `laje_tecnica`, `sacada_tecnica`, `parede_externa` e
`chao`. Cópia do fluxo anterior: execução de backup diária no GitHub.

## 3. Calibrar a preservação da foto

Cada geração com marcação registra no log do servidor:

```
[preservarFoto] diferença fora da zona: 12.4 (limiar 32)
```

Se o ambiente aparecer "fantasma" (duas paredes desencontradas), o limiar está alto
demais. Se a foto **nunca** for preservada, ele está baixo demais. O valor fica em
`LIMIAR_DESALINHO` (`src/lib/server/preservar-foto.ts`).
