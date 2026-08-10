#!/usr/bin/env python3
"""Construtor AUTOMATICO do caso de substituicoes do relatorio.

Elimina o ultimo passo criativo do agente: o caso de substituicoes (que na
Santa Tereza foram 116 chaves montadas a mao) agora e DERIVADO por regra a
partir das duas fontes de verdade — fatura conciliada + fluxos do motor.
O agente nao escreve mais nenhum texto nem numero do relatorio.

Envelope suportado (v1) — fora dele o script RECUSA e manda escalar (amarelo):
  - regime cativo, grupo A, modalidade verde;
  - itens relevantes (>=1% do total): consumo ponta, consumo fora ponta,
    demanda (bandeira/reativo cobrados sao aceitos se <1%);
  - sem ultrapassagem de demanda; demanda ideal < contratada;
  - BESS limitado por energia (padrao dos casos atuais).

Uso:
  python3 montar_caso_relatorio.py --fatura fat_conciliada.json \
      --caso-motor caso_bess.json --fluxo fluxo_bess.json \
      --caso-solar caso_solar.json --fluxo-solar fluxo_solar.json \
      --saida caso_relatorio.json
"""
import argparse
import json
import math
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
MODELO = os.path.join(AQUI, "..", "templates",
                      "modelo-aprovado-cliente-serra-verde-2025-06-b.html")

MODEL_ECO = [709933.58, 738330.92, 767864.16, 798578.73, 830521.88, 863742.75,
             898292.46, 934224.16, 971593.13, 1010456.85, 1050875.12,
             1092910.13, 1136626.53, 1182091.60, 1229375.26, 1278550.27,
             1329692.28, 1382879.97, 1438195.17, 1495722.98]
MODEL_ACUM = [-5500000.00, -4790066.42, -4051735.50, -3283871.34, -2485292.61,
              -1654770.73, -791027.98, 107264.48, 1041488.64, 2013081.76,
              3023538.61, 4074413.74, 5167323.87, 6303950.40, 7486042.00,
              8715417.26, 9993967.53, 11323659.81, 12706539.78, 14144734.95,
              15640457.93]


def fmt(v):
    return f"{v:,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")


def fint(v):
    return f"{round(v):,d}".replace(",", ".")


