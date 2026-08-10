#!/usr/bin/env python3
"""Entrega padrao de estudo da missao Nova Era (regras Dilkson 08/08, print):

  1. WhatsApp HDT & WAZE: PRIMEIRO o HTML celular com nome limpo (CODIGO.html)
     e legenda completa SEM repetir o codigo; 30s de pausa; depois o PDF sem
     legenda.
  2. Bitrix: anexa HTML+PDF no campo "ESTUDOS DE ECONOMIA E PROPOSTAS
     COMERCIAIS" do card, comenta e FECHA a O.S. (tarefa).

Uso: entregar_estudo.py --loja "SANTA TEREZA" --codigo STZ-NVE-PLG-HDT-ESS-0001 \
     --html /caminho/estudo_celular.html --pdf /caminho/estudo.pdf \
     --legenda "Auditoria Energetica ..." [--sem-whatsapp]
"""
import argparse
import base64
import json
import subprocess
import time

import requests

GRUPO_HDT = "120363430402421296@g.us"
CAMPO_ESTUDOS = "UF_CRM_1751567044496"
ESTADO = "/tmp/faturas_bess/cards_criados.json"

url = subprocess.check_output(
    ["bash", "/root/.openclaw/workspace/scripts/load-bitrix-webhook.sh"],
    text=True).strip().rstrip("/")


def bx(metodo, corpo):
    for _ in range(8):
        r = requests.post(url + "/" + metodo, json=corpo, timeout=180)
        d = r.json()
        if d.get("error") == "QUERY_LIMIT_EXCEEDED":
            time.sleep(5)
            continue
        if "error" in d:
            raise SystemExit("erro %s: %s" % (metodo, str(d)[:250]))
        time.sleep(0.8)
        return d["result"]
    raise SystemExit("rate limit persistente")


def wa(alvo, media, msg=None):
    cmd = ["openclaw", "message", "send", "--channel", "whatsapp",
           "--target", alvo, "--media", media]
    if msg:
        cmd += ["-m", msg]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if "Sent" not in r.stdout + r.stderr:
        raise SystemExit("envio WA falhou: " + (r.stdout + r.stderr)[-200:])
    print("WA ok:", media.split("/")[-1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--loja", required=True)
    ap.add_argument("--codigo", required=True)
    ap.add_argument("--html", required=True)
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--legenda", required=True)
    ap.add_argument("--sem-whatsapp", action="store_true")
    a = ap.parse_args()
    assert a.codigo not in a.legenda, "legenda nao repete o codigo (regra)"

    est = json.load(open(ESTADO))
    info = est[a.loja]

    # arquivos com nome limpo (o codigo E o nome; nada de _celular)
    html_limpo = "/tmp/entregas_nve/%s.html" % a.codigo
    pdf_limpo = "/tmp/entregas_nve/%s.pdf" % a.codigo
    if a.html != html_limpo:
        subprocess.run(["cp", a.html, html_limpo], check=True)
    if a.pdf != pdf_limpo:
        subprocess.run(["cp", a.pdf, pdf_limpo], check=True)

    if not a.sem_whatsapp:
        wa(GRUPO_HDT, html_limpo, a.legenda)   # principal: celular, 1o
        time.sleep(30)                          # pausa exigida
        wa(GRUPO_HDT, pdf_limpo)                # pdf sem legenda

    # Bitrix: anexar no card (campo ESTUDOS) + fechar O.S. com comentario
    def b64(p):
        return base64.b64encode(open(p, "rb").read()).decode()
    bx("crm.deal.update", {"id": info["deal"], "fields": {CAMPO_ESTUDOS: [
        {"fileData": ["%s.html" % a.codigo, b64(html_limpo)]},
        {"fileData": ["%s.pdf" % a.codigo, b64(pdf_limpo)]}]}})
    bx("task.commentitem.add", [info["task"],
        {"POST_MESSAGE": "Estudo %s concluido e entregue no grupo HDT & WAZE. "
                         "Arquivos anexados no card do CRM (campo ESTUDOS DE "
                         "ECONOMIA E PROPOSTAS COMERCIAIS). %s"
                         % (a.codigo, a.legenda)}])
    bx("tasks.task.complete", {"taskId": info["task"]})
    info["estudo"] = a.codigo
    info["os_fechada"] = True
    json.dump(est, open(ESTADO, "w"), ensure_ascii=False, indent=1)
    print("Bitrix: estudo anexado no deal %s, O.S. %s comentada e FECHADA"
          % (info["deal"], info["task"]))


if __name__ == "__main__":
    main()
