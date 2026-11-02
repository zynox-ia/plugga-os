#!/usr/bin/env bash
# Prepara o destino do backup no RustFS: balde próprio, usuário próprio e
# expiração automática. Roda uma vez; é idempotente.
#
# O servidor S3 anterior tinha o próprio comando de criar usuário restrito,
# porque os comandos `mc admin user`/`mc admin policy` (MinIO) não serviam
# ali. No RustFS o usuário nasce pela API administrativa dele mesma
# (assinada SigV4, em apps/api/scripts/provisionar-identidade-storage.mjs,
# sem `mc admin`), e o resultado é provado com a credencial dele, não
# presumido — mesmo formato de antes.
#
# O `mc` da MinIO deixou de ser distribuído (imagem e binário retirados dos
# canais oficiais em 2026-11); as operações de dados (balde, expiração, prova
# de escrita/leitura) usam o `aws-cli` oficial, que fala o mesmo S3.
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
REDE=${REDE:-plugga-os_default}
AWSCLI_IMAGEM=${AWSCLI_IMAGEM:-amazon/aws-cli@sha256:1b7003e3ecb737b7533d8e16a547b4bc36e912508c3532ae51003aad8d0cd41d}
NODE_IMAGEM=${NODE_IMAGEM:-node@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914}
SCRIPT_IDENTIDADE="$RAIZ/apps/api/scripts/provisionar-identidade-storage.mjs"
ENDPOINT=${BACKUP_STORAGE_ENDPOINT:-http://rustfs:9000}
CONTEINER=${RUSTFS_CONTAINER:-plugga-os-rustfs-1}
ARQUIVO_ENV=${ARQUIVO_ENV_BACKUP:-/root/.plugga-backup.env}
BALDE=plugga-backups

# Credencial raiz lida do contêiner e nunca impressa. `printenv`, não `docker
# inspect` com template split "=": o split cortava a senha no primeiro '='.
U=$(docker exec "$CONTEINER" printenv RUSTFS_ACCESS_KEY)
P=$(docker exec "$CONTEINER" printenv RUSTFS_SECRET_KEY)

# Um arquivo de ambiente por credencial, nunca `-e` no `docker run`: evita que
# a chave apareça no `ps` do host através da linha de comando do próprio docker.
AWS_ENV_RAIZ=$(mktemp)
AWS_ENV_BACKUP=$(mktemp)
trap 'rm -f "$AWS_ENV_RAIZ" "$AWS_ENV_BACKUP"' EXIT
(
  umask 077
  printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\nAWS_DEFAULT_REGION=us-east-1\n' "$U" "$P" >"$AWS_ENV_RAIZ"
)

# `</dev/null`: o docker lê o stdin e engoliria a entrada de quem chama.
aws_raiz() { docker run --rm --network "$REDE" --env-file "$AWS_ENV_RAIZ" "$AWSCLI_IMAGEM" "$@" --endpoint-url "$ENDPOINT" </dev/null; }
aws_backup() { docker run --rm --network "$REDE" --env-file "$AWS_ENV_BACKUP" "$AWSCLI_IMAGEM" "$@" --endpoint-url "$ENDPOINT" </dev/null; }

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

# O backup vive em balde separado dos arquivos de negócio: ciclo de vida
# diferente, acesso diferente, e um engano num balde da aplicação não deve
# alcançar o backup.
aws_raiz s3api head-bucket --bucket "$BALDE" >/dev/null 2>&1 || aws_raiz s3api create-bucket --bucket "$BALDE" >/dev/null

# Expiração pelo próprio servidor, não por script: se o cron parar, o disco não
# enche em silêncio, e nada some antes da hora por bug meu.
#
# `put-bucket-lifecycle-configuration` substitui o conjunto inteiro de regras,
# então rodar de novo é idempotente de verdade. Sem `|| true`: se falhar, o
# `set -e` para o script com o erro do aws na tela.
LIFECYCLE='{"Rules":[
 {"ID":"diario-30d","Status":"Enabled","Filter":{"Prefix":"diario/"},"Expiration":{"Days":30}},
 {"ID":"mensal-365d","Status":"Enabled","Filter":{"Prefix":"mensal/"},"Expiration":{"Days":365}}
]}'
aws_raiz s3api put-bucket-lifecycle-configuration --bucket "$BALDE" --lifecycle-configuration "$LIFECYCLE" >/dev/null

# Usuário só para backup: lê, escreve e lista no balde de backup, e nada mais.
# Se a credencial do cron vazar, ela não alcança os arquivos de negócio.
if [ ! -f "$ARQUIVO_ENV" ]; then
  if command -v openssl >/dev/null 2>&1; then
    SENHA=$(openssl rand -hex 24)
  else
    SENHA=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi
  umask 077
  printf 'BACKUP_ACCESS_KEY=plugga-backup\nBACKUP_SECRET_KEY=%s\n' "$SENHA" >"$ARQUIVO_ENV"
fi
# shellcheck disable=SC1090,SC1091
. "$ARQUIVO_ENV"

POLITICA='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":["arn:aws:s3:::plugga-backups/*"]},{"Effect":"Allow","Action":["s3:ListBucket"],"Resource":["arn:aws:s3:::plugga-backups"]}]}'
if ! SAIDA=$(provisiona_identidade "$BACKUP_ACCESS_KEY" "$BACKUP_SECRET_KEY" "plugga-backup" "$POLITICA" 2>&1); then
  printf 'falhou (criar usuário de backup):\n%s\n' "${SAIDA//$BACKUP_SECRET_KEY/***}" >&2
  exit 1
fi

# Sucesso é conferido com a credencial do próprio usuário, não presumido.
(
  umask 077
  printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\nAWS_DEFAULT_REGION=us-east-1\n' \
    "$BACKUP_ACCESS_KEY" "$BACKUP_SECRET_KEY" >"$AWS_ENV_BACKUP"
)

REGRAS=$(aws_raiz s3api get-bucket-lifecycle-configuration --bucket "$BALDE" 2>&1) || {
  printf 'falhou (conferindo regras de expiração):\n%s\n' "$REGRAS" >&2
  exit 1
}
for prefixo in "diario/" "mensal/"; do
  case "$REGRAS" in
    *"$prefixo"*) ;;
    *) echo "falhou: regra de expiração de ${prefixo} não está no balde" >&2; exit 1 ;;
  esac
done

# O servidor demora um instante para enxergar o usuário recém-criado.
provado=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if printf 'sonda' | docker run --rm -i --network "$REDE" --env-file "$AWS_ENV_BACKUP" "$AWSCLI_IMAGEM" \
    s3 cp - "s3://$BALDE/diario/.sonda" --endpoint-url "$ENDPOINT" >/dev/null 2>&1; then
    provado=1
    break
  fi
  sleep 2
done
if [ "$provado" -ne 1 ]; then
  echo "falhou: o usuário ${BACKUP_ACCESS_KEY} não consegue gravar em ${BALDE}" >&2
  exit 1
fi
aws_backup s3 cp "s3://$BALDE/diario/.sonda" - >/dev/null || { echo "falhou: usuário de backup não lê o que gravou" >&2; exit 1; }
aws_backup s3 rm "s3://$BALDE/diario/.sonda" >/dev/null || { echo "falhou: usuário de backup não apaga a sonda" >&2; exit 1; }

echo "destino preparado"
