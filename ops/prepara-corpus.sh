#!/usr/bin/env bash
# Prepara o balde do corpus de faturas no armazenamento local: balde próprio e
# duas chaves. Roda uma vez; é idempotente.
#
# O `mc` da MinIO deixou de ser distribuído (imagem e binário retirados dos
# canais oficiais em 2026-11); as operações de dados (balde, prova de
# escrita/leitura) agora usam o `aws-cli` oficial, que fala o mesmo S3.
#
#   leitor  Read,List        vai para os secrets CORPUS_LEITOR_* do GitHub (o job de
#                            corpus da CI só lê fixture)
#   editor  Read,Write,List  fica com quem publica fixture; não vai para secret nenhum
#
# Substitui o antigo prepara-corpus-minio.sh. Os comandos `mc admin` eram do MinIO e
# não servem aqui: no SeaweedFS o usuário criado por eles não autentica. As chaves
# nascem pelo `s3.configure` do próprio SeaweedFS e o resultado é provado com a
# credencial de cada uma, não presumido.
#
# Sem regra de expiração de propósito: o corpus não é dado de produção e não segue a
# retenção do estudo. Se o balde crescer a ponto de importar, é aí que se decide um
# prazo — não antes, e não por reflexo.
set -euo pipefail

REDE=${REDE:-plugga-os_default}
AWSCLI_IMAGEM=${AWSCLI_IMAGEM:-amazon/aws-cli@sha256:1b7003e3ecb737b7533d8e16a547b4bc36e912508c3532ae51003aad8d0cd41d}
ENDPOINT=${BACKUP_STORAGE_ENDPOINT:-http://seaweedfs:8333}
CONTEINER=${SEAWEEDFS_CONTAINER:-plugga-os-seaweedfs-1}
ARQUIVO_ENV=${ARQUIVO_ENV_CORPUS:-/root/.plugga-corpus.env}
BALDE=plugga-corpus-faturas

# Credencial raiz lida do contêiner e nunca impressa. `printenv`, não `docker
# inspect` com template split "=": o split cortava a senha no primeiro '='.
U=$(docker exec "$CONTEINER" printenv AWS_ACCESS_KEY_ID)
P=$(docker exec "$CONTEINER" printenv AWS_SECRET_ACCESS_KEY)

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

# A credencial entra pelo stdin do `weed shell`, nunca pela linha de comando:
# argumento aparece em `ps`. A saída repete o usuário criado, então só é mostrada
# se falhar, e sem o segredo.
cria_usuario() {
  local usuario=$1 chave=$2 segredo=$3 acoes=$4 saida
  if ! saida=$(printf '%s\n' "s3.configure -user=${usuario} -access_key=${chave} -secret_key=${segredo} -buckets=${BALDE} -actions=${acoes} -apply" |
    docker exec -i "$CONTEINER" weed shell -master=localhost:9333 2>&1); then
    printf 'falhou (criar %s):\n%s\n' "$usuario" "${saida//$segredo/***}" >&2
    exit 1
  fi
}
cria_usuario corpus-leitor "$CORPUS_LEITOR_ACCESS_KEY" "$CORPUS_LEITOR_SECRET_KEY" Read,List
cria_usuario corpus-editor "$CORPUS_EDITOR_ACCESS_KEY" "$CORPUS_EDITOR_SECRET_KEY" Read,Write,List

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
