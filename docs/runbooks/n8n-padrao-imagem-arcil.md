# n8n — Padrão de Imagem Arcil

O CRM passou a mandar mais coisas para os dois webhooks de imagem. Nada quebra se o
n8n não for alterado, mas duas partes só ficam completas com os ajustes abaixo.

> **Antes de editar:** recarregue a aba do editor do n8n. Salvar de uma aba aberta
> antes de uma alteração via API sobrescreve tudo (já sumiu um ramo inteiro assim).

## 1. Cena principal — raio-x da infraestrutura

Workflow `PVtyGZ6gQrBABe83`, grupo do `Webhook` de path `6fdf0bcb-…`.

O CRM agora acrescenta a instrução de raio-x padronizada (canaleta, parede ou forro
translúcidos, mesma cor e transparência sempre, nenhuma letra) **no fim de
`equipment_guidance`**, e manda a mesma frase sozinha em `estilo_infra`.

Conferir numa execução real:

1. Abrir a última execução e o nó **MONTA PROMPT SEEDREAM**.
2. Procurar no prompt final a frase `X-ray style is always the same`.
3. Se **não** estiver lá, o nó não usa `equipment_guidance`. Acrescentar ao fim da
   string do prompt:

   ```js
   ${$json.body.estilo_infra ?? ''}
   ```

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
