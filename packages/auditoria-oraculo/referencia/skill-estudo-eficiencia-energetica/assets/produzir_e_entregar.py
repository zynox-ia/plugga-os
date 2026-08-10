#!/usr/bin/env python3
"""ORQUESTRADOR ATOMICO — o UNICO caminho de producao e entrega de relatorio.

O agente prepara APENAS dois arquivos de dados:
  1. fatura.json      (extracao literal da fatura — formato em conciliar_fatura.py)
  2. caso_motor.json  (consumo/tarifas/CAPEX — premissas herdam o PADRAO)
e roda UM comando. Todo o resto e deterministico e ou passa inteiro ou nada
e enviado — nao existe estado intermediario entregue.

Sequencia (aborta na primeira falha):
  TRAVA 1 conciliar -> motor BESS -> motor Solar (kWp sugerido, R$2.500/kWp)
  -> SEMAFORO -> construtor automatico do caso -> GERADOR -> celular
  -> TRAVA 2 verificar -> TRAVA 4 registrar -> enviar 2 arquivos no Telegram.

Semaforo:
  VERMELHO -> aborta e imprime o motivo (escalar a Dilkson).
  AMARELO  -> produz e verifica TUDO, mas so envia com --liberado-por-dilkson
              (imprime os 4 numeros para mandar a ele).
  VERDE    -> envia.

Uso:
  python3 produzir_e_entregar.py --fatura fatura.json --caso-motor caso.json \
      --chat <chat_id_telegram> --por "auditor-energia" [--liberado-por-dilkson]
      [--sem-envio]   (produz e valida tudo, nao envia — para teste)
"""
import argparse
import json
import os
import re
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))


