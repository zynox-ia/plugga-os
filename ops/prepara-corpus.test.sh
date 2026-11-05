#!/usr/bin/env bash
#
# Ensaio de ops/prepara-corpus.sh contra um RustFS descartável. Precisa do
# Docker. Prova o que interessa das duas chaves do corpus: o leitor lê e
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

aws() { "${COMPOSE[@]}" exec -T awscli aws "$@" </dev/null; }
falha() { printf '✗ %s\n' "$*" >&2; exit 1; }
ok() { printf '✓ %s\n' "$*"; }

echo "▸ subindo RustFS descartável"
"${COMPOSE[@]}" up -d rustfs awscli >/dev/null 2>&1 || falha "docker compose up falhou"
for _ in $(seq 1 40); do aws s3api list-buckets >/dev/null 2>&1 && pronto=1 && break; sleep 2; done
[ "${pronto:-0}" = 1 ] || falha "RustFS não ficou pronto"
aws s3api create-bucket --bucket plugga-energia-opm >/dev/null

export REDE=ensaio-storage_default RUSTFS_CONTAINER=ensaio-storage-rustfs-1 ARQUIVO_ENV_CORPUS="$ENV_CORPUS"

bash ops/prepara-corpus.sh >"$SAIDA" 2>&1 || { cat "$SAIDA" >&2; falha "prepara-corpus.sh falhou"; }
grep -q "balde do corpus preparado" "$SAIDA" || falha "não confirmou o balde"
ok "primeira execução prepara o balde"

# shellcheck disable=SC1090
. "$ENV_CORPUS"
for segredo in "$CORPUS_LEITOR_SECRET_KEY" "$CORPUS_EDITOR_SECRET_KEY"; do
  if grep -q "$segredo" "$SAIDA"; then falha "um segredo do corpus vazou na saída"; fi
done
ok "segredos do corpus não aparecem na saída"

aws_como() { # $1=access $2=secret ; resto = args do aws
  local access=$1 secret=$2
  shift 2
  "${COMPOSE[@]}" exec -T -e AWS_ACCESS_KEY_ID="$access" -e AWS_SECRET_ACCESS_KEY="$secret" awscli aws "$@" </dev/null
}
aws_leitor() { aws_como "$CORPUS_LEITOR_ACCESS_KEY" "$CORPUS_LEITOR_SECRET_KEY" "$@"; }
aws_editor() { aws_como "$CORPUS_EDITOR_ACCESS_KEY" "$CORPUS_EDITOR_SECRET_KEY" "$@"; }

printf 'fixture' | aws_editor s3 cp - s3://plugga-corpus-faturas/roraima-teste.pdf >/dev/null 2>&1 \
  || falha "editor não grava fixture"
ok "editor grava fixture"
aws_leitor s3 cp s3://plugga-corpus-faturas/roraima-teste.pdf - >/dev/null 2>&1 || falha "leitor não lê fixture"
ok "leitor lê fixture"
if printf 'x' | aws_leitor s3 cp - s3://plugga-corpus-faturas/invasao.pdf >/dev/null 2>&1; then
  falha "leitor conseguiu escrever no corpus"
fi
ok "leitor é NEGADO na escrita"
for quem in aws_leitor aws_editor; do
  if printf 'x' | "$quem" s3 cp - s3://plugga-energia-opm/faturas/invasao >/dev/null 2>&1; then
    falha "uma chave do corpus gravou em plugga-energia-opm"
  fi
done
ok "nenhuma chave do corpus alcança plugga-energia-opm"

ANTES=$(cat "$ENV_CORPUS")
bash ops/prepara-corpus.sh >"$SAIDA" 2>&1 || { cat "$SAIDA" >&2; falha "segunda execução falhou"; }
[ "$ANTES" = "$(cat "$ENV_CORPUS")" ] || falha "segunda execução trocou as credenciais"
aws_leitor s3 cp s3://plugga-corpus-faturas/roraima-teste.pdf - >/dev/null 2>&1 \
  || falha "leitor deixou de ler após reexecução"
ok "reexecução é idempotente e o dado continua lá"

echo
echo "TODOS OS CASOS PASSARAM"
