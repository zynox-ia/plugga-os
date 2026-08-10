#!/usr/bin/env bash
# Prepara o balde do corpus de faturas no MinIO: balde próprio e duas chaves —
# uma que só lê, para a CI, e uma que escreve, para quem publica fixture.
# Roda uma vez, na VPS; é idempotente.
#
# Por que balde próprio, e não o `plugga-faturas`: o corpus é material de teste,
# com ciclo de vida próprio. Fatura de produção vive enquanto o estudo existir
# (política de dados do cliente); fixture de regressão vive enquanto o teste
# fizer sentido. Misturar os dois embaralha retenção e faz um engano no balde de
# teste alcançar documento de cliente em produção.
#
# Por que duas chaves: a da CI só precisa **ler**. Dar escrita a um runner para
# ele baixar fixture é poder que não se usa e que, se vazar, apaga o corpus.
set -euo pipefail

REDE=plugga-os_default
MC="minio/mc:RELEASE.2025-04-16T18-13-26Z"
BALDE=plugga-corpus-faturas

# Credencial raiz lida do contêiner e nunca impressa — mesma razão e mesma
# armadilha do `prepara-backup-minio.sh`: `docker inspect` com template split
# "=" cortava a senha no primeiro '='.
U=$(docker exec plugga-os-minio-1 printenv MINIO_ROOT_USER)
P=$(docker exec plugga-os-minio-1 printenv MINIO_ROOT_PASSWORD)

# MC_HOST_x é uma URL: senha com '@', ':' ou '/' cru quebraria o parse dela.
codifica_url() {
  local LC_ALL=C texto=$1 i c saida=
  for ((i = 0; i < ${#texto}; i++)); do
    c=${texto:i:1}
    case "$c" in
      [A-Za-z0-9._~-]) saida+=$c ;;
      *) printf -v c '%%%02X' "'$c"; saida+=$c ;;
    esac
  done
  printf '%s' "$saida"
}
RAIZ_URL="http://$U:$(codifica_url "$P")@minio:9000"

mc() { docker run --rm -i --network "$REDE" -e MC_HOST_x="$RAIZ_URL" "$MC" "$@"; }

# Tolera só o "já existe" de um script idempotente. O rótulo existe para a
# mensagem de erro não ecoar o comando, que carrega a credencial.
tolera_existente() {
  local rotulo=$1 saida
  shift
  if saida=$("$@" 2>&1); then return 0; fi
  case "$saida" in
    *"already exists"* | *"Already exists"* | *"no net effect"*) return 0 ;;
  esac
  printf 'falhou (%s):\n%s\n' "$rotulo" "$saida" >&2
  exit 1
}

mc mb --ignore-existing "x/$BALDE" >/dev/null

# Sem regra de expiração de propósito: o corpus não é dado de produção e não
# segue a retenção do estudo. Se o balde crescer a ponto de importar, é aí que
# se decide um prazo — não antes, e não por reflexo.

if [ ! -f /root/.plugga-corpus.env ]; then
  umask 077
  printf 'CORPUS_LEITOR_ACCESS_KEY=plugga-corpus-leitor\nCORPUS_LEITOR_SECRET_KEY=%s\nCORPUS_EDITOR_ACCESS_KEY=plugga-corpus-editor\nCORPUS_EDITOR_SECRET_KEY=%s\n' \
    "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > /root/.plugga-corpus.env
fi
# shellcheck disable=SC1091
. /root/.plugga-corpus.env

cat > /tmp/politica-corpus-leitura.json <<JSON
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:GetObject","s3:ListBucket"],
  "Resource":["arn:aws:s3:::$BALDE","arn:aws:s3:::$BALDE/*"]}
]}
JSON

cat > /tmp/politica-corpus-escrita.json <<JSON
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:GetObject","s3:ListBucket","s3:PutObject","s3:DeleteObject"],
  "Resource":["arn:aws:s3:::$BALDE","arn:aws:s3:::$BALDE/*"]}
]}
JSON

criar_politica() {
  tolera_existente "criar política $1" \
    docker run --rm --network "$REDE" -e MC_HOST_x="$RAIZ_URL" \
    -v "$2:/p.json" "$MC" admin policy create x "$1" /p.json
}

criar_usuario() {
  tolera_existente "criar usuário $1" \
    docker run --rm --network "$REDE" -e MC_HOST_x="$RAIZ_URL" "$MC" admin user add x "$1" "$2"
  tolera_existente "vincular política ao usuário $1" \
    docker run --rm --network "$REDE" -e MC_HOST_x="$RAIZ_URL" "$MC" \
    admin policy attach x "$3" --user "$1"
}

criar_politica corpus-somente-leitura /tmp/politica-corpus-leitura.json
criar_politica corpus-escrita /tmp/politica-corpus-escrita.json
criar_usuario "$CORPUS_LEITOR_ACCESS_KEY" "$CORPUS_LEITOR_SECRET_KEY" corpus-somente-leitura
criar_usuario "$CORPUS_EDITOR_ACCESS_KEY" "$CORPUS_EDITOR_SECRET_KEY" corpus-escrita

rm -f /tmp/politica-corpus-leitura.json /tmp/politica-corpus-escrita.json

# Sucesso é conferido, não presumido: um "balde preparado" impresso com o MinIO
# fora do ar viraria uma CI vermelha sem causa aparente semanas depois.
for chave in "$CORPUS_LEITOR_ACCESS_KEY" "$CORPUS_EDITOR_ACCESS_KEY"; do
  if ! mc admin user info x "$chave" >/dev/null 2>&1; then
    echo "falhou: usuário $chave não existe no MinIO" >&2
    exit 1
  fi
done
if ! mc ls "x/$BALDE" >/dev/null 2>&1; then
  echo "falhou: balde $BALDE não responde" >&2
  exit 1
fi

echo "balde preparado: $BALDE"
echo "as chaves estão em /root/.plugga-corpus.env — a de leitura vai para os"
echo "secrets CORPUS_LEITOR_ACCESS_KEY/CORPUS_LEITOR_SECRET_KEY do GitHub; a de"
echo "escrita fica com quem publica fixture, e não vai para secret nenhum."
