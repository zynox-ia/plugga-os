#!/usr/bin/env python3
"""Gerador do Relatorio de Auditoria Energetica — clone do modelo aprovado.

Criado 05/08/2026 apos o agente falhar em reproduzir o modelo a mao em TODAS
as tentativas (titulo trocado, CSS reinventado, fundo azul, secoes cortadas —
23 correcoes de Dilkson numa unica manha). Este script torna a divergencia
IMPOSSIVEL:

  1. O HTML de saida NASCE como copia byte a byte do modelo congelado.
  2. So muda o que estiver no JSON de substituicoes (de -> para), aplicado
     como troca literal de texto.
  3. TRAVAS: se qualquer "de" nao existir no modelo, ERRO. Se o CSS mudar,
     ERRO. Se sobrar qualquer marcador do caso-fonte (Serra Verde, UC antiga,
     numeros da fatura antiga), ERRO e lista do que faltou trocar.
  4. So entrega HTML valido quando 100% limpo. Nao existe "quase igual".

Uso:
  python3 gerar_relatorio_do_modelo.py --dados caso.json --saida reports/x.html
  python3 gerar_relatorio_do_modelo.py --listar-pendencias   (mostra os
      marcadores do caso-fonte que o caso novo precisa cobrir)

Formato do caso.json:
{
  "substituicoes": {
    "AGROINDUSTRIAL SERRA VERDE LTDA": "MERCANTIL NOVA ERA LTDA",
    "0188872-2": "0137405-2",
    "R$ 291.154,80": "R$ 76.295,48",
    "...": "..."
  }
}
As chaves sao SEMPRE o texto exato do modelo; os valores, o texto do caso novo.
Textos longos (caixas de destaque, diagnostico) tambem entram assim.
"""
import argparse
import hashlib
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
MODELO = os.path.join(AQUI, "..", "templates",
                      "modelo-aprovado-cliente-serra-verde-2025-06-b.html")

# Marcadores do caso-fonte: NENHUM pode sobrar no relatorio novo.
# Cobrem cliente, UC, distribuidora, referencia e os numeros-chave da fatura
# do modelo. Ajustar somente se o modelo congelado for trocado.
MARCADORES_FONTE = [
    "Serra Verde", "SERRA VERDE", "AGROINDUSTRIAL",
    "0188872", "18667238", "YIT1922706",
    "R$ 291.154", "R$ 290.503", "R$ 75.726", "R$ 195.522", "R$ 15.270",
    "R$ 3.984,50", "R$ 521,16", "R$ 3.463,34", "R$ 72.788",
    "42.835 kWh", ">42.835<", "505.578 kWh", ">505.578<", "548.413 kWh",
    "1.198 kW", "1.149 kW", "1.149,8 kW", ">1.149<", "1.020 kW", "1.079 kW",
    "<b>1.428</b>", "R$ 6.866.243", "R$ 15.640.457", "R$ -15.640.457",
    "06/2025", "21/07/2025", "31/05/2025", "30/06/2025",
    "Roraima", "RORAIMA", "Boa Vista", "BOA VISTA",
]


