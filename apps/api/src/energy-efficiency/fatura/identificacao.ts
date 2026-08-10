/**
 * De quem é a fatura e de que mês.
 *
 * É o que permite soltar quarenta PDFs de uma vez e ver quarenta linhas já
 * preenchidas: sem isso, alguém teria que abrir arquivo por arquivo só para
 * descobrir a unidade consumidora e a competência.
 *
 * A fatura imprime os dois, mas em layout de coluna — o rótulo e o valor caem
 * em linhas separadas. Por isso a busca é por forma do dado, não por
 * proximidade do rótulo: casar "Número da UC" com a linha seguinte quebraria
 * no primeiro layout diferente.
 */

export type IdentificacaoDaFatura = {
  unidadeConsumidora: string | null;
  competencia: { mes: number; ano: number } | null;
  distribuidora: string | null;
};

/** Código de UC: bloco longo de dígitos com dígito verificador. */
const CODIGO_DE_UC = /\b(\d{7,13}-\d{1,2})\b/;

/**
 * Rótulo da unidade consumidora, para as faturas que imprimem o código **sem**
 * dígito verificador separado.
 *
 * A Roraima Energia imprime `Código Único` numa linha e `01939890` na seguinte,
 * sem hífen. Só pela forma, oito dígitos seguidos poderiam ser qualquer coisa —
 * medidor, protocolo, nota. Aqui a proximidade do rótulo é o que dá segurança,
 * então ela é usada, mas **só** quando a forma com hífen não apareceu em lugar
 * nenhum: o caminho principal continua sendo a forma do dado.
 */
const ROTULO_DE_UC = /c[óo]digo\s+[úu]nico|n[º°.]?\s*da\s+uc\b|instala[çc][ãa]o/i;

/** O código no começo de uma das linhas logo abaixo do rótulo. */
const UC_SEM_DIGITO = /^(\d{7,13})\b/;

/**
 * Quantas linhas abaixo do rótulo ainda contam como "logo abaixo".
 *
 * O cabeçalho da Roraima Energia ocupa duas linhas — `Código Único Vencimento`
 * e `Mês Faturado` — e entre ele e a linha de valores caem CEP e CNPJ, que são
 * de outra coluna. Quatro linhas cobrem esse arranjo sem sair do bloco.
 */
const LINHAS_ABAIXO_DO_ROTULO = 4;

/**
 * Competência: MM/AAAA cercado por algo que não seja dígito nem barra.
 *
 * Ancorar na linha inteira, como antes, só funcionava quando o texto chegava em
 * pedaços soltos e a competência calhava de ficar sozinha em um deles. Lendo a
 * folha por posição, ela vem acompanhada dos vizinhos de coluna —
 * `... 0514527-9 12/2025 110984647 05/01/2026` — e o padrão ancorado não casava
 * mais nada.
 *
 * As duas guardas são o que separa competência de data: em `05/01/2026` o
 * trecho `01/2026` vem precedido de barra, e em `14/05/2026` o `05/2026`
 * também. Só a competência aparece sem dia colado.
 */
const COMPETENCIA = /(?<![\d/])(0[1-9]|1[0-2])\/(20\d{2})(?![\d/])/;

/**
 * Distribuidoras conhecidas. A lista serve para rotular, não para restringir —
 * fatura de distribuidora não listada continua sendo lida normalmente.
 */
const DISTRIBUIDORAS = [
  "AMAZONAS ENERGIA",
  "AMBAR ENERGIA",
  "RORAIMA ENERGIA",
  "ENERGISA",
  "EQUATORIAL",
  "ENEL",
  "CPFL",
  "LIGHT",
  "CEMIG",
  "COPEL",
  "CELESC",
  "NEOENERGIA",
];

export function identificar(linhas: readonly string[]): IdentificacaoDaFatura {
  let unidadeConsumidora: string | null = null;
  /** Achado pelo rótulo; só vale se a forma com hífen não aparecer na fatura. */
  let unidadeConsumidoraSemHifen: string | null = null;
  let competencia: { mes: number; ano: number } | null = null;
  let distribuidora: string | null = null;

  for (const [indice, linha] of linhas.entries()) {
    const enxuta = linha.trim();

    if (!unidadeConsumidora) {
      const uc = CODIGO_DE_UC.exec(enxuta);
      // A chave de acesso da NF-e também é um bloco longo de dígitos; ela vem
      // em grupos de quatro e sem hífen, então o padrão acima já a descarta.
      if (uc?.[1]) unidadeConsumidora = uc[1];
      else if (ROTULO_DE_UC.test(enxuta)) {
        for (let adiante = 1; adiante <= LINHAS_ABAIXO_DO_ROTULO; adiante += 1) {
          const abaixo = UC_SEM_DIGITO.exec((linhas[indice + adiante] ?? "").trim());
          if (abaixo?.[1]) {
            unidadeConsumidoraSemHifen ??= abaixo[1];
            break;
          }
        }
      }
    }

    if (!competencia) {
      const c = COMPETENCIA.exec(enxuta);
      if (c?.[1] && c[2]) competencia = { mes: Number(c[1]), ano: Number(c[2]) };
    }

    if (!distribuidora) {
      const achada = DISTRIBUIDORAS.find((nome) => enxuta.toUpperCase().includes(nome));
      if (achada) distribuidora = achada;
    }
  }

  return {
    unidadeConsumidora: unidadeConsumidora ?? unidadeConsumidoraSemHifen,
    competencia,
    distribuidora,
  };
}
