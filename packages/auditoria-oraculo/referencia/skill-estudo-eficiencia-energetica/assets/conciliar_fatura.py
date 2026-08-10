#!/usr/bin/env python3
"""TRAVA 1 — Conciliacao da fatura (a mais importante do fluxo).

O maior risco da producao de relatorios nao e layout nem conta: e ERRO DE
EXTRACAO da fatura. Esta trava obriga a prova aritmetica ANTES de qualquer
estudo: a soma dos itens extraidos tem que bater com o total da fatura ao
centavo. Sem essa prova, o motor nao roda e o relatorio nao nasce.

Foi exatamente esta checagem que revelou, na Santa Tereza (06/2026), que a
"Adicional Bandeira Amarela" era informativa (bandeira Verde R$ 0,00) e nao
entrava no total — um erro que teria contaminado o estudo inteiro.

Uso:
  python3 conciliar_fatura.py --fatura fatura_extraida.json
  (grava <mesmo nome>_conciliada.json com "conciliada": true)

Formato do JSON de entrada (tudo que veio da fatura, nada inventado):
{
  "cliente": "...", "cnpj": "...", "uc": "...",
  "distribuidora": "...", "regime": "cativo|mercado_livre",
  "grupo": "A", "modalidade": "verde|azul", "classe": "...",
  "referencia": "MM/AAAA", "vencimento": "DD/MM/AAAA",
  "total": 174636.70,
  "itens": [
    {"nome": "Consumo Ponta", "valor": 46842.73,
     "kwh": 17419, "tarifa": 2.689175},
    {"nome": "Demanda com ICMS", "valor": 10165.90, "kw": 367,
     "tarifa": 27.70},
    ...
  ],
  "consumo_ponta_kwh": 17419, "consumo_fp_kwh": 183153,
  "demanda_contratada_kw": 500,
  "demanda_registrada_ponta_kw": 346, "demanda_registrada_fp_kw": 367,
  "reativo_ponta_kwh": 0, "reativo_fp_kwh": 0,
  "nao_cobrados": [{"nome": "Adicional Bandeira Amarela",
                    "valor": 3774.59,
                    "motivo": "bandeira Verde 0,00 na referencia"}]
}
"""
import argparse
import json
import sys

TOLERANCIA = 0.005          # meio centavo: 1 centavo de diferenca ja reprova
TOL_ITEM = 0.06             # tarifa x quantidade vs valor (arredondamento)

OBRIGATORIOS = ["cliente", "uc", "distribuidora", "regime", "modalidade",
                "referencia", "vencimento", "total", "itens",
                "consumo_ponta_kwh", "consumo_fp_kwh",
                "demanda_contratada_kw"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fatura", required=True)
    a = ap.parse_args()
    f = json.load(open(a.fatura, encoding="utf-8"))

    erros = []
    for c in OBRIGATORIOS:
        if c not in f or f[c] in ("", None, []):
            erros.append("campo obrigatorio ausente: %s" % c)
    if erros:
        print("REPROVADA — extracao incompleta:")
        for e in erros:
            print("  -", e)
        return 1

    # 1) PROVA CENTRAL: soma dos itens == total da fatura
    soma = sum(i["valor"] for i in f["itens"])
    dif = soma - f["total"]
    if abs(dif) > TOLERANCIA:
        print("REPROVADA — soma dos itens (R$ %.2f) != total da fatura "
              "(R$ %.2f). Diferenca: R$ %.2f." % (soma, f["total"], dif))
        print("Causas comuns: item informativo somado (bandeira/devolucao), "
              "item esquecido, valor digitado errado. Corrija a extracao — "
              "NUNCA ajuste o total para fechar.")
        return 1

    # 2) coerencia item a item: tarifa x quantidade ~= valor
    for i in f["itens"]:
        q = i.get("kwh", i.get("kw"))
        t = i.get("tarifa")
        if q is not None and t is not None:
            calc = q * t
            if abs(calc - i["valor"]) > max(TOL_ITEM, i["valor"] * 0.001):
                erros.append("item %r: %s x %s = %.2f, mas valor extraido e "
                             "%.2f" % (i["nome"], q, t, calc, i["valor"]))
    # 3) demanda registrada nao pode exceder contratada+5% sem item de
    #    ultrapassagem declarado
    reg = max(f.get("demanda_registrada_ponta_kw", 0) or 0,
              f.get("demanda_registrada_fp_kw", 0) or 0)
    if reg > f["demanda_contratada_kw"] * 1.05:
        nomes = " ".join((i["nome"] + " " + i.get("detalhe", "")).lower()
                         for i in f["itens"])
        if "ultrapassagem" not in nomes and not f.get("ultrapassagem_valor"):
            erros.append("demanda registrada %s kW > contratada+5%% e nao ha "
                         "item de ultrapassagem — conferir fatura" % reg)
    if erros:
        print("REPROVADA — inconsistencias:")
        for e in erros:
            print("  -", e)
        return 1

    enf = f.get("energia_nf")
    if enf:
        calc = enf["total"] / enf["mwh"] / 1000.0
        if abs(calc - enf["preco_kwh"]) > 1e-6:
            print("REPROVADA — energia_nf: preco_kwh %.7f != total/volume "
                  "%.7f" % (enf["preco_kwh"], calc))
            return 1
        it = {i["nome"].lower(): i for i in f["itens"]}
        tp = next((v.get("tarifa") for k, v in it.items()
                   if "consumo ponta" in k), None)
        if tp and abs(f.get("tarifa_ponta_total", 0)
                      - (tp + enf["preco_kwh"])) > 1e-6:
            print("REPROVADA — tarifa_ponta_total != TUSD + energia da NF")
            return 1

    f["conciliada"] = True
    f["prova"] = {"soma_itens": round(soma, 2), "total": f["total"],
                  "diferenca": round(dif, 4)}
    destino = a.fatura.replace(".json", "") + "_conciliada.json"
    json.dump(f, open(destino, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("CONCILIADA — soma dos itens = total (R$ %.2f). Gravada: %s"
          % (f["total"], destino))
    if f.get("nao_cobrados"):
        for n in f["nao_cobrados"]:
            print("  fora do total (informativo): %s R$ %.2f — %s"
                  % (n["nome"], n["valor"], n.get("motivo", "")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
