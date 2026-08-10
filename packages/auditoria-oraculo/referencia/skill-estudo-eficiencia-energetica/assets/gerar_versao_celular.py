#!/usr/bin/env python3
"""Versao celular do Relatorio de Auditoria Energetica.

Pos-processador OFICIAL da skill: recebe um relatorio JA GERADO pelo
gerar_relatorio_do_modelo.py e acrescenta UMA camada @media (max-width:640px)
no fim do <head>. Nada do modelo congelado e alterado:

  - o CSS original permanece byte a byte (trava verifica);
  - desktop e PDF renderizam identicos (a camada so vale em tela <= 640px);
  - fundo claro forcado tambem no celular (regra do contraste de Dilkson:
    meta color-scheme "light only" bloqueia o auto-dark do Chrome mobile).

Uso:
  python3 gerar_versao_celular.py --relatorio caminho/do/relatorio.html
  (gera caminho/do/relatorio_celular.html)
"""
import argparse
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
MODELO = os.path.join(AQUI, "..", "templates",
                      "modelo-aprovado-cliente-serra-verde-2025-06-b.html")
MARCA = "camada-celular-v2"

CAMADA = """<meta name="color-scheme" content="light only">
<style id="%s">
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
""" % MARCA


def css_de(texto):
    m = re.search(r"<style[^>]*>(.*?)</style>", texto, flags=re.S)
    return m.group(1) if m else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--relatorio", required=True)
    a = ap.parse_args()

    rel = open(a.relatorio, encoding="utf-8").read()
    modelo = open(MODELO, encoding="utf-8").read()

    # TRAVA 1: so aceita relatorio saido do gerador (CSS identico ao modelo)
    if css_de(rel) != css_de(modelo):
        print("ERRO — o CSS deste arquivo nao e o do modelo congelado. "
              "A versao celular so e gerada sobre relatorio do gerador oficial.")
        return 1
    # TRAVA 2: nao aplicar duas vezes
    if MARCA in rel:
        print("ERRO — este arquivo ja tem a camada celular.")
        return 1
    if "</head>" not in rel:
        print("ERRO — sem </head> no relatorio.")
        return 1

    saida = rel.replace("</head>", CAMADA + "</head>", 1)
    destino = re.sub(r"\.html?$", "", a.relatorio) + "_celular.html"
    open(destino, "w", encoding="utf-8").write(saida)
    print("OK — %s (%d KB). CSS do modelo intocado; camada so p/ <=640px."
          % (destino, len(saida) // 1000))
    return 0


if __name__ == "__main__":
    sys.exit(main())
