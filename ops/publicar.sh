#!/usr/bin/env bash
#
# Publica na VPS o que está na `main` do GitHub.
#
# Roda **na sua máquina**, da raiz do repositório:
#
#     ./ops/publicar.sh
#
# Publica o que está publicado no GitHub, não o que está na sua pasta. A
# diferença importa: se der problema em produção, o código que está lá é o mesmo
# que qualquer pessoa consegue ver e revisar. Publicar a pasta local significaria
# ter em produção algo que só existe na sua máquina.
set -euo pipefail

VPS=${VPS_HOST:-plugga-vps}
DESTINO=${VPS_PATH:-/opt/plugga-os}
REFERENCIA=${1:-origin/main}

registro() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

registro "conferindo o que vai subir"
git fetch origin --quiet
COMMIT=$(git rev-parse --short "$REFERENCIA")
echo "  $COMMIT $(git log -1 --format=%s "$REFERENCIA")"

# A referência precisa carregar a própria máquina de publicação. Em 2026-08-09
# a main ficou 30 commits atrás da feature branch — sem ops/ — e todo publish
# morria no meio do caminho remoto, depois de já ter mexido na árvore da VPS.
# Falhar aqui, antes de empacotar, transforma esse acidente numa mensagem.
if ! git cat-file -e "${REFERENCIA}:ops/deploy.sh" 2>/dev/null; then
  echo
  echo "  ${REFERENCIA} não contém ops/deploy.sh — publicar essa referência"
  echo "  deixaria a VPS sem o script que o publish executa."
  echo "  O trabalho está mergeado na main? (git log --oneline ${REFERENCIA} -- ops/)"
  exit 1
fi

# Trabalho não commitado não sobe, e é bom que não suba. Mas avisar evita a
# surpresa de publicar e não ver a própria alteração no ar.
if [ -n "$(git status --porcelain)" ]; then
  echo
  echo "  Atenção: você tem alterações não commitadas. Elas NÃO vão subir."
  echo "  Para publicá-las: commit, push, e rode de novo."
  printf "  Continuar assim mesmo? [s/N] "
  read -r resposta
  [ "$resposta" = "s" ] || { echo "  cancelado"; exit 1; }
fi

registro "empacotando"
PACOTE=$(mktemp -t plugga-deploy-XXXXXX).tgz
git archive --format=tar "$REFERENCIA" | gzip > "$PACOTE"
echo "  $(du -h "$PACOTE" | cut -f1)"

registro "enviando para a VPS"
scp -q "$PACOTE" "${VPS}:/tmp/plugga-deploy.tgz"
rm -f "$PACOTE"

registro "instalando o código e publicando"
# Extrair-e-trocar, nunca extrair por cima: o tar em cima da pasta viva deixava
# para trás o que saiu do repositório — uma migração renomeada virava DUAS
# migrações aplicadas, e fonte removida continuava entrando na imagem pelo
# `COPY . .`. O pacote vai para uma pasta nova e a troca é um `mv`; a pasta que
# estava no ar sobrevive em `.anterior`, pronta para rollback.
#
# `.env` e `compose.yaml` da VPS são preservados: carregam a configuração de
# produção, que por desenho não vive no repositório.
ssh "$VPS" "set -e
  rm -rf ${DESTINO}.novo
  mkdir -p ${DESTINO}.novo
  tar xzf /tmp/plugga-deploy.tgz -C ${DESTINO}.novo
  # Confere ANTES do swap: se o pacote vier sem o deploy, a árvore que está no
  # ar continua intocada em vez de ser trocada por uma que não sabe publicar.
  test -f ${DESTINO}.novo/ops/deploy.sh
  cp ${DESTINO}/.env ${DESTINO}.novo/.env
  cp ${DESTINO}/compose.yaml ${DESTINO}.novo/compose.yaml
  chmod 600 ${DESTINO}.novo/.env
  rm -f /tmp/plugga-deploy.tgz
  rm -rf ${DESTINO}.anterior
  mv ${DESTINO} ${DESTINO}.anterior
  mv ${DESTINO}.novo ${DESTINO}
  cd ${DESTINO}
  chmod +x ops/deploy.sh
  ./ops/deploy.sh"

registro "no ar: $COMMIT"
echo "  o código que estava no ar ficou em ${DESTINO}.anterior na VPS — é o rollback, se precisar"
