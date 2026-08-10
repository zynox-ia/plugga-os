import { arredondar } from "./aritmetica.js";

/**
 * Formatação pt-BR do relatório, igual à do oráculo.
 *
 * O `fmt` do Python é `f"{v:,.2f}"` com os separadores trocados; o `fint` é
 * `round(v)` com ponto de milhar. Os dois passam pelo arredondamento do
 * Python — meia casa vai para o par —, e não pelo `toFixed`, que arredonda
 * para longe do zero.
 */

function comMilhar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** `R$ 1.234,56` sem o prefixo: duas casas, vírgula decimal, ponto no milhar. */
export function fmt(valor: number): string {
  const arredondado = arredondar(valor, 2);
  const negativo = arredondado < 0 || Object.is(arredondado, -0);
  const [inteiro = "0", decimais = "00"] = Math.abs(arredondado)
    .toFixed(2)
    .split(".");

  return `${negativo ? "-" : ""}${comMilhar(inteiro)},${decimais}`;
}

/** Inteiro com ponto de milhar. */
export function fint(valor: number): string {
  const arredondado = arredondar(valor, 0);
  const negativo = arredondado < 0;

  return `${negativo ? "-" : ""}${comMilhar(Math.abs(arredondado).toFixed(0))}`;
}

/** `"%.1f" % v` com vírgula decimal — usado em anos de payback e spread. */
export function comUmaCasa(valor: number): string {
  return arredondar(valor, 1).toFixed(1).replace(".", ",");
}

/** `"%.6f" % v` com vírgula — tarifas do bloco de mercado livre. */
export function comSeisCasas(valor: number): string {
  return arredondar(valor, 6).toFixed(6).replace(".", ",");
}

/** `"%.3f" % v` com vírgula — volume em MWh da nota fiscal. */
export function comTresCasas(valor: number): string {
  return arredondar(valor, 3).toFixed(3).replace(".", ",");
}

/** `"%g" % v` com vírgula — kWp da usina, sem zeros à toa. */
export function compacto(valor: number): string {
  return Number(valor.toPrecision(6)).toString().replace(".", ",");
}
