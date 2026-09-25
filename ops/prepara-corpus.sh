#!/usr/bin/env bash
# Prepara o balde do corpus de faturas no SeaweedFS: balde próprio e duas chaves.
# Roda uma vez; é idempotente.
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
MC=${MC_IMAGE:-minio/mc:RELEASE.2025-04-16T18-13-26Z}
CONTEINER=${SEAWEEDFS_CONTAINER:-plugga-os-seaweedfs-1}
ARQUIVO_ENV=${ARQUIVO_ENV_CORPUS:-/root/.plugga-corpus.env}
BALDE=plugga-corpus-faturas

# Credencial raiz lida do contêiner e nunca impressa. `printenv`, não `docker
# inspect` com template split "=": o split cortava a senha no primeiro '='.
U=$(docker exec "$CONTEINER" printenv AWS_ACCESS_KEY_ID)
P=$(docker exec "$CONTEINER" printenv AWS_SECRET_ACCESS_KEY)

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
RAIZ_URL="http://$U:$(codifica_url "$P")@seaweedfs:8333"

# `</dev/null`: o docker lê o stdin e engoliria a entrada de quem chama.
mc_raiz() { docker run --rm --network "$REDE" -e MC_HOST_x="$RAIZ_URL" "$MC" "$@" </dev/null; }
mc_como() { local url=$1; shift; docker run --rm --network "$REDE" -e MC_HOST_u="$url" "$MC" "$@" </dev/null; }

mc_raiz mb --ignore-existing "x/$BALDE" >/dev/null

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

LEITOR="http://${CORPUS_LEITOR_ACCESS_KEY}:$(codifica_url "$CORPUS_LEITOR_SECRET_KEY")@seaweedfs:8333"
EDITOR="http://${CORPUS_EDITOR_ACCESS_KEY}:$(codifica_url "$CORPUS_EDITOR_SECRET_KEY")@seaweedfs:8333"

# Sucesso é conferido com a credencial de cada um, não presumido. O servidor
# demora um instante para enxergar usuário recém-criado.
provado=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if printf 'sonda' | docker run --rm -i --network "$REDE" -e MC_HOST_u="$EDITOR" "$MC" \
    pipe "u/$BALDE/.sonda" >/dev/null 2>&1; then
    provado=1
    break
  fi
  sleep 2
done
[ "$provado" -eq 1 ] || { echo "falhou: o editor não consegue gravar em $BALDE" >&2; exit 1; }
mc_como "$EDITOR" rm "u/$BALDE/.sonda" >/dev/null || { echo "falhou: o editor não apaga a sonda" >&2; exit 1; }

mc_como "$LEITOR" ls "u/$BALDE" >/dev/null || { echo "falhou: o leitor não lista $BALDE" >&2; exit 1; }
if printf 'x' | docker run --rm -i --network "$REDE" -e MC_HOST_u="$LEITOR" "$MC" \
  pipe "u/$BALDE/.sonda-leitor" >/dev/null 2>&1; then
  echo "falhou: o leitor conseguiu ESCREVER em $BALDE" >&2
  exit 1
fi

echo "balde do corpus preparado"
