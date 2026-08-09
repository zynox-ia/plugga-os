#!/usr/bin/env bash
# Prepara o destino do backup no MinIO: balde próprio, usuário próprio e
# expiração automática. Roda uma vez; é idempotente.
set -euo pipefail

REDE=plugga-os_default
MC="minio/mc:RELEASE.2025-04-16T18-13-26Z"

# Credencial raiz lida do contêiner e nunca impressa.
U=$(docker inspect plugga-os-minio-1 --format '{{range .Config.Env}}{{if eq (index (split . "=") 0) "MINIO_ROOT_USER"}}{{index (split . "=") 1}}{{end}}{{end}}')
P=$(docker inspect plugga-os-minio-1 --format '{{range .Config.Env}}{{if eq (index (split . "=") 0) "MINIO_ROOT_PASSWORD"}}{{index (split . "=") 1}}{{end}}{{end}}')

mc() { docker run --rm -i --network "$REDE" -e MC_HOST_x="http://$U:$P@minio:9000" "$MC" "$@"; }

# O backup vive em balde separado das faturas: ciclo de vida diferente, acesso
# diferente, e um engano no balde da aplicação não deve alcançar o backup.
mc mb --ignore-existing x/plugga-backups >/dev/null

# Expiração pelo próprio MinIO, não por script: se o cron parar, o disco não
# enche em silêncio — e nada some antes da hora por bug meu.
cat > /tmp/lifecycle.json <<'JSON'
{"Rules":[
 {"ID":"diario-30d","Status":"Enabled","Filter":{"Prefix":"diario/"},"Expiration":{"Days":30}},
 {"ID":"mensal-365d","Status":"Enabled","Filter":{"Prefix":"mensal/"},"Expiration":{"Days":365}}
]}
JSON
docker run --rm -i --network "$REDE" -e MC_HOST_x="http://$U:$P@minio:9000" \
  -v /tmp/lifecycle.json:/lifecycle.json "$MC" ilm import x/plugga-backups < /dev/null >/dev/null 2>&1 || \
  docker run --rm --network "$REDE" -e MC_HOST_x="http://$U:$P@minio:9000" "$MC" \
    ilm rule add --expire-days 30 --prefix "diario/" x/plugga-backups >/dev/null 2>&1 || true
docker run --rm --network "$REDE" -e MC_HOST_x="http://$U:$P@minio:9000" "$MC" \
  ilm rule add --expire-days 365 --prefix "mensal/" x/plugga-backups >/dev/null 2>&1 || true

# Usuário só para backup: pode escrever e ler no balde de backup, e nada mais.
# Se a credencial do cron vazar, ela não alcança as faturas nem a administração.
if [ ! -f /root/.plugga-backup.env ]; then
  SENHA=$(openssl rand -hex 24)
  umask 077
  printf 'BACKUP_ACCESS_KEY=plugga-backup\nBACKUP_SECRET_KEY=%s\n' "$SENHA" > /root/.plugga-backup.env
fi
# shellcheck disable=SC1091
. /root/.plugga-backup.env

cat > /tmp/politica-backup.json <<'JSON'
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:PutObject","s3:GetObject","s3:ListBucket","s3:DeleteObject"],
  "Resource":["arn:aws:s3:::plugga-backups","arn:aws:s3:::plugga-backups/*"]}
]}
JSON

docker run --rm --network "$REDE" -e MC_HOST_x="http://$U:$P@minio:9000" \
  -v /tmp/politica-backup.json:/p.json "$MC" admin policy create x somente-backup /p.json >/dev/null 2>&1 || true
docker run --rm --network "$REDE" -e MC_HOST_x="http://$U:$P@minio:9000" "$MC" \
  admin user add x "$BACKUP_ACCESS_KEY" "$BACKUP_SECRET_KEY" >/dev/null 2>&1 || true
docker run --rm --network "$REDE" -e MC_HOST_x="http://$U:$P@minio:9000" "$MC" \
  admin policy attach x somente-backup --user "$BACKUP_ACCESS_KEY" >/dev/null 2>&1 || true

rm -f /tmp/lifecycle.json /tmp/politica-backup.json
echo "destino preparado"
