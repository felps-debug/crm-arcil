import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";

/**
 * Compõe a camada técnica sobre a cena gerada pelo modelo de imagem.
 *
 * Por que existir: pedir título, cotas, passo a passo e cards a um modelo de
 * imagem é pedir justamente a coisa que ele menos sabe fazer. Já saiu "2,80m"
 * onde o vendedor respondeu 2,70 — e texto embolado antes disso, que foi o
 * motivo do LABEL VOCABULARY existir no prompt. Aqui o modelo desenha só a cena
 * (ambiente + aparelho instalado) e o texto vem vetorial, sempre nítido e sempre
 * com o número que está no banco.
 *
 * O desenho é full-bleed sobre a foto, com um véu escuro em cima e embaixo para
 * garantir leitura sem esconder o ambiente — o miolo da cena, que é o que o
 * cliente quer ver, fica limpo.
 */

// satori converte o texto em contorno usando a fonte que recebe, então nada
// depende de fonte instalada no servidor. Isso importa aqui: o `watermarkImage`
// deste projeto já falhou renderizando <text> em SVG porque o runtime da Vercel
// não tem fonte para o librsvg desenhar, e a saída vinha em branco.
const FONT_DIR = path.join(process.cwd(), "public", "fonts");
type Fonte = { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" };
let fontesCache: Fonte[] | null = null;

function fontes(): Fonte[] {
  if (!fontesCache) {
    fontesCache = [
      { name: "Montserrat", data: fs.readFileSync(path.join(FONT_DIR, "Montserrat-Regular.ttf")), weight: 400, style: "normal" },
      { name: "Montserrat", data: fs.readFileSync(path.join(FONT_DIR, "Montserrat-SemiBold.ttf")), weight: 600, style: "normal" },
      { name: "Montserrat", data: fs.readFileSync(path.join(FONT_DIR, "Montserrat-Bold.ttf")), weight: 700, style: "normal" },
    ];
  }
  return fontesCache;
}

const AZUL = "#4EA1FF";
const CLARO = "#F2F6FC";
const CINZA = "#A9B8CE";
const BORDA = "rgba(255,255,255,0.22)";

export type DadosOverlay = {
  produto: string;
  marca: string | null;
  sku: string | null;
  tipoEquipamento: string;
  peDireito: string | null;
  alturaInstalacao: string;
  distanciaTeto: string;
  espacamentoLateral: string;
  tubulacao: string | null;
  pontoEletrico: boolean | null;
  produtoImagemBase64: string | null;
};

/** Nó no formato que o satori espera, sem precisar de JSX num arquivo .ts.
 *
 *  `display: flex` entra por padrão porque o satori recusa qualquer div com mais
 *  de um filho que não declare display — e ele só implementa flexbox mesmo, então
 *  declarar em cada nó seria repetição pura. */
type No = { type: string; props: Record<string, unknown> };
type Filho = No | string | null | false;
const el = (type: string, style: Record<string, unknown>, ...children: Filho[]): No => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.filter(Boolean) },
});

const img = (src: string, style: Record<string, unknown>): No => ({
  type: "img",
  props: { src, style: { ...style } },
});

const PASSOS_PADRAO = [
  "Marcar e nivelar o suporte na parede",
  "Furar com leve caimento para fora",
  "Passar tubulação de cobre, dreno e cabo",
  "Fixar a unidade interna e conferir encaixe",
  "Testar drenagem, vedação e funcionamento",
];

// A sequência de passos do hi-wall ("furar a parede", "suporte na parede") é
// fisicamente errada para os outros formatos — cassete e dutado vão no forro,
// janela não tem suporte de parede nenhum. Isso não é estilo, é o passo a
// passo mostrando a obra errada para quem vai instalar.
const PASSOS_POR_TIPO: Record<string, string[]> = {
  cassete: [
    "Marcar e nivelar o gabinete no forro",
    "Abrir o vão e fixar os tirantes na laje",
    "Passar tubulação de cobre, dreno (com bomba, se necessário) e cabo",
    "Encaixar o gabinete e o painel decorativo",
    "Testar drenagem, vedação e funcionamento",
  ],
  "piso-teto": [
    "Marcar e nivelar o suporte no piso ou no teto",
    "Fixar os suportes na superfície escolhida",
    "Passar tubulação de cobre, dreno e cabo",
    "Fixar a unidade interna e conferir encaixe",
    "Testar drenagem, vedação e funcionamento",
  ],
  dutado: [
    "Fixar a unidade no espaço técnico com amortecedores",
    "Montar a rede de dutos, retorno e grelhas",
    "Passar tubulação de cobre, dreno e cabo",
    "Isolar termicamente dutos e conexões",
    "Testar drenagem, vedação e funcionamento",
  ],
  janela: [
    "Conferir e preparar o vão da janela ou parede",
    "Instalar o suporte e a base de sustentação",
    "Encaixar a unidade e vedar as laterais",
    "Ligar ao ponto elétrico exclusivo",
    "Testar vedação e funcionamento",
  ],
};

