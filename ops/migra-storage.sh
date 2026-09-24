#!/usr/bin/env bash
#
# Copia os objetos do MinIO antigo para o SeaweedFS novo e confere cada um.
#
# Não espelha por espelhar: cada objeto de origem precisa ter um destino no
# mapa abaixo. Um objeto sem destino derruba a migração — deixar para trás um
# arquivo de cliente sem ninguém perceber é o pior resultado possível.
#
# A conferência falha em três situações que, por engano, já passaram como
# sucesso num ensaio (a imagem do mc não tem awk nem sed, e "0 = 0" parecia OK):
#   - origem sem nenhum objeto (código 2);
#   - objeto sem destino no mapa (código 3);
#   - objeto ausente ou com conteúdo diferente no destino (código 1).
#
# Credenciais entram só por variável de ambiente e nunca são impressas:
#   MC_HOST_source  http://USUARIO:SENHA@minio:9000      (origem)
#   MC_HOST_dest    http://USUARIO:SENHA@seaweedfs:8333  (destino)
#
# Uso:
#   ops/migra-storage.sh                # copia e confere
#   ops/migra-storage.sh --so-verificar # só confere, sem copiar
#
# Para ensaiar fora da VPS, MC_CMD substitui o `docker run` do mc, por exemplo
# MC_CMD="docker compose -f compose.ensaio-storage.yaml exec -T mc mc".
set -euo pipefail

REDE=${REDE:-plugga-os_default}
MC_IMAGE=${MC_IMAGE:-minio/mc:RELEASE.2025-04-16T18-13-26Z}

# "balde de origem|prefixo da chave|balde de destino". Prefixo vazio vale para
# o balde inteiro. A chave do objeto não muda: só o balde.
MAPA=(
  "plugga-faturas|faturas/|plugga-energia-opm"
  "plugga-corpus-faturas||plugga-corpus-faturas"
  "plugga-backups||plugga-backups"
)

SO_VERIFICAR=0
case "${1:-}" in
  "") ;;
  --so-verificar) SO_VERIFICAR=1 ;;
  *) echo "uso: $0 [--so-verificar]" >&2; exit 64 ;;
esac

: "${MC_HOST_source:?defina MC_HOST_source}"
: "${MC_HOST_dest:?defina MC_HOST_dest}"
export MC_HOST_source MC_HOST_dest

# `</dev/null` é essencial: o docker lê o stdin, e dentro dos `while read` daqui
# ele engoliria as linhas seguintes do inventário. A migração copiaria e
# conferiria só o primeiro objeto e diria que está tudo certo.
mc() {
  if [ -n "${MC_CMD:-}" ]; then
    # shellcheck disable=SC2086
    $MC_CMD "$@" </dev/null
  else
    docker run --rm --network "$REDE" \
      -e MC_HOST_source -e MC_HOST_dest "$MC_IMAGE" "$@" </dev/null
  fi
}

registro() { printf '\n▸ %s\n' "$*"; }
falha() { printf '  ✗ %s\n' "$*" >&2; }

# Destino do objeto, ou vazio se nenhuma regra do mapa o cobre.
destino_de() {
  local balde="$1" chave="$2" regra origem prefixo alvo
  for regra in "${MAPA[@]}"; do
    IFS='|' read -r origem prefixo alvo <<<"$regra"
    if [ "$origem" = "$balde" ] && [[ "$chave" == "$prefixo"* ]]; then
      printf '%s' "$alvo"
      return 0
    fi
  done
  return 0
}

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

# ---------------------------------------------------------------- 1. inventário
registro "1/4 · inventário da origem"
BALDES_ORIGEM=()
for regra in "${MAPA[@]}"; do
  IFS='|' read -r origem _ _ <<<"$regra"
  if [[ " ${BALDES_ORIGEM[*]:-} " != *" $origem "* ]]; then BALDES_ORIGEM+=("$origem"); fi
done