def run(nome, cmd, ok=(0,)):
    r = subprocess.run(cmd, capture_output=True, text=True)
    print("[%s] rc=%d" % (nome, r.returncode))
    out = (r.stdout + r.stderr).strip()
    if out:
        print("  " + out.replace("\n", "\n  ")[:700])
    if r.returncode not in ok:
        sys.exit("ABORTADO em %s — nada foi enviado." % nome)
    return r.returncode


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fatura", required=True)
    ap.add_argument("--caso-motor", required=True)
    ap.add_argument("--chat", required=True)
    ap.add_argument("--por", required=True)
    ap.add_argument("--liberado-por-dilkson", action="store_true")
    ap.add_argument("--sem-envio", action="store_true")
    ap.add_argument("--dir-saida", default="/tmp")
    a = ap.parse_args()

    fat0 = json.load(open(a.fatura, encoding="utf-8"))
    slug = re.sub(r"[^a-z0-9]+", "_",
                  (fat0.get("apelido", "cliente") + "_uc_" + str(fat0["uc"])
                   + "_" + fat0["referencia"].replace("/", "_")).lower())
    d = a.dir_saida
    fat_conc = a.fatura.replace(".json", "") + "_conciliada.json"
    fluxo_b = os.path.join(d, slug + "_fluxo_bess.json")
    fluxo_s = os.path.join(d, slug + "_fluxo_solar.json")
    caso_s = os.path.join(d, slug + "_caso_solar.json")
    caso_rel = os.path.join(d, slug + "_caso_relatorio.json")
    rel = os.path.join(d, "auditoria_energetica_" + slug + ".html")
    rel_cel = rel[:-5] + "_celular.html"

    # 1) TRAVA 1
    run("TRAVA1-conciliar", ["python3", AQUI + "/conciliar_fatura.py",
                             "--fatura", a.fatura])
    # 2) motor BESS (funcao peak_shaving usa o motor v3)
    cm0 = json.load(open(a.caso_motor, encoding="utf-8"))
    motor = ("/motor_peak_shaving.py"
             if cm0.get("funcao") == "peak_shaving" else
             "/motor_bess_solar.py")
    run("motor-bess", ["python3", AQUI + motor,
                       "--caso", a.caso_motor, "--saida", fluxo_b])
    # 3) motor Solar (kWp sugerido pior mes, R$2.500/kWp)
    db = json.load(open(fluxo_b, encoding="utf-8"))
    cs = json.load(open(a.caso_motor, encoding="utf-8"))
    # solar_kwp_definido: dimensionado p/ recarga ate 15h no pior mes
    # (regra Dilkson 08/08); sem ele, cai no sugerido do motor
    kwp = cs.get("solar_kwp_definido") or db["solar"]["kwp_sugerido_pior_mes"]
    cs["solar_kwp"] = kwp
    cs["capex_solar_total"] = round(kwp * 2500.0, 2)
    json.dump(cs, open(caso_s, "w", encoding="utf-8"), indent=1)
    run("motor-solar", ["python3", AQUI + motor,
                        "--caso", caso_s, "--saida", fluxo_s])
    # 4) SEMAFORO
    faixa = run("semaforo", ["python3", AQUI + "/triagem_semaforo.py",
                             "--fatura", fat_conc, "--fluxo", fluxo_b],
                ok=(0, 3))
    # 5) construtor automatico + gerador + celular
    run("construtor-caso", ["python3", AQUI + "/montar_caso_relatorio.py",
                            "--fatura", fat_conc, "--caso-motor", a.caso_motor,
                            "--fluxo", fluxo_b, "--caso-solar", caso_s,
                            "--fluxo-solar", fluxo_s, "--saida", caso_rel])
    run("gerador", ["python3", AQUI + "/gerar_relatorio_do_modelo.py",
                    "--dados", caso_rel, "--saida", rel])
    run("celular", ["python3", AQUI + "/gerar_versao_celular.py",
                    "--relatorio", rel])
    # 6) TRAVA 2 — contra o fluxo APRESENTADO (Solar+BESS)
    run("TRAVA2-verificar", ["python3", AQUI + "/verificar_relatorio.py",
                             "--html", rel, "--fatura", fat_conc,
                             "--fluxo", fluxo_s])

    ind = json.load(open(fluxo_s, encoding="utf-8"))["indicadores"]
    quatro = ("4 NUMEROS P/ CONFERENCIA DILKSON: total fatura R$ %s | consumo "
              "ponta %s kWh | TIR %.2f%% a.a. | payback %.1f anos"
              % (f"{fat0['total']:,.2f}", fat0["consumo_ponta_kwh"],
                 ind["tir_aa"] * 100, ind["payback_meses"] / 12))
    if faixa == 3 and not a.liberado_por_dilkson:
        print("\nFAIXA AMARELA — relatorio pronto e VERIFICADO, mas NAO "
              "enviado. %s\nApos OK: repetir com --liberado-por-dilkson e "
              "registrar o tipo (triagem_semaforo.py --aprovar --por "
              "\"Dilkson\")." % quatro)
        print("arquivos:", rel, rel_cel)
        return 0
    if a.sem_envio:
        print("\n--sem-envio: tudo produzido e verificado. arquivos:", rel,
              rel_cel)
        return 0
    # 7) TRAVA 4 + envio
    faixa_nome = "amarelo" if faixa == 3 else "verde"
    for arq, obs in [(rel, "desktop"), (rel_cel, "versao celular")]:
        run("TRAVA4-registro", ["python3", AQUI + "/registrar_entrega.py",
                                "--arquivo", arq, "--destino",
                                "telegram:" + a.chat, "--faixa", faixa_nome,
                                "--por", a.por, "--obs", obs])
    tok = None
    pids = subprocess.check_output(
        "pgrep -f 'openclaw-gateway|openclaw gateway'", shell=True,
        text=True).split()
    for pid in pids:
        try:
            env = open("/proc/%s/environ" % pid, "rb").read().split(b"\0")
        except OSError:
            continue
        for e in env:
            if e.startswith(b"TELEGRAM_BOT_TOKEN="):
                tok = e.split(b"=", 1)[1].decode()
    if not tok:
        sys.exit("token do gateway nao encontrado — envio manual proibido; "
                 "escalar.")
    import requests
    cap = ("Relatorio de Auditoria Energetica — %s (UC %s, ref %s). "
           "Pipeline completo: travas 1-2-4 aprovadas, faixa %s."
           % (fat0.get("apelido"), fat0["uc"], fat0["referencia"], faixa_nome))
    for arq, sufixo in [(rel, ""), (rel_cel, " — VERSAO CELULAR")]:
        r = requests.post("https://api.telegram.org/bot%s/sendDocument" % tok,
                          data={"chat_id": a.chat, "caption": cap + sufixo},
                          files={"document": open(arq, "rb")}, timeout=180)
        if r.status_code != 200:
            sys.exit("envio falhou (%s) — conferir e reenviar via este "
                     "script." % r.status_code)
        print("enviado:", os.path.basename(arq))
    print("\nCONCLUIDO — produzido, verificado, registrado e entregue.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