function passosPara(tipoEquipamento: string): string[] {
  return PASSOS_POR_TIPO[tipoEquipamento.trim().toLowerCase()] ?? PASSOS_PADRAO;
}

function spec(rotulo: string, valor: string): No {
  return el("div", { flexDirection: "column", marginBottom: 5 },
    el("div", { fontSize: 10, color: CINZA }, rotulo),
    el("div", { fontSize: 13, color: CLARO, fontWeight: 600, marginTop: 1 }, valor)
  );
}

function cartao(titulo: string, corpo: No, flex = 1): No {
  return el("div", {
    flexDirection: "column", flex, padding: "10px 12px", borderRadius: 10,
    border: "1px solid " + BORDA, background: "rgba(6,12,22,0.55)",
  },
    el("div", { fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: AZUL, marginBottom: 6 }, titulo),
    corpo
  );
}

function topo(d: DadosOverlay): No {
  return el("div", { flexDirection: "column", padding: "18px 30px 0" },
    el("div", { fontSize: 28, fontWeight: 700, color: "#ffffff", lineHeight: 1.05 }, "PRÉVIA TÉCNICA DE INSTALAÇÃO"),
    el("div", { fontSize: 15, marginTop: 5, color: CINZA },
      el("span", { color: AZUL, fontWeight: 700 }, d.produto),
      d.sku ? el("span", { marginLeft: 8 }, "· " + d.sku) : null
    ),
    el("div", { width: 150, height: 2, background: AZUL, marginTop: 9, marginBottom: 8 }),
    el("div", { alignItems: "center" },
      // Marcador desenhado, não caractere: "✓" (U+2713) não existe na Montserrat
      // e saía como quadradinho de glifo ausente. Um disco resolve sem depender
      // da cobertura da fonte.
      el("div", { width: 7, height: 7, borderRadius: 4, background: AZUL, marginRight: 9 }),
      el("div", { fontSize: 12, color: CLARO },
        "Posicionamento conforme manual preserva a garantia de fábrica.")
    )
  );
}

/** Rótulo e presença dos cards mudam por tipo: "distância do teto" não
 *  significa nada para um cassete que já mora no teto, e janela não tem
 *  tubulação frigorígena exposta pra mostrar. Os valores continuam vindo do
 *  que o vendedor respondeu — só o rótulo e o que aparece mudam aqui. */
function especificacoes(d: DadosOverlay): No[] {
  const t = d.tipoEquipamento.trim().toLowerCase();
  const specs: No[] = [];

  if (t === "cassete") {
    specs.push(spec("Espaço no forro (plenum)", d.distanciaTeto));
    specs.push(spec("Distância das paredes", d.espacamentoLateral));
  } else if (t === "dutado") {
    specs.push(spec("Espaço técnico (plenum)", d.distanciaTeto));
    specs.push(spec("Afastamento da rede de dutos", d.espacamentoLateral));
  } else if (t === "janela") {
    // Unidade única no vão: nenhuma das três cotas genéricas (teto,
    // espaçamento, altura) descreve essa instalação.
  } else {
    // split hi-wall, piso-teto e qualquer tipo não mapeado
    specs.push(spec("Distância do teto", d.distanciaTeto));
    specs.push(spec("Espaçamento lateral", d.espacamentoLateral));
    specs.push(spec("Altura de instalação", d.alturaInstalacao));
  }

  if (d.peDireito) {
    const rotuloPeDireito = t === "cassete" || t === "dutado" ? "Altura laje-forro" : t === "janela" ? "Medidas do vão" : "Pé-direito";
    specs.push(spec(rotuloPeDireito, d.peDireito));
  }
  if (d.tubulacao) specs.push(spec("Tubulação", d.tubulacao));
  if (d.pontoEletrico != null) specs.push(spec("Ponto elétrico", d.pontoEletrico ? "já existe" : "a executar"));

  return specs;
}

