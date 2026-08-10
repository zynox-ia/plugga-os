import { FormatoNaoSuportadoError, type DocumentoNormalizado } from "./documento.js";
import { lerPorRegras } from "./leitura.js";
import {
  PdfIlegivelError,
  SenhaIncorretaError,
  SenhaNecessariaError,
  type Fragmento,
  type PaginaDoDocumento,
} from "./paginas.js";

/**
 * Congelar uma fatura: transformar um arquivo em evidência que não muda.
 *
 * O leitor tinha **um** caso de regressão contra documento real — a Roraima
 * Energia —, e ele existe porque alguém copiou a geometria da página à mão.
 * Enquanto congelar um caso for artesanato, o corpus não cresce, e medir
 * mudança de comportamento contra fatura de verdade continua sendo promessa.
 *
 * Este módulo é a parte que não faz E/S: recebe o `DocumentoNormalizado` que
 * `normalizar` já devolve pronto e produz os dois arquivos que viram fixture —
 * o JSON da página e o esqueleto de spec. A E/S, o parse dos argumentos e as
 * mensagens de erro ficam em `scripts/congelar-fatura.ts`, que é a casca.
 *
 * Três compromissos governam tudo o que está aqui:
 *
 * 1. **Determinismo.** Rodar duas vezes sobre o mesmo arquivo produz bytes
 *    idênticos. Sem data, sem caminho de máquina, chaves sempre na mesma ordem.
 *    Fixture que muda sozinha vira ruído de diff e mata o valor do teste.
 * 2. **Anonimização explícita.** Nada é trocado sem `--anonimizar`, e o que foi
 *    trocado é dito no cabeçalho do spec. Mexer na evidência em silêncio é pior
 *    do que não anonimizar.
 * 3. **A aritmética é intocável.** Quantidade, tarifa, valor e total nunca são
 *    substituídos — são eles que provam que a leitura acertou. Por isso a
 *    anonimização só reconhece formas que dinheiro não tem: barra de CNPJ,
 *    hífen de CEP, parênteses de telefone, arroba de e-mail.
 */

/* ------------------------------------------------------------------ *
 * Serialização determinística
 * ------------------------------------------------------------------ */

/**
 * Indentação de um espaço, como no arquivo da Roraima feito à mão.
 *
 * A fixture tem dezenas de milhares de linhas de fragmento; cada nível de
 * indentação a mais é peso morto no diff. O formato aqui é o mesmo do arquivo
 * manual de propósito — `congelar.spec.ts` prova a igualdade byte a byte.
 */
const INDENTACAO = 1;

/** Reescreve o fragmento com as chaves em ordem fixa. */
function fragmentoEstavel(fragmento: Fragmento): Fragmento {
  return {
    texto: fragmento.texto,
    x: fragmento.x,
    y: fragmento.y,
    largura: fragmento.largura,
    altura: fragmento.altura,
  };
}

/** Reescreve a página com as chaves em ordem fixa. */
function paginaEstavel(pagina: PaginaDoDocumento): PaginaDoDocumento {
  return {
    numero: pagina.numero,
    largura: pagina.largura,
    altura: pagina.altura,
    fragmentos: pagina.fragmentos.map(fragmentoEstavel),
  };
}

/**
 * O documento normalizado como texto JSON estável.
 *
 * A ordem das chaves é escrita à mão, não herdada do objeto: duas execuções da
 * mesma versão do leitor produzem a mesma ordem por acaso, mas uma refatoração
 * em `paginas.ts` mudaria todas as fixtures de uma vez sem que nada de fato
 * tivesse mudado na fatura.
 *
 * Os números saem como o JavaScript os imprime — `825.0853269999999` e não um
 * arredondamento simpático. É a coordenada que o pdf.js calculou; arredondar
 * aqui faria a fixture divergir do que a leitura de verdade recebe.
 */
export function serializarDocumento(documento: DocumentoNormalizado): string {
  const estavel = {
    origem: documento.origem,
    confianca: documento.confianca ?? null,
    totalDePaginas: documento.totalDePaginas,
    paginas: documento.paginas.map(paginaEstavel),
  };

  return `${JSON.stringify(estavel, null, INDENTACAO)}\n`;
}

