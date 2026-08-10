#!/usr/bin/env python3
"""TRAVA 2 — Verificador aritmetico do relatorio FINAL.

Le o HTML pronto e refaz as contas de tras pra frente, a partir das duas
unicas fontes de verdade: a fatura CONCILIADA (trava 1) e o fluxo do MOTOR.
Qualquer divergencia acima de R$ 0,01 (ou 1 linha ausente) = NAO ENTREGA.

O que e conferido:
  1. fatura re-conciliada (soma itens = total; consumo total = P + FP)
  2. KPIs da fatura no HTML: total, consumo total, custo medio (= total/consumo)
  3. pesos percentuais de cada item (valor/total, 2 casas) presentes no HTML
  4. tabela de 20 anos = fluxo do motor linha a linha (economia E acumulado)
  5. acumulado interno: acum[i] = acum[i-1] + economia[i]
  6. cartoes do estudo: economia ano 1, media mensal (=E1/12), fatura com BESS
     (= total - mensal), reducao %, VPL, TIR, payback
  7. estrutura: CSS identico ao modelo congelado, 10 secoes h1/h2, nenhum
     marcador do caso-fonte (defesa em profundidade)

Uso:
  python3 verificar_relatorio.py --html relatorio.html \
      --fatura fatura_conciliada.json --fluxo fluxo_motor.json
"""
import argparse
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
MODELO = os.path.join(AQUI, "..", "templates",
                      "modelo-aprovado-cliente-serra-verde-2025-06-b.html")
MARCADORES_FONTE = ["Serra Verde", "SERRA VERDE", "AGROINDUSTRIAL", "0188872",
                    "R$ 291.154", "548.413 kWh", "R$ 72.788", "R$ 3.984,50", "06/2025"]


def fmt(v):
    return f"{v:,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")


def fint(v):
    return f"{round(v):,d}".replace(",", ".")


def css_de(t):
    m = re.search(r"<style[^>]*>(.*?)</style>", t, flags=re.S)
    return m.group(1) if m else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", required=True)
    ap.add_argument("--fatura", required=True)
    ap.add_argument("--fluxo", required=True)
    a = ap.parse_args()

    html = open(a.html, encoding="utf-8").read()
    fat = json.load(open(a.fatura, encoding="utf-8"))
    flx = json.load(open(a.fluxo, encoding="utf-8"))
    erros = []

    def deve_conter(texto, motivo):
        if texto not in html:
            erros.append("AUSENTE no HTML: %r (%s)" % (texto, motivo))

    # 1) fatura re-conciliada
    if not fat.get("conciliada"):
        erros.append("fatura NAO passou pela trava 1 (conciliar_fatura.py)")
    soma = sum(i["valor"] for i in fat["itens"])
    if abs(soma - fat["total"]) > 0.01:
        erros.append("fatura: soma itens %.2f != total %.2f" %
                     (soma, fat["total"]))
    cons = fat["consumo_ponta_kwh"] + fat["consumo_fp_kwh"]

    # 2) KPIs da fatura
    deve_conter(fmt(fat["total"]), "valor total da fatura")
    deve_conter(fint(cons) + " kWh", "consumo total")
    deve_conter("R$ " + fmt(fat["total"] / cons).replace(".", "") + "/kWh",
                "custo medio total = total/consumo")
    deve_conter(fat["referencia"], "referencia")
    deve_conter(fat["vencimento"], "vencimento")
    deve_conter(fat["cliente"].upper(), "nome do cliente")
    deve_conter(str(fat["uc"]), "UC")

    # 3) pesos percentuais dos itens relevantes (>= 1% do total)
    for i in fat["itens"]:
        ni = i["nome"].lower()
        if ("cosip" in ni or "ilum" in ni or "apcei" in ni
                or "ultrapassagem" in ni):
            continue    # mesmos itens sem linha propria do construtor
        if i["valor"] / fat["total"] >= 0.01:
            deve_conter(fmt(i["valor"]), "valor do item %s" % i["nome"])
            deve_conter(fmt(i["valor"] / fat["total"] * 100) + "%",
                        "peso do item %s" % i["nome"])

    # 4-5) tabela de 20 anos = motor, e acumulado consistente
    an = flx["fluxo_anual"]
    if len(an) != 21:
        erros.append("fluxo do motor sem 21 posicoes (a0 + 20 anos)")
    eco = an[1:]
    acum = [an[0]]
    for v in eco:
        acum.append(round(acum[-1] + v, 2))
    for i, v in enumerate(eco, start=1):
        deve_conter(fmt(v), "economia ano %d (motor)" % i)
    for i, v in enumerate(acum[1:], start=1):
        deve_conter(fmt(v), "acumulado ano %d (motor)" % i)
    deve_conter(fmt(abs(an[0])), "CAPEX (ano 0)")

    # 6) cartoes do estudo
    e1 = eco[0]
    mensal = e1 / 12
    deve_conter(fmt(e1), "economia ano 1")
    deve_conter(fmt(mensal), "economia media mensal = ano1/12")
    deve_conter(fmt(fat["total"] - mensal), "fatura com BESS = total - mensal")
    deve_conter(fmt(mensal / fat["total"] * 100) + "%", "reducao %")
    ind = flx.get("indicadores", {})
    if ind:
        # decisao Dilkson 08/08: relatorio sem TMA/VPL — conferir TIR,
        # payback simples e acumulado (ja coberto pela tabela de 20 anos)
        deve_conter(fmt(ind["tir_aa"] * 100) + "%", "TIR do motor")
        pb = ind.get("payback_meses")
        if pb:
            deve_conter(("%.1f anos" % (pb / 12)).replace(".", ","),
                        "payback do motor")

    # 7) estrutura
    if css_de(html) != css_de(open(MODELO, encoding="utf-8").read()):
        # versao celular acrescenta um 2o bloco <style>; o PRIMEIRO tem que
        # ser o do modelo
        erros.append("CSS principal difere do modelo congelado")
    ncab = len(re.findall(r"<h[12][ >]", re.sub(r"<style.*?</style>", "",
                                                html, flags=re.S)))
    if ncab < 10:
        erros.append("menos de 10 titulos h1/h2 (%d) — secao sumiu?" % ncab)
    for mk in MARCADORES_FONTE:
        if mk in html:
            erros.append("marcador do caso-fonte presente: %r" % mk)

    if erros:
        print("REPROVADO — %d problema(s). NAO ENTREGAR:" % len(erros))
        for e in erros:
            print("  -", e)
        return 1
    print("APROVADO — HTML consistente com fatura conciliada + fluxo do motor "
          "(%d verificacoes)." % (
              7 + len([i for i in fat["itens"]
                       if i["valor"] / fat["total"] >= 0.01]) * 2 + 40 + 6))
    return 0


if __name__ == "__main__":
    sys.exit(main())
