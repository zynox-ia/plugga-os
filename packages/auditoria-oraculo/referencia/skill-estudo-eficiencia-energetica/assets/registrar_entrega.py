#!/usr/bin/env python3
"""TRAVA 4 — Registro de producao/entrega.

Todo relatorio que sai (cliente, Dilkson, grupo) e registrado em
casos/registro-producao.jsonl: quando, o que (hash), para quem, em que faixa
do semaforo e por quem foi produzido. Duas utilidades:

  1. nunca reenviar versao velha achando que e a nova (o hash diz);
  2. se um numero for contestado meses depois, sabemos exatamente qual
     versao o cliente tem em maos.

Regra: SEM registro, a entrega nao aconteceu. O agente registra ANTES de
apertar enviar.

Uso:
  python3 registrar_entrega.py --arquivo rel.html --destino "DM Dilkson" \
      --faixa verde --por "auditor-energia" [--obs "..."]
  python3 registrar_entrega.py --listar [--uc 01939890]
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(AQUI, "..", "casos", "registro-producao.jsonl")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arquivo")
    ap.add_argument("--destino")
    ap.add_argument("--faixa", choices=["verde", "amarelo", "vermelho"])
    ap.add_argument("--por")
    ap.add_argument("--obs", default="")
    ap.add_argument("--listar", action="store_true")
    ap.add_argument("--uc", default="")
    a = ap.parse_args()

    if a.listar:
        try:
            linhas = [json.loads(l) for l in open(LOG, encoding="utf-8")]
        except OSError:
            print("registro vazio."); return 0
        for r in linhas:
            if a.uc and a.uc not in r.get("arquivo", ""):
                continue
            print("%s | %s | %s -> %s | %s | md5 %s | %s" %
                  (r["quando"], r["faixa"], r["por"], r["destino"],
                   os.path.basename(r["arquivo"]), r["md5"][:10], r.get("obs", "")))
        return 0

    if not (a.arquivo and a.destino and a.faixa and a.por):
        ap.error("--arquivo, --destino, --faixa e --por sao obrigatorios")
    if a.faixa == "vermelho":
        print("REGISTRO RECUSADO — faixa vermelha NUNCA e entregue."); return 1
    if not os.path.exists(a.arquivo):
        print("arquivo nao existe:", a.arquivo); return 1
    reg = {"quando": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
           "arquivo": os.path.abspath(a.arquivo),
           "md5": hashlib.md5(open(a.arquivo, "rb").read()).hexdigest(),
           "destino": a.destino, "faixa": a.faixa, "por": a.por,
           "obs": a.obs}
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(reg, ensure_ascii=False) + "\n")
    print("REGISTRADO — md5 %s -> %s. Pode enviar." % (reg["md5"][:10],
                                                       a.destino))
    return 0


if __name__ == "__main__":
    sys.exit(main())
