#!/usr/bin/env python3
"""TRAVA 3 — Teste de regressao (golden test).

Regenera o caso de referencia (Santa Tereza, aprovado por Dilkson em
08/08/2026) a partir do caso salvo e compara o MD5 com o da versao aprovada.
Qualquer mudanca no gerador, no modelo congelado ou no pos-processador
celular que altere 1 byte da saida e detectada AQUI, antes de contaminar
producao.

QUANDO RODAR (obrigatorio):
  - depois de QUALQUER commit que toque a skill (gerador, modelo, camada
    celular, motor);
  - no inicio de qualquer dia de producao de relatorios (custa segundos).

Se o teste falhar de proposito (mudanca aprovada por Dilkson), atualizar os
hashes com --regravar E dizer no commit qual aprovacao autorizou.

Uso:
  python3 teste_regressao.py            (roda o teste)
  python3 teste_regressao.py --regravar (regrava os hashes apos mudanca APROVADA)
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
CASOS = os.path.join(AQUI, "..", "casos")
HASHES = os.path.join(CASOS, "golden-hashes.json")
CASO_REF = os.path.join(CASOS, "caso-relatorio-santa-tereza-2026-06.json")


def md5(p):
    return hashlib.md5(open(p, "rb").read()).hexdigest()


def gerar(tmp):
    desktop = os.path.join(tmp, "golden.html")
    r = subprocess.run(["python3", os.path.join(AQUI, "gerar_relatorio_do_modelo.py"),
                        "--dados", CASO_REF, "--saida", desktop],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("gerador falhou no golden:\n" + r.stdout + r.stderr)
    r = subprocess.run(["python3", os.path.join(AQUI, "gerar_versao_celular.py"),
                        "--relatorio", desktop], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("versao celular falhou no golden:\n" + r.stdout + r.stderr)
    return desktop, os.path.join(tmp, "golden_celular.html")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--regravar", action="store_true")
    a = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        d, c = gerar(tmp)
        atual = {"desktop": md5(d), "celular": md5(c)}
    if a.regravar:
        json.dump(atual, open(HASHES, "w"), indent=1)
        print("hashes regravados (mudanca APROVADA por Dilkson?):", atual)
        return 0
    try:
        esperado = json.load(open(HASHES))
    except (OSError, ValueError):
        sys.exit("golden-hashes.json ausente — rode --regravar uma vez sobre "
                 "a versao aprovada.")
    dif = [k for k in atual if atual[k] != esperado.get(k)]
    if dif:
        print("REGRESSAO DETECTADA em: %s" % ", ".join(dif))
        print("  esperado:", esperado)
        print("  atual:   ", atual)
        print("Alguma mudanca na skill alterou a saida aprovada. REVERTER, ou "
              "— se a mudanca foi aprovada por Dilkson — rodar --regravar "
              "citando a aprovacao no commit.")
        return 1
    print("GOLDEN OK — saida identica a versao aprovada (desktop + celular).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
