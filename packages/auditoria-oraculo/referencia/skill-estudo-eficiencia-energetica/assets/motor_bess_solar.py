#!/usr/bin/env python3
"""Motor BESS + Solar — port fiel da planilha BESS_Dimensionador_Solar de Dilkson
(recebida 08/08/2026). Fluxo mensal de 20 anos com SOH interpolado, reajustes,
solar carregando o BESS primeiro, VPL/TIR/payback.

Uso:
  python3 motor_bess_solar.py --caso caso.json [--saida fluxo.json]
  python3 motor_bess_solar.py --exemplo          (roda com os valores da planilha)

O caso.json aceita qualquer subconjunto de PREMISSAS — o resto herda o padrão
da planilha. O motor é a FONTE DE VERDADE do estudo BESS/Solar da skill
estudo-eficiencia-energetica: o agente extrai dados e monta o caso; o cálculo
é sempre daqui, nunca de cabeça.
"""
import argparse
import json

# ---- padrão = valores da planilha de Dilkson (aba Premissas) ----
PADRAO = {
    # equipamento BESS
    "potencia_bess_kw": 241.0,
    "dod": 1.0,
    "eta_rt": 0.9556,
    "eta_ele": 0.98,
    "eta_op": 0.99,
    "dias_uteis_mes": 21,
    # dimensionamento
    "consumo_ponta_desejado_kwh_mes": 6900.0,
    "n_bess": None,               # None = usa o sugerido (ceil)
    "capex_bess_total": 1100000.0,
    # tarifas (Mercado Livre: TE=0, vale o fio)
    "tusd_fp": 0.625962,
    "te_fp": 0.0,
    "tusd_p": 2.689175,
    "te_p": 0.0,
    # financeiro
    "om_bess_pct_capex_ano": 0.01,
    "om_bess_ano1": None,          # se definido, usa direto (modelo REV04: capex x 1,5%)
    "limitar_utilizacao_ao_consumo": True,   # Solar=True (fator J12); REV04=False
    # REGRA DILKSON 08/08/2026: o solar existe SO para carregar o BESS que
    # descarrega na ponta. Excedente NAO abate consumo FP do local (nem com
    # simultaneidade) e NAO gera credito no estudo. False = modo legado da
    # planilha (usado apenas para validacao contra ela).
    "solar_apenas_carrega_bess": True,
    "reajuste_energia_aa": 0.08,
    "reajuste_om_aa": 0.03,
    "tma_aa": 0.12,
    # solar
    "solar_kwp": 475.0,
    # PR 85%: decisao Dilkson 08/08/2026 (planilha original usava 0,75 —
    # para validar contra ela, passar "solar_pr": 0.75 no caso)
    "solar_pr": 0.85,
    "solar_degradacao_aa": 0.005,
    "capex_solar_total": 1187500.0,
    "om_solar_pct_capex_ano": 0.01,
    "hsp_mensal": [5.0] * 12,     # CRESESB/PVGIS por mês
    # curva SOH Huawei (1 ciclo/dia, DoD 100%), anos 0..20
    "soh": [1.0, 0.971, 0.948, 0.927, 0.907, 0.888, 0.870, 0.852, 0.834,
            0.817, 0.799, 0.783, 0.763, 0.750, 0.734, 0.718, 0.703, 0.688,
            0.673, 0.659, 0.645],
}
DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set",
         "Out", "Nov", "Dez"]


