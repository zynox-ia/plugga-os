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

/** Competência: MM/AAAA isolado. Vencimento tem dia, então não colide. */
const COMPETENCIA = /^(0[1-9]|1[0-2])\/(20\d{2})$/;

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
  let competencia: { mes: number; ano: number } | null = null;
  let distribuidora: string | null = null;

  for (const linha of linhas) {
    const enxuta = linha.trim();

    if (!unidadeConsumidora) {
      const uc = CODIGO_DE_UC.exec(enxuta);
      // A chave de acesso da NF-e também é um bloco longo de dígitos; ela vem
      // em grupos de quatro e sem hífen, então o padrão acima já a descarta.
      if (uc?.[1]) unidadeConsumidora = uc[1];
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

  return { unidadeConsumidora, competencia, distribuidora };
}
