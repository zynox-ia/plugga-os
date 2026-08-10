#!/usr/bin/env python3
"""Motor PEAK SHAVING (v3) — BESS para eliminar demanda de PONTA em
modalidade AZUL (nome definido por Dilkson 08/08/2026: PEAK SHAVING — nao e
load shifting).

Logica: o BESS cobre TODA a carga da janela de ponta (potencia >= pico e
energia >= consumo de ponta diario) -> demanda de ponta medida ~0 -> contrato
de ponta reduzido ao minimo. Economia = conta de demanda de ponta eliminada
(medida + nao consumida) menos o contrato remanescente. A energia continua a
mesma: o BESS carrega no FP (com perdas) e o solar carrega o BESS.

Dimensionamento com GARANTIA DE 20 ANOS: N tal que a energia util no ano 20
(SOH 64,5%) ainda cobre o consumo de ponta diario — sem recontratacao.

Saida no MESMO formato do motor_bess_solar (dimensionamento/ano1_base/solar/
indicadores/fluxo_anual/fluxo_mensal) para reuso do construtor e das travas.
"""
import argparse
import json
import math

PADRAO = {
    "potencia_bess_kw": 241.0, "dod": 1.0, "eta_rt": 0.9556,
    "eta_ele": 0.98, "eta_op": 0.99, "dias_uteis_mes": 21,
    # demanda de ponta (azul)
    "demanda_ponta_medida_kw": 0.0, "tarifa_kw_ponta_medida": 0.0,
    "demanda_ponta_nc_kw": 0.0, "tarifa_kw_ponta_nc": 0.0,
    "contrato_ponta_novo_kw": 0.0,     # remanescente apos BESS
    # energia
    "consumo_ponta_desejado_kwh_mes": 0.0,
    "tusd_fp": 0.0, "te_fp": 0.0,      # hfp = custo de carga (e hp = hfp no azul)
    "tusd_p": None, "te_p": None,      # se None, usa hfp (azul kWh igual)
    "n_bess": None, "capex_bess_total": None, "capex_unitario": 550000.0,
    "om_bess_pct_capex_ano": 0.01,
    "reajuste_energia_aa": 0.08, "reajuste_om_aa": 0.03, "tma_aa": 0.12,
    "solar_kwp": 0.0, "solar_pr": 0.85, "solar_degradacao_aa": 0.005,
    "capex_solar_total": 0.0, "om_solar_pct_capex_ano": 0.01,
    "hsp_mensal": [4.5] * 12,
    "soh": [1.0, 0.971, 0.948, 0.927, 0.907, 0.888, 0.870, 0.852, 0.834,
            0.817, 0.799, 0.783, 0.763, 0.750, 0.734, 0.718, 0.703, 0.688,
            0.673, 0.659, 0.645],
}
DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set",
         "Out", "Nov", "Dez"]


