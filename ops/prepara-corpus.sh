#!/usr/bin/env bash
# Prepara o balde do corpus de faturas no RustFS: balde próprio e duas chaves.
# Roda uma vez; é idempotente.
#
# O servidor S3 anterior tinha o próprio comando de criar as chaves, porque
# os comandos `mc admin` (MinIO) não serviam ali. No RustFS as chaves
# nascem pela API administrativa dele mesma (assinada SigV4, em
# apps/api/scripts/provisionar-identidade-storage.mjs, sem `mc admin`), e o
# resultado é provado com a credencial de cada uma, não presumido.
#
#   leitor  Read,List        vai para os secrets CORPUS_LEITOR_* do GitHub (o job de
#                            corpus da CI só lê fixture)
#   editor  Read,Write,List  fica com quem publica fixture; não vai para secret nenhum
#
# Sem regra de expiração de propósito: o corpus não é dado de produção e não segue a
# retenção do estudo. Se o balde crescer a ponto de importar, é aí que se decide um
# prazo — não antes, e não por reflexo.
#
# O `mc` da MinIO deixou de ser distribuído (imagem e binário retirados dos
# canais oficiais em 2026-11); as operações de dados (balde, prova de
# escrita/leitura) usam o `aws-cli` oficial, que fala o mesmo S3.
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
REDE=${REDE:-plugga-os_default}
AWSCLI_IMAGEM=${AWSCLI_IMAGEM:-amazon/aws-cli@sha256:1b7003e3ecb737b7533d8e16a547b4bc36e912508c3532ae51003aad8d0cd41d}
NODE_IMAGEM=${NODE_IMAGEM:-node@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914}
SCRIPT_IDENTIDADE="$RAIZ/apps/api/scripts/provisionar-identidade-storage.mjs"
ENDPOINT=${BACKUP_STORAGE_ENDPOINT:-http://rustfs:9000}
CONTEINER=${RUSTFS_CONTAINER:-plugga-os-rustfs-1}
ARQUIVO_ENV=${ARQUIVO_ENV_CORPUS:-/root/.plugga-corpus.env}
BALDE=plugga-corpus-faturas

# Credencial raiz lida do contêiner e nunca impressa. `printenv`, não `docker
# inspect` com template split "=": o split cortava a senha no primeiro '='.
U=$(docker exec "$CONTEINER" printenv RUSTFS_ACCESS_KEY)
P=$(docker exec "$CONTEINER" printenv RUSTFS_SECRET_KEY)

# Um arquivo de ambiente por credencial, nunca `-e` no `docker run`: evita que
# a chave apareça no `ps` do host através da linha de comando do próprio docker.
AWS_ENV_RAIZ=$(mktemp)
AWS_ENV_LEITOR=$(mktemp)
AWS_ENV_EDITOR=$(mktemp)
trap 'rm -f "$AWS_ENV_RAIZ" "$AWS_ENV_LEITOR" "$AWS_ENV_EDITOR"' EXIT
(
  umask 077
  printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\nAWS_DEFAULT_REGION=us-east-1\n' "$U" "$P" >"$AWS_ENV_RAIZ"
)

# `</dev/null`: o docker lê o stdin e engoliria a entrada de quem chama.
aws_raiz() { docker run --rm --network "$REDE" --env-file "$AWS_ENV_RAIZ" "$AWSCLI_IMAGEM" "$@" --endpoint-url "$ENDPOINT" </dev/null; }
aws_como() { local envfile=$1; shift; docker run --rm --network "$REDE" --env-file "$envfile" "$AWSCLI_IMAGEM" "$@" --endpoint-url "$ENDPOINT" </dev/null; }

# A credencial da identidade e a política entram por arquivo de ambiente,
# nunca por `-e`: o mesmo cuidado do aws-cli acima, agora para o script Node.
provisiona_identidade() { # $1=accessKey $2=secretKey $3=politicaNome $4=politicaJson
  local envfile
  envfile=$(mktemp)
  (
    umask 077
    {
      printf 'STORAGE_ENDPOINT=%s\n' "$ENDPOINT"
      printf 'STORAGE_ROOT_ACCESS_KEY=%s\n' "$U"
      printf 'STORAGE_ROOT_SECRET_KEY=%s\n' "$P"
      printf 'IDENTIDADE_ACCESS_KEY=%s\n' "$1"
      printf 'IDENTIDADE_SECRET_KEY=%s\n' "$2"
      printf 'IDENTIDADE_POLITICA_NOME=%s\n' "$3"
      printf 'IDENTIDADE_POLITICA_JSON=%s\n' "$4"
    } >"$envfile"
  )
  docker run --rm --network "$REDE" --env-file "$envfile" \
    --mount "type=bind,source=$SCRIPT_IDENTIDADE,target=/provisionar.mjs,readonly" "$NODE_IMAGEM" \
    node //provisionar.mjs
  local status=$?
  rm -f "$envfile"
  return $status
}

aws_raiz s3api head-bucket --bucket "$BALDE" >/dev/null 2>&1 || aws_raiz s3api create-bucket --bucket "$BALDE" >/dev/null

segredo_novo() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    head -c 24 /dev/urandom | od -An -tx1 | tr -d '[:space:]'
  fi
}