function base(d: DadosOverlay): No {
  const specs = especificacoes(d);

  const passos = passosPara(d.tipoEquipamento).map((p, i) =>
    el("div", { alignItems: "center", marginBottom: 6 },
      el("div", {
        alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 10,
        border: "1.5px solid " + AZUL, color: AZUL, fontSize: 11, fontWeight: 700, marginRight: 9,
      }, String(i + 1)),
      el("div", { fontSize: 12, color: CLARO, flex: 1 }, p)
    )
  );

  const equipamento = el("div", { flexDirection: "column", alignItems: "center" },
    d.produtoImagemBase64
      ? img(d.produtoImagemBase64, { width: 96, height: 70, objectFit: "contain" })
      : el("div", {
          alignItems: "center", justifyContent: "center", width: 96, height: 70,
          borderRadius: 8, border: "1px dashed " + CINZA, color: CINZA, fontSize: 10,
        }, "sem foto"),
    el("div", { fontSize: 13, fontWeight: 700, color: CLARO, marginTop: 7 }, d.marca ?? "—"),
    el("div", { fontSize: 10, color: CINZA, marginTop: 1 }, d.tipoEquipamento)
  );

  // Janela é monobloco de fábrica: não tem tubulação de cobre nem vácuo pra
  // testar em campo. Repetir a lista do hi-wall ali seria orientar o instalador
  // a fazer um serviço que aquele aparelho não tem.
  const garantia = d.tipoEquipamento.trim().toLowerCase() === "janela"
    ? el("div", { flexDirection: "column", fontSize: 11, color: CLARO, lineHeight: 1.4 },
        el("div", { marginBottom: 2 }, "· vedação completa do vão, sem frestas"),
        el("div", { marginBottom: 2 }, "· caimento para o dreno de fábrica"),
        el("div", {}, "· ponto elétrico exclusivo e aterrado")
      )
    : el("div", { flexDirection: "column", fontSize: 11, color: CLARO, lineHeight: 1.4 },
        el("div", { marginBottom: 2 }, "· tubulação de cobre isolada"),
        el("div", { marginBottom: 2 }, "· vácuo e teste de estanqueidade"),
        el("div", { marginBottom: 2 }, "· dreno com caimento contínuo"),
        el("div", {}, "· ponto elétrico exclusivo e aterrado")
      );

  return el("div", { flexDirection: "column", padding: "0 30px 16px" },
    el("div", { gap: 12 },
      el("div", { flexDirection: "column", flex: 1.05 },
        el("div", { fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: AZUL, marginBottom: 8 }, "PASSO A PASSO"),
        ...passos
      ),
      cartao("ESPECIFICAÇÕES", el("div", { flexDirection: "column" }, ...specs), 0.85),
      cartao("EQUIPAMENTO", equipamento, 0.7),
      cartao("GARANTIA DE FÁBRICA", garantia, 0.95)
    ),
    el("div", { marginTop: 8, fontSize: 10, color: CINZA, lineHeight: 1.3 },
      "Prévia para visualização. A instalação final deve ser validada no local por profissional habilitado, conforme o manual do fabricante e a ABNT NBR 16401.")
  );
}

/** Véu escuro só nas faixas de texto: um gradiente do topo e outro da base,
 *  deixando o miolo da cena — que é o que o cliente quer ver — sem filtro.
 *  Cards e título encolheram (pedido do Luke: "tampou muito o ambiente"), e
 *  as paradas do gradiente encolheram junto — senão o véu ficaria sobrando
 *  em cima de texto que não está mais lá, sem abrir mais janela nenhuma. */
function camada(d: DadosOverlay, largura: number, altura: number): No {
  return el("div", {
    width: largura, height: altura, flexDirection: "column", justifyContent: "space-between",
    backgroundImage:
      "linear-gradient(to bottom, rgba(4,9,18,0.86) 0%, rgba(4,9,18,0.5) 9%, rgba(4,9,18,0) 18%," +
      " rgba(4,9,18,0) 56%, rgba(4,9,18,0.72) 70%, rgba(4,9,18,0.94) 82%)",
    fontFamily: "Montserrat",
  },
    topo(d),
    base(d)
  );
}

/**
 * Devolve a cena com a camada técnica por cima, no mesmo tamanho da original.
 * Quem chama trata a falha — uma cena sem moldura ainda serve, um erro não.
 */
export async function comporPrevia(cena: Buffer, dados: DadosOverlay): Promise<Buffer> {
  const meta = await sharp(cena).metadata();
  const largura = meta.width ?? 1024;
  const altura = meta.height ?? 1024;

  const svg = await satori(camada(dados, largura, altura) as never, { width: largura, height: altura, fonts: fontes() });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return sharp(cena).composite([{ input: png, top: 0, left: 0 }]).jpeg({ quality: 94 }).toBuffer();
}