def irr_anual(fluxos, lo=-0.99, hi=10.0, it=200):
    def vpl(r):
        return sum(f / (1 + r) ** i for i, f in enumerate(fluxos))
    if vpl(lo) * vpl(hi) > 0:
        return None
    for _ in range(it):
        mid = (lo + hi) / 2
        if vpl(lo) * vpl(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def rodar(p):
    ciclo = (p["potencia_bess_kw"] * p["dod"] * p["eta_rt"] * p["eta_ele"]
             * p["eta_op"])
    consumo_dia = p["consumo_ponta_desejado_kwh_mes"] / p["dias_uteis_mes"]
    soh20 = p["soh"][20]
    # N garante ano 20: energia util com SOH final >= consumo diario de ponta
    n_sug = max(math.ceil(consumo_dia / (ciclo * soh20)),
                math.ceil(p["demanda_ponta_medida_kw"]
                          / p["potencia_bess_kw"]))
    n = int(p["n_bess"] or n_sug)
    capex_bess = p["capex_bess_total"] or n * p["capex_unitario"]
    hfp = p["tusd_fp"] + p["te_fp"]
    hp = ((p["tusd_p"] + p["te_p"])
          if p.get("tusd_p") is not None and p.get("te_p") is not None
          else hfp)
    fator = 1.0 / (p["eta_rt"] * p["eta_ele"] * p["eta_op"])
    util_mes = p["consumo_ponta_desejado_kwh_mes"]   # cobre 100% da ponta
    carga_mes = util_mes * fator
    eco_dem_mes = (p["demanda_ponta_medida_kw"] * p["tarifa_kw_ponta_medida"]
                   + p["demanda_ponta_nc_kw"] * p["tarifa_kw_ponta_nc"]
                   - p["contrato_ponta_novo_kw"] * p["tarifa_kw_ponta_nc"])
    ger_mes = [p["solar_kwp"] * p["hsp_mensal"][m] * p["solar_pr"]
               * DIAS_MES[m] for m in range(12)]
    om_bess_ano1 = capex_bess * p["om_bess_pct_capex_ano"]
    om_solar_ano1 = p["capex_solar_total"] * p["om_solar_pct_capex_ano"]

    soh = p["soh"]
    fluxo = []
    capex_total = capex_bess + p["capex_solar_total"]
    acum = -capex_total
    anuais = [-capex_total]
    for ano in range(20):
        fa = 0.0
        rj_e = (1 + p["reajuste_energia_aa"]) ** ano
        rj_o = (1 + p["reajuste_om_aa"]) ** ano
        deg_s = (1 - p["solar_degradacao_aa"]) ** ano
        for m in range(12):
            s = soh[ano] + (m / 12.0) * (soh[ano + 1] - soh[ano])
            # cobertura garantida por dimensionamento (nunca < consumo)
            rec_dem = eco_dem_mes * rj_e
            rec_hp = util_mes * hp * rj_e          # energia de ponta evitada
            cus_hfp = carga_mes * hfp * rj_e       # recarga no FP
            ger = ger_mes[m] * deg_s
            sol_bess = min(ger, carga_mes)
            credito_solar = sol_bess * hfp * rj_e
            om_b = om_bess_ano1 * rj_o / 12
            om_s = om_solar_ano1 * rj_o / 12
            liq = rec_dem + rec_hp - cus_hfp + credito_solar - om_b - om_s
            acum += liq
            fa += liq
            fluxo.append({"ano": ano + 1, "mes": MESES[m], "soh": round(s, 4),
                          "receita_hp": round(rec_dem + rec_hp, 2),
                          "custo_hfp": round(cus_hfp, 2),
                          "ger_solar": round(ger, 1),
                          "solar_bess": round(sol_bess, 1),
                          "solar_exc": round(max(0.0, ger - sol_bess), 1),
                          "eco_liq": round(liq, 2),
                          "acumulado": round(acum, 2)})
        anuais.append(fa)

    tma = p["tma_aa"]
    vpl = sum(f / (1 + tma) ** i for i, f in enumerate(anuais))
    tir = irr_anual(anuais)
    neg = [f for f in fluxo if f["acumulado"] < 0]
    payback_meses = None
    if len(neg) < len(fluxo):
        k = len(neg)
        if k:
            payback_meses = k + (abs(neg[-1]["acumulado"])
                                 / fluxo[k]["eco_liq"]
                                 if fluxo[k]["eco_liq"] else 0)
        else:
            payback_meses = 0.0

    hsp_min = min(p["hsp_mensal"])
    return {
        "dimensionamento": {
            "funcao": "PEAK SHAVING (reducao de demanda de ponta)",
            "energia_util_ciclo_kwh": round(ciclo, 2),
            "energia_util_mes_1bess": round(ciclo * p["dias_uteis_mes"], 1),
            "energia_carga_mes_1bess": round(ciclo * p["dias_uteis_mes"]
                                             * fator, 1),
            "n_bess_sugerido": int(n_sug), "n_bess_adotado": n,
            "criterio": "cobertura de 100%% da ponta ATE O ANO 20 (SOH %.1f%%)"
                        % (soh20 * 100),
            "cobertura_consumo": 1.0,
            "potencia_disponivel_kw": n * p["potencia_bess_kw"],
            "pico_ponta_kw": p["demanda_ponta_medida_kw"],
        },
        "ano1_base": {
            "receita_hp": round((eco_dem_mes + util_mes * hp) * 12, 2),
            "custo_hfp": round(carga_mes * hfp * 12, 2),
            "economia_bruta": round((eco_dem_mes + util_mes * hp
                                     - carga_mes * hfp) * 12, 2),
            "om_bess": round(om_bess_ano1, 2),
            "economia_liquida": round((eco_dem_mes + util_mes * hp
                                       - carga_mes * hfp) * 12
                                      - om_bess_ano1, 2),
            "economia_demanda_mes": round(eco_dem_mes, 2),
        },
        "solar": {"geracao_ano1_kwh": round(sum(ger_mes), 0),
                  "capex": p["capex_solar_total"],
                  "om_ano1": round(om_solar_ano1, 2),
                  "regra": "apenas carrega o BESS (excedente sem credito)",
                  "kwp_sugerido_media": round(carga_mes / 21 / (
                      sum(p["hsp_mensal"]) / 12 * p["solar_pr"] * 0.854), 1),
                  "kwp_sugerido_pior_mes": round(carga_mes / 21 / (
                      hsp_min * p["solar_pr"] * 0.854), 1)},
        "indicadores": {
            "capex_total": capex_total,
            "vpl_tma": round(vpl, 2), "tma": tma,
            "tir_aa": round(tir, 4) if tir is not None else None,
            "payback_meses": round(payback_meses, 1) if payback_meses else None,
            "payback_anos": round(payback_meses / 12, 2) if payback_meses else None,
            "acumulado_20a": round(acum, 2),
            "economia_liquida_20a": round(acum + capex_total, 2),
        },
        "fluxo_anual": [round(f, 2) for f in anuais],
        "fluxo_mensal": fluxo,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--caso", required=True)
    ap.add_argument("--saida")
    a = ap.parse_args()
    p = dict(PADRAO)
    p.update(json.load(open(a.caso)))
    r = rodar(p)
    if a.saida:
        json.dump(r, open(a.saida, "w"), ensure_ascii=False, indent=1)
    res = dict(r)
    res.pop("fluxo_mensal")
    res["fluxo_anual"] = res["fluxo_anual"][:4] + ["..."]
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