if [ ! -f "$ARQUIVO_ENV" ]; then
  umask 077
  {
    printf 'CORPUS_LEITOR_ACCESS_KEY=corpus-leitor\nCORPUS_LEITOR_SECRET_KEY=%s\n' "$(segredo_novo)"
    printf 'CORPUS_EDITOR_ACCESS_KEY=corpus-editor\nCORPUS_EDITOR_SECRET_KEY=%s\n' "$(segredo_novo)"
  } >"$ARQUIVO_ENV"
fi
# shellcheck disable=SC1090
. "$ARQUIVO_ENV"

POLITICA_LEITOR='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::plugga-corpus-faturas/*"]},{"Effect":"Allow","Action":["s3:ListBucket"],"Resource":["arn:aws:s3:::plugga-corpus-faturas"]}]}'
POLITICA_EDITOR='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":["arn:aws:s3:::plugga-corpus-faturas/*"]},{"Effect":"Allow","Action":["s3:ListBucket"],"Resource":["arn:aws:s3:::plugga-corpus-faturas"]}]}'

cria_usuario() { # $1=usuario $2=chave $3=segredo $4=politicaNome $5=politicaJson
  local usuario=$1 chave=$2 segredo=$3 politicaNome=$4 politicaJson=$5 saida
  if ! saida=$(provisiona_identidade "$chave" "$segredo" "$politicaNome" "$politicaJson" 2>&1); then
    printf 'falhou (criar %s):\n%s\n' "$usuario" "${saida//$segredo/***}" >&2
    exit 1
  fi
}
cria_usuario corpus-leitor "$CORPUS_LEITOR_ACCESS_KEY" "$CORPUS_LEITOR_SECRET_KEY" corpus-leitor "$POLITICA_LEITOR"
cria_usuario corpus-editor "$CORPUS_EDITOR_ACCESS_KEY" "$CORPUS_EDITOR_SECRET_KEY" corpus-editor "$POLITICA_EDITOR"

(
  umask 077
  printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\nAWS_DEFAULT_REGION=us-east-1\n' \
    "$CORPUS_LEITOR_ACCESS_KEY" "$CORPUS_LEITOR_SECRET_KEY" >"$AWS_ENV_LEITOR"
  printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\nAWS_DEFAULT_REGION=us-east-1\n' \
    "$CORPUS_EDITOR_ACCESS_KEY" "$CORPUS_EDITOR_SECRET_KEY" >"$AWS_ENV_EDITOR"
)

# Sucesso é conferido com a credencial de cada um, não presumido. O servidor
# demora um instante para enxergar usuário recém-criado.
provado=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if printf 'sonda' | docker run --rm -i --network "$REDE" --env-file "$AWS_ENV_EDITOR" "$AWSCLI_IMAGEM" \
    s3 cp - "s3://$BALDE/.sonda" --endpoint-url "$ENDPOINT" >/dev/null 2>&1; then
    provado=1
    break
  fi
  sleep 2
done
[ "$provado" -eq 1 ] || { echo "falhou: o editor não consegue gravar em $BALDE" >&2; exit 1; }
aws_como "$AWS_ENV_EDITOR" s3 rm "s3://$BALDE/.sonda" >/dev/null || { echo "falhou: o editor não apaga a sonda" >&2; exit 1; }

aws_como "$AWS_ENV_LEITOR" s3api list-objects-v2 --bucket "$BALDE" >/dev/null || { echo "falhou: o leitor não lista $BALDE" >&2; exit 1; }
if printf 'x' | docker run --rm -i --network "$REDE" --env-file "$AWS_ENV_LEITOR" "$AWSCLI_IMAGEM" \
  s3 cp - "s3://$BALDE/.sonda-leitor" --endpoint-url "$ENDPOINT" >/dev/null 2>&1; then
  echo "falhou: o leitor conseguiu ESCREVER em $BALDE" >&2
  exit 1
fi

echo "balde do corpus preparado"
