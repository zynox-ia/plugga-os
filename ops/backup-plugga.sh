#!/usr/bin/env bash
#
# Backup do banco do Plugga OS para o armazenamento S3 local, balde plugga-backups.
#
# Formato `custom` do pg_dump (-Fc), não SQL puro: já vem comprimido, permite
# restaurar tabela avulsa e é o que o `pg_restore` lê. O dump sai pelo `stdout`
# do contêiner e entra direto no armazenamento — sem arquivo intermediário no disco da
# VPS, que é o mesmo disco que o backup existe para proteger.
#
# Falhar é ruidoso de propósito: `set -e` mais a checagem de tamanho no fim. Um
# backup que falha em silêncio é pior que não ter backup, porque dá confiança.
#
# O `mc` da MinIO deixou de ser distribuído (imagem e binário retirados dos
# canais oficiais em 2026-11); o cliente agora é o `aws-cli` oficial, que fala
# o mesmo S3 e funciona com qualquer servidor compatível (RustFS incluído).
set -euo pipefail

REDE=plugga-os_default
AWSCLI_IMAGEM=${AWSCLI_IMAGEM:-amazon/aws-cli@sha256:1b7003e3ecb737b7533d8e16a547b4bc36e912508c3532ae51003aad8d0cd41d}
ENDPOINT=${BACKUP_STORAGE_ENDPOINT:-http://rustfs:9000}
BALDE=plugga-backups
BANCO=plugga_os

# Credencial do usuário restrito, criada por prepara-backup.sh.
# shellcheck disable=SC1091
. /root/.plugga-backup.env

CARIMBO=$(date -u +%Y%m%d-%H%M%S)
DIA=$(date -u +%d)
NOME="plugga_os-${CARIMBO}.dump"
DESTINO="diario/${NOME}"

aws() {
  docker run --rm -i --network "$REDE" \
    -e AWS_ACCESS_KEY_ID="${BACKUP_ACCESS_KEY}" -e AWS_SECRET_ACCESS_KEY="${BACKUP_SECRET_KEY}" -e AWS_DEFAULT_REGION=us-east-1 \
    "$AWSCLI_IMAGEM" "$@" --endpoint-url "$ENDPOINT"
}

# O usuário do dump é o dono do banco: o papel da aplicação não enxerga tudo.
docker exec plugga-os-postgres-1 pg_dump -U "$BANCO" -d "$BANCO" -Fc \
  | aws s3 cp - "s3://${BALDE}/${DESTINO}"

# Um dump de banco com dados nunca é minúsculo; tamanho ínfimo é falha silenciosa
# do pg_dump que o pipe engoliria.
#
# Captura e checagem separadas de propósito: com `set -e`, um `head-object` que
# falha dentro do $(...) abortava o script antes da mensagem — o aviso de
# "objeto ausente" logo abaixo era inalcançável.
if ! BRUTO=$(aws s3api head-object --bucket "${BALDE}" --key "${DESTINO}" 2>&1); then
  echo "backup FALHOU: objeto ausente ou inacessível (${BRUTO})" >&2
  exit 1
fi
TAMANHO=$(printf '%s' "$BRUTO" | sed -n 's/.*"ContentLength": *\([0-9]*\).*/\1/p')
if [ -z "${TAMANHO:-}" ] || [ "$TAMANHO" -lt 10000 ]; then
  echo "backup FALHOU: objeto ausente ou pequeno demais (${TAMANHO:-0} bytes)" >&2
  exit 1
fi

# No primeiro dia do mês, uma cópia que vive um ano. Guardar só os diários
# perderia a foto de um mês fechado assim que os 30 dias passassem.
if [ "$DIA" = "01" ]; then
  aws s3 cp "s3://${BALDE}/${DESTINO}" "s3://${BALDE}/mensal/${NOME}" >/dev/null
fi

echo "backup ok: ${DESTINO} (${TAMANHO} bytes)"
