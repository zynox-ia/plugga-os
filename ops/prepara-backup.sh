#!/usr/bin/env bash
# Prepara o destino do backup no SeaweedFS: balde próprio, usuário próprio e
# expiração automática. Roda uma vez; é idempotente.
#
# Substitui o antigo prepara-backup-minio.sh. Os comandos `mc admin policy` e
# `mc admin user` eram do MinIO e NÃO servem aqui: no SeaweedFS o usuário criado
# por eles não autentica, e o vínculo de política é recusado. O usuário
# restrito agora nasce pelo `s3.configure` do próprio SeaweedFS, e o resultado
# é provado com a credencial dele, não presumido.
set -euo pipefail

REDE=${REDE:-plugga-os_default}
MC=${MC_IMAGE:-minio/mc:RELEASE.2025-04-16T18-13-26Z}
CONTEINER=${SEAWEEDFS_CONTAINER:-plugga-os-seaweedfs-1}
ARQUIVO_ENV=${ARQUIVO_ENV_BACKUP:-/root/.plugga-backup.env}
BALDE=plugga-backups

# Credencial raiz lida do contêiner e nunca impressa. `printenv`, não `docker
# inspect` com template split "=": o split cortava a senha no primeiro '='.
U=$(docker exec "$CONTEINER" printenv AWS_ACCESS_KEY_ID)
P=$(docker exec "$CONTEINER" printenv AWS_SECRET_ACCESS_KEY)

# MC_HOST_x é uma URL: senha com '@', ':' ou '/' cru quebraria o parse dela.
# Percent-encoding em bash puro porque é o único intérprete que este script
# garante na VPS: jq e python3 não são pressupostos em lugar nenhum daqui.
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
RAIZ_URL="http://$U:$(codifica_url "$P")@seaweedfs:8333"

# `</dev/null`: o docker lê o stdin e engoliria a entrada de quem chama.
mc_raiz() { docker run --rm --network "$REDE" -e MC_HOST_x="$RAIZ_URL" "$MC" "$@" </dev/null; }
mc_backup() { docker run --rm --network "$REDE" -e MC_HOST_b="$BACKUP_URL" "$MC" "$@" </dev/null; }

# O backup vive em balde separado dos arquivos de negócio: ciclo de vida
# diferente, acesso diferente, e um engano num balde da aplicação não deve
# alcançar o backup.
mc_raiz mb --ignore-existing "x/$BALDE" >/dev/null

# Expiração pelo próprio servidor, não por script: se o cron parar, o disco não
# enche em silêncio, e nada some antes da hora por bug meu.
#
# `ilm import` lê o JSON pelo stdin e substitui o conjunto inteiro de regras,
# então rodar de novo é idempotente de verdade. Sem `|| true`: se falhar, o
# `set -e` para o script com o erro do mc na tela.
LIFECYCLE='{"Rules":[
 {"ID":"diario-30d","Status":"Enabled","Filter":{"Prefix":"diario/"},"Expiration":{"Days":30}},
 {"ID":"mensal-365d","Status":"Enabled","Filter":{"Prefix":"mensal/"},"Expiration":{"Days":365}}
]}'
printf '%s' "$LIFECYCLE" | docker run --rm -i --network "$REDE" -e MC_HOST_x="$RAIZ_URL" "$MC" \
  ilm import "x/$BALDE" >/dev/null

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
# shellcheck disable=SC1091
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
BACKUP_URL="http://${BACKUP_ACCESS_KEY}:$(codifica_url "$BACKUP_SECRET_KEY")@seaweedfs:8333"

REGRAS=$(mc_raiz ilm rule ls "x/$BALDE" 2>&1) || {
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
  if printf 'sonda' | docker run --rm -i --network "$REDE" -e MC_HOST_b="$BACKUP_URL" "$MC" \
    pipe "b/$BALDE/diario/.sonda" >/dev/null 2>&1; then
    provado=1
    break
  fi
  sleep 2
done
if [ "$provado" -ne 1 ]; then
  echo "falhou: o usuário ${BACKUP_ACCESS_KEY} não consegue gravar em ${BALDE}" >&2
  exit 1
fi
mc_backup cat "b/$BALDE/diario/.sonda" >/dev/null || { echo "falhou: usuário de backup não lê o que gravou" >&2; exit 1; }
mc_backup rm "b/$BALDE/diario/.sonda" >/dev/null || { echo "falhou: usuário de backup não apaga a sonda" >&2; exit 1; }

echo "destino preparado"