def css_de(texto):
    m = re.search(r"<style[^>]*>(.*?)</style>", texto, flags=re.S)
    return m.group(1) if m else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dados", help="JSON com o mapa de substituicoes")
    ap.add_argument("--saida", help="caminho do HTML de saida")
    ap.add_argument("--listar-pendencias", action="store_true",
                    help="lista ocorrencias dos marcadores do caso-fonte no modelo")
    a = ap.parse_args()

    modelo = open(MODELO, encoding="utf-8").read()

    if a.listar_pendencias:
        print("Marcadores do caso-fonte presentes no modelo (todos precisam de "
              "substituicao no caso novo):")
        for mk in MARCADORES_FONTE:
            n = modelo.count(mk)
            if n:
                print("  %-22s %3d ocorrencia(s)" % (mk, n))
        return 0

    if not a.dados or not a.saida:
        ap.error("--dados e --saida sao obrigatorios (ou use --listar-pendencias)")

    dados = json.load(open(a.dados, encoding="utf-8"))
    subs = dados.get("substituicoes", {})
    if not subs:
        print("ERRO: caso.json sem 'substituicoes'."); return 1

    saida = modelo
    erros = []
    # maiores primeiro, para "R$ 291.154,80" nao ser quebrado por "291.154"
    for de in sorted(subs, key=len, reverse=True):
        if de not in saida:
            erros.append("nao encontrado no modelo: %r" % de[:60])
            continue
        saida = saida.replace(de, subs[de])
    if erros:
        print("ERRO — chaves que nao existem no modelo (texto nao e identico):")
        for e in erros: print("  -", e)
        return 1

    # TRAVA 1: CSS intocado
    if css_de(saida) != css_de(modelo):
        print("ERRO — o CSS foi alterado pelas substituicoes. Proibido: nenhuma "
              "chave pode tocar o <style>."); return 1

    # TRAVA 2: nada do caso-fonte pode sobrar
    # manter_marcadores: excecao DECLARADA no caso.json para quando o caso
    # novo compartilha um fato com o caso-fonte (ex.: mesma distribuidora).
    manter = set(dados.get("manter_marcadores", []))
    if manter:
        print("AVISO — marcadores do caso-fonte mantidos por declaracao: "
              + ", ".join(sorted(manter)))
    sobras = [(mk, saida.count(mk)) for mk in MARCADORES_FONTE
              if mk in saida and mk not in manter]
    if sobras:
        print("ERRO — o relatorio ainda contem dados do caso-fonte (Serra Verde). "
              "Falta substituir:")
        for mk, n in sobras:
            print("  %-22s %3d ocorrencia(s)" % (mk, n))
        print("Nada foi gravado. Complete o caso.json e rode de novo.")
        return 1

    # INSERCOES: conteudo novo pedido por Dilkson entra como ADICAO declarada,
    # nunca inline nas substituicoes. Formato no caso.json:
    #   "insercoes": [{"apos_titulo": "7. Oportunidades", "html": "<section>...</section>"}]
    # O bloco entra no FIM da secao indicada (antes do proximo <h2>).
    for ins in dados.get("insercoes", []):
        bloco = ins.get("html", "")
        anc = ins.get("antes_de")
        if anc:
            # insercao por ancora literal: bloco entra IMEDIATAMENTE antes
            if saida.count(anc) != 1:
                print("ERRO — insercao antes_de: ancora %r tem %d ocorrencias"
                      % (anc[:50], saida.count(anc)))
                return 1
            saida = saida.replace(anc, bloco + "\n" + anc, 1)
            continue
        tit = ins.get("apos_titulo", "")
        m = re.search(r"<h[12][^>]*>[^<]*" + re.escape(tit), saida)
        if not m:
            print("ERRO — insercao: titulo %r nao encontrado." % tit[:50])
            return 1
        prox = re.search(r"<h2[ >]", saida[m.end():])
        pos = m.end() + prox.start() if prox else len(saida) - len("</body></html>")
        saida = saida[:pos] + "\n" + bloco + "\n" + saida[pos:]

    # TRAVA 3: NENHUMA secao do modelo pode sumir (adicionar pode; remover nunca)
    def titulos(t):
        limpo = re.sub(r"<style.*?</style>", "", t, flags=re.S)
        return [re.sub(r"<[^>]+>", "", x.group(2)).strip()
                for x in re.finditer(r"<h([12])[^>]*>(.*?)</h\1>", limpo, flags=re.S)]
    tm_, ts_ = titulos(modelo), titulos(saida)
    tm_aj = []
    for t in tm_:
        for de in sorted(subs, key=len, reverse=True):
            t = t.replace(de, subs[de])
        tm_aj.append(t)
    faltando = [t for t in tm_aj if t and t not in ts_]
    if faltando or len(ts_) < len(tm_):
        print("ERRO — secoes do modelo validado foram REMOVIDAS ou esvaziadas "
              "(proibido: pedido novo e ADICAO, nunca remocao):")
        for t in faltando:
            print("  -", t[:70])
        return 1

    os.makedirs(os.path.dirname(a.saida) or ".", exist_ok=True)
    open(a.saida, "w", encoding="utf-8").write(saida)
    print("OK — %s gerado (%d KB)" % (a.saida, len(saida) // 1000))
    print("     CSS identico ao modelo: sim | secoes: %d | substituicoes: %d"
          % (len(titulos(saida)), len(subs)))
    print("     hash modelo %s | hash saida %s"
          % (hashlib.md5(modelo.encode()).hexdigest()[:8],
             hashlib.md5(saida.encode()).hexdigest()[:8]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