def morre(msg):
    sys.exit("FORA DO ENVELOPE SUPORTADO — escalar (amarelo): " + msg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fatura", required=True)
    ap.add_argument("--caso-motor", required=True)
    ap.add_argument("--fluxo", required=True)
    ap.add_argument("--caso-solar", required=True)
    ap.add_argument("--fluxo-solar", required=True)
    ap.add_argument("--saida", required=True)
    a = ap.parse_args()

    fat = json.load(open(a.fatura, encoding="utf-8"))
    cm = json.load(open(a.caso_motor, encoding="utf-8"))
    flx = json.load(open(a.fluxo, encoding="utf-8"))
    cs = json.load(open(a.caso_solar, encoding="utf-8"))
    fs = json.load(open(a.fluxo_solar, encoding="utf-8"))
    tpl = open(MODELO, encoding="utf-8").read()

    # ---------- envelope ----------
    if not fat.get("conciliada"):
        sys.exit("fatura nao conciliada (trava 1 primeiro).")
    peak = fat.get("funcao") == "peak_shaving"
    if fat.get("regime") not in ("cativo", "mercado_livre") \
            or (fat.get("modalidade") != "verde" and not peak) \
            or str(fat.get("grupo", "")).upper() != "A":
        morre("v2 cobre cativo/ML de grupo A verde; este caso e %s/%s/%s"
              % (fat.get("regime"), fat.get("grupo"), fat.get("modalidade")))
    for c in ["apelido", "leitura_anterior", "leitura_atual", "classe_display"]:
        if not fat.get(c):
            sys.exit("fatura sem campo %r (necessario ao relatorio)." % c)

    itens = {i["nome"].lower(): i for i in fat["itens"]}
    def item(*nomes):
        for n in nomes:
            for k, v in itens.items():
                if n in k:
                    return v
        return None
    ip = item("consumo ponta") or morre("sem item consumo ponta")
    ifp = item("fora ponta") or morre("sem item consumo fora ponta")
    idm = item("demanda") or morre("sem item demanda")
    TOTAL = fat["total"]
    reconhecidos = {id(ip), id(ifp), id(idm)}
    for i in fat["itens"]:
        ni = i["nome"].lower()
        if ("cosip" in ni or "ilum" in ni or "apcei" in ni
                or "reativo" in ni or "ultrapassagem" in ni):
            continue    # reconhecidos; sem linha propria no modelo (spread
                        # do estudo nao depende deles)
        if id(i) not in reconhecidos and i["valor"] / TOTAL >= 0.01:
            morre("item %r pesa %.1f%% do total e o modelo nao tem linha para "
                  "ele" % (i["nome"], i["valor"] / TOTAL * 100))

    CP, CFP = fat["consumo_ponta_kwh"], fat["consumo_fp_kwh"]
    CONS = CP + CFP
    V_P, V_FP, V_DEM = ip["valor"], ifp["valor"], idm["valor"]
    TAR_P = ip.get("tarifa") or morre("consumo ponta sem tarifa")
    TAR_FP = ifp.get("tarifa") or morre("fora ponta sem tarifa")
    DCON = fat["demanda_contratada_kw"]
    DRP = fat.get("demanda_registrada_ponta_kw") or 0
    DRF = fat.get("demanda_registrada_fp_kw") or 0
    DREG = max(DRP, DRF)
    DFAT = idm.get("kw") or DREG
    ultra_v = fat.get("ultrapassagem_valor") or 0.0
    ultra_kw = fat.get("ultrapassagem_kw") or 0
    if DREG > DCON * 1.05 and not ultra_v:
        morre("demanda registrada acima de contratada+5% sem item de "
              "ultrapassagem declarado")
    # coerencia caso do motor x fatura (fecha o ultimo furo)
    hfp_cm = cm.get("tusd_fp", 0) + cm.get("te_fp", 0)
    # peak shaving (azul): kWh de ponta = fora ponta; caso motor so tem hfp
    if cm.get("tusd_p") is None and cm.get("funcao") == "peak_shaving":
        hp_cm = hfp_cm
    else:
        hp_cm = cm.get("tusd_p", 0) + cm.get("te_p", 0)
    if abs(hp_cm - fat["tarifa_ponta_total"]) > 1e-6 or \
            abs(hfp_cm - fat["tarifa_fp_total"]) > 1e-6:
        sys.exit("caso do motor com tarifas != fatura (hp %.6f vs %.6f; hfp "
                 "%.6f vs %.6f)" % (hp_cm, fat["tarifa_ponta_total"],
                                    hfp_cm, fat["tarifa_fp_total"]))
    if abs(cm["consumo_ponta_desejado_kwh_mes"] - CP) > 0.5:
        sys.exit("caso do motor: consumo_ponta_desejado != consumo ponta da "
                 "fatura (%s vs %s)" % (cm["consumo_ponta_desejado_kwh_mes"], CP))

    # ---------- derivacoes da fatura ----------
    reat_p_v = fat.get("reativo_ponta_valor") or 0.0
    reat_fp_v = fat.get("reativo_fp_valor") or 0.0
    reat_v = reat_p_v + reat_fp_v
    benef = fat.get("beneficio_isencao_valor") or 0.0
    ml = fat.get("regime") == "mercado_livre"
    enf = fat.get("energia_nf") or {}
    if ml:
        for c in ["energia_nf", "distribuidora_display", "localidade",
                  "total_gasto_energia"]:
            if not fat.get(c):
                sys.exit("fatura ML sem campo %r." % c)
    util_fp = DRF / DCON * 100
    util_p = DRP / DCON * 100
    util = DREG / DCON * 100
    folga = DCON - DREG
    ideal = math.ceil(DREG / 1.05)
    if ultra_v:
        # contrato ESTOURADO: recomendacao e AUMENTAR para ideal; economia
        # liquida = ultrapassagem (paga em dobro) - custo do aumento
        red_kw = ideal - DCON
        eco_dem = ultra_v - red_kw * fat.get("tarifa_demanda_kw", 0.0)
    else:
        if ideal >= DCON:
            ideal = DCON          # contrato justo: recomendacao e MANTER
            red_kw = 0
        else:
            red_kw = DCON - ideal
        if red_kw == 0:
            eco_dem = 0.0
        elif fat.get("demanda_complemento_valor") is not None:
            eco_dem = fat["demanda_complemento_valor"]
        else:
            eco_dem = red_kw * (V_DEM / DFAT)
    spread = fat["tarifa_ponta_total"] / fat["tarifa_fp_total"]
    if spread > 10 and not peak:
        morre("spread %.1fx acima da faixa sanitaria" % spread)

    # ---------- derivacoes do motor ----------
    # APRESENTACAO = cenario Solar+BESS (decisao Dilkson 08/08: BESS sozinho
    # tem payback mais longo). Cards, graficos e tabelas de 20 anos mostram o
    # recomendado; o BESS-only fica na tabela comparativa de cenarios.
    AN_B = flx["fluxo_anual"]
    IND_B = flx["indicadores"]
    capex_bess = abs(AN_B[0])
    E1_b = AN_B[1]
    acum20_b = round(sum(AN_B), 2)
    n_bess = int(round(capex_bess / 550000.0))
    AN = fs["fluxo_anual"]
    E = AN[1:]
    ACUM = [AN[0]]
    for v in E:
        ACUM.append(round(ACUM[-1] + v, 2))
    IND = fs["indicadores"]
    E1 = E[0]
    mensal = E1 / 12
    fat_bess = TOTAL - mensal
    red = mensal / TOTAL * 100
    if IND.get("payback_meses") is None or IND_B.get("payback_meses") is None:
        morre("payback inexistente em 20 anos — estudo inviavel nao gera "
              "relatorio de oportunidade")
    pb = IND["payback_meses"] / 12
    pb_b = IND_B["payback_meses"] / 12
    acum20 = ACUM[20]
    ciclo = flx["dimensionamento"]["energia_util_ciclo_kwh"]
    e_dia = CP / 21.0
    if peak:
        un_e = math.ceil(e_dia / (ciclo * 0.645))   # cobre ponta ate ano 20
    else:
        un_e = math.ceil(e_dia / ciclo)
    un_p = math.ceil(DRP / 241.0) if DRP else 1
    if un_e < un_p:
        morre("BESS limitado por potencia — redigir com Dilkson (v1 cobre "
              "limitado por energia)")
    ISOL = fs["indicadores"]
    E1s = fs["fluxo_anual"][1]
    kwp = cs["solar_kwp"]
    capex_solar = cs["capex_solar_total"]

    # ---------- substituicoes ----------
    S = {}

    def sub(de, para):
        if de not in tpl:
            sys.exit("chave do modelo sumiu (modelo trocado?): %r" % de[:60])
        S[de] = para

    def rx(pat, para, flags=0):
        m = re.search(pat, tpl, flags)
        if not m:
            sys.exit("regex sem match no modelo: %r" % pat[:60])
        sub(m.group(0), para)

    cliente_u = fat["cliente"].upper()
    nome_analise = fat.get("nome_analise") or fat["cliente"]
    sub("Energética — Serra Verde", "Energética — " + fat["apelido"])
    sub("AGROINDUSTRIAL SERRA VERDE LTDA", cliente_u)
    sub("Agroindustrial Serra Verde", nome_analise)
    sub("0188872-2", str(fat["uc"]))
    sub("Agroindustrial / rural", fat["classe_display"])
    if fat.get("distribuidora_display") and \
            fat["distribuidora_display"] != "Roraima Energia S.A.":
        sub("Roraima Energia S.A.", fat["distribuidora_display"])
    if fat.get("localidade") and fat["localidade"] != "Boa Vista/RR":
        sub("Boa Vista/RR", fat["localidade"])
    if peak:
        rx(r"A energia fora ponta concentra a maior parte do valor, mas a "
           r"ponta representa custo desproporcional: somente",
           "Na modalidade AZUL o peso está na DEMANDA: os contratos de "
           "demanda respondem por %s%% do valor do fio, e a demanda de PONTA "
           "custa R$ %s/kW — o alvo do PEAK SHAVING. O consumo de ponta é "
           "somente" % (fmt(V_DEM / TOTAL * 100),
                        fmt(fat["tarifa_kw_ponta_medida"])))
        sub("Isso explica por que a oportunidade está menos na demanda "
            "contratada e mais no deslocamento/gestão do custo de ponta.",
            "Isso explica por que a oportunidade aqui é a ELIMINAÇÃO da "
            "demanda de ponta com BESS (PEAK SHAVING), e não o deslocamento "
            "de consumo (load shifting).")
        rx(r"O ponto de maior atenção está no custo de ponta\. Embora a "
           r"ponta represente apenas",
           "O ponto de maior atenção está na DEMANDA de ponta: R$ %s por "
           "mês (%s kW a R$ %s/kW). A função recomendada é PEAK SHAVING — "
           "o consumo de ponta representa apenas"
           % (fmt(fat["demanda_ponta_valor_total"]),
              fint(fat["demanda_registrada_ponta_kw"]),
              fmt(fat["tarifa_kw_ponta_medida"])))
        sub("fatura bem controlada em demanda, mas com custo de ponta muito "
            "superior ao fora ponta",
            "fatura de modalidade azul com demanda de ponta muito cara "
            "(R$ %s/kW)" % fmt(fat["tarifa_kw_ponta_medida"]))
    if ml:
        sub("fatura cativa", "fatura Mercado Livre (TUSD + ACL)")
        sub("Custo médio total", "Custo médio do fio (TUSD)")
    sub("06/2025", fat["referencia"])
    sub("21/07/2025", fat["vencimento"])
    sub("31/05/2025", fat["leitura_anterior"])
    sub("30/06/2025", fat["leitura_atual"])
    sub("R$ 291.154,80", "R$ " + fmt(TOTAL))
    sub("548.413 kWh", fint(CONS) + " kWh")
    efetivo = (V_P + V_FP + V_DEM) / CONS
    # ordem importa: a chave 0,52 e consumida ANTES da 0,53 criar um novo
    # "R$ 0,52/kWh" (colisao real no caso Cantuaria: total/consumo = 0,52)
    sub("R$ 1,77/kWh", "R$ %s/kWh" % fmt(TAR_P))
    sub("R$ 0,39/kWh", "R$ %s/kWh" % fmt(TAR_FP))
    if fmt(efetivo) == "0,53" and fmt(TOTAL / CONS) != "0,53":
        sys.exit("colisao de cadeia 0,52/0,53 nos custos medios — revisar")
    sub("R$ 0,52/kWh", "R$ %s/kWh" % fmt(efetivo))
    sub("R$ 0,53/kWh", "R$ %s/kWh" % fmt(TOTAL / CONS))

    # destaques (frases por regra)
    if ultra_v:
        f_dem = ("demanda contratada ESTOURADA (%s kW registrados para %s "
                 "contratados — ultrapassagem de R$ %s no ciclo)"
                 % (fint(DREG), fint(DCON), fmt(ultra_v)))
    elif util < 90:
        f_dem = "demanda contratada com folga (utilização de %s%%)" % fmt(util)
    else:
        f_dem = "demanda contratada bem utilizada (%s%%)" % fmt(util)
    if reat_v == 0:
        f_rea = "sem cobrança de energia reativa nesta referência"
    elif reat_v < TOTAL * 0.001:
        f_rea = ("cobrança de energia reativa desprezível no ciclo (R$ %s)"
                 % fmt(reat_v))
    else:
        f_rea = ("cobrança de energia reativa de %s%% da fatura"
                 % fmt(reat_v / TOTAL * 100))
    bnc = next((n for n in fat.get("nao_cobrados", [])
                if "bandeira" in n["nome"].lower()), None)
    fb = item("bandeira")
    if fb:
        f_ban = "bandeira com impacto de R$ %s no ciclo" % fmt(fb["valor"])
    elif bnc:
        f_ban = "bandeira verde no ciclo (sem custo adicional)"
    else:
        f_ban = "sem adicional de bandeira no ciclo"
    f_ultra = ("" if ultra_v else ", sem ultrapassagem identificada")
    if peak:
        dpv = fat["demanda_ponta_valor_total"]
        rx(r"demanda contratada bem utilizada.*?BESS/Solar\+BESS\.",
           "modalidade AZUL: o custo da ponta está na DEMANDA — R$ %s/mês "
           "(%s kW medidos a R$ %s/kW)%s; %s; %s; função recomendada: "
           "PEAK SHAVING com BESS/Solar+BESS (não é load shifting)."
           % (fmt(dpv), fint(fat["demanda_registrada_ponta_kw"]),
              fmt(fat["tarifa_kw_ponta_medida"]), f_ultra, f_rea, f_ban),
           re.S)
    else:
        rx(r"demanda contratada bem utilizada.*?BESS/Solar\+BESS\.",
           "%s%s; %s; %s; a ponta custa %sx a fora "
           "ponta e abre oportunidade para BESS/Solar+BESS."
           % (f_dem, f_ultra, f_rea, f_ban,
              ("%.1f" % spread).replace(".", ",")), re.S)

    # secao 3 — demanda
    sub("<td>Demanda</td><td>1.149 kW</td>", "<td>Demanda</td><td>%s kW</td>"
        % fint(DFAT))
    sub("1.198 kW", fint(DCON) + " kW")
    sub("1.149,8 kW", ("%.1f" % (ideal * 1.05)).replace(".", ",") + " kW")
    sub("1.149 kW", fint(DREG) + " kW")
    sub("1.020 kW", fint(DRP) + " kW")
    sub("1.079 kW", fint(fat.get("demanda_ref_potencia_kw", DRP)) + " kW")
    sub("95,91%", fmt(util_fp) + "%")
    sub("90,07%", fmt(util_p) + "%")
    sub("1.095 kW", fint(ideal) + " kW")
    sub("103 kW (8,60%)", "%s kW (%s%%)" % (fint(red_kw),
                                            fmt(red_kw / DCON * 100)))
    sub("R$ 1.368,87", "R$ " + fmt(eco_dem))
    sub("R$ 16.426,44", "R$ " + fmt(eco_dem * 12))
    if ultra_v:
        sub("Não identificada", "Sim — %s kW" % fint(ultra_kw))
        sub("Sem ultrapassagem identificada.",
            "Ultrapassagem de %s kW faturada em dobro no ciclo (R$ %s)."
            % (fint(ultra_kw), fmt(ultra_v)))
        sub("Redução preliminar", "Ajuste preliminar (aumento)")
        sub("Contrato bem utilizado no mês.", "Contrato ESTOURADO no mês.")
        sub("Não há folga excessiva neste mês.",
            "Registrada acima do contrato — excedente pago em dobro.")
        sub("bem dimensionada neste mês, sem ultrapassagem. Manter histórico "
            "antes de qualquer alteração contratual.",
            "com ULTRAPASSAGEM neste ciclo (%s kW registrados para %s "
            "contratados). Readequação contratual recomendada — economia "
            "líquida estimada de R$ %s/mês."
            % (fint(DREG), fint(DCON), fmt(eco_dem)))
        sub("fatura bem controlada em demanda, mas com custo de ponta muito "
            "superior ao fora ponta",
            "fatura com ULTRAPASSAGEM de demanda e custo de ponta muito "
            "superior ao fora ponta")
        rx(r"apresenta boa utilização da demanda contratada e não demonstra, "
           r"nesta referência, uma dor principal de ultrapassagem\.",
           "apresenta ULTRAPASSAGEM de demanda nesta referência (%s kW "
           "registrados para %s kW contratados) — readequação contratual "
           "recomendada." % (fint(DREG), fint(DCON)))
    if not ultra_v and util < 90:
        sub("Contrato bem utilizado no mês.", "Contrato com folga no mês.")
        sub("Não há folga excessiva neste mês.",
            "Folga de %s kW sobre o maior registro." % fint(folga))
        sub("bem dimensionada neste mês, sem ultrapassagem. Manter histórico "
            "antes de qualquer alteração contratual.",
            "com folga neste mês (%s kW registrados para %s kW contratados), "
            "sem ultrapassagem. Manter histórico antes de qualquer ajuste "
            "contratual." % (fint(DREG), fint(DCON)))
        sub("fatura bem controlada em demanda, mas com custo de ponta muito "
            "superior ao fora ponta",
            "fatura com folga de demanda contratada e custo de ponta muito "
            "superior ao fora ponta")
        rx(r"apresenta boa utilização da demanda contratada e não demonstra, "
           r"nesta referência, uma dor principal de ultrapassagem\.",
           "apresenta demanda contratada com folga (utilização de %s%% no "
           "mês) e não demonstra, nesta referência, ultrapassagem."
           % fmt(util))

    # secao 4 — consumo
    sub("42.835 kWh", fint(CP) + " kWh")
    sub("505.578 kWh", fint(CFP) + " kWh")
    sub("7,81%", fmt(CP / CONS * 100) + "%")
    sub("R$ 75.726,71", "R$ " + fmt(V_P))
    sub("R$ 195.522,17", "R$ " + fmt(V_FP))
    sub("R$ 15.270,21", "R$ " + fmt(V_DEM))
    pc_p, pc_fp, pc_dem = (V_P / TOTAL * 100, V_FP / TOTAL * 100,
                           V_DEM / TOTAL * 100)
    sub("26,01%", fmt(pc_p) + "%")
    sub("67,15%", fmt(pc_fp) + "%")
    sub("5,24%", fmt(pc_dem) + "%")

    # secao 5 — reativo / beneficio / bandeira
    pc_rea = reat_v / TOTAL * 100
    pc_ben = benef / TOTAL * 100
    sub("R$ 3.984,50", "R$ " + fmt(reat_v))
    sub("R$ 521,16", "R$ " + fmt(reat_p_v))
    sub("R$ 3.463,34", "R$ " + fmt(reat_fp_v))
    sub("R$ 72.788,70", "R$ " + fmt(benef))
    sub("1,37%", fmt(pc_rea) + "%")
    sub("25,00%", fmt(pc_ben) + "%")
    if fb:
        sub("Verificar na tarifa", "R$ " + fmt(fb["valor"]))
    elif bnc:
        sub("Verificar na tarifa", "Verde — R$ 0,00")
    else:
        sub("Verificar na tarifa", "Sem adicional")
    if reat_v == 0:
        sub("Baixo impacto isolado.", "Sem cobrança nesta referência.")
        sub("Maior parte da cobrança reativa.", "Ufer zerado no ciclo.")
        sub("Monitorar; não é a principal dor neste mês.",
            "Fator de potência adequado neste mês.")
        sub("cobrança existe, mas com baixo peso percentual. Recomenda-se "
            "monitoramento do fator de potência.",
            "sem cobrança nesta referência (Ufer zerado). Recomenda-se manter "
            "o monitoramento do fator de potência.")
        rx(r"A cobrança de reativo aparece em patamar baixo, com peso de",
           "Não houve cobrança de energia reativa no ciclo, com peso de")
        sub("rotina financeira e reativo", "rotina financeira e demanda "
            "contratada")
    if benef == 0:
        sub("Valor relevante e deve ser protegido.",
            "PIS/COFINS a alíquota zero nesta fatura.")
        sub("representa parcela relevante da fatura e deve ser acompanhado "
            "para evitar perda de vantagem tributária.",
            "PIS/COFINS a alíquota zero nesta referência; acompanhar a "
            "condição para evitar perda de vantagem tributária.")

    # secao 7 — estudo
    sub("R$ 59.161,13", "R$ " + fmt(mensal))
    sub("R$ 709.933,58", "R$ " + fmt(E1))
    sub("R$ 231.993,67", "R$ " + fmt(fat_bess))
    sub("20,32%", fmt(red) + "%")
    sub("<b>1.428</b>", "<b>%s</b>" % fint(e_dia))
    rx(r"<span>Por energia</span><br><b>\d+</b>",
       "<span>Por energia</span><br><b>%d</b>" % un_e)
    rx(r"<span>Por potência</span><br><b>\d+</b>",
       "<span>Por potência</span><br><b>%d</b>" % un_p)
    rx(r"<span>Preliminar</span><br><b>\d+</b>",
       "<span>Preliminar</span><br><b>%d</b>" % max(un_e, un_p))
    sub("10 unidades LUNA2000-241", "%d unidades LUNA2000-241" % n_bess)
    # linha "Apenas BESS" da tabela de cenarios: valores do BESS-only
    sub("<td>R$ 5.500.000,00</td><td>R$ 709.933,58</td><td>6,9 anos</td>",
        "<td>R$ %s</td><td>R$ %s</td><td>%s anos</td>"
        % (fmt(capex_bess), fmt(E1_b), ("%.1f" % pb_b).replace(".", ",")))
    sub("R$ -5.500.000,00", "R$ -" + fmt(abs(AN[0])))   # ano 0 (Solar+BESS)
    # DECISAO DILKSON 08/08: sem TMA no relatorio — cartoes simples, iguais
    # as tabelas (TIR, payback simples, acumulado 20 anos)
    sub("VPL com TMA", "Acumulado em 20 anos")
    sub("Payback descontado", "Payback")
    sub("VPL R$ 6.866.243,04; TIR 15,25% em 20 anos.",
        "TIR %s%% ao ano; payback %s anos; acumulado de R$ %s em 20 anos."
        % (fmt(IND_B["tir_aa"] * 100), ("%.1f" % pb_b).replace(".", ","),
           fmt(acum20_b)))
    sub("R$ 6.866.243,04", "R$ " + fmt(acum20))
    sub("15,25%", fmt(IND["tir_aa"] * 100) + "%")
    sub("8,4 anos", ("%.1f anos" % pb).replace(".", ","))
    alvo_prem = "reajuste tarifário de 8% ao ano"
    if peak:
        alvo_prem += ("; contrato de demanda de ponta remanescente de 30 kW "
                      "(demanda mínima regulatória — REN ANEEL 1.000/2021); "
                      "função PEAK SHAVING: o BESS assume a carga da janela "
                      "de ponta e elimina a demanda de ponta medida")
    if ml:
        alvo_prem += ("; valores de kWh considerando os custos efetivos de "
                      "TUSD + energia (TE ACL); usina dimensionada para "
                      "recarga do BESS até as 15h no pior mês de irradiação")
    sub("reajuste tarifário de 4% ao ano, TMA de 5% ao ano", alvo_prem)
    if peak:
        sub("limitado por potência, não apenas por energia.",
            "dimensionado para cobrir 100%% da janela de ponta ATÉ O ANO 20 "
            "(degradação SOH a 64,5%%), com potência de %s kW para um pico "
            "de %s kW." % (fint(n_bess * 241),
                           fint(fat["demanda_registrada_ponta_kw"])))
    else:
        sub("limitado por potência, não apenas por energia.",
            "limitado por energia, com folga de potência para a demanda de "
            "ponta registrada.")
    acum20_s = round(sum(fs["fluxo_anual"]), 2)
    rx(r"<td>A dimensionar</td><td>A simular</td><td>A simular</td><td>[^<]*</td>",
       "<td>R$ %s</td><td>R$ %s</td><td>%s anos</td><td>%d unidades "
       "LUNA2000-241 + usina solar de %s kWp dedicada à carga do BESS. TIR "
       "%s%% ao ano; acumulado de R$ %s em 20 anos.</td>"
       % (fmt(capex_bess + capex_solar), fmt(E1s),
          ("%.1f" % (ISOL["payback_meses"] / 12)).replace(".", ","), n_bess,
          ("%g" % kwp).replace(".", ","), fmt(ISOL["tir_aa"] * 100),
          fmt(acum20_s)))
    for i in range(1, 20):
        sub("R$ " + fmt(MODEL_ECO[i]), "R$ " + fmt(E[i]))
        sub("R$ " + fmt(MODEL_ACUM[i]), "R$ " + fmt(ACUM[i]))
    sub("R$ 15.640.457,93", "R$ " + fmt(ACUM[20]))

    # ---------- geometria dos 5 SVGs ----------
    svgs = re.findall(r"<svg.*?</svg>", tpl, flags=re.S)
    if len(svgs) != 5:
        sys.exit("modelo sem os 5 svgs esperados")
    H3, PLOT = 183.0, 159.0

    def barras(s, bars, ticks_old=None, ticks_new=None, pcts=None):
        if ticks_old:
            for o, n in zip(ticks_old, ticks_new):
                k = '">%s</text>' % o
                if s.count(k) != 1:
                    sys.exit("tick ambiguo: %r" % o)
                s = s.replace(k, '">%s</text>' % n)
        for rect_old, h, y, lab_old, lab_new in bars:
            m = re.search(rect_old, s)
            if not m:
                sys.exit("rect nao achado: %r" % rect_old[:60])
            old = m.group(0)
            new = re.sub(r'y="[0-9.\-]+"', 'y="%.1f"' % y, old, count=1)
            new = re.sub(r'height="[0-9.]+"', 'height="%.1f"' % h, new, count=1)
            s = s.replace(old, new, 1)
            if lab_old is not None:
                mlab = re.search(r'(<text x="[0-9.]+" y=")([0-9.]+)("[^>]*>)'
                                 + re.escape(lab_old) + r"(</text>)", s)
                if not mlab:
                    sys.exit("label nao achado: %r" % lab_old)
                s = s.replace(mlab.group(0), mlab.group(1) + "%.1f" % (y - 5)
                              + mlab.group(3) + lab_new + mlab.group(4), 1)
        for o, n in (pcts or []):
            s = s.replace(">%s<" % o, ">%s<" % n)
        return s

    def h_(v, ax):
        return round(v / ax * PLOT, 1) if v else 0.0

    def y_(v, ax):
        return round(H3 - (v / ax * PLOT), 1) if v else H3

    ax0 = CFP * 1.18
    s0 = barras(svgs[0], [
        (re.escape('<rect x="156.0" y="48.3" width="46.0" height="134.7" rx="5" fill="#2563eb"/>'),
         h_(CFP, ax0), y_(CFP, ax0), "505.578", fint(CFP)),
        (re.escape('<rect x="218.0" y="171.6" width="46.0" height="11.4" rx="5" fill="#f59e0b"/>'),
         h_(CP, ax0), y_(CP, ax0), "42.835", fint(CP)),
        (re.escape('<rect x="280.0" y="182.7" width="46.0" height="0.3" rx="5" fill="#7c3aed"/>'),
         h_(DFAT, ax0), y_(DFAT, ax0), "1.149", fint(DFAT))],
        ["198.861", "397.721", "596.582"],
        [fint(ax0 / 3), fint(ax0 * 2 / 3), fint(ax0)],
        [("92,19%", fmt(CFP / CONS * 100) + "%"),
         ("7,81%", fmt(CP / CONS * 100) + "%"),
         ("0,23%", fmt(DFAT / CFP * 100) + "%")])
    ax1 = max(V_FP, V_P, V_DEM, reat_v, benef) * 1.18
    s1 = barras(svgs[1], [
        (re.escape('<rect x="94.0" y="48.3" width="46.0" height="134.7" rx="5" fill="#2563eb"/>'),
         h_(V_FP, ax1), y_(V_FP, ax1), "R$ 195.522,17", "R$ " + fmt(V_FP)),
        (re.escape('<rect x="156.0" y="130.8" width="46.0" height="52.2" rx="5" fill="#f59e0b"/>'),
         h_(V_P, ax1), y_(V_P, ax1), "R$ 75.726,71", "R$ " + fmt(V_P)),
        (re.escape('<rect x="218.0" y="172.5" width="46.0" height="10.5" rx="5" fill="#7c3aed"/>'),
         h_(V_DEM, ax1), y_(V_DEM, ax1), "R$ 15.270,21", "R$ " + fmt(V_DEM)),
        (re.escape('<rect x="280.0" y="180.3" width="46.0" height="2.7" rx="5" fill="#dc2626"/>'),
         h_(reat_v, ax1), y_(reat_v, ax1), "R$ 3.984,50", "R$ " + fmt(reat_v)),
        (re.escape('<rect x="342.0" y="132.8" width="46.0" height="50.2" rx="5" fill="#0ea5e9"/>'),
         h_(benef, ax1), y_(benef, ax1), "R$ 72.788,70", "R$ " + fmt(benef))],
        ["R$ 76.905,39", "R$ 153.810,77", "R$ 230.716,16"],
        ["R$ " + fmt(ax1 / 3), "R$ " + fmt(ax1 * 2 / 3), "R$ " + fmt(ax1)],
        [("67,15%", fmt(pc_fp) + "%"), ("26,01%", fmt(pc_p) + "%"),
         ("5,24%", fmt(pc_dem) + "%"), ("1,37%", fmt(pc_rea) + "%"),
         ("25,00%", fmt(pc_ben) + "%")])
    ax2 = TOTAL * 1.18
    s2 = barras(svgs[2], [
        (re.escape('<rect x="156.0" y="48.3" width="46.0" height="134.7" rx="5" fill="#0f5740"/>'),
         h_(TOTAL, ax2), y_(TOTAL, ax2), "R$ 291.154,80", "R$ " + fmt(TOTAL)),
        (re.escape('<rect x="218.0" y="75.6" width="46.0" height="107.4" rx="5" fill="#16a34a"/>'),
         h_(fat_bess, ax2), y_(fat_bess, ax2), "R$ 231.993,67",
         "R$ " + fmt(fat_bess)),
        (re.escape('<rect x="280.0" y="155.6" width="46.0" height="27.4" rx="5" fill="#2563eb"/>'),
         h_(mensal, ax2), y_(mensal, ax2), "R$ 59.161,13", "R$ " + fmt(mensal))],
        ["R$ 114.520,89", "R$ 229.041,78", "R$ 343.562,66"],
        ["R$ " + fmt(ax2 / 3), "R$ " + fmt(ax2 * 2 / 3), "R$ " + fmt(ax2)],
        [("79,68%", fmt(100 - red) + "%"), ("20,32%", fmt(red) + "%")])
    ax3 = E[19] * 1.12
    s3 = svgs[3]
    rects3 = re.findall(r'<rect x="[0-9.]+" y="[0-9.]+" width="[0-9.]+" '
                        r'height="[0-9.]+" rx="3" fill="[^"]+"/>', s3)
    for i, old in enumerate(rects3):
        hh = round(E[i] / ax3 * 246.0, 1)
        new = re.sub(r'y="[0-9.]+"', 'y="%.1f"' % (272.0 - hh), old, count=1)
        new = re.sub(r'height="[0-9.]+"', 'height="%.1f"' % hh, new, count=1)
        s3 = s3.replace(old, new, 1)
    for o, n in zip(["R$ 418.802,43", "R$ 837.604,87", "R$ 1.256.407,30",
                     "R$ 1.675.209,74"],
                    [fmt(ax3 / 4), fmt(ax3 / 2), fmt(ax3 * 3 / 4), fmt(ax3)]):
        s3 = s3.replace('">%s</text>' % o, '">R$ %s</text>' % n)
    ax4 = abs(ACUM[20])
    s4 = svgs[4]
    rects4 = re.findall(r'<rect x="[0-9.]+" y="[0-9.]+" width="[0-9.]+" '
                        r'height="[0-9.]+" rx="3" fill="[^"]+"/>', s4)
    f_neg = re.search(r'fill="([^"]+)"', rects4[0]).group(1)
    f_pos = re.search(r'fill="([^"]+)"', rects4[-1]).group(1)
    for i, old in enumerate(rects4):
        v = ACUM[i]
        ht = abs(v) / ax4 * 123.0
        y = 149.0 if v < 0 else round(149.0 - ht, 1)
        new = re.sub(r'y="[0-9.]+"', 'y="%.1f"' % y, old, count=1)
        new = re.sub(r'height="[0-9.]+"', 'height="%.1f"' % round(max(ht, 2.0), 1),
                     new, count=1)
        new = re.sub(r'fill="[^"]+"', 'fill="%s"' % (f_neg if v < 0 else f_pos),
                     new, count=1)
        s4 = s4.replace(old, new, 1)
    for o, n in zip(["R$ -15.640.457,93", "R$ -7.820.228,96",
                     "R$ 7.820.228,96", "R$ 15.640.457,93"],
                    ["R$ -" + fmt(ax4), "R$ -" + fmt(ax4 / 2),
                     "R$ " + fmt(ax4 / 2), "R$ " + fmt(ax4)]):
        s4 = s4.replace('">%s</text>' % o, '">%s</text>' % n)
    for old, new in zip(svgs, [s0, s1, s2, s3, s4]):
        if old != new:
            S[old] = new

    # ---------- O&M visivel no relatorio (decisao Dilkson 08/08) ----------
    om_b = flx["ano1_base"]["om_bess"]
    om_s = fs["solar"]["om_ano1"]
    om1 = om_b + om_s
    om20 = sum(om1 * 1.03 ** i for i in range(20))
    bloco_om = (
        "<h3>Custos de opera\u00e7\u00e3o e manuten\u00e7\u00e3o (O&amp;M)</h3>"
        "<p>Para o sistema entregar a economia projetada pelos 20 anos, a "
        "opera\u00e7\u00e3o e manuten\u00e7\u00e3o \u00e9 parte do investimento "
        "\u2014 monitoramento, limpeza, inspe\u00e7\u00f5es e manuten\u00e7\u00e3o "
        "preventiva do BESS e da usina solar. Estes custos j\u00e1 est\u00e3o "
        "descontados de TODOS os valores de economia deste relat\u00f3rio.</p>"
        "<table><thead><tr><th>Item</th><th>Custo ano 1</th><th>Base de "
        "c\u00e1lculo</th><th>Reajuste</th></tr></thead><tbody>"
        "<tr><td>O&amp;M BESS</td><td>R$ %s</td><td>1%% do CAPEX do BESS ao "
        "ano</td><td>3%% a.a.</td></tr>"
        "<tr><td>O&amp;M Solar</td><td>R$ %s</td><td>1%% do CAPEX da usina ao "
        "ano</td><td>3%% a.a.</td></tr>"
        "<tr><td><b>Total ano 1</b></td><td><b>R$ %s</b></td><td>\u2248 R$ %s "
        "por m\u00eas</td><td>\u2014</td></tr></tbody></table>"
        "<p>O&amp;M total projetado nos 20 anos: <b>R$ %s</b>. A economia "
        "l\u00edquida acumulada de R$ %s j\u00e1 considera esse custo.</p>"
        % (fmt(om_b), fmt(om_s), fmt(om1), fmt(om1 / 12), fmt(om20),
           fmt(acum20)))
    manter = []
    if "roraima" in fat["distribuidora"].lower():
        manter = ["Roraima", "Boa Vista"]
    insercoes = []
    if peak:
        bloco_peak = (
            "<h3>Função do sistema: PEAK SHAVING (não é load shifting)</h3>"
            "<p>Nas demais unidades da rede o BESS faz <b>load shifting</b>: "
            "compra energia barata fora ponta e devolve na ponta cara. "
            "Nesta unidade (modalidade AZUL) o consumo custa o MESMO na "
            "ponta e fora dela — o custo está na <b>demanda de ponta: "
            "R$ %s/kW</b>. A função aqui é <b>PEAK SHAVING</b>: o BESS "
            "assume 100%% da carga na janela de ponta, a demanda de ponta "
            "medida vai a ~zero e o contrato cai de %s kW para o mínimo "
            "regulatório de 30 kW (REN ANEEL 1.000/2021). A economia é a "
            "conta de demanda de ponta que deixa de existir: <b>R$ %s por "
            "mês</b>.</p>"
            "<p>Requisitos de projeto: SOC 100%% no início de cada janela "
            "de ponta; recarga limitada à folga de demanda fora ponta + "
            "geração solar; dimensionamento com garantia de cobertura até "
            "o ano 20 (degradação SOH).</p>"
            % (fmt(fat["tarifa_kw_ponta_medida"]),
               fint(fat["demanda_contratada_kw"]),
               fmt(fat["demanda_ponta_valor_total"]
                   - 30 * fat.get("tarifa_kw_ponta_nc", 0))))
        insercoes.append({"antes_de": "<h3>Economia anual projetada",
                          "html": bloco_peak})
    if ml:
        bloco_ml = (
            "<h3>Mercado Livre — custo efetivo da energia (TUSD + TE ACL)"
            "</h3>"
            "<p>Unidade no Mercado Livre: paga o uso do fio (TUSD) à "
            "distribuidora e compra a energia por contrato ACL. Os valores "
            "por kWh deste estudo consideram os CUSTOS EFETIVOS: TUSD com "
            "impostos + energia da nota fiscal de fornecimento (valor total "
            "com impostos ÷ volume).</p>"
            "<table><thead><tr><th>Componente</th><th>Valor</th><th>Base de "
            "cálculo</th></tr></thead><tbody>"
            "<tr><td>Energia ACL — %s</td><td>R$ %s/kWh</td>"
            "<td>NF R$ %s ÷ %s MWh</td></tr>"
            "<tr><td><b>Custo efetivo ponta</b></td><td><b>R$ %s/kWh</b></td>"
            "<td>TUSD %s + energia</td></tr>"
            "<tr><td>Custo efetivo fora ponta</td><td>R$ %s/kWh</td>"
            "<td>TUSD %s + energia</td></tr>"
            "<tr><td>Gasto total do mês (fio + notas)</td><td>R$ %s</td>"
            "<td>referência %s</td></tr></tbody></table>"
            "<p>Créditos APCEI (benefício da energia incentivada), débitos e "
            "lançamentos de outras competências não integram o estudo.</p>"
            % (enf.get("fornecedor", "ACL"),
               ("%.6f" % enf["preco_kwh"]).replace(".", ","),
               fmt(enf["total"]),
               ("%.3f" % enf["mwh"]).replace(".", ","),
               ("%.6f" % fat["tarifa_ponta_total"]).replace(".", ","),
               ("%.6f" % TAR_P).replace(".", ","),
               ("%.6f" % fat["tarifa_fp_total"]).replace(".", ","),
               ("%.6f" % TAR_FP).replace(".", ","),
               fmt(fat["total_gasto_energia"]), fat["referencia"]))
        insercoes.append({"antes_de": "<h3>Economia anual projetada",
                          "html": bloco_ml})
    insercoes.append({"antes_de": "<h3>Economia anual projetada",
                      "html": bloco_om})
    caso = {"substituicoes": S, "manter_marcadores": manter,
            "insercoes": insercoes}
    json.dump(caso, open(a.saida, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("caso de relatorio gerado automaticamente: %d substituicoes -> %s"
          % (len(S), a.saida))
    return 0


if __name__ == "__main__":
    sys.exit(main())