def irr_anual(fluxos, lo=-0.99, hi=10.0, it=200):
    """TIR por bissecção sobre fluxos anuais (fluxos[0] = investimento)."""
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
             * p["eta_op"])                                   # kWh úteis/ciclo
    util_mes_1 = ciclo * p["dias_uteis_mes"]                  # por BESS
    carga_mes_1 = (p["potencia_bess_kw"] * p["dias_uteis_mes"] * p["dod"]
                   / (p["eta_rt"] * p["eta_ele"] * p["eta_op"]))
    n_sug = -(-p["consumo_ponta_desejado_kwh_mes"] // util_mes_1)  # ceil
    n = int(p["n_bess"] or n_sug)
    hfp = p["tusd_fp"] + p["te_fp"]
    hp = p["tusd_p"] + p["te_p"]
    # UTILIZACAO LIMITADA AO CONSUMO (fator J12 da planilha): o BESS so fatura
    # a energia que de fato desloca — nunca a capacidade fisica cheia.
    util_fis_n = n * util_mes_1
    if p.get("limitar_utilizacao_ao_consumo", True):
        util_n = min(util_fis_n, p["consumo_ponta_desejado_kwh_mes"])
    else:
        util_n = util_fis_n
    u = util_n / util_fis_n if util_fis_n else 0.0
    carga_n = n * carga_mes_1 * u
    util_mes_1 = util_mes_1 * u          # efetiva por BESS (relatorio)
    carga_mes_1 = carga_mes_1 * u
    ger_mes = [p["solar_kwp"] * p["hsp_mensal"][m] * p["solar_pr"] * DIAS_MES[m]
               for m in range(12)]
    # O&M BESS: CAPEX_total x pct — SEM multiplicar por N (formula corrigida por
    # Dilkson em 08/08: C25 = CAPEX_total*1%/N por BESS; xN = CAPEX_total*1%).
    om_bess_ano1 = (p["om_bess_ano1"] if p.get("om_bess_ano1") is not None
                    else p["capex_bess_total"] * p["om_bess_pct_capex_ano"])
    om_solar_ano1 = p["capex_solar_total"] * p["om_solar_pct_capex_ano"]

    soh = p["soh"]
    fluxo = []
    capex_total = p["capex_bess_total"] + p["capex_solar_total"]
    acum = -capex_total
    anuais = [-capex_total]
    for ano in range(20):
        fa = 0.0
        rj_e = (1 + p["reajuste_energia_aa"]) ** ano
        rj_o = (1 + p["reajuste_om_aa"]) ** ano
        deg_s = (1 - p["solar_degradacao_aa"]) ** ano
        for m in range(12):
            s = soh[ano] + (m / 12.0) * (soh[ano + 1] - soh[ano])
            rec_hp = util_n * s * hp * rj_e
            cus_hfp = carga_n * s * hfp * rj_e
            om_b = om_bess_ano1 * rj_o / 12
            ger = ger_mes[m] * deg_s
            sol_bess = min(ger, carga_n * s)
            sol_exc = max(0.0, ger - sol_bess)
            om_s = om_solar_ano1 * rj_o / 12
            if p.get("solar_apenas_carrega_bess", True):
                credito_solar = sol_bess * hfp * rj_e      # so o que carrega o BESS
            else:
                credito_solar = (sol_bess + sol_exc) * hfp * rj_e   # legado planilha
            bruta = rec_hp - cus_hfp + credito_solar
            liq = bruta - om_b - om_s
            acum += liq
            fa += liq
            fluxo.append({"ano": ano + 1, "mes": MESES[m], "soh": round(s, 4),
                          "receita_hp": round(rec_hp, 2),
                          "custo_hfp": round(cus_hfp, 2),
                          "ger_solar": round(ger, 1),
                          "solar_bess": round(sol_bess, 1),
                          "solar_exc": round(sol_exc, 1),
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
            ultimo_neg = neg[-1]["acumulado"]
            prox = fluxo[k]["eco_liq"]
            payback_meses = k + (abs(ultimo_neg) / prox if prox else 0)
        else:
            payback_meses = 0.0

    return {
        "dimensionamento": {
            "energia_util_ciclo_kwh": round(ciclo, 2),
            "energia_util_mes_1bess": round(util_mes_1, 1),
            "energia_carga_mes_1bess": round(carga_mes_1, 1),
            "n_bess_sugerido": int(n_sug), "n_bess_adotado": n,
            "cobertura_consumo": round(util_n / p["consumo_ponta_desejado_kwh_mes"], 4)
            if p["consumo_ponta_desejado_kwh_mes"] else None,
        },
        "ano1_base": {
            "receita_hp": round(util_n * hp * 12, 2),
            "custo_hfp": round(carga_n * hfp * 12, 2),
            "economia_bruta": round(util_n * hp * 12 - carga_n * hfp * 12, 2),
            "om_bess": round(om_bess_ano1, 2),
            "economia_liquida": round(util_n * hp * 12 - carga_n * hfp * 12
                                      - om_bess_ano1, 2),
        },
        "solar": {"geracao_ano1_kwh": round(sum(ger_mes), 0),
                  "capex": p["capex_solar_total"], "om_ano1": round(om_solar_ano1, 2),
                  "regra": ("apenas carrega o BESS (excedente sem credito)"
                            if p.get("solar_apenas_carrega_bess", True)
                            else "legado planilha (excedente creditado no FP)"),
                  # kWp sugerido para cobrir SO a carga do BESS:
                  "kwp_sugerido_media": round(carga_n / (
                      sum(p["hsp_mensal"][m] * p["solar_pr"] * DIAS_MES[m]
                          for m in range(12)) / 12), 1) if p["solar_pr"] else None,
                  "kwp_sugerido_pior_mes": round(max(
                      carga_n / (p["hsp_mensal"][m] * p["solar_pr"] * DIAS_MES[m])
                      for m in range(12)), 1) if p["solar_pr"] else None},
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
    ap.add_argument("--caso")
    ap.add_argument("--saida")
    ap.add_argument("--exemplo", action="store_true")
    a = ap.parse_args()
    p = dict(PADRAO)
    if a.caso:
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
