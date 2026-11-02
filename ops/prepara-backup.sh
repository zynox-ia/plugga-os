#!/usr/bin/env bash
# Prepara o destino do backup no armazenamento local: balde próprio, usuário
# próprio e expiração automática. Roda uma vez; é idempotente.
#
# Substitui o antigo prepara-backup-minio.sh. Os comandos `mc admin policy` e
# `mc admin user` eram do MinIO e NÃO servem aqui: no SeaweedFS o usuário criado
# por eles não autentica, e o vínculo de política é recusado. O usuário
# restrito agora nasce pelo `s3.configure` do próprio SeaweedFS, e o resultado
# é provado com a credencial dele, não presumido.
#
# O `mc` da MinIO deixou de ser distribuído (imagem e binário retirados dos
# canais oficiais em 2026-11); as operações de dados (balde, expiração, prova
# de escrita/leitura) agora usam o `aws-cli` oficial, que fala o mesmo S3.
set -euo pipefail

REDE=${REDE:-plugga-os_default}
AWSCLI_IMAGEM=${AWSCLI_IMAGEM:-amazon/aws-cli@sha256:1b7003e3ecb737b7533d8e16a547b4bc36e912508c3532ae51003aad8d0cd41d}
ENDPOINT=${BACKUP_STORAGE_ENDPOINT:-http://seaweedfs:8333}
CONTEINER=${SEAWEEDFS_CONTAINER:-plugga-os-seaweedfs-1}
ARQUIVO_ENV=${ARQUIVO_ENV_BACKUP:-/root/.plugga-backup.env}
BALDE=plugga-backups

# Credencial raiz lida do contêiner e nunca impressa. `printenv`, não `docker
# inspect` com template split "=": o split cortava a senha no primeiro '='.
U=$(docker exec "$CONTEINER" printenv AWS_ACCESS_KEY_ID)
P=$(docker exec "$CONTEINER" printenv AWS_SECRET_ACCESS_KEY)

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

# A credencial entra pelo stdin do `weed shell`, nunca pela linha de comando:
# argumento aparece em `ps` para qualquer usuário da máquina. A saída do shell
# repete o usuário criado, então só é mostrada se falhar, e sem o segredo.
COMANDO="s3.configure -user=${BACKUP_ACCESS_KEY} -access_key=${BACKUP_ACCESS_KEY} -secret_key=${BACKUP_SECRET_KEY} -buckets=${BALDE} -actions=Read,Write,List -apply"
if ! SAIDA=$(printf '%s\n' "$COMANDO" | docker exec -i "$CONTEINER" weed shell -master=localhost:9333 2>&1); then
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
