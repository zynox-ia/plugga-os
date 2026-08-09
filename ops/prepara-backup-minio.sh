#!/usr/bin/env bash
# Prepara o destino do backup no MinIO: balde próprio, usuário próprio e
# expiração automática. Roda uma vez; é idempotente.
set -euo pipefail

REDE=plugga-os_default
MC="minio/mc:RELEASE.2025-04-16T18-13-26Z"

# Credencial raiz lida do contêiner e nunca impressa. `printenv`, não `docker
# inspect` com template split "=": o split cortava a senha no primeiro '='.
U=$(docker exec plugga-os-minio-1 printenv MINIO_ROOT_USER)
P=$(docker exec plugga-os-minio-1 printenv MINIO_ROOT_PASSWORD)

# MC_HOST_x é uma URL: senha com '@', ':' ou '/' cru quebraria o parse dela.
# Percent-encoding em bash puro porque é o único intérprete que este script
# garante na VPS — jq e python3 não são pressupostos em lugar nenhum daqui.
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

# Roda um passo tolerando só o "já existe" de um script idempotente (e o "sem
# efeito" do attach repetido). Antes cada passo terminava em
# `>/dev/null 2>&1 || true`, que não distingue isso de credencial errada ou
# MinIO fora do ar — e o script imprimia sucesso de qualquer jeito. O rótulo
# existe para a mensagem de erro não ecoar o comando, que carrega a credencial.
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

# O backup vive em balde separado das faturas: ciclo de vida diferente, acesso
# diferente, e um engano no balde da aplicação não deve alcançar o backup.
mc mb --ignore-existing x/plugga-backups >/dev/null

# Expiração pelo próprio MinIO, não por script: se o cron parar, o disco não
# enche em silêncio — e nada some antes da hora por bug meu.
#
# `ilm import` lê o JSON pelo stdin e substitui o conjunto inteiro de regras,
# então rodar de novo é idempotente de verdade. A versão antiga mandava
# `< /dev/null` para o import (que assim falhava sempre) e caía num fallback
# com `|| true` — qualquer falha real morria em silêncio. Sem `|| true` aqui:
# se o import falhar, o `set -e` para o script com o erro do mc na tela.
cat > /tmp/lifecycle.json <<'JSON'
{"Rules":[
 {"ID":"diario-30d","Status":"Enabled","Filter":{"Prefix":"diario/"},"Expiration":{"Days":30}},
 {"ID":"mensal-365d","Status":"Enabled","Filter":{"Prefix":"mensal/"},"Expiration":{"Days":365}}
]}
JSON
mc ilm import x/plugga-backups < /tmp/lifecycle.json >/dev/null

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

tolera_existente "criar política somente-backup" \
  docker run --rm --network "$REDE" -e MC_HOST_x="$RAIZ_URL" \
  -v /tmp/politica-backup.json:/p.json "$MC" admin policy create x somente-backup /p.json
tolera_existente "criar usuário de backup" \
  docker run --rm --network "$REDE" -e MC_HOST_x="$RAIZ_URL" "$MC" \
  admin user add x "$BACKUP_ACCESS_KEY" "$BACKUP_SECRET_KEY"
tolera_existente "vincular política ao usuário" \
  docker run --rm --network "$REDE" -e MC_HOST_x="$RAIZ_URL" "$MC" \
  admin policy attach x somente-backup --user "$BACKUP_ACCESS_KEY"

rm -f /tmp/lifecycle.json /tmp/politica-backup.json

# Sucesso é conferido, não presumido: antes o "destino preparado" saía até com
# o MinIO desligado. As regras têm que aparecer no ilm e o usuário tem que
# existir — senão o cron de backup ia falhar todo dia, em silêncio.
REGRAS=$(mc ilm rule ls x/plugga-backups 2>&1) || {
  printf 'falhou (conferindo regras de expiração):\n%s\n' "$REGRAS" >&2
  exit 1
}
for prefixo in "diario/" "mensal/"; do
  case "$REGRAS" in
    *"$prefixo"*) ;;
    *) echo "falhou: regra de expiração de ${prefixo} não está no balde" >&2; exit 1 ;;
  esac
done
if ! mc admin user info x "$BACKUP_ACCESS_KEY" >/dev/null 2>&1; then
  echo "falhou: usuário $BACKUP_ACCESS_KEY não existe no MinIO" >&2
  exit 1
fi

echo "destino preparado"
