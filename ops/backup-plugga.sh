#!/usr/bin/env bash
#
# Backup do banco do Plugga OS para o MinIO.
#
# Formato `custom` do pg_dump (-Fc), não SQL puro: já vem comprimido, permite
# restaurar tabela avulsa e é o que o `pg_restore` lê. O dump sai pelo `stdout`
# do contêiner e entra direto no MinIO — sem arquivo intermediário no disco da
# VPS, que é o mesmo disco que o backup existe para proteger.
#
# Falhar é ruidoso de propósito: `set -e` mais a checagem de tamanho no fim. Um
# backup que falha em silêncio é pior que não ter backup, porque dá confiança.
set -euo pipefail

REDE=plugga-os_default
MC="minio/mc:RELEASE.2025-04-16T18-13-26Z"
BALDE=plugga-backups
BANCO=plugga_os

# Credencial do usuário restrito, criada por prepara-backup.sh.
# shellcheck disable=SC1091
. /root/.plugga-backup.env

CARIMBO=$(date -u +%Y%m%d-%H%M%S)
DIA=$(date -u +%d)
NOME="plugga_os-${CARIMBO}.dump"
DESTINO="diario/${NOME}"

mc() {
  docker run --rm -i --network "$REDE" \
    -e MC_HOST_b="http://${BACKUP_ACCESS_KEY}:${BACKUP_SECRET_KEY}@minio:9000" \
    "$MC" "$@"
}

# O usuário do dump é o dono do banco: o papel da aplicação não enxerga tudo.
docker exec plugga-os-postgres-1 pg_dump -U "$BANCO" -d "$BANCO" -Fc \
  | mc pipe "b/${BALDE}/${DESTINO}"

# Um dump de banco com dados nunca é minúsculo; tamanho ínfimo é falha silenciosa
# do pg_dump que o pipe engoliria.
#
# Captura e checagem separadas de propósito: com `set -e`, um `mc stat` que
# falha dentro do $(...) abortava o script antes da mensagem — o aviso de
# "objeto ausente" logo abaixo era inalcançável.
if ! BRUTO=$(mc stat --json "b/${BALDE}/${DESTINO}" 2>&1); then
  echo "backup FALHOU: objeto ausente ou inacessível (${BRUTO})" >&2
  exit 1
fi
TAMANHO=$(printf '%s' "$BRUTO" | sed -n 's/.*"size":\([0-9]*\).*/\1/p')
if [ -z "${TAMANHO:-}" ] || [ "$TAMANHO" -lt 10000 ]; then
  echo "backup FALHOU: objeto ausente ou pequeno demais (${TAMANHO:-0} bytes)" >&2
  exit 1
fi

# No primeiro dia do mês, uma cópia que vive um ano. Guardar só os diários
# perderia a foto de um mês fechado assim que os 30 dias passassem.
if [ "$DIA" = "01" ]; then
  mc cp "b/${BALDE}/${DESTINO}" "b/${BALDE}/mensal/${NOME}" >/dev/null
fi

echo "backup ok: ${DESTINO} (${TAMANHO} bytes)"
