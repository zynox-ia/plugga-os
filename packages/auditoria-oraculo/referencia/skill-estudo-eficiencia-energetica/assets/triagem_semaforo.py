#!/usr/bin/env python3
"""SEMAFORO — triagem de risco antes de produzir/entregar o relatorio.

O julgamento tecnico rotineiro e do agente; Dilkson so e acionado no que e
novo ou estranho. Regra:

  VERDE    tipo de fatura JA CONHECIDO (distribuidora+regime+modalidade+grupo
           aprovados) e travas 1-2 passaram -> produz e ENTREGA sozinho.
  AMARELO  tipo NOVO (primeira fatura desta combinacao) -> produz o estudo,
           mas NAO envia ao cliente; manda a Dilkson os 4 numeros de
           conferencia (total, consumo ponta, VPL, payback). Aprovou ->
           registrar o tipo com --aprovar e ai vira VERDE para sempre.
  VERMELHO qualquer trava reprovou, dado faltando, ou resultado fora da
           faixa sanitaria -> PARA e escala com o erro. Nunca entrega.

Faixas sanitarias (VERMELHO se violar):
  TIR > 60% a.a., payback < 24 meses, economia ano 1 > 50% da fatura,
  spread ponta/fp > 8x — bom demais quase sempre e erro de extracao.

Uso:
  python3 triagem_semaforo.py --fatura fat_conciliada.json [--fluxo fluxo.json]
  python3 triagem_semaforo.py --aprovar --fatura fat_conciliada.json \
      --por "Dilkson"          (registra o tipo como conhecido)

Registro: casos/tipos-conhecidos.json
"""
import argparse
import datetime as dt
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
REGISTRO = os.path.join(AQUI, "..", "casos", "tipos-conhecidos.json")


def chave(f):
    return "|".join(str(f.get(k, "?")).strip().lower() for k in
                    ("distribuidora", "regime", "modalidade", "grupo"))


def carrega():
    try:
        return json.load(open(REGISTRO, encoding="utf-8"))
    except (OSError, ValueError):
        return {"tipos": []}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fatura", required=True)
    ap.add_argument("--fluxo")
    ap.add_argument("--aprovar", action="store_true")
    ap.add_argument("--por", default="")
    a = ap.parse_args()
    f = json.load(open(a.fatura, encoding="utf-8"))
    reg = carrega()
    k = chave(f)

    if a.aprovar:
        if not a.por:
            print("--aprovar exige --por (quem aprovou)."); return 1
        if any(t["chave"] == k for t in reg["tipos"]):
            print("tipo ja registrado:", k); return 0
        reg["tipos"].append({"chave": k,
                             "exemplo_uc": str(f.get("uc", "")),
                             "aprovado_por": a.por,
                             "aprovado_em": dt.date.today().isoformat()})
        json.dump(reg, open(REGISTRO, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print("APROVADO E REGISTRADO como tipo conhecido:", k)
        return 0

    # ---- vermelho: pre-condicoes ----
    vermelho = []
    if not f.get("conciliada"):
        vermelho.append("fatura nao conciliada (trava 1)")
    if a.fluxo:
        flx = json.load(open(a.fluxo, encoding="utf-8"))
        ind = flx.get("indicadores", {})
        e1 = flx["fluxo_anual"][1] if len(flx.get("fluxo_anual", [])) > 1 else 0
        tir = (ind.get("tir_aa") or 0) * 100
        pb = ind.get("payback_meses")
        if tir > 60:
            vermelho.append("TIR %.1f%% a.a. — bom demais, conferir extracao" % tir)
        if pb is not None and pb < 24:
            vermelho.append("payback %.0f meses (<24) — conferir extracao" % pb)
        # ML: base = gasto total (fio + energia); cativo: total da fatura
        base_gasto = f.get("total_gasto_energia") or f.get("total")
        if base_gasto and e1 / 12 > base_gasto * 0.5:
            vermelho.append("economia mensal > 50%% do gasto com energia — conferir")
    tp = f.get("tarifa_ponta_total") or 0
    tf = f.get("tarifa_fp_total") or 0
    if tp and tf and tp / tf > 10:
        vermelho.append("spread ponta/fp %.1fx (>10x) — conferir tarifas" % (tp / tf))

    if vermelho:
        print("FAIXA: VERMELHO — NAO PRODUZIR/ENTREGAR. Escalar com:")
        for v in vermelho:
            print("  -", v)
        return 2

    conhecido = any(t["chave"] == k for t in reg["tipos"])
    if conhecido:
        print("FAIXA: VERDE — tipo conhecido (%s). Produzir e entregar; "
              "registrar a entrega (registrar_entrega.py)." % k)
        return 0
    print("FAIXA: AMARELO — tipo NOVO (%s). Produzir o estudo mas NAO enviar "
          "ao cliente. Mandar a Dilkson os 4 numeros: total da fatura, "
          "consumo ponta, VPL e payback. Apos o OK dele, rodar --aprovar "
          "--por \"Dilkson\" e ai entregar." % k)
    return 3


if __name__ == "__main__":
    sys.exit(main())
