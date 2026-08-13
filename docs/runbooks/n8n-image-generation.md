# n8n — Geração e revisão de simulações de instalação

O CRM envia ao webhook de imagem um contexto estruturado para que o n8n não
precise inferir o tipo do equipamento a partir de uma foto ou texto.

## Campos principais

- `tipo_equipamento`: `Split Hi-Wall`, `Cassete`, `Piso-teto` ou `Dutado`. A lista
  é fechada de propósito: cada valor tem geometria correspondente no prompt do
  n8n. Um valor fora dela deixa o gerador sem saber onde instalar o equipamento.
- `marca` e `modelo`: identificação comercial informada pelo vendedor.
- `equipment_guidance`: regra visual/técnica específica do tipo.
- `prompt`: contexto completo do ambiente, instalação e garantia.
- `product_image_url`: referência real do produto quando o banco de imagens for populado.
- `generation_mode`: `initial` ou `revision`.
- `reference_image_url`: imagem anterior quando for uma revisão.
- `revision_prompt`: alteração solicitada pelo usuário.

## Regra do prompt do n8n

O prompt do modelo deve tratar `product_image_url` como referência visual
prioritária quando existir. Se `generation_mode` for `revision`, deve preservar
a composição correta da `reference_image_url` e modificar apenas o que foi
pedido em `revision_prompt`.

O tipo nunca deve ser convertido automaticamente para outro equipamento:

- **Split Hi-Wall:** evaporadora na parede.
- **Cassete:** painel embutido no forro, não evaporadora na parede.
- **Piso-teto:** unidade instalada na configuração piso-teto informada.
- **Dutado:** unidade e distribuição por dutos/grelhas, sem inventar aparelho aparente.

Em todos os casos, a cena deve manter dreno, tubulação, suportes e acessos de
manutenção visualmente plausíveis. Não inventar medidas ou regras específicas de
garantia; usar o manual oficial da marca/modelo como autoridade.

## Revisões

O botão **Ajustar esta imagem** no CRM envia a imagem gerada anterior como
`reference_image_url`. O n8n deve gerar uma nova imagem a partir dela, mantendo
o que já está correto e aplicando somente o `revision_prompt`.