: >"$TMP"
for balde in "${BALDES_ORIGEM[@]}"; do
  if mc ls "source/${balde}" >/dev/null 2>&1; then
    # `mc find` devolve source/<balde>/<chave>, um objeto por linha.
    mc find "source/${balde}" 2>/dev/null >>"$TMP" || true
  else
    echo "  aviso: balde de origem ausente: ${balde}"
  fi
done

TOTAL=$(grep -c . "$TMP" || true)
echo "  objetos na origem: ${TOTAL}"
if [ "${TOTAL}" -eq 0 ]; then
  falha "a origem não tem nenhum objeto. Recuso seguir: 0 = 0 não prova nada."
  exit 2
fi

# ---------------------------------------------------------- 2. cobertura do mapa
registro "2/4 · todo objeto tem destino?"
SEM_DESTINO=0
while IFS= read -r linha; do
  [ -n "$linha" ] || continue
  resto=${linha#source/}
  balde=${resto%%/*}
  chave=${resto#*/}
  if [ -z "$(destino_de "$balde" "$chave")" ]; then
    falha "sem destino no mapa: ${balde}/${chave}"
    SEM_DESTINO=$((SEM_DESTINO + 1))
  fi
done <"$TMP"
if [ "$SEM_DESTINO" -gt 0 ]; then
  falha "${SEM_DESTINO} objeto(s) sem destino. Ajuste o MAPA antes de migrar."
  exit 3
fi
echo "  ✓ todos cobertos pelo mapa"

# --------------------------------------------------------------------- 3. cópia
if [ "$SO_VERIFICAR" -eq 0 ]; then
  registro "3/4 · copiando"
  for regra in "${MAPA[@]}"; do
    IFS='|' read -r _ _ alvo <<<"$regra"
    mc mb --ignore-existing "dest/${alvo}" >/dev/null
  done
  COPIADOS=0
  while IFS= read -r linha; do
    [ -n "$linha" ] || continue
    resto=${linha#source/}
    balde=${resto%%/*}
    chave=${resto#*/}
    alvo=$(destino_de "$balde" "$chave")
    if ! mc cp "source/${balde}/${chave}" "dest/${alvo}/${chave}" >/dev/null; then
      falha "falha ao copiar ${balde}/${chave}"
      exit 1
    fi
    COPIADOS=$((COPIADOS + 1))
  done <"$TMP"
  echo "  ✓ ${COPIADOS} objeto(s) copiados"
else
  registro "3/4 · cópia ignorada (--so-verificar)"
fi

# ------------------------------------------------------------- 4. conferência
registro "4/4 · conferindo conteúdo (SHA-256) objeto a objeto"
DIVERGENTES=0
CONFERIDOS=0
while IFS= read -r linha; do
  [ -n "$linha" ] || continue
  resto=${linha#source/}
  balde=${resto%%/*}
  chave=${resto#*/}
  alvo=$(destino_de "$balde" "$chave")
  a=$(mc cat "source/${balde}/${chave}" | sha256sum | cut -d' ' -f1)
  if ! b=$(mc cat "dest/${alvo}/${chave}" 2>/dev/null | sha256sum | cut -d' ' -f1); then b=""; fi
  # sha256 de conteúdo vazio não é string vazia: só "" significa erro de leitura.
  if [ -z "$b" ] || [ "$a" != "$b" ]; then
    falha "diverge: ${balde}/${chave} -> ${alvo}/${chave}"
    DIVERGENTES=$((DIVERGENTES + 1))
  fi
  CONFERIDOS=$((CONFERIDOS + 1))
done <"$TMP"

echo "  conferidos: ${CONFERIDOS} | divergentes: ${DIVERGENTES}"
if [ "$DIVERGENTES" -gt 0 ]; then
  falha "migração NÃO está íntegra."
  exit 1
fi
printf '\n✓ migração conferida: %s objeto(s), conteúdo idêntico.\n' "$CONFERIDOS"