/* ------------------------------------------------------------------ *
 * Recusas que a pessoa entende
 * ------------------------------------------------------------------ */

/**
 * A frase a dizer quando o arquivo não abre — ou `null`, se o erro não é um dos
 * previstos e deve subir inteiro.
 *
 * PDF com senha não é falha do arquivo nem do programa: é uma pergunta que
 * faltou fazer. Responder a ela com um stack trace manda a pessoa depurar
 * `pdfjs-dist` quando tudo o que ela precisava era acrescentar `--senha`. Vive
 * aqui, e não na casca, porque aqui pode ser testado — a casca não abre
 * arquivo protegido em teste.
 */
export function recusaLegivel(erro: unknown): string | null {
  if (erro instanceof SenhaNecessariaError) {
    return "este PDF está protegido por senha: repita o comando com --senha <senha>.";
  }
  if (erro instanceof SenhaIncorretaError) {
    return "a senha informada não abre este PDF.";
  }
  if (erro instanceof FormatoNaoSuportadoError) {
    return `não sei ler este arquivo: parece ser ${erro.message}.`;
  }
  if (erro instanceof PdfIlegivelError) {
    return "o arquivo diz ser PDF, mas está corrompido ou truncado.";
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Anonimização
 * ------------------------------------------------------------------ */

export type ClasseTrocada =
  | "CNPJ"
  | "CPF"
  | "CEP"
  | "telefone"
  | "e-mail"
  | "linha digitável / código de barras"
  | "texto informado em --ocultar";

export type TrocaRegistrada = {
  classe: ClasseTrocada;
  /** Quantos fragmentos da página foram alterados por esta classe. */
  fragmentos: number;
};

/**
 * O que a anonimização reconhece, e por que cada padrão é seguro.
 *
 * Todos exigem um caractere que valor em dinheiro não tem naquela posição: a
 * barra do CNPJ, o hífen no meio dos dígitos do CEP e do CPF, os parênteses do
 * telefone, a arroba do e-mail. Nenhum deles casa `2.689175`, `17.419` ou
 * `174.636,70` — e `congelar.spec.ts` prova isso rodando a leitura antes e
 * depois da troca e exigindo ficha idêntica.
 *
 * A substituição preserva o comprimento do texto. A geometria não depende dele
 * (x e largura ficam como estavam), mas um texto do mesmo tamanho mantém a
 * fixture legível ao lado da original, que é o ponto de ela existir.
 */
const PADROES: readonly { classe: ClasseTrocada; padrao: RegExp }[] = [
  { classe: "CNPJ", padrao: /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g },
  { classe: "CPF", padrao: /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g },
  { classe: "CEP", padrao: /(?<!\d)\d{2}\.?\d{3}-\d{3}(?!\d)/g },
  { classe: "telefone", padrao: /\(\d{2}\)\s?\d{4,5}-\d{4}/g },
  { classe: "e-mail", padrao: /[\w.+-]+@[\w-]+\.[\w.-]*\w/g },
];

/**
 * Linha digitável e código de barras: só dígitos, espaço e ponto, e longa.
 *
 * O corte em quarenta dígitos é folgado — a linha digitável do setor elétrico
 * tem quarenta e oito. Nenhum campo de fatura que a leitura usa chega perto
 * disso: a maior quantidade desta base tem seis dígitos.
 */
const CODIGO_DE_BARRAS = /^[\d\s.]{40,}$/;
const DIGITOS_MINIMOS_DO_CODIGO = 40;

/** Zera os dígitos e preserva a pontuação, para a forma continuar reconhecível. */
function zerar(texto: string): string {
  return texto.replace(/\d/g, "0");
}

/** Troca letra e dígito por `x`, preservando `@`, `.` e `-`. */
function mascarar(texto: string): string {
  return texto.replace(/[^\s@.-]/g, "x");
}

function escaparParaRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type OpcoesDeAnonimizacao = {
  /**
   * Textos literais a ocultar, trocados por `X` do mesmo comprimento.
   *
   * Existe porque titular e endereço não têm forma própria: "MERCANTIL NOVA ERA
   * LTDA" e "AV. CAPITAO ENE GARCEZ 691" são indistinguíveis de "GRUPO A A4
   * COMERCIAL" por qualquer regra automática que eu saiba escrever, e uma regra
   * que errasse apagaria o rótulo de um item. Quem congela a fatura está com
   * ela aberta na tela e sabe o nome; o programa não sabe.
   */
  ocultar?: readonly string[];
};

export type ResultadoDaAnonimizacao = {
  documento: DocumentoNormalizado;
  trocas: TrocaRegistrada[];
};

/**
 * Troca o que identifica o titular, e nada mais.
 *
 * O que **não** é trocado, de propósito: inscrição estadual, número do medidor
 * e o próprio código da unidade consumidora. São corridas de dígitos sem forma
 * própria — não há como separá-las de uma quantidade sem olhar o rótulo ao
 * lado, e a unidade consumidora é justamente o que o spec gerado afirma. Trocar
 * na dúvida seria destruir a evidência para proteger um dado que a fatura
 * publica no cabeçalho de qualquer jeito.
 */
export function anonimizarDocumento(
  documento: DocumentoNormalizado,
  opcoes: OpcoesDeAnonimizacao = {},
): ResultadoDaAnonimizacao {
  const contagem = new Map<ClasseTrocada, number>();
  const literais = (opcoes.ocultar ?? []).filter((texto) => texto.trim().length > 0);

  const anotar = (classe: ClasseTrocada): void => {
    contagem.set(classe, (contagem.get(classe) ?? 0) + 1);
  };

  const trocarTexto = (original: string): string => {
    let texto = original;

    for (const { classe, padrao } of PADROES) {
      // `replace` com regex global é reentrante e ignora `lastIndex`; a mesma
      // instância pode ser reutilizada entre fragmentos sem estado pendurado.
      const trocado = texto.replace(padrao, (achado) =>
        classe === "e-mail" ? mascarar(achado) : zerar(achado),
      );
      if (trocado !== texto) anotar(classe);
      texto = trocado;
    }

    if (
      CODIGO_DE_BARRAS.test(texto) &&
      (texto.match(/\d/g)?.length ?? 0) >= DIGITOS_MINIMOS_DO_CODIGO
    ) {
      anotar("linha digitável / código de barras");
      texto = zerar(texto);
    }

    for (const literal of literais) {
      const padrao = new RegExp(escaparParaRegex(literal), "gi");
      const trocado = texto.replace(padrao, (achado) => "X".repeat(achado.length));
      if (trocado !== texto) anotar("texto informado em --ocultar");
      texto = trocado;
    }

    return texto;
  };

  const paginas = documento.paginas.map((pagina) => ({
    ...pagina,
    fragmentos: pagina.fragmentos.map((fragmento) => ({
      ...fragmento,
      texto: trocarTexto(fragmento.texto),
    })),
  }));

  // A ordem do relatório segue a ordem dos padrões, não a de descoberta: o
  // cabeçalho gerado tem de ser igual entre execuções.
  const ordem: ClasseTrocada[] = [
    ...PADROES.map(({ classe }) => classe),
    "linha digitável / código de barras",
    "texto informado em --ocultar",
  ];

  const trocas = ordem
    .filter((classe) => contagem.has(classe))
    .map((classe) => ({ classe, fragmentos: contagem.get(classe) ?? 0 }));

  return { documento: { ...documento, paginas }, trocas };
}

/* ------------------------------------------------------------------ *
 * Esqueleto de spec
 * ------------------------------------------------------------------ */

/** `174636.7` → `174_636.7`, como o resto do repositório escreve. */
function literal(valor: number): string {
  const texto = String(valor);
  const [inteiro = "", decimal] = texto.split(".");
  const sinal = inteiro.startsWith("-") ? "-" : "";
  const digitos = sinal ? inteiro.slice(1) : inteiro;
  const agrupado = digitos.length > 3 ? digitos.replace(/\B(?=(\d{3})+(?!\d))/g, "_") : digitos;
  return `${sinal}${agrupado}${decimal === undefined ? "" : `.${decimal}`}`;
}

/** Texto como literal de string TypeScript, com as aspas e os escapes certos. */
function citar(texto: string): string {
  return JSON.stringify(texto);
}

/** Meio centavo, a mesma folga que `conferencia.ts` usa para conciliar. */
const TOLERANCIA_DO_TOTAL = 0.005;

export type DadosDoSpec = {
  slug: string;
  documento: DocumentoNormalizado;
  /** Vazio quando a fatura foi congelada sem `--anonimizar`. */
  trocas: readonly TrocaRegistrada[];
  anonimizado: boolean;
};

function tituloDoCaso(documento: DocumentoNormalizado, slug: string): string {
  const { identificacao } = lerPorRegras(documento);
  const partes = [identificacao.distribuidora ?? slug];

  if (identificacao.unidadeConsumidora) partes.push(`UC ${identificacao.unidadeConsumidora}`);
  if (identificacao.competencia) {
    const { mes, ano } = identificacao.competencia;
    partes.push(`${String(mes).padStart(2, "0")}/${ano}`);
  }

  return partes.join(" — ");
}

function relatorioDeAnonimizacao(dados: DadosDoSpec): string[] {
  if (!dados.anonimizado) {
    return [
      " * **Sem anonimização.** O texto desta fixture é o impresso na fatura,",
      " * incluindo titular, documento e endereço. Congelada sem `--anonimizar`.",
    ];
  }

  const trocadas = dados.trocas.length
    ? dados.trocas
        .map((troca) => `${troca.classe} (${troca.fragmentos})`)
        .join(", ")
    : "nada casou os padrões";

  return [
    ` * **Anonimizada** com \`--anonimizar\`. Trocado: ${trocadas}.`,
    " *",
    " * Nenhum número que a aritmética confere — quantidade, tarifa, valor e",
    " * total — foi tocado; é neles que a prova de leitura se apoia. Inscrição",
    " * estadual, medidor e o código da unidade **não** são trocados: são",
    " * corridas de dígitos sem forma própria, e a unidade consumidora é o que",
    " * este spec afirma.",
  ];
}

/**
 * O aviso que o cabeçalho dá quando o caso congelado **não** é um caso bom.
 *
 * Fixture de fatura que a leitura não fechou continua valendo — é o registro do
 * buraco, e é assim que o próximo layout entra no corpus. O que não pode é
 * parecer aprovada: um spec verde afirmando quatro campos, sobre uma fatura de
 * quinze, passa por regressão sadia e some do radar.
 */
function ressalvas(
  leitura: ReturnType<typeof lerPorRegras>,
  somaDosCobrados: number,
): string[] {
  const avisos: string[] = [];

  if (!leitura.aproveitavel) {
    avisos.push(
      ` * A leitura **não fechou a ficha** (\`${leitura.motivo}\`). Este caso está`,
      " * congelado como registro do que falta, não como regressão aprovada.",
    );
  }

  if (leitura.conferencia.divergentes > 0) {
    avisos.push(
      ` * ${leitura.conferencia.divergentes} item não fechou na multiplicação e ficou fora da ficha.`,
      " * É onde o reconhecimento óptico e a digitação erram; confira na folha.",
    );
  }

  const total = leitura.invoice.valorTotal;
  if (total !== undefined && Math.abs(somaDosCobrados - total) >= TOLERANCIA_DO_TOTAL) {
    avisos.push(
      ` * A soma dos itens lidos (${somaDosCobrados.toFixed(2)}) não alcança o total`,
      ` * impresso (${total.toFixed(2)}): falta item nesta leitura.`,
    );
  }

  return avisos.length ? [...avisos, " *"] : [];
}

/**
 * O esqueleto de spec, com os valores observados já preenchidos.
 *
 * "Observado" é a palavra exata: o gerador escreve o que a leitura **devolveu**,
 * não o que a fatura **diz**. Se a leitura errou, o spec nasce congelando o
 * erro — por isso o cabeçalho manda conferir contra a folha impressa antes de
 * tratar o arquivo como regressão. O que o gerador não sabe escrever, e pede
 * que a pessoa escreva, é o que aquele layout tem de difícil; é isso que faz
 * `roraima.spec.ts` valer mais do que a soma das suas asserções.
 */
export function gerarSpec(dados: DadosDoSpec): string {
  const { slug, documento } = dados;
  const leitura = lerPorRegras(documento);
  const { identificacao, invoice, conferencia } = leitura;

  const informativos = leitura.itens.filter((item) => !item.compoeTotal);
  const usaMotivoInformativo = informativos.length > 0;

  const somaDosCobrados = Number(
    leitura.itens
      .filter((item) => item.compoeTotal)
      .reduce((total, item) => total + item.valor, 0)
      .toFixed(2),
  );

  const linhas: string[] = [];
  const bloco = (...conteudo: string[]): void => {
    linhas.push(...conteudo);
  };

  bloco(
    `import { describe, expect, it } from "vitest";`,
    "",
    `import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";`,
  );
  if (usaMotivoInformativo) bloco(`import { MOTIVO_INFORMATIVO } from "./informativos.js";`);
  bloco(`import { lerPorRegras, type LeituraDaFatura } from "./leitura.js";`, "");

  bloco(
    "/**",
    ` * ${tituloDoCaso(documento, slug)}.`,
    " *",
    " * Fixture gerada por `pnpm --filter @plugga/api fatura:congelar`. O caso vive",
    " * aqui como a geometria da página, não como PDF: os fragmentos com posição são",
    " * o que a leitura consome, e congelá-los torna o teste determinístico sem",
    " * depender do arquivo original.",
    " *",
    " * **A fixture não está no git.** Ela é fatura de cliente, com o dado inteiro,",
    " * e git é container permanente, replicado em todo clone e sem revogação — o",
    " * JSON mora no balde do corpus no MinIO e chega por `corpus:baixar`. Sem a",
    " * chave, este arquivo inteiro é pulado com a mensagem que explica o porquê.",
    " *",
    " * Os números abaixo são os **observados** na hora de congelar, não valores",
    " * conferidos contra a folha impressa. Confira-os antes de tratar este arquivo",
    " * como regressão: um erro de leitura congelado vira erro de leitura protegido",
    " * por teste.",
    " *",
    ...ressalvas(leitura, somaDosCobrados),
    " * TODO: escreva aqui o que este layout tem de difícil — foi por isso que ele",
    " * entrou no corpus, e é o que o próximo leitor precisa saber.",
    " *",
    ...relatorioDeAnonimizacao(dados),
    " */",
    `const NOME = "${slug}.pagina.json";`,
    "const DOCUMENTO = fixtureDoCorpus(NOME);",
    "",
    "if (!DOCUMENTO) console.warn(avisoDeCorpusAusente(NOME));",
    "",
    "/**",
    " * A leitura, feita no primeiro caso que a pedir — nunca na coleta.",
    " *",
    " * O vitest executa o corpo de um `describe.skipIf` mesmo quando vai pular os",
    " * casos. Derivar qualquer coisa da fixture ali dentro quebraria o arquivo",
    " * inteiro em quem não baixou o corpus, que é exatamente o que o pulo existe",
    " * para evitar.",
    " */",
    "let lida: LeituraDaFatura | null = null;",
    "function leitura(): LeituraDaFatura {",
    "  if (!DOCUMENTO) throw new Error(`${NOME} não está no corpus local`);",
    "  return (lida ??= lerPorRegras(DOCUMENTO));",
    "}",
    "",
    `describe.skipIf(!DOCUMENTO)(${citar(tituloDoCaso(documento, slug))}, () => {`,
  );

  const testes: string[][] = [];

  testes.push([
    leitura.aproveitavel
      ? `  it("chega em ficha aproveitável sozinha, sem plano B", () => {`
      : `  it("não fecha a ficha sozinha, e diz pelo nome o que faltou", () => {`,
    `    expect(leitura().origem).toBe(${citar(documento.origem)});`,
    `    expect(leitura().aproveitavel).toBe(${String(leitura.aproveitavel)});`,
    leitura.motivo === null
      ? `    expect(leitura().motivo).toBeNull();`
      : `    expect(leitura().motivo).toBe(${citar(leitura.motivo)});`,
    `  });`,
  ]);

  const identidade = [
    identificacao.distribuidora === null
      ? `    expect(leitura().identificacao.distribuidora).toBeNull();`
      : `    expect(leitura().identificacao.distribuidora).toBe(${citar(identificacao.distribuidora)});`,
    identificacao.unidadeConsumidora === null
      ? `    expect(leitura().identificacao.unidadeConsumidora).toBeNull();`
      : `    expect(leitura().identificacao.unidadeConsumidora).toBe(${citar(identificacao.unidadeConsumidora)});`,
    identificacao.competencia === null
      ? `    expect(leitura().identificacao.competencia).toBeNull();`
      : `    expect(leitura().identificacao.competencia).toEqual({ mes: ${identificacao.competencia.mes}, ano: ${identificacao.competencia.ano} });`,
  ];
  testes.push([
    `  it("identifica distribuidora, unidade consumidora e competência", () => {`,
    ...identidade,
    `  });`,
  ]);

  const consumo = campos(invoice, [
    "consumoPontaKwh",
    "tarifaPonta",
    "valorPonta",
    "consumoForaPontaKwh",
    "tarifaForaPonta",
    "valorForaPonta",
  ]);
  if (consumo.length) {
    testes.push([
      `  it("lê consumo, tarifa e valor em ponta e fora ponta", () => {`,
      ...consumo,
      `  });`,
    ]);
  }

  const demanda = campos(invoice, [
    "demandaContratadaKw",
    "demandaMedidaPontaKw",
    "demandaMedidaForaPontaKw",
    "tarifaDemanda",
    "valorDemanda",
  ]);
  if (demanda.length) {
    testes.push([
      `  it("lê a demanda contratada e a registrada", () => {`,
      ...demanda,
      `  });`,
    ]);
  }

  if (leitura.demandaComplementoValor !== null) {
    testes.push([
      `  it("lê da própria fatura a parcela de demanda sem ICMS", () => {`,
      `    // A linha explícita manda: quem calcula economia de readequação usa este`,
      `    // número quando ele existe, e só cai no rateio quando não existe.`,
      `    expect(leitura().demandaComplementoValor).toBe(${literal(leitura.demandaComplementoValor)});`,
      `  });`,
    ]);
  }

  const itensEsperados = leitura.itens.map((item) => {
    const partes = [
      `rotulo: ${citar(item.rotulo)}`,
      `quantidade: ${item.quantidade === null ? "null" : literal(item.quantidade)}`,
      `unidade: ${item.unidade === null ? "null" : citar(item.unidade)}`,
      `tarifa: ${item.tarifa === null ? "null" : literal(item.tarifa)}`,
      `valor: ${literal(item.valor)}`,
    ];
    return `    { ${partes.join(", ")} },`;
  });

  // Fatura da qual a leitura não tirou item nenhum é caso legítimo de corpus —
  // é o registro do layout que ainda não entra. O que ela não pode gerar é a
  // lista vazia do caso normal: `const esperados = []` sem elemento nenhum não
  // tem tipo que o TypeScript deduza, e o spec nasceria sem compilar. Ficaram
  // dois formatos, e o de zero item diz o que de fato aconteceu.
  testes.push(
    leitura.itens.length === 0
      ? [
          `  it("não reconheceu nenhum item financeiro nesta fatura", () => {`,
          `    // É isto que o caso registra. Quando o leitor aprender este layout,`,
          `    // este teste fica vermelho — e é assim que se percebe que melhorou.`,
          `    expect(leitura().itens).toEqual([]);`,
          `  });`,
        ]
      : [
          `  it("lê a tabela de itens com quantidade, unidade, tarifa e valor", () => {`,
          `    const esperados = [`,
          ...itensEsperados.map((linha) => `  ${linha}`),
          `    ];`,
          ``,
          `    expect(leitura().itens).toHaveLength(${leitura.itens.length});`,
          `    for (const esperado of esperados) {`,
          `      const achado = leitura().itens.find((item) => item.rotulo === esperado.rotulo);`,
          `      expect(achado, \`item ausente: \${esperado.rotulo}\`).toMatchObject(esperado);`,
          `    }`,
          `  });`,
        ],
  );

  testes.push([
    conferencia.divergentes === 0
      ? `  it("a aritmética de cada item fecha", () => {`
      : `  it("a aritmética acusa item que não fecha, e é isso que este caso registra", () => {`,
    `    expect(leitura().conferencia.confirmados).toBe(${conferencia.confirmados});`,
    `    expect(leitura().conferencia.divergentes).toBe(${conferencia.divergentes});`,
    `    expect(leitura().conferencia.temDivergencia).toBe(${String(conferencia.temDivergencia)});`,
    `  });`,
  ]);

  if (invoice.valorTotal !== undefined) {
    // A soma é a **observada**, não o total impresso. Quando as duas coincidem
    // é a mesma coisa; quando não, escrever o total aqui geraria um spec que
    // nasce vermelho — e "conserte o gerador" é a lição errada. O caso em que
    // elas divergem é evidência de leitura incompleta, e o comentário diz isso.
    const fecha = Math.abs(somaDosCobrados - invoice.valorTotal) < TOLERANCIA_DO_TOTAL;

    testes.push([
      fecha
        ? `  it("a soma dos itens que compõem o total fecha com o total impresso", () => {`
        : `  it("a soma dos itens lidos não alcança o total impresso — leitura incompleta", () => {`,
      ...(fecha
        ? []
        : [
            `    // A leitura não reconstruiu o total: falta item, ou algum caiu por`,
            `    // divergência aritmética. O número abaixo é o **observado**, congelado`,
            `    // como evidência do buraco. Não o ajuste para fechar — quem fecha é a`,
            `    // leitura, quando melhorar.`,
          ]),
      `    expect(leitura().invoice.valorTotal).toBe(${literal(invoice.valorTotal)});`,
      ``,
      `    const soma = leitura().itens`,
      `      .filter((item) => item.compoeTotal)`,
      `      .reduce((total, item) => total + item.valor, 0);`,
      `    expect(Number(soma.toFixed(2))).toBe(${literal(somaDosCobrados)});`,
      `  });`,
    ]);
  }

  if (usaMotivoInformativo) {
    testes.push([
      `  it("marca como informativo, sem remover da lista, o que estouraria o total", () => {`,
      `    const informativos = leitura().itens.filter((item) => !item.compoeTotal);`,
      ``,
      `    expect(informativos.map((item) => item.rotulo)).toEqual([`,
      ...informativos.map((item) => `      ${citar(item.rotulo)},`),
      `    ]);`,
      `    for (const item of informativos) {`,
      `      expect(item.motivoForaDoTotal).toBe(MOTIVO_INFORMATIVO);`,
      `    }`,
      `    // O item continua na lista com o valor impresso — nunca é apagado.`,
      ...informativos.map(
        (item) =>
          `    expect(informativos.find((item) => item.rotulo === ${citar(item.rotulo)})?.valor).toBe(${literal(item.valor)});`,
      ),
      `  });`,
    ]);
  }

  testes.push([
    `  it("declara exatamente o que ainda depende de conferência humana", () => {`,
    leitura.camposParaConfirmar.length === 0
      ? `    expect(leitura().camposParaConfirmar).toEqual([]);`
      : [
          `    expect(leitura().camposParaConfirmar).toEqual([`,
          ...leitura.camposParaConfirmar.map((campo) => `      ${citar(campo)},`),
          `    ]);`,
        ].join("\n"),
    `  });`,
  ]);

  bloco(testes.map((teste) => teste.join("\n")).join("\n\n"), "});", "");

  return linhas.join("\n");
}

/**
 * Emite uma asserção por campo presente na ficha, e **ignora os ausentes**.
 *
 * Campo que a fatura não publica sai nulo de propósito — é o contrato de
 * honestidade da leitura, e já é dito em `camposParaConfirmar`. Afirmar aqui
 * `toBeUndefined()` congelaria a ausência como se fosse resultado desejado, e
 * o dia em que a leitura passasse a achar o campo o teste ficaria vermelho por
 * ter melhorado.
 */
function campos(invoice: Record<string, unknown>, chaves: readonly string[]): string[] {
  return chaves.flatMap((chave) => {
    const valor = invoice[chave];
    if (typeof valor !== "number") return [];
    return [`    expect(leitura().invoice.${chave}).toBe(${literal(valor)});`];
  });
}
