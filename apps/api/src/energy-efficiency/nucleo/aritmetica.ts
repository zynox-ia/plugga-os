/**
 * Aritmética do oráculo.
 *
 * Um port fiel não pode reproduzir só as fórmulas: precisa reproduzir como o
 * Python soma, arredonda e arredonda para cima. Cada função aqui existe porque
 * a versão ingênua em JavaScript diverge do oráculo em algum caso do corpus, e
 * a comparação é ao centavo.
 */

/**
 * Soma como o `sum()` do CPython, que desde a 3.12 usa somatório compensado de
 * Neumaier para floats.
 *
 * Somar da esquerda para a direita diverge em 5 das 27 faturas do corpus: em
 * Jatuarana sobra um resíduo de −1,46e−11 onde o oráculo fecha em zero exato, e
 * em Alvorada II acontece o contrário. Também vale para o VPL, que soma 21
 * fluxos anuais, e para a geração solar do ano 1, que soma 12 meses.
 */
export function somarComoOOraculo(valores: readonly number[]): number {
  let soma = 0;
  let compensacao = 0;

  for (const valor of valores) {
    const parcial = soma + valor;
    compensacao +=
      Math.abs(soma) >= Math.abs(valor)
        ? soma - parcial + valor
        : valor - parcial + soma;
    soma = parcial;
  }

  return soma + compensacao;
}

/**
 * Arredonda como o `round()` do Python.
 *
 * Duas diferenças em relação ao `Math.round`, e as duas aparecem no corpus:
 *
 * - o empate vai para o dígito par, não para longe do zero;
 * - a decisão olha o valor exato do double, não o valor multiplicado por
 *   10^casas. Escalar destrói a informação: o SOH interpolado de outubro do
 *   ano 2 vale 0,95374999999999998668, que está **abaixo** do empate, mas
 *   multiplicado por 10.000 vira exatamente 9537,5 e arredondaria para cima.
 *   O oráculo grava 0,9537.
 *
 * O zero negativo é preservado, porque o oráculo grava `-0.0` quando o
 * resultado é um resíduo negativo.
 */
export function arredondar(valor: number, casas: number): number {
  if (!Number.isFinite(valor)) return valor;

  const negativo = valor < 0 || Object.is(valor, -0);
  const absoluto = Math.abs(valor);
  const exato = absoluto.toFixed(Math.min(casas + 18, 100));
  const [inteiro = "0", fracao = ""] = exato.split(".");

  const mantida = fracao.slice(0, casas).padEnd(casas, "0");
  const descartada = fracao.slice(casas);
  let escalado = BigInt(inteiro + mantida);

  const empate = /^50*$/.test(descartada);
  if (empate) {
    if (escalado % 2n === 1n) escalado += 1n;
  } else if (descartada !== "" && descartada[0]! >= "5") {
    escalado += 1n;
  }

  const resultado = Number(escalado) / 10 ** casas;
  if (!negativo) return resultado;
  return resultado === 0 ? -0 : -resultado;
}

/**
 * O teto do oráculo. O motor Solar+BESS escreve `-(-a // b)`, que é o teto
 * expresso por divisão inteira de floats; o peak shaving usa `math.ceil`. Os
 * dois chegam ao mesmo lugar, e é este.
 */
export function tetoComoOOraculo(dividendo: number, divisor: number): number {
  return -Math.floor(-dividendo / divisor);
}

/**
 * TIR anual por bisseção, igual à `irr_anual` dos dois motores: mesma janela
 * de busca, mesmo número de iterações, mesmo critério de troca de lado.
 *
 * Não é a TIR "correta" de biblioteca — é a que o oráculo calcula. Trocar por
 * Newton-Raphson daria outro último dígito e quebraria a comparação.
 */
export function tirAnual(
  fluxos: readonly number[],
  inferior = -0.99,
  superior = 10.0,
  iteracoes = 200,
): number | null {
  const vpl = (taxa: number): number =>
    somarComoOOraculo(fluxos.map((fluxo, i) => fluxo / (1 + taxa) ** i));

  let lo = inferior;
  let hi = superior;
  if (vpl(lo) * vpl(hi) > 0) return null;

  for (let i = 0; i < iteracoes; i += 1) {
    const meio = (lo + hi) / 2;
    if (vpl(lo) * vpl(meio) <= 0) hi = meio;
    else lo = meio;
  }

  return (lo + hi) / 2;
}
