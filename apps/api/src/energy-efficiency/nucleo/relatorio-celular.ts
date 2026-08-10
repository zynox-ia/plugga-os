import { lerModeloOficial, RelatorioInvalidoError } from "./relatorio-literal.js";

/**
 * Versão celular — port fiel de `assets/gerar_versao_celular.py`.
 *
 * É um pós-processador, não um segundo gerador: recebe um relatório já gerado e
 * acrescenta **uma** camada `@media` no fim do `<head>`. Nada do modelo
 * congelado é alterado — o CSS original continua byte a byte, e desktop e PDF
 * renderizam idênticos, porque a camada só vale em telas de até 640px.
 *
 * O fundo claro é forçado também no celular: `color-scheme: light only` bloqueia
 * o modo escuro automático do Chrome mobile, que transformava fundo claro com
 * texto escuro em fundo escuro com texto escuro.
 */

export const MARCA_DA_CAMADA = "camada-celular-v2";

const CAMADA = `<meta name="color-scheme" content="light only">
<style id="${MARCA_DA_CAMADA}">
/* Versao celular — camada adicional; NAO altera o CSS do modelo congelado.
   Vale somente em telas <=640px; desktop e PDF ficam identicos. */
@media (max-width:640px){
  .page{padding:0 0 32px}
  .hero{padding:26px 18px 38px;border-radius:0 0 20px 20px}
  .hero::after{display:none}
  /* logo + "voce no controle da sua energia" reduzidas proporcionalmente,
     ancoradas no canto superior direito (pedido Dilkson 08/08, print) */
  .brandmark{top:16px;right:16px}
  .brandmark .logo-img{height:20px}
  .brandmark .tag{font-size:6.5px;margin-top:1px;letter-spacing:.3px}
  .hero .eyebrow{font-size:9px;letter-spacing:2px;padding-right:118px}
  .hero h1{font-size:24px;margin-top:12px}
  .grid,.grid3,.dim,.chart-pair,.wide-chart,.timeline,.demand-grid{
    grid-template-columns:1fr !important}
  section{padding-left:16px;padding-right:16px}
  table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}
  h2{font-size:19px}
}
</style>
`;

function cssDe(texto: string): string {
  const encontrado = /<style[^>]*>([\s\S]*?)<\/style>/.exec(texto);
  return encontrado ? encontrado[1]! : "";
}

/**
 * Só aceita relatório saído do gerador oficial, e só uma vez. Aplicar duas
 * vezes duplicaria a camada e mudaria o hash sem mudar a aparência.
 */
export function gerarVersaoCelular(
  relatorio: string,
  modelo = lerModeloOficial(),
): string {
  if (cssDe(relatorio) !== cssDe(modelo)) {
    throw new RelatorioInvalidoError("o CSS deste arquivo não é o do modelo congelado", [
      "a versão celular só é gerada sobre relatório do gerador oficial",
    ]);
  }
  if (relatorio.includes(MARCA_DA_CAMADA)) {
    throw new RelatorioInvalidoError("este arquivo já tem a camada celular", [
      "aplicar duas vezes mudaria o hash sem mudar a aparência",
    ]);
  }
  if (!relatorio.includes("</head>")) {
    throw new RelatorioInvalidoError("relatório sem </head>", [
      "não há onde acrescentar a camada",
    ]);
  }

  return relatorio.replace("</head>", `${CAMADA}</head>`);
}
