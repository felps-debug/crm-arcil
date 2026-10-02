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

## 2. Condensadora — dois locais novos

Webhook de `N8N_CONDENSADORA_WEBHOOK`. O campo `tipo_local` agora pode ser também
`parede_externa` e `chao`, além de `telhado`, `laje_tecnica` e `sacada_tecnica`.

Acrescentar os dois casos onde o nó escolhe a frase do cenário:

| `tipo_local` | Frase da cena |
|---|---|
| `parede_externa` | outdoor condenser unit mounted on a metal wall bracket on an exterior masonry wall, level, 15 cm away from the wall, free airflow around it |
| `chao` | outdoor condenser unit on a raised concrete base on the ground, level, anti-vibration pads, free airflow around it |

Enquanto isso não for feito, a cena desses dois locais pode sair genérica ou falhar.
Se falhar, a prancha mostra os afastamentos mínimos em texto no lugar da cena: a
prévia continua saindo.

## 3. Calibrar a preservação da foto

Cada geração com marcação registra no log do servidor:

```
[preservarFoto] diferença fora da zona: 12.4 (limiar 32)
```

Se o ambiente aparecer "fantasma" (duas paredes desencontradas), o limiar está alto
demais. Se a foto **nunca** for preservada, ele está baixo demais. O valor fica em
`LIMIAR_DESALINHO` (`src/lib/server/preservar-foto.ts`).
