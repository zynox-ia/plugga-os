#!/usr/bin/env bash
#
# Ensaio de ops/prepara-corpus.sh contra um SeaweedFS (modo mini) descartável.
# Precisa do Docker. Prova o que interessa das duas chaves do corpus: o leitor lê e
# NÃO escreve, o editor escreve, nenhum enxerga balde de negócio, e rodar de novo não
# troca a credencial.
#
# Uso: bash ops/prepara-corpus.test.sh
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
# Senha descartável desta execução: nada de segredo escrito no repositório.
ENSAIO_SEGREDO=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d '[:space:]')
export ENSAIO_SEGREDO
cd "$RAIZ"
COMPOSE=(docker compose -f compose.ensaio-storage.yaml)
ENV_CORPUS=$(mktemp)
rm -f "$ENV_CORPUS" # o script cria o arquivo; o teste só reserva o nome
SAIDA=$(mktemp)

limpa() { "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true; rm -f "$ENV_CORPUS" "$SAIDA"; }
trap limpa EXIT

mc() { "${COMPOSE[@]}" exec -T mc mc "$@" </dev/null; }
falha() { printf '✗ %s\n' "$*" >&2; exit 1; }
ok() { printf '✓ %s\n' "$*"; }

echo "▸ subindo SeaweedFS descartável"
"${COMPOSE[@]}" up -d seaweedfs mc >/dev/null 2>&1 || falha "docker compose up falhou"
for _ in $(seq 1 40); do mc ls dest >/dev/null 2>&1 && pronto=1 && break; sleep 2; done
[ "${pronto:-0}" = 1 ] || falha "SeaweedFS não ficou pronto"
mc mb --ignore-existing dest/plugga-energia-opm >/dev/null

export REDE=ensaio-storage_default SEAWEEDFS_CONTAINER=ensaio-storage-seaweedfs-1 ARQUIVO_ENV_CORPUS="$ENV_CORPUS"

bash ops/prepara-corpus.sh >"$SAIDA" 2>&1 || { cat "$SAIDA" >&2; falha "prepara-corpus.sh falhou"; }
grep -q "balde do corpus preparado" "$SAIDA" || falha "não confirmou o balde"
ok "primeira execução prepara o balde"

# shellcheck disable=SC1090
. "$ENV_CORPUS"
for segredo in "$CORPUS_LEITOR_SECRET_KEY" "$CORPUS_EDITOR_SECRET_KEY"; do
  if grep -q "$segredo" "$SAIDA"; then falha "um segredo do corpus vazou na saída"; fi
done
ok "segredos do corpus não aparecem na saída"

no_mc() { local url=$1 cmd=$2; "${COMPOSE[@]}" exec -T -e MC_HOST_u="$url" mc sh -c "$cmd" </dev/null; }
LEITOR="http://${CORPUS_LEITOR_ACCESS_KEY}:${CORPUS_LEITOR_SECRET_KEY}@seaweedfs:8333"
EDITOR="http://${CORPUS_EDITOR_ACCESS_KEY}:${CORPUS_EDITOR_SECRET_KEY}@seaweedfs:8333"

no_mc "$EDITOR" 'echo fixture > /tmp/f && mc cp /tmp/f u/plugga-corpus-faturas/roraima-teste.pdf' >/dev/null 2>&1 || falha "editor não grava fixture"
ok "editor grava fixture"
no_mc "$LEITOR" 'mc cat u/plugga-corpus-faturas/roraima-teste.pdf' >/dev/null 2>&1 || falha "leitor não lê fixture"
ok "leitor lê fixture"
if no_mc "$LEITOR" 'echo x > /tmp/f && mc cp /tmp/f u/plugga-corpus-faturas/invasao.pdf' >/dev/null 2>&1; then
  falha "leitor conseguiu escrever no corpus"
fi
ok "leitor é NEGADO na escrita"
for quem in "$LEITOR" "$EDITOR"; do
  if no_mc "$quem" 'echo x > /tmp/f && mc cp /tmp/f u/plugga-energia-opm/faturas/invasao' >/dev/null 2>&1; then
    falha "uma chave do corpus gravou em plugga-energia-opm"
  fi
done
ok "nenhuma chave do corpus alcança plugga-energia-opm"

ANTES=$(cat "$ENV_CORPUS")
bash ops/prepara-corpus.sh >"$SAIDA" 2>&1 || { cat "$SAIDA" >&2; falha "segunda execução falhou"; }
[ "$ANTES" = "$(cat "$ENV_CORPUS")" ] || falha "segunda execução trocou as credenciais"
no_mc "$LEITOR" 'mc cat u/plugga-corpus-faturas/roraima-teste.pdf' >/dev/null 2>&1 || falha "leitor deixou de ler após reexecução"
ok "reexecução é idempotente e o dado continua lá"

echo
echo "TODOS OS CASOS PASSARAM"
