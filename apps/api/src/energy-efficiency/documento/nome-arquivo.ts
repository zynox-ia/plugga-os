/**
 * Nome do arquivo PDF entregue ao cliente.
 *
 * O arquivo sai da nossa mão e vai parar na pasta de downloads de alguém, ao
 * lado de dezenas de outros. O nome é a única pista de contexto que sobra ali,
 * então carrega cliente, unidade consumidora e competência — nessa ordem, que é
 * a ordem em que a pessoa procura.
 *
 * Só ASCII de propósito: `Content-Disposition` com acento exige codificação
 * RFC 5987, e cliente de e-mail antigo continua errando isso. Perder o til não
 * atrapalha ninguém a achar o arquivo; nome corrompido, sim.
 */

/** Remove acento, troca o que não for letra ou número por hífen. */
function pedaco(texto: string): string {
  return texto
    .normalize("NFD")
    // Faixa dos diacríticos combinantes, escapada: o caractere cru aqui é
    // invisível no editor e some em qualquer cópia mal feita do arquivo.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Razão social inteira daria nome ilegível — "a-m-quimica-industria-e-comercio-
 * de-produtos-quimicos-ltda". Corta em palavra inteira, porque metade de uma
 * palavra atrapalha mais do que a falta dela.
 */
function nomeCurto(cliente: string, limite = 40): string {
  const limpo = pedaco(cliente);
  if (limpo.length <= limite) return limpo;

  const corte = limpo.lastIndexOf("-", limite);
  return limpo.slice(0, corte > 0 ? corte : limite);
}

export function nomeDoArquivoPdf(dados: {
  clientName: string;
  consumerUnitCode: string;
  competenceMonth: number;
  competenceYear: number;
}): string {
  const partes = [
    "estudo-eficiencia-energetica",
    nomeCurto(dados.clientName),
    pedaco(dados.consumerUnitCode),
    `${String(dados.competenceMonth).padStart(2, "0")}-${dados.competenceYear}`,
  ].filter((parte) => parte.length > 0);

  return `${partes.join("-")}.pdf`;
}
